/* teacher.js: teacher dashboard */

window.firebaseReady.then(() => {
  const user = requireRole('teacher');
  if (!user) return;
  renderHeader(user);

  const content = $('#content');
  const courseList = $('#course-list');
  const aDlg = $('#assignment-dlg');
  const rDlg = $('#review-dlg');

  let courses = [];
  let courseId = null;
  let assignments = [];

  /* ---------- data loading ---------- */

  async function loadCourses(selectId) {
    courses = await Courses.listForTeacher();
    if (selectId) courseId = selectId;
    if (!courses.some((c) => c.id === courseId)) courseId = courses[0] ? courses[0].id : null;
    renderCourses();
    await loadAssignments();
  }

  async function loadAssignments() {
    assignments = courseId ? await Assignments.listForCourse(courseId) : [];
    renderContent();
  }

  /* ---------- rendering ---------- */

  function renderCourses() {
    courseList.innerHTML = courses.length
      ? courses.map((c) => `
          <li><button type="button" data-course="${esc(c.id)}" aria-current="${c.id === courseId}">${esc(c.title)}</button></li>`).join('')
      : '<li class="meta">No courses yet.</li>';
  }

  function renderContent() {
    const c = courses.find((x) => x.id === courseId);
    if (!c) {
      content.innerHTML = '<div class="empty">Add your first course to start posting assignments.</div>';
      return;
    }
    const n = c.studentIds.length;
    content.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${esc(c.title)}</h1>
          <p class="lead">${n} ${n === 1 ? 'student' : 'students'} enrolled</p>
          <div class="code-box">
            <span>Students join with</span>
            <span class="code">${esc(c.code)}</span>
            <button class="btn btn-quiet" id="copy-code" type="button">Copy code</button>
          </div>
        </div>
        <button class="btn btn-primary" id="new-assignment" type="button">New assignment</button>
      </div>
      <ul class="list">
        ${assignments.length
          ? assignments.map(rowHtml).join('')
          : '<li class="empty">No assignments yet. Select New assignment to post the first one.</li>'}
      </ul>`;
  }

  function rowHtml(a) {
    const t = timeLeft(a.deadline);
    const stubClass = t.overdue ? 'is-closed' : t.soon ? 'is-soon' : '';
    const small = t.overdue ? t.unit + ' ago' : t.unit + ' left';
    return `
      <li class="row">
        <div class="stub ${stubClass}"><strong>${esc(t.n)}</strong><span>${esc(small)}</span></div>
        <div class="row-main">
          <h3>${esc(a.title)}</h3>
          <p class="meta">Due ${esc(fmtDate(a.deadline))}, ${esc(a.maxMarks)} marks</p>
          <p class="meta">${esc(a.submittedCount)} of ${esc(a.studentCount)} students submitted</p>
        </div>
        <div class="row-side">
          <button class="btn btn-primary" type="button" data-review="${esc(a.id)}">Review submissions</button>
          <button class="btn btn-danger" type="button" data-delete="${esc(a.id)}">Delete</button>
        </div>
      </li>`;
  }

  /* ---------- review dialog ---------- */

  function statusBadge(s) {
    if (!s) return '<span class="badge muted">Not submitted</span>';
    if (s.marks !== null) return '<span class="badge ok">Graded</span>';
    return s.late ? '<span class="badge late">Submitted late</span>' : '<span class="badge">Submitted</span>';
  }

  function reviewRow(r, max) {
    const s = r.submission;
    const name = r.student ? r.student.name : 'Unknown student';
    const email = r.student ? r.student.email : '';
    if (!s) {
      return `
        <tr>
          <td>${esc(name)}<br><span class="meta">${esc(email)}</span></td>
          <td>${statusBadge(null)}</td>
          <td>None</td><td>None</td><td>None</td><td></td>
        </tr>`;
    }
    const driveUrl = safeDriveUrl(s.submissionUrl);
    const submissionLink = driveUrl
      ? `<a href="${esc(driveUrl)}" target="_blank" rel="noopener noreferrer">Open Drive link</a>`
      : 'Invalid submission link';
    return `
      <tr data-sub="${esc(s.id)}">
        <td>${esc(name)}<br><span class="meta">${esc(email)}</span></td>
        <td>${statusBadge(s)}<br><span class="meta">${esc(fmtDate(s.submittedAt))}</span></td>
        <td>${submissionLink}</td>
        <td>
          <div class="marks">
            <label class="sr-only" for="m-${esc(s.id)}">Marks for ${esc(name)}</label>
            <input class="m" id="m-${esc(s.id)}" type="number" min="0" max="${esc(max)}" step="0.5" value="${s.marks === null ? '' : esc(s.marks)}">
            <span>/ ${esc(max)}</span>
          </div>
        </td>
        <td>
          <label class="sr-only" for="f-${esc(s.id)}">Feedback for ${esc(name)}</label>
          <input class="f" id="f-${esc(s.id)}" type="text" value="${esc(s.feedback)}" placeholder="Write feedback">
        </td>
        <td><button class="btn btn-ghost" type="button" data-save>Save grade</button></td>
      </tr>`;
  }

  async function openReview(id) {
    const keepScroll = rDlg.scrollTop;
    try {
      const { assignment: a, rows } = await Submissions.forAssignment(id);
      rDlg.dataset.id = id;
      rDlg.innerHTML = `
        <div class="dialog-body">
          <div class="dialog-head">
            <div>
              <h2 id="review-title">${esc(a.title)}</h2>
              <p class="meta">Due ${esc(fmtDate(a.deadline))}, ${esc(a.maxMarks)} marks</p>
            </div>
            <button type="button" class="btn btn-quiet" data-close>Close</button>
          </div>
          ${rows.length
            ? `<div class="table-wrap">
                 <table>
                   <thead><tr><th>Student</th><th>Status</th><th>Submission link</th><th>Marks</th><th>Feedback</th><th></th></tr></thead>
                   <tbody>${rows.map((r) => reviewRow(r, a.maxMarks)).join('')}</tbody>
                 </table>
               </div>`
            : '<div class="empty">No students have joined this course yet.</div>'}
        </div>`;
      if (!rDlg.open) rDlg.showModal();
      rDlg.scrollTop = keepScroll;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /* ---------- helpers ---------- */

  function toLocalInput(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /* ---------- events ---------- */

  courseList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-course]');
    if (!btn) return;
    courseId = btn.dataset.course;
    renderCourses();
    await loadAssignments();
  });

  $('#course-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#course-title');
    try {
      const course = await Courses.create({ title: input.value });
      input.value = '';
      toast('Course added');
      await loadCourses(course.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  content.addEventListener('click', async (e) => {
    if (e.target.closest('#new-assignment')) {
      $('#assignment-form').reset();
      $('#assignment-error').textContent = '';
      const tomorrow = new Date(Date.now() + 864e5);
      tomorrow.setHours(23, 59, 0, 0);
      $('#a-deadline').value = toLocalInput(tomorrow);
      aDlg.showModal();
      $('#a-title').focus();
      return;
    }

    if (e.target.closest('#copy-code')) {
      const c = courses.find((x) => x.id === courseId);
      try {
        await navigator.clipboard.writeText(c.code);
        toast('Code copied');
      } catch (err) {
        toast('Could not copy. Select the code and copy it by hand.', 'error');
      }
      return;
    }

    const review = e.target.closest('[data-review]');
    if (review) { openReview(review.dataset.review); return; }

    const del = e.target.closest('[data-delete]');
    if (del && confirm('Delete this assignment and all of its submissions?')) {
      try {
        await Assignments.remove(del.dataset.delete);
        toast('Assignment deleted');
        await loadAssignments();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  $('#assignment-cancel').addEventListener('click', () => aDlg.close());

  $('#assignment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#assignment-error');
    error.textContent = '';

    const title = $('#a-title').value.trim();
    const questionUrl = $('#a-question-url').value.trim();
    const deadline = new Date($('#a-deadline').value);
    const maxMarks = Number($('#a-marks').value);

    if (!title) { error.textContent = 'Enter a title.'; return; }
    if (questionUrl && !safeDriveUrl(questionUrl)) {
      error.textContent = 'Use a secure link from drive.google.com or docs.google.com.';
      return;
    }
    if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
      error.textContent = 'Pick a deadline in the future.';
      return;
    }
    if (!(maxMarks > 0)) { error.textContent = 'Maximum marks must be more than 0.'; return; }

    try {
      await Assignments.create({
        courseId,
        title,
        description: $('#a-desc').value.trim(),
        questionUrl,
        deadline: deadline.toISOString(),
        maxMarks,
      });
      aDlg.close();
      toast('Assignment published');
      await loadAssignments();
    } catch (err) {
      error.textContent = err.message;
    }
  });

  rDlg.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]') || e.target === rDlg) {
      rDlg.close();
      await loadAssignments(); // refresh the submitted counts
      return;
    }
    const save = e.target.closest('[data-save]');
    if (!save) return;

    const tr = save.closest('tr');
    const marks = $('.m', tr).value;
    if (marks === '') { toast('Enter marks before saving.', 'error'); return; }
    try {
      await Submissions.grade(tr.dataset.sub, { marks, feedback: $('.f', tr).value });
      toast('Grade saved');
      await openReview(rDlg.dataset.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadCourses();
}).catch((error) => toast(error.message, 'error'));
