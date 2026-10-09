// Bảng kết quả: MỘT bảng duy nhất cho toàn bộ giờ dạy, để kiểm tra & đối chiếu công.
import { esc, money, fmtHours, fmtDate, DOW_SHORT, weekday, norm, fmtMonth } from '../util.js';
import { TYPE_LABEL, STATUS_LABEL, isCounted, payable, summarize, notCountedReason } from '../calc.js';
import * as store from '../store.js';
import { monthPickerHTML, bindMonthPicker, typeBadge, statusBadge, emptyState, downloadFile } from '../ui.js';
import { openEventForm } from '../forms.js';

const F = { q: '', type: '', cls: '', status: '', count: '' };
const classKey = (e) => e.classId || (e.classCode ? 'x:' + norm(e.classCode) : '');

function applyFilters(ym) {
  const q = norm(F.q);
  return store.events().filter((e) => {
    if (ym && !e.date.startsWith(ym)) return false;
    if (F.type && e.type !== F.type) return false;
    if (F.cls && classKey(e) !== F.cls) return false;
    if (F.status && (e.type === 'personal' || e.status !== F.status)) return false;
    if (F.count === 'yes' && !isCounted(e)) return false;
    if (F.count === 'no' && isCounted(e)) return false;
    if (q && ![e.classCode, e.className, e.course, e.student, e.mainTeacher, e.actualTeacher, e.note, e.title].some((x) => norm(x).includes(q))) return false;
    return true;
  });
}

function rowHTML(e) {
  const counted = isCounted(e);
  const personal = e.type === 'personal';
  const reason = notCountedReason(e);
  return `<tr class="${e.status === 'cancelled' ? 'row-cancelled' : ''} ${personal ? 'row-personal' : ''}" data-id="${e.id}">
    <td class="nowrap">${fmtDate(e.date)} <small class="muted">${DOW_SHORT[weekday(e.date)]}</small></td>
    <td>${typeBadge(e.type)}</td>
    <td><b>${esc(personal ? e.className : e.classCode)}</b>${e.lessonNo ? `<br><small class="muted">Buổi ${e.lessonNo}</small>` : ''}</td>
    <td>${esc(e.course)}</td>
    <td>${esc(e.student)}</td>
    <td>${esc(e.mainTeacher)}</td>
    <td>${esc(e.actualTeacher)}</td>
    <td class="nowrap">${e.startTime}</td>
    <td class="nowrap">${e.endTime}</td>
    <td class="num">${fmtHours(e.hours)}</td>
    <td class="num">${personal ? '—' : money(e.hourlyRate)}</td>
    <td class="num ${counted ? '' : 'muted'}"><b>${money(payable(e))}</b></td>
    <td>${statusBadge(e)}</td>
    <td><span class="badge ${counted ? 'cw-yes' : 'cw-no'}" ${reason ? `title="${esc(reason)}"` : ''}>${counted ? 'Có' : 'Không'}</span>${!counted && reason && !personal && e.status !== 'cancelled' ? `<br><small class="muted">${esc(reason)}</small>` : ''}</td>
    <td class="note-cell">${esc(e.note)}</td>
  </tr>`;
}

function tableHTML(list, ym) {
  if (!list.length) return emptyState('Không có dữ liệu phù hợp với bộ lọc.');
  const s = summarize(list);
  return `<div class="table-wrap table-tall"><table class="tbl tbl-results clickable">
    <thead><tr><th>Ngày</th><th>Loại</th><th>Lớp</th><th>Khóa học</th><th>Học viên</th><th>GV chính</th><th>GV dạy</th><th>Bắt đầu</th><th>Kết thúc</th><th class="num">Số giờ</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th>Trạng thái</th><th>Tính công</th><th>Ghi chú</th></tr></thead>
    <tbody>${list.map(rowHTML).join('')}</tbody>
    <tfoot><tr><td colspan="9">Tổng (chỉ các dòng <b>tính công</b> trong bộ lọc): ${s.sessions} buổi</td>
      <td class="num"><b>${fmtHours(s.hours)}</b></td><td></td><td class="num"><b>${money(s.amount)}</b></td><td colspan="3"></td></tr></tfoot>
  </table></div>
  <div class="summary-strip">
    <span>Lớp chính <b>${fmtHours(s.byType.main.hours)}h</b> · ${money(s.byType.main.amount)}</span>
    <span>Trial <b>${fmtHours(s.byType.trial.hours)}h</b> · ${money(s.byType.trial.amount)}</span>
    <span>Dạy bù <b>${fmtHours(s.byType.makeup.hours)}h</b> · ${money(s.byType.makeup.amount)}</span>
    <span class="grow">Tổng <b>${fmtHours(s.hours)} giờ</b> · <b>${money(s.amount)}</b></span>
  </div>`;
}

export function render(root) {
  const ym = store.state.month;
  const classOpts = new Map();
  for (const e of store.events()) {
    const k = classKey(e);
    if (k && e.type !== 'personal') classOpts.set(k, e.classCode || e.className);
  }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Bảng kết quả</h1><p class="muted">${ym ? 'Tháng ' + fmtMonth(ym) : 'Tất cả các tháng'} · bấm vào một dòng để xem / sửa</p></div>
      <div class="btn-row">${monthPickerHTML(ym, { allowAll: true })}<button class="btn" id="csv">⬇ Xuất CSV</button></div>
    </div>
    <div class="toolbar filters">
      <input type="search" id="f-q" placeholder="Tìm lớp, học viên, giáo viên, ghi chú…" value="${esc(F.q)}">
      <select id="f-type"><option value="">Mọi loại</option>${Object.entries(TYPE_LABEL).map(([v, l]) => `<option value="${v}" ${F.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="f-cls"><option value="">Mọi lớp</option>${[...classOpts].sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => `<option value="${k}" ${F.cls === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select id="f-status"><option value="">Mọi trạng thái</option>${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${F.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="f-count"><option value="">Tính công: tất cả</option><option value="yes" ${F.count === 'yes' ? 'selected' : ''}>Có tính công</option><option value="no" ${F.count === 'no' ? 'selected' : ''}>Không tính công</option></select>
      <button class="btn btn-sm" id="f-reset">Xóa lọc</button>
    </div>
    <section class="card card-flush" id="res-table"></section>`;

  const draw = () => { root.querySelector('#res-table').innerHTML = tableHTML(applyFilters(ym), ym); };
  draw();

  bindMonthPicker(root, () => store.state.month, (v) => store.setMonth(v));
  const bind = (id, key, ev = 'change') => root.querySelector(id).addEventListener(ev, (e) => { F[key] = e.target.value; draw(); });
  bind('#f-q', 'q', 'input'); bind('#f-type', 'type'); bind('#f-cls', 'cls'); bind('#f-status', 'status'); bind('#f-count', 'count');
  root.querySelector('#f-reset').onclick = () => { Object.assign(F, { q: '', type: '', cls: '', status: '', count: '' }); store.setMonth(store.state.month); };
  root.querySelector('#res-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openEventForm({ id: tr.dataset.id });
  });
  root.querySelector('#csv').onclick = () => {
    const list = applyFilters(ym);
    const head = ['Ngày', 'Loại', 'Lớp', 'Khóa học', 'Học viên', 'GV chính', 'GV dạy', 'Bắt đầu', 'Kết thúc', 'Số giờ', 'Đơn giá', 'Thành tiền', 'Trạng thái', 'Tính công', 'Ghi chú'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = list.map((e) => [fmtDate(e.date), TYPE_LABEL[e.type], e.type === 'personal' ? e.className : e.classCode, e.course, e.student, e.mainTeacher, e.actualTeacher, e.startTime, e.endTime, Math.round(e.hours * 100) / 100, e.hourlyRate, payable(e), e.type === 'personal' ? '' : STATUS_LABEL[e.status], isCounted(e) ? 'Có' : 'Không', e.note].map(q).join(','));
    downloadFile(`bang-ket-qua-${ym || 'tat-ca'}.csv`, '﻿' + [head.map(q).join(','), ...rows].join('\r\n'), 'text/csv');
  };
}
