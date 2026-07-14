document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const wasOpen = item.classList.contains('open');
    item.closest('.faq-list').querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});

document.querySelectorAll('.faq-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.faq-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.faq-list').forEach(list => list.hidden = true);
    document.getElementById('faq-' + tab.dataset.tab).hidden = false;
  });
});

window.addEventListener('scroll', () => {
  const nav = document.querySelector('nav');
  if (window.scrollY > 50) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const modal = document.getElementById('auth-modal');
const modalClose = document.getElementById('modal-close');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const modalTabs = document.querySelectorAll('.modal-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

async function checkAuth() {
  const navAuth = document.querySelector('.nav-auth');
  if (!navAuth) return;

  if (VelvetAPI.getToken()) {
    try {
      const user = await VelvetAPI.getMe();
      navAuth.innerHTML = `
        <span class="nav-user">Welcome, ${user.username}</span>
        <a href="dashboard.html" class="btn btn-primary">Dashboard</a>
      `;
      return;
    } catch {
      VelvetAPI.logout();
    }
  }

  navAuth.innerHTML = `
    <button class="btn btn-ghost" id="login-btn">Login</button>
    <button class="btn btn-primary" id="signup-btn">Sign Up</button>
  `;
  document.getElementById('login-btn').addEventListener('click', () => openModal('login'));
  document.getElementById('signup-btn').addEventListener('click', () => openModal('signup'));
}

function openModal(tab = 'login') {
  modal.classList.add('active');
  switchTab(tab);
}

function closeModal() {
  modal.classList.remove('active');
  setTimeout(() => {
    loginForm.reset();
    signupForm.reset();
  }, 300);
}

function switchTab(tab) {
  modalTabs.forEach(t => t.classList.remove('active'));
  document.querySelector(`.modal-tab[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  } else {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  }
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
modalTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

function redirectToDashboard() {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;

  submitBtn.textContent = 'Signing in...';
  submitBtn.disabled = true;

  try {
    await VelvetAPI.login(username, password);
    closeModal();
    redirectToDashboard();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signup-username').value;
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;

  if (password !== confirm) {
    alert('Passwords do not match!');
    return;
  }

  const submitBtn = signupForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Creating account...';
  submitBtn.disabled = true;

  try {
    await VelvetAPI.register(username, password);
    closeModal();
    redirectToDashboard();
  } catch (err) {
    alert(err.message);
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.4s ease';
  setTimeout(() => { document.body.style.opacity = '1'; }, 50);
  checkAuth();
});
