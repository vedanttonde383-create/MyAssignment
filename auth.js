/* auth.js: login and registration page */

window.firebaseReady.then(() => {
  const existing = Auth.current();
  if (existing) {
    location.replace(existing.role === 'teacher' ? 'teacher.html' : 'student.html');
    return;
  }

  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const tabLogin = $('#tab-login');
  const tabRegister = $('#tab-register');
  const errorBox = $('#auth-error');

  function showTab(which) {
    const isLogin = which === 'login';
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabRegister.setAttribute('aria-selected', String(!isLogin));
    errorBox.textContent = '';
  }

  tabLogin.addEventListener('click', () => showTab('login'));
  tabRegister.addEventListener('click', () => showTab('register'));

  function goHome(user) {
    location.href = user.role === 'teacher' ? 'teacher.html' : 'student.html';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const email = $('#login-email').value;
    const password = $('#login-password').value;
    if (!email.trim() || !password) {
      errorBox.textContent = 'Enter your email and password.';
      return;
    }
    const btn = $('#login-btn');
    btn.disabled = true;
    try {
      goHome(await Auth.login(email, password));
    } catch (err) {
      errorBox.textContent = err.message;
      btn.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.textContent = '';
    const btn = $('#register-btn');
    btn.disabled = true;
    try {
      const user = await Auth.register({
        name: $('#reg-name').value,
        email: $('#reg-email').value,
        password: $('#reg-password').value,
        role: registerForm.querySelector('input[name="role"]:checked').value,
      });
      goHome(user);
    } catch (err) {
      errorBox.textContent = err.message;
      btn.disabled = false;
    }
  });
}).catch((error) => {
  const errorBox = $('#auth-error');
  if (errorBox) errorBox.textContent = error.message;
});
