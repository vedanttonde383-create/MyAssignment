/* student.js: student dashboard */

window.firebaseReady.then(() => {
  const user = requireRole('student');
  if (!user) return;
  renderHeader(user);

  const list = $('#list');
  const dlg = $('#dlg');
  let items = [];
  let courses = [];
  let tab = 'pending';

  const statusOf = (a) => (!a.submission ? 'pending' : a.submission.marks !== null ? 'graded' : 'submitted');

  async function refresh() {
    [items, courses] = await Promise.all([Assignments.listForStudent(), Courses.listForStudent()]);
    render();
  }

  /* ---------- list ---------- */

  function render() {
    const groups = { pending: [], submitted: [], graded: [] };
    items.forEach((a) => groups[statusOf(a)].push(a));
    groups.pending.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    groups.submitted.sort((a, b) => new Date(b.submission.submittedAt) - new Date(a.submission.submittedAt));
    groups.graded.sort((a, b) => new Date(b.submission.submittedAt) - new Date(a.submission.submittedAt));

    const overdue = groups.pending.filter((a) => new Date(a.deadline) < Date.now()).length;
    $('#summary').textContent = groups.pending.length
      ? groups.pending.length + ' to hand in' + (overdue ? ', ' + overdue + ' overdue' : '') + '.'
      : items.length ? 'Everything is handed in.' : 'Join a course to see its assignments.';

    $$('#tabs button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      $('.count', b).textContent = groups[b.dataset.tab].length;
    });

    $('#course-chips').innerHTML = courses.map((c) => `<span class="chip">${esc(c.title)}</span>`).join('');

    const rows = groups[tab];
    list.innerHTML = rows.length ? rows.map(rowHtml).join('') : `<li class="empty">${emptyText()}</li>`;
  }

  function emptyText() {
    if (tab === 'pending') {
      return items.length
        ? 'Nothing to hand in right now.'
        : 'You are not in a course yet. Enter the join code from your teacher above.';
    }
    return tab === 'submitted' ? 'Nothing is waiting for a grade.' : 'No grades yet.';
  }

  function rowHtml(a) {
    const st = statusOf(a);
    const t = timeLeft(a.deadline);
    let stubClass = '', big = '', small = '', badge = '', action = 'Submit';

    if (st === 'graded') {
      stubClass = 'is-done'; big = a.submission.marks; small = 'of ' + a.maxMarks;
      badge = '<span class="badge ok">Graded</span>'; action = 'View grade';
    } else if (st === 'submitted') {
      stubClass = 'is-done'; big = 'Sent'; small = a.submission.late ? 'late' : 'on time';
      badge = a.submission.late ? '<span class="badge late">Submitted late</span>' : '<span class="badge ok">Submitted</span>';
      action = 'View';
    } else if (t.overdue) {
      stubClass = 'is-late'; big = t.n; small = t.unit + ' late';
      badge = '<span class="badge late">Overdue</span>';
    } else {
      stubClass = t.soon ? 'is-soon' : ''; big = t.n; small = t.unit + ' left';
    }

    return `
      <li class="row">
        <div class="stub ${stubClass}"><strong>${esc(big)}</strong><span>${esc(small)}</span></div>
        <div class="row-main">
          <h3>${esc(a.title)}</h3>
          <p class="meta">${esc(a.courseTitle)}</p>
          <p class="meta">Due ${esc(fmtDate(a.deadline))}</p>
        </div>
        <div class="row-side">
          ${badge}
          <button class="btn btn-primary" type="button" data-open="${esc(a.id)}">${action}</button>
        </div>
      </li>`;
  }

  /* ---------- assignment dialog ---------- */

  function dialogHtml(a) {
    const s = a.submission;
    const graded = s && s.marks !== null;
    const t = timeLeft(a.deadline);
    const due = 'Due ' + fmtDate(a.deadline) + (t.overdue && !s ? '. This is overdue, but you can still submit.' : '');
    const questionUrl = safeDriveUrl(a.questionUrl);
    const questionLink = questionUrl
      ? `<div class="box"><h3>Assignment questions</h3><p><a href="${esc(questionUrl)}" target="_blank" rel="noopener noreferrer">Open questions in Google Drive</a></p></div>`
      : '';

    let submissionBox = '';
    if (s) {
      const driveUrl = safeDriveUrl(s.submissionUrl);
      const driveLink = driveUrl
        ? `<a href="${esc(driveUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Drive</a>`
        : 'Invalid submission link';
      submissionBox += `
        <div class="box">
          <h3>Your submission</h3>
          <p>${driveLink}</p>
          <p class="meta">Submitted ${esc(fmtDate(s.submittedAt))}
            ${s.late ? '<span class="badge late">Late</span>' : '<span class="badge ok">On time</span>'}</p>
        </div>`;
    }
    if (graded) {
      submissionBox += `
        <div class="box">
          <h3>Grade: ${esc(s.marks)} of ${esc(a.maxMarks)}</h3>
          <p class="pre">${s.feedback ? esc(s.feedback) : 'No written feedback.'}</p>
        </div>`;
    }

    const actions = graded
      ? `<div class="dialog-actions"><button type="button" class="btn btn-primary" data-close>Close</button></div>`
      : `<form id="submit-form" novalidate>
           <div class="field">
             <label for="drive-link-input">${s ? 'Replace your submission link' : 'Google Drive submission link'}</label>
             <input type="url" id="drive-link-input" value="${s ? esc(s.submissionUrl) : ''}" placeholder="https://drive.google.com/..." autocomplete="url" required>
             <p class="hint">Set General access to Anyone with the link and Viewer. Your teacher may check version history; you can still edit the file after the deadline.</p>
             <p class="form-error" id="file-error" role="alert"></p>
           </div>
           <div class="dialog-actions">
             <button type="button" class="btn btn-quiet" data-close>Close</button>
             <button class="btn btn-primary" type="submit" id="submit-btn">${s ? 'Replace submission' : 'Submit assignment'}</button>
           </div>
         </form>`;

    return `
      <div class="dialog-body">
        <div class="dialog-head">
          <div>
            <h2 id="dlg-title">${esc(a.title)}</h2>
            <p class="meta">${esc(a.courseTitle)}</p>
          </div>
          <span class="badge">${esc(a.maxMarks)} marks</span>
        </div>
        <p class="meta">${esc(due)}</p>
        ${questionLink}
        <div class="box"><p class="pre">${a.description ? esc(a.description) : 'No description provided.'}</p></div>
        ${submissionBox}
        ${actions}
      </div>`;
  }

  function openDialog(id) {
    const a = items.find((x) => x.id === id);
    if (!a) return;
    dlg.dataset.id = id;
    dlg.innerHTML = dialogHtml(a);
    dlg.showModal();
  }

  /* ---------- events ---------- */

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (btn) openDialog(btn.dataset.open);
  });

  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    render();
  });

  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) dlg.close();
    if (e.target === dlg) dlg.close(); // click on the backdrop
  });

  dlg.addEventListener('submit', async (e) => {
    if (e.target.id !== 'submit-form') return;
    e.preventDefault();

    const input = $('#drive-link-input', dlg);
    const error = $('#file-error', dlg);
    const btn = $('#submit-btn', dlg);
    const label = btn.textContent;
    const submissionUrl = safeDriveUrl(input.value.trim());
    error.textContent = '';

    if (!submissionUrl) {
      error.textContent = 'Paste a secure link from drive.google.com or docs.google.com.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      await Submissions.submit({ assignmentId: dlg.dataset.id, submissionUrl });
      dlg.close();
      toast('Assignment submitted');
      await refresh();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#join-code');
    if (!input.value.trim()) { toast('Enter the join code from your teacher.', 'error'); return; }
    try {
      const course = await Courses.join(input.value);
      input.value = '';
      toast('Joined ' + course.title);
      await refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  refresh();
}).catch((error) => toast(error.message, 'error'));
