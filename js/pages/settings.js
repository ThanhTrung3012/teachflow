// Trang Cài đặt: thông tin giáo viên, đơn giá gợi ý, sao lưu, đăng xuất.
import { esc, money } from '../util.js';
import * as store from '../store.js';
import { toast, downloadFile } from '../ui.js';

export function render(root, { onSignOut }) {
  const s = store.state.settings;
  const u = store.state.user;
  const local = store.backendMode() === 'local';
  root.innerHTML = `
    <div class="page-head"><div><h1>Cài đặt</h1></div></div>
    ${local ? '<div class="alert alert-warn">🧪 <b>Chế độ thử nghiệm:</b> chưa cấu hình Firebase nên dữ liệu chỉ lưu trong trình duyệt này. Điền <code>js/config.js</code> để dùng Firebase thật (xem README).</div>' : ''}
    <div class="grid-2">
      <section class="card">
        <h2>Thông tin giáo viên</h2>
        <form id="set-form" class="form-grid">
          <label class="field span-2"><span>Tên giáo viên (hiển thị là "GV chính / GV dạy")</span><input name="teacherName" value="${esc(s.teacherName)}" required></label>
          <label class="field"><span>Đơn giá gợi ý — lớp mới (đ/giờ)</span><input type="number" name="defaultRate" min="0" step="1000" value="${s.defaultRate}"></label>
          <label class="field"><span>Đơn giá gợi ý — Trial</span><input type="number" name="trialRate" min="0" step="1000" value="${s.trialRate}"></label>
          <label class="field"><span>Đơn giá gợi ý — Dạy bù</span><input type="number" name="makeupRate" min="0" step="1000" value="${s.makeupRate}"></label>
          <div class="span-2"><button class="btn btn-primary" type="submit">Lưu cài đặt</button></div>
        </form>
        <p class="hint">Đơn giá gợi ý chỉ điền sẵn vào form. Mỗi buổi vẫn giữ đơn giá riêng của nó.</p>
      </section>
      <section class="card">
        <h2>Cài TeachFlow lên điện thoại</h2>
        <p class="hint">Thêm TeachFlow vào màn hình chính để mở như một ứng dụng. Cần truy cập website qua HTTPS.</p>
        <div class="btn-row wrap" style="margin:12px 0">
          <button class="btn btn-primary" id="install-app" type="button">Cài ứng dụng</button>
        </div>
        <p id="install-help" class="hint" aria-live="polite">Android: bấm “Cài ứng dụng” hoặc chọn “Cài đặt ứng dụng” trong menu trình duyệt. iPhone/iPad: mở bằng Safari, bấm nút Chia sẻ rồi chọn “Thêm vào MH chính”.</p>
      </section>
      <section class="card">
        <h2>Tài khoản</h2>
        <div class="info-grid one"><div><span>Email</span><b>${esc(u.email)}</b></div><div><span>Nơi lưu dữ liệu</span><b>${local ? 'Trình duyệt này (thử nghiệm)' : 'Firebase Firestore'}</b></div></div>
        <div class="btn-row wrap" style="margin-top:14px">
          <button class="btn" id="backup">⬇ Sao lưu dữ liệu (JSON)</button>
          <button class="btn btn-danger-ghost" id="logout">Đăng xuất</button>
        </div>
      </section>
    </div>`;

  root.querySelector('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await store.saveSettings({
        teacherName: fd.get('teacherName').trim() || s.teacherName,
        defaultRate: Number(fd.get('defaultRate')) || 0, trialRate: Number(fd.get('trialRate')) || 0, makeupRate: Number(fd.get('makeupRate')) || 0,
      });
      toast('Đã lưu cài đặt.');
    } catch (ex) { toast(store.friendlyError(ex), 'err'); }
  });
  const installButton = root.querySelector('#install-app');
  const installHelp = root.querySelector('#install-help');
  const updateInstallState = () => {
    const available = Boolean(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
    installButton.textContent = available ? 'Đã cài trên thiết bị này' : 'Cài ứng dụng';
    installButton.disabled = available;
  };
  installButton.onclick = () => {
    window.dispatchEvent(new Event('teachflow-install'));
    if (!window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
      installHelp.textContent = 'Nếu không thấy hộp thoại cài đặt, hãy mở menu trình duyệt và chọn “Thêm vào màn hình chính” hoặc “Cài đặt ứng dụng”. Trên iPhone/iPad, dùng Safari → Chia sẻ → Thêm vào MH chính.';
    }
  };
  window.addEventListener('teachflow-install-ready', updateInstallState);
  window.addEventListener('teachflow-installed', updateInstallState);
  updateInstallState();
  root.querySelector('#backup').onclick = () => downloadFile(`teachflow-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportAll(), null, 2), 'application/json');
  root.querySelector('#logout').onclick = onSignOut;
}
