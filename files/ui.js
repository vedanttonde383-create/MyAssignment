/* ui.js: small helpers shared by every page */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

/* Escape user text before putting it into innerHTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function safeDriveUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || !['drive.google.com', 'docs.google.com'].includes(url.hostname)
      || url.pathname === '/') return '';
    return url.href;
  } catch (error) {
    return '';
  }
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString([], {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* Time between now and a deadline, as a number plus a unit. */
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5);
  const h = Math.floor((abs % 864e5) / 36e5);
  const m = Math.max(1, Math.floor((abs % 36e5) / 6e4));
  let n, unit;
  if (d >= 1) { n = d; unit = d === 1 ? 'day' : 'days'; }
  else if (h >= 1) { n = h; unit = h === 1 ? 'hour' : 'hours'; }
  else { n = m; unit = m === 1 ? 'min' : 'mins'; }
  const soon = ms > 0 && !(d > 2);
  return { overdue: ms < 0, soon, n, unit };
}

/* Toasts live in a popover so they appear above open dialogs. */
function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('popover', 'manual');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  box.appendChild(el);
  try { box.hidePopover(); box.showPopover(); } catch (e) { /* popover not supported */ }
  setTimeout(() => el.remove(), 3500);
}

/* Send logged-out users to the login page, and wrong-role users to their own page. */
function requireRole(role) {
  const user = Auth.current();
  if (!user) { location.replace('index.html'); return null; }
  if (user.role !== role) {
    location.replace(user.role === 'teacher' ? 'teacher.html' : 'student.html');
    return null;
  }
  return user;
}

function renderHeader(user) {
  const home = user.role === 'teacher' ? 'teacher.html' : 'student.html';
  $('#app-header').innerHTML = `
    <div class="header-inner">
      <a class="brand" href="${home}">MyAssignment</a>
      <div class="who">
        <span>${esc(user.name)} <small>${esc(user.role)}</small></span>
        <button class="btn btn-quiet" id="logout" type="button">Log out</button>
      </div>
    </div>`;
  $('#logout').addEventListener('click', async () => {
    try {
      await Auth.logout();
      location.href = 'index.html';
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}
