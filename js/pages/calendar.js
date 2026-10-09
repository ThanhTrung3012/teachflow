// Trang Lịch: xem theo ngày / tuần / tháng — gồm lớp chính, Trial, dạy bù và lịch cá nhân.
import { esc, todayISO, addDays, startOfWeek, parseISO, toISO, weekday, DOW_SHORT, DOW_FULL, fmtDate, fmtDM, fmtHours, monthOf } from '../util.js';
import { isCounted, TYPE_LABEL, notCountedReason } from '../calc.js';
import * as store from '../store.js';
import { typeBadge, statusBadge, emptyState } from '../ui.js';
import { openEventForm } from '../forms.js';

const cal = { mode: 'month', date: todayISO(), types: { main: true, trial: true, makeup: true, personal: true } };

const evTitle = (e) => (e.type === 'personal' ? e.className : `${e.classCode || e.className}${e.lessonNo ? ' · B' + e.lessonNo : ''}`);

function stepDate(dir) {
  const d = parseISO(cal.date);
  if (cal.mode === 'month') d.setMonth(d.getMonth() + dir, 1);
  else d.setDate(d.getDate() + dir * (cal.mode === 'week' ? 7 : 1));
  cal.date = toISO(d);
}
function label() {
  const d = cal.date;
  if (cal.mode === 'month') return `Tháng ${d.slice(5, 7)}/${d.slice(0, 4)}`;
  if (cal.mode === 'week') { const s = startOfWeek(d); return `${fmtDM(s)} – ${fmtDM(addDays(s, 6))}/${addDays(s, 6).slice(0, 4)}`; }
  return `${DOW_FULL[weekday(d)]}, ${fmtDate(d)}`;
}

function card(e) {
  const counted = isCounted(e);
  return `<div class="ev-card ev-${e.type} ${e.status === 'cancelled' ? 'ev-cancelled' : ''}" data-id="${e.id}" tabindex="0">
    <div class="ev-time">${e.startTime} – ${e.endTime}</div>
    <div class="ev-title">${esc(evTitle(e))}</div>
    <div class="ev-sub">${e.type === 'personal' ? '' : esc(e.course || e.student || '')}</div>
    <div class="ev-meta">${typeBadge(e.type)} ${statusBadge(e)}
      ${e.type === 'personal' ? '' : `<span class="badge ${counted ? 'cw-yes' : 'cw-no'}" title="${esc(notCountedReason(e))}">${counted ? `Tính công · ${fmtHours(e.hours)}h` : 'Không tính công'}</span>`}</div>
  </div>`;
}

function body(evs) {
  const byDate = new Map();
  for (const e of evs) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); }
  const today = todayISO();

  if (cal.mode === 'day') {
    const list = byDate.get(cal.date) || [];
    return list.length ? `<div class="ev-list">${list.map(card).join('')}</div>` : emptyState('Không có lịch trong ngày này.');
  }
  if (cal.mode === 'week') {
    const s = startOfWeek(cal.date);
    return `<div class="week-grid">${Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i);
      const list = byDate.get(d) || [];
      return `<div class="week-col ${d === today ? 'is-today' : ''}">
        <div class="week-head" data-day="${d}"><b>${DOW_SHORT[weekday(d)]}</b><span>${fmtDM(d)}</span></div>
        ${list.length ? list.map(card).join('') : '<div class="week-empty">—</div>'}</div>`;
    }).join('')}</div>`;
  }
  // month
  const first = `${cal.date.slice(0, 7)}-01`;
  const gridStart = startOfWeek(first);
  const lastDay = addDays(first, new Date(+cal.date.slice(0, 4), +cal.date.slice(5, 7), 0).getDate() - 1);
  const weeks = Math.ceil((((parseISO(lastDay) - parseISO(gridStart)) / 86400000) + 1) / 7);
  let html = `<div class="month-grid">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => `<div class="mg-dow">${x}</div>`).join('')}`;
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gridStart, i);
    const list = byDate.get(d) || [];
    const inMonth = monthOf(d) === monthOf(first);
    html += `<div class="mg-cell ${inMonth ? '' : 'out'} ${d === today ? 'is-today' : ''}" data-day="${d}">
      <div class="mg-num">${+d.slice(8)}</div>
      ${list.slice(0, 3).map((e) => `<div class="chip ev-${e.type} ${e.status === 'cancelled' ? 'ev-cancelled' : ''}" data-id="${e.id}" title="${esc(`${e.startTime}–${e.endTime} · ${evTitle(e)} · ${TYPE_LABEL[e.type]}`)}"><i>${e.startTime}</i><span>${esc(evTitle(e))}</span></div>`).join('')}
      ${list.length > 3 ? `<div class="chip-more">+${list.length - 3} nữa</div>` : ''}
    </div>`;
  }
  return html + '</div>';
}

export function render(root, { refresh }) {
  const all = store.events().filter((e) => cal.types[e.type]);
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Lịch</h1><p class="muted">Lớp chính · Trial · Dạy bù · Lịch cá nhân</p></div>
      <div class="btn-row">
        <button class="btn" data-add="trial">＋ Trial</button>
        <button class="btn" data-add="makeup">＋ Dạy bù</button>
        <button class="btn" data-add="personal">＋ Lịch cá nhân</button>
      </div>
    </div>
    <div class="toolbar cal-bar">
      <div class="btn-row"><button class="icon-btn" data-step="-1" aria-label="Trước">‹</button>
        <button class="btn btn-sm" data-today>Hôm nay</button>
        <button class="icon-btn" data-step="1" aria-label="Sau">›</button></div>
      <h2 class="cal-label">${label()}</h2>
      <div class="seg seg-btn">${[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([v, l]) => `<button class="${cal.mode === v ? 'on' : ''}" data-mode="${v}">${l}</button>`).join('')}</div>
    </div>
    <div class="legend">${Object.entries(TYPE_LABEL).map(([k, l]) => `<label class="legend-item"><input type="checkbox" data-type="${k}" ${cal.types[k] ? 'checked' : ''}><i class="dot dot-${k}"></i>${l}</label>`).join('')}</div>
    <section class="card cal-body">${body(all)}</section>`;

  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) { stepDate(Number(step.dataset.step)); return refresh(); }
    if (e.target.closest('[data-today]')) { cal.date = todayISO(); return refresh(); }
    const mode = e.target.closest('[data-mode]');
    if (mode) { cal.mode = mode.dataset.mode; return refresh(); }
    const add = e.target.closest('[data-add]');
    if (add) return openEventForm({ type: add.dataset.add, date: cal.date });
    const ev = e.target.closest('[data-id]');
    if (ev) return openEventForm({ id: ev.dataset.id });
    const day = e.target.closest('[data-day]');
    if (day) { cal.date = day.dataset.day; cal.mode = 'day'; refresh(); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.ev-card')) openEventForm({ id: e.target.dataset.id });
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.type) { cal.types[e.target.dataset.type] = e.target.checked; refresh(); }
  });
}
