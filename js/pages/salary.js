// Trang Lương: tổng hợp theo tháng, thưởng / khấu trừ, thực nhận, và chốt lương.
import { esc, money, fmtHours, fmtDate, fmtMonth, round2 } from '../util.js';
import { netSalary, TYPE_LABEL } from '../calc.js';
import * as store from '../store.js';
import { typeBadge, toast, confirmDialog } from '../ui.js';

const STATUS = { draft: 'Nháp', checked: 'Đã kiểm tra', locked: 'Đã chốt' };
const salaryValue = (n) => `<span class="salary-value">${money(n)}</span>`;

export function render(root) {
  const ym = store.state.month;
  const [yy, mm] = ym.split('-');
  const live = store.liveSalary(ym);
  const sal = store.salaryOf(ym);
  const locked = sal?.status === 'locked';
  const status = sal?.status || 'draft';

  // Tháng đã chốt → hiển thị số liệu đã chốt (ổn định), không theo dữ liệu hiện tại
  const d = locked
    ? { classes: sal.totalClasses, sessions: sal.totalSessions, hours: sal.totalHours, main: sal.mainHours, trial: sal.trialHours, makeup: sal.makeupHours, amount: sal.totalSalary, lines: sal.lines || [] }
    : { classes: live.sum.classes, sessions: live.sum.sessions, hours: live.sum.hours, main: live.sum.byType.main.hours, trial: live.sum.byType.trial.hours, makeup: live.sum.byType.makeup.hours, amount: live.sum.amount, lines: live.lines };
  const bonus = sal?.bonus || 0, deduction = sal?.deduction || 0;

  const drift = locked && (live.sum.amount !== sal.totalSalary || live.sum.hours !== sal.totalHours);
  const stale = locked ? [] : store.pastScheduled((e) => e.date.startsWith(ym));

  // gom theo lớp để đối chiếu
  const byClass = new Map();
  for (const l of d.lines) {
    const k = `${l.type === 'trial' ? 'Trial' : l.classCode || l.className}|${l.type === 'makeup' ? 'makeup' : l.type === 'trial' ? 'trial' : 'main'}`;
    const o = byClass.get(k) || { name: l.type === 'trial' ? 'Trial' : l.classCode || l.className, type: l.type, sessions: 0, hours: 0, amount: 0 };
    o.sessions++; o.hours += l.hours; o.amount += l.amount;
    byClass.set(k, o);
  }
  const classRows = [...byClass.values()].sort((a, b) => a.name.localeCompare(b.name));

  const years = [Number(yy) - 1, Number(yy), Number(yy) + 1];
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Lương tháng ${fmtMonth(ym)} <span class="badge ls-${status}">${locked ? '🔒 ' : ''}${STATUS[status]}</span></h1>
        <p class="muted">Lương KPI: có giờ công nhận 11.000.000đ lương cứng cho tối đa 70 giờ; từ giờ thứ 71 cộng 180.000đ/giờ.</p></div>
      <div class="btn-row">
        <select id="sel-m" aria-label="Tháng">${Array.from({ length: 12 }, (_, i) => `<option value="${String(i + 1).padStart(2, '0')}" ${Number(mm) === i + 1 ? 'selected' : ''}>Tháng ${i + 1}</option>`).join('')}</select>
        <select id="sel-y" aria-label="Năm">${years.map((y) => `<option ${y === Number(yy) ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>
    </div>

    ${locked ? `<div class="alert alert-info">🔒 Tháng này đã chốt${sal.lockedAt ? ' lúc ' + new Date(sal.lockedAt).toLocaleString('vi-VN') : ''}. Số liệu bên dưới là bản đã chốt và sẽ không tự thay đổi. Muốn sửa buổi dạy hoặc lương, hãy bấm "Mở khóa".</div>` : ''}
    ${drift ? `<div class="alert alert-warn">⚠️ Dữ liệu buổi dạy hiện tại (${fmtHours(live.sum.hours)} giờ · ${money(live.sum.amount)}) khác bản đã chốt. Bản đã chốt vẫn được giữ nguyên.</div>` : ''}
    ${stale.length ? `<div class="alert alert-warn"><b>⏰ Cần xác nhận ${stale.length} buổi đã qua giờ:</b><ul class="stale-list">${stale.map((e) => `<li><span><b>${esc(e.classCode || e.className || 'Lớp chưa đặt tên')}</b> · ${fmtDate(e.date)} · ${e.startTime}–${e.endTime}</span><button class="btn btn-sm" data-mark-session="${e.id}">✓ Đã dạy</button></li>`).join('')}</ul><button class="btn btn-sm" id="mark-done">Đánh dấu tất cả đã dạy</button> <a class="link" href="#/results">Xem bảng kết quả</a></div>` : ''}

    <div class="stat-grid stat-grid-sm">
      <div class="stat"><span>Tổng lớp</span><b>${d.classes}</b></div>
      <div class="stat"><span>Tổng buổi</span><b>${d.sessions}</b></div>
      <div class="stat"><span>Tổng giờ công</span><b>${fmtHours(d.hours)}<small> giờ</small></b></div>
      <div class="stat"><span>Giờ lớp chính</span><b>${fmtHours(d.main)}</b></div>
      <div class="stat"><span>Giờ Trial</span><b>${fmtHours(d.trial)}</b></div>
      <div class="stat"><span>Giờ dạy bù</span><b>${fmtHours(d.makeup)}</b></div>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>Bảng lương</h2>
        <div class="pay-row"><span>Lương KPI</span><b>${salaryValue(d.amount)}</b></div>
        <label class="pay-row"><span>＋ Thưởng</span><input type="number" id="bonus" min="0" step="1000" value="${bonus}" ${locked ? 'disabled' : ''}></label>
        <label class="pay-row"><span>－ Khấu trừ</span><input type="number" id="deduction" min="0" step="1000" value="${deduction}" ${locked ? 'disabled' : ''}></label>
        <div class="pay-row pay-total"><span>Thực nhận</span><b id="net" class="salary-value">${money(netSalary(d.amount, bonus, deduction))}</b></div>
        <p class="hint">Thực nhận = Tổng tiền công + Thưởng − Khấu trừ</p>
        <div class="btn-row wrap">
          ${locked
            ? '<button class="btn btn-warn" id="unlock">🔓 Mở khóa để chỉnh sửa</button>'
            : `<button class="btn" id="save-draft">Lưu nháp</button>
               <button class="btn" id="save-checked">✔ Đã kiểm tra</button>
               <button class="btn btn-primary" id="lock">🔒 Chốt lương</button>`}
        </div>
      </section>

      <section class="card">
        <h2>Đối chiếu theo lớp</h2>
        ${classRows.length ? `<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Lớp</th><th>Loại</th><th class="num">Buổi</th><th class="num">Giờ</th><th class="num">Tiền</th></tr></thead>
          <tbody>${classRows.map((r) => `<tr><td><b>${esc(r.name)}</b></td><td>${typeBadge(r.type)}</td><td class="num">${r.sessions}</td><td class="num">${fmtHours(r.hours)}</td><td class="num">${money(r.amount)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">Tổng</td><td class="num">${d.sessions}</td><td class="num">${fmtHours(round2(classRows.reduce((s, r) => s + r.hours, 0)))}</td><td class="num"><b>${money(classRows.reduce((s, r) => s + r.amount, 0))}</b></td></tr></tfoot>
        </table></div>` : '<p class="muted">Chưa có buổi nào được tính công trong tháng này.</p>'}
      </section>
    </div>

    <section class="card">
      <details>
        <summary><b>Chi tiết ${d.lines.length} buổi được tính công</b> — đơn giá từng buổi chỉ để đối chiếu, tổng lương tính theo KPI tháng</summary>
        <div class="table-wrap table-tall"><table class="tbl">
          <thead><tr><th>Ngày</th><th>Loại</th><th>Lớp</th><th>Giờ</th><th class="num">Số giờ</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>${d.lines.map((l) => `<tr><td>${fmtDate(l.date)}</td><td>${esc(TYPE_LABEL[l.type])}</td><td>${esc(l.classCode || l.className)}</td><td>${l.startTime}–${l.endTime}</td><td class="num">${fmtHours(l.hours)}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="4">Tổng</td><td class="num">${fmtHours(d.hours)}</td><td></td><td class="num"><b>${money(d.lines.reduce((s, l) => s + l.amount, 0))}</b></td></tr></tfoot>
        </table></div>
      </details>
    </section>`;

  const setYM = () => store.setMonth(`${root.querySelector('#sel-y').value}-${root.querySelector('#sel-m').value}`);
  root.querySelector('#sel-m').onchange = setYM;
  root.querySelector('#sel-y').onchange = setYM;

  const val = (id) => Math.max(0, Math.round(Number(root.querySelector(id)?.value) || 0));
  const updateNet = () => { root.querySelector('#net').textContent = money(netSalary(d.amount, val('#bonus'), val('#deduction'))); };
  root.querySelector('#bonus')?.addEventListener('input', updateNet);
  root.querySelector('#deduction')?.addEventListener('input', updateNet);

  const save = async (st, msg) => {
    try { await store.saveSalary(ym, { bonus: val('#bonus'), deduction: val('#deduction'), status: st }); toast(msg); } catch (e) { toast(store.friendlyError(e), 'err'); }
  };
  root.querySelector('#save-draft')?.addEventListener('click', () => save('draft', 'Đã lưu nháp.'));
  root.querySelector('#save-checked')?.addEventListener('click', () => save('checked', 'Đã đánh dấu đã kiểm tra.'));
  root.querySelector('#lock')?.addEventListener('click', async () => {
    const net = netSalary(live.sum.amount, val('#bonus'), val('#deduction'));
    const ok = await confirmDialog({
      title: `Chốt lương tháng ${fmtMonth(ym)}?`, okText: 'Chốt lương',
      message: `Thực nhận: <b>${money(net)}</b> (${fmtHours(live.sum.hours)} giờ, ${live.sum.sessions} buổi).<br>Sau khi chốt, số liệu được giữ cố định và <b>không thể sửa các buổi dạy của tháng này</b> cho tới khi bạn mở khóa.${stale.length ? `<br><br>⚠️ Còn ${stale.length} buổi đã qua nhưng chưa xác nhận "Đã dạy".` : ''}`,
    });
    if (ok) save('locked', 'Đã chốt lương.');
  });
  root.querySelector('#unlock')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Mở khóa lương', okText: 'Mở khóa', message: 'Mở khóa để chỉnh sửa các buổi dạy và bảng lương của tháng này? Bản đã chốt sẽ được thay bằng số liệu hiện tại khi bạn chốt lại.' });
    if (!ok) return;
    try { await store.unlockSalary(ym); toast('Đã mở khóa. Trạng thái: Đã kiểm tra.'); } catch (e) { toast(store.friendlyError(e), 'err'); }
  });
  root.querySelector('#mark-done')?.addEventListener('click', async () => {
    try { toast(`Đã đánh dấu ${await store.markPastDone({ ym })} buổi là "Đã dạy".`); } catch (e) { toast(store.friendlyError(e), 'err'); }
  });
  root.querySelector('.stale-list')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mark-session]'); if (!b) return;
    try { await store.markPastDone({ sessionId: b.dataset.markSession }); toast('Đã xác nhận buổi dạy.'); } catch (ex) { toast(store.friendlyError(ex), 'err'); }
  });
}
