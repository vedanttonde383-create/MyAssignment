/* store.js: Firebase Auth and Firestore data layer. */

(function () {
  const fail = (msg) => { throw new Error(msg); };

  function services() { return window.Firebase; }
  function sdk() { return services().sdk; }

  function cloudError(error) {
    if (error.code === 'permission-denied') {
      return new Error('Firebase denied this action. Check your account role, course enrollment, and deployed security rules.');
    }
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
      return new Error('Email or password is incorrect.');
    }
    if (error.code === 'auth/email-already-in-use') return new Error('An account with this email already exists.');
    if (error.code === 'auth/weak-password') return new Error('Use a password with at least 6 characters.');
    if (error.code === 'auth/invalid-email') return new Error('Enter a valid email address.');
    return new Error(error.message || 'Firebase request failed. Try again.');
  }

  function iso(value) {
    return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
  }

  function courseRecord(snapshot) {
    return { id: snapshot.id, ...snapshot.data(), studentIds: [] };
  }

  function assignmentRecord(snapshot) {
    const data = snapshot.data();
    return { id: snapshot.id, ...data, deadline: iso(data.deadline), createdAt: iso(data.createdAt) };
  }

  function isGoogleDriveUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:'
        && ['drive.google.com', 'docs.google.com'].includes(url.hostname)
        && url.pathname !== '/';
    } catch (error) {
      return false;
    }
  }

  function submissionRecord(snapshot) {
    const data = snapshot.data();
    return { id: snapshot.id, ...data, submittedAt: iso(data.submittedAt), gradedAt: iso(data.gradedAt) };
  }

  function currentUser(role) {
    const user = services().currentProfile;
    if (!user) fail('Please log in again.');
    if (role && user.role !== role) fail('You do not have access to this action.');
    return user;
  }

  /* ---------- Auth ---------- */

  const Auth = {
    current() {
      return services().currentProfile;
    },
    async register({ name, email, password, role }) {
      email = email.trim().toLowerCase();
      if (!name.trim()) fail('Enter your name.');
      if (name.trim().length > 80) fail('Your name must be 80 characters or fewer.');
      if (password.length < 6) fail('Use a password with at least 6 characters.');
      if (!['student', 'teacher'].includes(role)) fail('Choose student or teacher.');
      const { auth, db } = services();
      const { createUserWithEmailAndPassword, deleteUser, doc, setDoc, updateProfile } = sdk();
      let credential = null;
      try {
        credential = await createUserWithEmailAndPassword(auth, email, password);
        const profile = { id: credential.user.uid, name: name.trim(), email, role };
        await updateProfile(credential.user, { displayName: profile.name });
        await setDoc(doc(db, 'users', profile.id), { name: profile.name, email, role });
        services().currentProfile = profile;
        return profile;
      } catch (error) {
        if (credential) {
          try { await deleteUser(credential.user); } catch (deleteError) { console.warn('Could not remove the incomplete account.', deleteError); }
          services().currentProfile = null;
        }
        throw cloudError(error);
      }
    },
    async login(email, password) {
      const { auth, db } = services();
      const { doc, getDoc, signInWithEmailAndPassword } = sdk();
      try {
        const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        const profile = await getDoc(doc(db, 'users', credential.user.uid));
        if (!profile.exists()) {
          await sdk().signOut(auth);
          fail('Your account profile is missing. Contact the administrator.');
        }
        services().currentProfile = { id: credential.user.uid, ...profile.data() };
        return services().currentProfile;
      } catch (error) {
        throw cloudError(error);
      }
    },
    async logout() {
      await sdk().signOut(services().auth);
      services().currentProfile = null;
    },
  };

  /* ---------- Courses ---------- */

  const Courses = {
    async create({ title }) {
      const user = currentUser('teacher');
      if (!title.trim()) fail('Enter a course name.');
      const { db } = services();
      const { collection, doc, writeBatch } = sdk();
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const courseRef = doc(collection(db, 'courses'));
      const batch = writeBatch(db);
      batch.set(courseRef, { title: title.trim(), code, teacherId: user.id, teacherName: user.name });
      batch.set(doc(db, 'joinCodes', code), { courseId: courseRef.id, teacherId: user.id });
      await batch.commit();
      return { id: courseRef.id, title: title.trim(), code, teacherId: user.id, teacherName: user.name, studentIds: [] };
    },
    async listForTeacher() {
      const user = currentUser('teacher');
      const { db } = services();
      const { collection, getDocs, query, where } = sdk();
      const [courseRows, enrollmentRows] = await Promise.all([
        getDocs(query(collection(db, 'courses'), where('teacherId', '==', user.id))),
        getDocs(query(collection(db, 'enrollments'), where('teacherId', '==', user.id))),
      ]);
      return courseRows.docs.map((snapshot) => {
        const course = courseRecord(snapshot);
        course.studentIds = enrollmentRows.docs
          .filter((row) => row.data().courseId === course.id)
          .map((row) => row.data().studentId);
        return course;
      });
    },
    async listForStudent() {
      const user = currentUser('student');
      const { db } = services();
      const { collection, doc, getDoc, getDocs, query, where } = sdk();
      const rows = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', user.id)));
      const courses = await Promise.all(rows.docs.map(async (row) => {
        const snapshot = await getDoc(doc(db, 'courses', row.data().courseId));
        return snapshot.exists() ? courseRecord(snapshot) : null;
      }));
      return courses.filter(Boolean);
    },
    async join(code) {
      const user = currentUser('student');
      const { db } = services();
      const { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } = sdk();
      const normalizedCode = code.trim().toUpperCase();
      const codeSnapshot = await getDoc(doc(db, 'joinCodes', normalizedCode));
      if (!codeSnapshot.exists()) fail('No course matches that code. Check it with your teacher.');
      const codeData = codeSnapshot.data();
      const enrollmentId = codeData.courseId + '_' + user.id;
      const enrollmentRef = doc(db, 'enrollments', enrollmentId);
      const currentEnrollments = await getDocs(query(
        collection(db, 'enrollments'),
        where('studentId', '==', user.id)
      ));
      if (currentEnrollments.docs.some((row) => row.data().courseId === codeData.courseId)) {
        fail('You are already in this course.');
      }
      await setDoc(enrollmentRef, {
        courseId: codeData.courseId,
        studentId: user.id,
        studentName: user.name,
        studentEmail: user.email,
        teacherId: codeData.teacherId,
        code: normalizedCode,
        joinedAt: serverTimestamp(),
      });
      const courseSnapshot = await getDoc(doc(db, 'courses', codeData.courseId));
      if (!courseSnapshot.exists()) fail('The course for this join code no longer exists.');
      return courseRecord(courseSnapshot);
    },
  };

  /* ---------- Assignments ---------- */

  const Assignments = {
    async create({ courseId, title, description, questionUrl, deadline, maxMarks }) {
      const user = currentUser('teacher');
      if (!title.trim()) fail('Enter a title.');
      if ((description || '').length > 2000) fail('Instructions must be 2,000 characters or fewer.');
      const cleanQuestionUrl = String(questionUrl || '').trim();
      if (cleanQuestionUrl && !isGoogleDriveUrl(cleanQuestionUrl)) {
        fail('Use a secure link from drive.google.com or docs.google.com.');
      }
      if (!Number.isFinite(Number(maxMarks)) || Number(maxMarks) <= 0 || Number(maxMarks) > 1000) {
        fail('Maximum marks must be between 1 and 1,000.');
      }
      const { db } = services();
      const { addDoc, collection, doc, getDoc, serverTimestamp, Timestamp } = sdk();
      const course = await getDoc(doc(db, 'courses', courseId));
      if (!course.exists() || course.data().teacherId !== user.id) fail('Course not found.');
      const due = new Date(deadline);
      if (Number.isNaN(due.getTime()) || due <= new Date()) fail('Pick a deadline in the future.');
      const assignment = {
        courseId,
        teacherId: user.id,
        title: title.trim(),
        description: description || '',
        ...(cleanQuestionUrl ? { questionUrl: cleanQuestionUrl } : {}),
        deadline: Timestamp.fromDate(due),
        maxMarks: Number(maxMarks),
        createdAt: serverTimestamp(),
      };
      const created = await addDoc(collection(db, 'assignments'), assignment);
      return { id: created.id, ...assignment, questionUrl: cleanQuestionUrl, deadline: due.toISOString(), createdAt: new Date().toISOString() };
    },
    async listForCourse(courseId) {
      const user = currentUser('teacher');
      const { db } = services();
      const { collection, getDocs, query, where } = sdk();
      const [assignments, enrollments, submissions] = await Promise.all([
        getDocs(query(collection(db, 'assignments'), where('teacherId', '==', user.id))),
        getDocs(query(collection(db, 'enrollments'), where('teacherId', '==', user.id))),
        getDocs(query(collection(db, 'submissions'), where('teacherId', '==', user.id))),
      ]);
      return assignments.docs
        .filter((row) => row.data().courseId === courseId)
        .map(assignmentRecord)
        .map((assignment) => ({
          ...assignment,
          studentCount: enrollments.docs.filter((row) => row.data().courseId === courseId).length,
          submittedCount: submissions.docs.filter((row) => row.data().assignmentId === assignment.id).length,
        }))
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    },
    async listForStudent() {
      const user = currentUser('student');
      const { db } = services();
      const { collection, getDocs, query, where } = sdk();
      const courses = await Courses.listForStudent();
      const [assignments, submissions] = await Promise.all([
        Promise.all(courses.map((course) =>
          getDocs(query(collection(db, 'assignments'), where('courseId', '==', course.id)))
        )),
        getDocs(query(collection(db, 'submissions'), where('studentId', '==', user.id))),
      ]);
      const records = assignments.flatMap((rows) => rows.docs.map(assignmentRecord));
      const submissionsByAssignment = new Map(submissions.docs.map((row) => [row.data().assignmentId, row]));
      return Promise.all(records.map(async (assignment) => {
        const submission = submissionsByAssignment.get(assignment.id);
        return {
          ...assignment,
          courseTitle: courses.find((course) => course.id === assignment.courseId).title,
          submission: submission ? await submissionRecord(submission) : null,
        };
      }));
    },
    async remove(id) {
      const user = currentUser('teacher');
      const { db } = services();
      const { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } = sdk();
      const assignmentRef = doc(db, 'assignments', id);
      const assignment = await getDoc(assignmentRef);
      if (!assignment.exists() || assignment.data().teacherId !== user.id) fail('Assignment not found.');
      const rows = await getDocs(query(collection(db, 'submissions'), where('teacherId', '==', user.id)));
      const submissions = rows.docs.filter((row) => row.data().assignmentId === id);
      for (let start = 0; start < submissions.length; start += 400) {
        const batch = writeBatch(db);
        submissions.slice(start, start + 400).forEach((row) => batch.delete(row.ref));
        await batch.commit();
      }
      await deleteDoc(assignmentRef);
      return true;
    },
  };

  /* ---------- Submissions ---------- */

  const Submissions = {
    async submit({ assignmentId, submissionUrl }) {
      const user = currentUser('student');
      const { db } = services();
      const { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where } = sdk();
      const assignmentSnapshot = await getDoc(doc(db, 'assignments', assignmentId));
      if (!assignmentSnapshot.exists()) fail('Assignment not found.');
      const assignment = assignmentSnapshot.data();
      const submissionRef = doc(db, 'submissions', assignmentId + '_' + user.id);
      const ownSubmissions = await getDocs(query(
        collection(db, 'submissions'),
        where('studentId', '==', user.id)
      ));
      const existing = ownSubmissions.docs.find((row) => row.data().assignmentId === assignmentId) || null;
      if (existing && existing.data().marks !== null) fail('This submission has already been graded.');
      const cleanUrl = String(submissionUrl || '').trim();
      if (!isGoogleDriveUrl(cleanUrl)) {
        fail('Paste a secure link from drive.google.com or docs.google.com.');
      }

      const now = Timestamp.now();
      const late = now.toMillis() > assignment.deadline.toMillis();
      const data = {
        assignmentId,
        courseId: assignment.courseId,
        teacherId: assignment.teacherId,
        studentId: user.id,
        studentName: user.name,
        submissionUrl: cleanUrl,
        submittedAt: serverTimestamp(),
        late,
        marks: null,
        feedback: '',
      };
      try {
        await setDoc(submissionRef, data);
      } catch (error) {
        throw cloudError(error);
      }

      return { id: submissionRef.id, ...data, submittedAt: new Date().toISOString() };
    },
    async forAssignment(assignmentId) {
      const user = currentUser('teacher');
      const { db } = services();
      const { collection, doc, getDoc, getDocs, query, where } = sdk();
      const assignmentSnapshot = await getDoc(doc(db, 'assignments', assignmentId));
      if (!assignmentSnapshot.exists()) fail('Assignment not found.');
      const assignment = assignmentRecord(assignmentSnapshot);
      if (assignment.teacherId !== user.id) fail('You do not have access to this assignment.');
      const enrollments = await getDocs(query(collection(db, 'enrollments'), where('teacherId', '==', user.id)));
      const students = enrollments.docs.filter((row) => row.data().courseId === assignment.courseId);
      const submissionRows = await getDocs(query(collection(db, 'submissions'), where('teacherId', '==', user.id)));
      const submissionsByStudent = new Map(submissionRows.docs
        .filter((row) => row.data().assignmentId === assignmentId)
        .map((row) => [row.data().studentId, row]));
      const rows = await Promise.all(students.map(async (row) => {
        const enrollment = row.data();
        const submission = submissionsByStudent.get(enrollment.studentId);
        return {
          student: { id: enrollment.studentId, name: enrollment.studentName, email: enrollment.studentEmail },
          submission: submission ? await submissionRecord(submission) : null,
        };
      }));
      return { assignment, rows };
    },
    async grade(id, { marks, feedback }) {
      const user = currentUser('teacher');
      const { db } = services();
      const { doc, getDoc, serverTimestamp, updateDoc } = sdk();
      const submissionRef = doc(db, 'submissions', id);
      const submission = await getDoc(submissionRef);
      if (!submission.exists() || submission.data().teacherId !== user.id) fail('Submission not found.');
      const assignment = await getDoc(doc(db, 'assignments', submission.data().assignmentId));
      if (!assignment.exists()) fail('Assignment not found.');
      const m = Number(marks);
      if (Number.isNaN(m) || m < 0 || m > assignment.data().maxMarks) fail('Marks must be between 0 and ' + assignment.data().maxMarks + '.');
      const cleanFeedback = (feedback || '').trim();
      if (cleanFeedback.length > 1000) fail('Feedback must be 1,000 characters or fewer.');
      await updateDoc(submissionRef, { marks: m, feedback: cleanFeedback, gradedAt: serverTimestamp() });
      return { id, ...submission.data(), marks: m, feedback: cleanFeedback, gradedAt: new Date().toISOString() };
    },
  };

  function mapCloudErrors(api) {
    Object.keys(api).forEach((key) => {
      const operation = api[key];
      api[key] = async (...args) => {
        try {
          return await operation(...args);
        } catch (error) {
          if (error.code) throw cloudError(error);
          throw error;
        }
      };
    });
  }

  mapCloudErrors(Courses);
  mapCloudErrors(Assignments);
  mapCloudErrors(Submissions);

  window.Auth = Auth;
  window.Courses = Courses;
  window.Assignments = Assignments;
  window.Submissions = Submissions;
})();
