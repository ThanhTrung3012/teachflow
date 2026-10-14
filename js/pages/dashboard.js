// Trang Dashboard: tổng quan theo tháng.
import { esc, money, fmtHours, fmtDate, fmtDM, todayISO, nowHM, DOW_SHORT, weekday, fmtMonth } from '../util.js';
import { netSalary } from '../calc.js';
import * as store from '../store.js';
import { monthPickerHTML, bindMonthPicker, monthTitle, typeBadge, emptyState, toast } from '../ui.js';
import { openEventForm } from '../forms.js';

export function render(root, { refresh }) {
  const ym = store.state.month;
  const sum = store.monthSummary(ym);
  const activeClasses = store.classesList().filter((c) => c.status === 'active').length;
  const sal = store.salaryOf(ym);
  const locked = sal?.status === 'locked';
  const net = locked ? sal.finalSalary : netSalary(sum.amount, sal?.bonus, sal?.deduction);
  const stale = store.pastScheduled((e) => e.date.startsWith(ym));

  const t = todayISO(), n = nowHM();
  const upcoming = store.events()
    .filter((e) => e.status !== 'cancelled' && (e.date > t || (e.date === t && e.endTime > n)))
    .slice(0, 8);

  const maxH = Math.max(1, ...Object.values(sum.byType).map((b) => b.hours));
  const rows = [['main', 'Lớp chính'], ['trial', 'Trial'], ['makeup', 'Dạy bù']].map(([k, label]) => {
    const b = sum.byType[k];
    return `<div class="bar-row">
      <div class="bar-label">${typeBadge(k)}</div>
      <div class="bar-track"><div class="bar-fill fill-${k}" style="width:${(b.hours / maxH) * 100}%"></div></div>
      <div class="bar-val"><b>${fmtHours(b.hours)} giờ</b><small>${b.sessions} buổi · ${money(b.amount)}</small></div>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Tổng quan ${esc(monthTitle(ym))}</h1><p class="muted">Xin chào, ${esc(store.teacherName())} 👋</p></div>
      ${monthPickerHTML(ym)}
    </div>

    ${stale.length ? `<div class="alert alert-warn"><b>⏰ Cần xác nhận ${stale.length} buổi đã qua giờ:</b><ul class="stale-list">${stale.map((e) => `<li><span><b>${esc(e.classCode || e.className || 'Lớp chưa đặt tên')}</b> · ${fmtDate(e.date)} · ${e.startTime}–${e.endTime}</span><button class="btn btn-sm" data-mark-session="${e.id}">✓ Đã dạy</button></li>`).join('')}</ul><button class="btn btn-sm" id="mark-done">Đánh dấu tất cả đã dạy</button></div>` : ''}
    ${locked ? `<div class="alert alert-info">🔒 Lương tháng ${fmtMonth(ym)} đã được chốt.</div>` : ''}

    <div class="stat-grid">
      <div class="stat"><span>Lớp đang dạy</span><b>${activeClasses}</b></div>
      <div class="stat"><span>Tổng giờ công</span><b>${fmtHours(sum.hours)}<small> giờ</small></b></div>
      <div class="stat"><span>Số giờ đã dạy</span><b>${fmtHours(sum.doneHours)}<small> giờ</small></b><em>Trong tháng ${esc(fmtMonth(ym))}</em></div>
      <div class="stat"><span>Tổng số buổi dạy</span><b>${sum.sessions}</b><em>${sum.cancelled ? `${sum.cancelled} buổi nghỉ không tính` : 'Chưa có buổi nghỉ'}</em></div>
      <div class="stat"><span>Ca Trial</span><b>${sum.byType.trial.sessions}</b></div>
      <div class="stat"><span>Buổi dạy bù</span><b>${sum.byType.makeup.sessions}</b></div>
      <div class="stat"><span>Tiền công${locked ? '' : ' dự kiến'}</span><b class="salary-value">${money(locked ? sal.totalSalary : sum.amount)}</b>
        <em>11.000.000đ cho tối đa 70 giờ; từ giờ 71 cộng 180.000đ/giờ</em></div>
      <div class="stat stat-accent"><span>Lương tháng (thực nhận)</span><b class="salary-value">${money(net)}</b>
        <em>${sal ? `${{ draft: 'Nháp', checked: 'Đã kiểm tra', locked: 'Đã chốt' }[sal.status]} · thưởng ${money(sal.bonus)} · khấu trừ ${money(sal.deduction)}` : 'Chưa lập bảng lương'}</em></div>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>Giờ công theo loại</h2>
        ${rows}
        <div class="total-line"><span>Tổng cộng</span><b>${fmtHours(sum.hours)} giờ · ${money(sum.amount)}</b></div>
        <div class="total-line"><span>Số giờ đã dạy trong tháng</span><b>${fmtHours(sum.doneHours)} giờ</b></div>
        <a class="link" href="#/results">Xem Bảng kết quả chi tiết →</a>
      </section>
      <section class="card">
        <div class="card-head"><h2>Lịch dạy sắp tới</h2></div>
        ${upcoming.length ? `<ul class="upcoming">${upcoming.map((e) => `
          <li data-id="${e.id}">
            <div class="up-date"><b>${fmtDM(e.date)}</b><small>${DOW_SHORT[weekday(e.date)]}</small></div>
            <div class="up-main"><b>${esc(e.type === 'personal' ? e.className : e.classCode || e.className)}</b>
              <small>${e.startTime} – ${e.endTime} · ${e.type === 'personal' ? 'Lịch cá nhân' : esc(e.course || e.className || '')}</small></div>
            ${typeBadge(e.type)}
          </li>`).join('')}</ul>` : emptyState('Chưa có lịch sắp tới.')}
      </section>
    </div>`;

  bindMonthPicker(root, () => store.state.month, (v) => store.setMonth(v));
  root.querySelector('#mark-done')?.addEventListener('click', async () => {
    try { toast(`Đã đánh dấu ${await store.markPastDone({ ym })} buổi là "Đã dạy".`); } catch (e) { toast(store.friendlyError(e), 'err'); }
  });
  root.querySelector('.stale-list')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mark-session]'); if (!b) return;
    try { await store.markPastDone({ sessionId: b.dataset.markSession }); toast('Đã xác nhận buổi dạy.'); } catch (ex) { toast(store.friendlyError(ex), 'err'); }
  });
  root.querySelector('.upcoming')?.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) openEventForm({ id: li.dataset.id });
  });
}
