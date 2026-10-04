# MyAssignment: Firebase setup

The app uses Firebase Authentication and Cloud Firestore. Students host submission files in Google Drive and save a share link in Firestore.

The security rules are in:

- `firestore.rules` for the database

These rules were written but **not run in the Firebase emulator**. Test them with the checklist below before relying on them.

## Data model the rules expect

| Collection | Document ID | Fields |
|---|---|---|
| `users` | auth uid | name, email, role (`student` or `teacher`) |
| `courses` | auto | title, code (6 chars), teacherId, teacherName |
| `joinCodes` | the 6-char code | courseId, teacherId |
| `enrollments` | `{courseId}_{studentUid}` | courseId, studentId, studentName, studentEmail, teacherId, code, joinedAt |
| `assignments` | auto | courseId, teacherId, title, description, optional questionUrl, deadline, maxMarks, createdAt |
| `submissions` | `{assignmentId}_{studentUid}` | assignmentId, courseId, teacherId, studentId, studentName, submissionUrl, submittedAt, late, marks, feedback, gradedAt (after grading) |

## Setup

1. In Firebase Console, enable **Authentication > Email/Password** and create a **Firestore database**. This app does not use Firebase Storage.
2. Deploy the rules from the project root with Firebase CLI:

```
firebase deploy --only firestore:rules --project myassignment-fc47d
```

The browser app is served over HTTP at `http://localhost:8000/`; Firebase Auth must include `localhost` in its authorized domains (it is normally included by default).

## App integration notes

- The app stores deadlines as Firestore **Timestamps** and uses `serverTimestamp()` for `createdAt`, `joinedAt`, `submittedAt` and `gradedAt`.
- Submission lateness is checked against the assignment deadline in the security rules. The browser supplies the `late` value, so a submission very close to the deadline can be rejected if the device clock differs from Firebase's server clock.
- Enrollments are stored as documents rather than a `studentIds` array on courses.
- Course and join-code documents are written together so the rules can validate the code with `getAfter()`.
- Teacher queries are constrained by `teacherId`; students query assignments one enrolled course at a time by `courseId`.
- Results are sorted by deadline in JavaScript.
- Submission links must use HTTPS and the `drive.google.com` or `docs.google.com` host.
- Teachers can add an optional Google Drive/Docs `questionUrl` to an assignment; enrolled students see a link in the assignment details.
- Students must set Drive sharing to **Anyone with the link** and **Viewer**. Firestore rules validate the link's host but cannot verify its Google Drive sharing permissions.
- Students can edit a Drive file after submitting. Teachers can inspect Drive version history and last-modified time when reviewing work.

## What the rules enforce

- Nobody can read another student's submission or grade.
- Students cannot grade, change marks, or edit a graded submission.
- A student can only submit to a course they joined with a valid code.
- `late` and timestamps come from the server clock, not the student's device.
- Roles cannot be changed after sign-up; anyone can register as a teacher.
- Submission URLs are limited to HTTPS Google Drive and Google Docs links.

## Test checklist (Firebase Rules Playground or emulator)

1. A student reads another student's submission: **denied**.
2. A student writes `marks` on their own submission: **denied**.
3. A student replaces a file after grading: **denied**.
4. A student submits to a course they have not joined: **denied**.
5. A user creates their profile with another account's email: **denied**.
6. A teacher reads submissions for a course owned by another teacher: **denied**.
7. A student submits a non-HTTPS or non-Google Drive/Docs URL: **denied**.
8. A student joins with a wrong code: **denied**.
9. The normal flows (join, submit, replace, grade) all work: **allowed**.

## Known limits

- Join codes can be guessed one at a time by a signed-in user. Six characters from a 32-letter set is about a billion combinations, which is fine for a college project.
- `enrollments` store `studentName` and `studentEmail` copies so teachers do not need to read other users' profiles. If a student renames themselves, old copies keep the old name.
