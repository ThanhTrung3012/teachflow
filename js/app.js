// Điểm vào của ứng dụng: xác thực, bố cục (sidebar), bộ định tuyến theo hash (#/trang).
import * as store from './store.js';
import { toast, $ } from './ui.js';
import { esc } from './util.js';
import * as dashboard from './pages/dashboard.js';
import * as classes from './pages/classes.js';
import * as calendar from './pages/calendar.js';
import * as results from './pages/results.js';
import * as salary from './pages/salary.js';
import * as settings from './pages/settings.js';

const PAGES = { dashboard, classes, calendar, results, salary, settings };
const MENU = [
  ['dashboard', '🏠', 'Dashboard'],
  ['classes', '📚', 'Lớp học'],
  ['calendar', '📅', 'Lịch'],
  ['results', '📋', 'Bảng kết quả'],
  ['salary', '💰', 'Lương'],
  ['settings', '⚙️', 'Cài đặt'],
];

const app = document.getElementById('app');
let shellReady = false;
let loadingUid = null;

// ---------------------------------------------------------------- router
const parseRoute = () => {
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  return { page: PAGES[parts[0]] ? parts[0] : 'dashboard', params: parts.slice(1) };
};
export const navigate = (path) => { location.hash = '#/' + path; };

function renderPage() {
  if (!shellReady || !store.state.user) return;
  const { page, params } = parseRoute();
  const view = $('#view');
  const y = window.scrollY;
  const root = document.createElement('div'); // container mới mỗi lần render → không dồn listener cũ
  root.className = 'page';
  view.replaceChildren(root);
  try {
    PAGES[page].render(root, { params, refresh: renderPage, navigate, onSignOut: signOut });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="alert alert-warn">Không hiển thị được trang này: ${esc(e.message)}</div>`;
  }
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
  document.body.classList.remove('nav-open');
  window.scrollTo(0, y);
}

// ---------------------------------------------------------------- shell
function showShell() {
  const u = store.state.user;
  app.innerHTML = `
    <div class="layout">
      <header class="topbar">
        <button class="icon-btn" id="burger" aria-label="Menu">☰</button>
        <b>TeachFlow</b>
      </header>
      <aside class="sidebar">
        <div class="brand"><span class="logo">📘</span><div><b>TeachFlow</b><small>Lịch dạy & lương</small></div></div>
        <nav class="menu">${MENU.map(([k, ico, label]) => `<a href="#/${k}" data-page="${k}"><span>${ico}</span>${label}</a>`).join('')}</nav>
        <div class="side-user">
          <div class="avatar">${esc((store.teacherName()[0] || '?').toUpperCase())}</div>
          <div class="who"><b>${esc(store.teacherName())}</b><small>${esc(u.email)}</small></div>
          <button class="icon-btn" id="logout" title="Đăng xuất" aria-label="Đăng xuất">⏻</button>
        </div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <main id="view"></main>
    </div>`;
  shellReady = true;
  $('#burger').onclick = () => document.body.classList.toggle('nav-open');
  $('#scrim').onclick = () => document.body.classList.remove('nav-open');
  $('#logout').onclick = signOut;
  renderPage();
}

async function signOut() {
  try { await store.signOutUser(); } catch (e) { toast(store.friendlyError(e), 'err'); }
  showLogin();
}

// ---------------------------------------------------------------- login
function showLogin() {
  shellReady = false;
  const local = store.backendMode() === 'local';
  let mode = 'login';
  const draw = () => {
    app.innerHTML = `
      <div class="auth-wrap"><div class="auth-card">
        <div class="auth-brand"><span class="logo lg">📘</span><h1>TeachFlow</h1><p>Quản lý lịch dạy, giờ công và lương cho giáo viên</p></div>
        ${local ? '<div class="alert alert-warn">🧪 Chế độ thử nghiệm (chưa cấu hình Firebase): dữ liệu lưu trong trình duyệt này. Bấm <b>Tạo tài khoản</b> để bắt đầu.</div>' : ''}
        <div class="seg seg-btn auth-tabs"><button class="${mode === 'login' ? 'on' : ''}" data-mode="login">Đăng nhập</button><button class="${mode === 'signup' ? 'on' : ''}" data-mode="signup">Tạo tài khoản</button></div>
        <form id="auth-form" class="form-grid one" novalidate>
          ${mode === 'signup' ? '<label class="field"><span>Tên giáo viên</span><input name="name" autocomplete="name" placeholder="VD: Nguyễn Văn A"></label>' : ''}
          <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
          <label class="field"><span>Mật khẩu</span><input type="password" name="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="6"></label>
          <button class="btn btn-primary btn-block" type="submit">${mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
          ${mode === 'login' && !local ? '<button class="link-btn" type="button" id="forgot">Quên mật khẩu?</button>' : ''}
        </form>
        ${!local ? '<div class="auth-divider"><span>hoặc</span></div><button class="btn btn-google btn-block" type="button" id="google-login"><span class="google-mark" aria-hidden="true">G</span>Tiếp tục với Google</button>' : ''}
      </div></div>`;
    $('.auth-tabs').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { mode = b.dataset.mode; draw(); } };
    $('#forgot')?.addEventListener('click', async () => {
      const email = $('#auth-form').email.value.trim();
      if (!email) return toast('Nhập email trước, rồi bấm "Quên mật khẩu?".', 'err');
      try { await store.resetPassword(email); toast('Đã gửi email đặt lại mật khẩu.'); } catch (e) { toast(store.friendlyError(e), 'err'); }
    });
    $('#google-login')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await store.signInWithGoogle(); }
      catch (ex) { toast(store.friendlyError(ex), 'err'); btn.disabled = false; }
    });
    $('#auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector('button[type=submit]');
      if (!f.email.value.trim() || f.password.value.length < 6) return toast('Nhập email và mật khẩu (tối thiểu 6 ký tự).', 'err');
      btn.disabled = true;
      try {
        if (mode === 'login') await store.signIn(f.email.value, f.password.value);
        else await store.signUp(f.email.value, f.password.value, f.name?.value.trim());
      } catch (ex) { toast(store.friendlyError(ex), 'err'); btn.disabled = false; }
    });
  };
  draw();
}

function showLoading(text = 'Đang tải dữ liệu…') {
  shellReady = false;
  app.innerHTML = `<div class="loading"><div class="spinner"></div><p>${text}</p></div>`;
}

// ---------------------------------------------------------------- boot
async function boot() {
  showLoading('Đang khởi động…');
  try {
    await store.initBackend();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="alert alert-warn">Không kết nối được Firebase: ${esc(e.message)}<br>Kiểm tra lại <code>js/config.js</code> và kết nối mạng.</div></div></div>`;
    return;
  }
  store.onAuthChange(async (user) => {
    if (!user) { loadingUid = null; showLogin(); return; }
    if (loadingUid === user.uid) return;
    loadingUid = user.uid;
    showLoading();
    try {
      await store.loadUserData(user);
      showShell();
    } catch (e) {
      console.error(e);
      loadingUid = null;
      toast(store.friendlyError(e), 'err', 8000);
      await store.signOutUser().catch(() => {});
      showLogin();
    }
  });
  store.subscribe(renderPage);
  window.addEventListener('hashchange', renderPage);
}

boot();
