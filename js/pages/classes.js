// Trang Lớp học: danh sách + chi tiết lớp (kèm danh sách buổi, nghỉ / khôi phục).
import { esc, money, fmtHours, fmtDate, DOW_SHORT, DOW_FULL, weekday, norm } from '../util.js';
import { CLASS_STATUS_LABEL, CLASS_TYPE_LABEL, STATUS_LABEL } from '../calc.js';
import * as store from '../store.js';
import { classStatusBadge, emptyState, confirmDialog, toast } from '../ui.js';
import { openClassForm, openEventForm, cancelSessionFlow, restoreSessionFlow } from '../forms.js';

const filters = { q: '', status: '' };

const scheduleText = (c) => `${[...c.studyDays].sort((a, b) => ((a || 7) - (b || 7))).map((d) => (d === 0 ? 'CN' : 'T' + (d + 1))).join(' + ')} · ${c.startTime}–${c.endTime}`;

function progress(c) {
  const main = store.classMain(c.id);
  const active = main.filter((s) => s.status !== 'cancelled');
  const done = active.filter((s) => s.status === 'done').length;
  return { total: active.length, done, cancelled: main.length - active.length };
}

function completionDate(c) {
  const doneDates = store.classMain(c.id).filter((s) => s.status === 'done').map((s) => s.date).sort();
  return doneDates.at(-1) || c.endDate || '';
}

function sortClasses(classes) {
  return [...classes].sort((a, b) => {
    const aEnded = a.status === 'ended', bEnded = b.status === 'ended';
    if (aEnded !== bEnded) return aEnded ? 1 : -1;
    if (aEnded) return completionDate(b).localeCompare(completionDate(a)) || a.classCode.localeCompare(b.classCode);
    return a.classCode.localeCompare(b.classCode);
  });
}

export function render(root, { params, refresh, navigate }) {
  if (params[0]) return renderDetail(root, params[0], { refresh, navigate });
  const classes = sortClasses(store.classesList().filter((c) => {
    if (filters.status && c.status !== filters.status) return false;
    const q = norm(filters.q);
    return !q || [c.classCode, c.className, c.course, c.students].some((x) => norm(x).includes(q));
  }));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Lớp học</h1><p class="muted">${store.classesList().length} lớp · bấm vào lớp để xem lịch từng buổi</p></div>
      <button class="btn btn-primary" id="add-class">＋ Thêm lớp</button>
    </div>
    <div class="toolbar">
      <input type="search" id="q" placeholder="Tìm mã lớp, tên lớp, khóa học, học viên…" value="${esc(filters.q)}">
      <select id="st"><option value="">Tất cả trạng thái</option>${Object.entries(CLASS_STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${filters.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div id="class-list">${listHTML(classes)}</div>`;

  root.querySelector('#add-class').onclick = () => openClassForm(null, (r) => navigate('classes/' + r.id));
  root.querySelector('#q').oninput = (e) => {
    filters.q = e.target.value;
    root.querySelector('#class-list').innerHTML = listHTML(sortClasses(store.classesList().filter((c) => (!filters.status || c.status === filters.status) && (!norm(filters.q) || [c.classCode, c.className, c.course, c.students].some((x) => norm(x).includes(norm(filters.q)))))));
  };
  root.querySelector('#st').onchange = (e) => { filters.status = e.target.value; refresh(); };
  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-class]');
    if (row) navigate('classes/' + row.dataset.class);
    if (e.target.closest('[data-empty-add]')) openClassForm(null, (r) => navigate('classes/' + r.id));
  });
}

function listHTML(classes) {
  if (!classes.length) {
    return emptyState('Chưa có lớp nào phù hợp.', '<button class="btn btn-primary" data-empty-add>＋ Thêm lớp đầu tiên</button>');
  }
  return `<div class="table-wrap"><table class="tbl clickable">
    <thead><tr><th>Mã lớp</th><th>Tên lớp / Khóa học</th><th>Loại</th><th>Lịch học</th><th class="num">Giờ/buổi</th><th class="num">Đơn giá</th><th>Tiến độ</th><th>Kết thúc</th><th>Trạng thái</th></tr></thead>
    <tbody>${classes.map((c) => {
      const p = progress(c);
      const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      return `<tr data-class="${c.id}">
        <td><b>${esc(c.classCode)}</b></td>
        <td>${esc(c.className)}<br><small class="muted">${esc(c.course || '')}</small></td>
        <td>${CLASS_TYPE_LABEL[c.classType] || ''}</td>
        <td>${scheduleText(c)}</td>
        <td class="num">${fmtHours(c.duration)}</td>
        <td class="num">${money(c.hourlyRate)}</td>
        <td><div class="mini-bar"><i style="width:${pct}%"></i></div><small class="muted">${p.done}/${p.total} buổi${p.cancelled ? ` · ${p.cancelled} nghỉ` : ''}</small></td>
        <td>${fmtDate(c.endDate)}</td>
        <td>${classStatusBadge(c.status)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderDetail(root, id, { refresh, navigate }) {
  const c = store.getClass(id);
  if (!c) {
    root.innerHTML = emptyState('Không tìm thấy lớp này.', '<a class="btn" href="#/classes">← Về danh sách lớp</a>');
    return;
  }
  const main = store.classMain(id);
  const p = progress(c);
  const makeups = store.sessionsList().filter((s) => s.classId === id && s.type !== 'main');
  const stale = main.filter((s) => store.pastScheduled((e) => e.id === s.id).length);

  root.innerHTML = `
    <div class="page-head">
      <div><a class="link" href="#/classes">← Lớp học</a><h1>${esc(c.classCode)} <small>${esc(c.className)}</small></h1></div>
      <div class="btn-row">
        <button class="btn" id="edit">✏️ Sửa</button>
        <button class="btn btn-danger-ghost" id="del">🗑 Xóa lớp</button>
      </div>
    </div>

    <section class="card">
      <div class="info-grid">
        <div><span>Khóa học</span><b>${esc(c.course || '—')}</b></div>
        <div><span>Loại lớp / Học viên</span><b>${CLASS_TYPE_LABEL[c.classType]} · ${esc(c.students || '—')}</b></div>
        <div><span>Lịch học</span><b>${scheduleText(c)}</b></div>
        <div><span>Thời lượng · Đơn giá</span><b>${fmtHours(c.duration)} giờ/buổi · ${money(c.hourlyRate)}/giờ</b></div>
        <div><span>Bắt đầu → Kết thúc</span><b>${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}</b></div>
        <div><span>Tiến độ</span><b>${p.done}/${p.total} buổi đã dạy${p.cancelled ? ` · ${p.cancelled} buổi nghỉ` : ''}</b></div>
        <div><span>Trạng thái</span><b>${classStatusBadge(c.status)}</b></div>
        <div><span>Ghi chú</span><b>${esc(c.note || '—')}</b></div>
      </div>
    </section>

    ${stale.length ? `<div class="alert alert-warn">⏰ ${stale.length} buổi đã qua nhưng chưa xác nhận. <button class="btn btn-sm" id="mark-done">Đánh dấu tất cả đã dạy</button></div>` : ''}

    <section class="card">
      <div class="card-head"><h2>Các buổi học (${main.length})</h2>
        <small class="muted">Buổi nghỉ được giữ lại; các buổi sau tự lùi 1 buổi.</small></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Buổi</th><th>Ngày</th><th>Thứ</th><th>Giờ</th><th class="num">Số giờ</th><th class="num">Đơn giá</th><th>Trạng thái</th><th>Tính công</th><th></th></tr></thead>
        <tbody>${main.map((s) => `
          <tr class="${s.status === 'cancelled' ? 'row-cancelled' : ''}" data-sid="${s.id}">
            <td>${s.lessonNo ? '#' + s.lessonNo : '—'}</td>
            <td>${fmtDate(s.date)}${s.autoExtra ? ' <span class="tag" title="Buổi tự thêm để bù buổi nghỉ">bù nghỉ</span>' : ''}${s.edited ? ' <span class="tag tag-gray" title="Đã chỉnh tay">sửa tay</span>' : ''}</td>
            <td>${DOW_SHORT[weekday(s.date)]}</td>
            <td>${s.startTime}–${s.endTime}</td>
            <td class="num">${fmtHours(s.hours)}</td>
            <td class="num">${money(s.hourlyRate)}</td>
            <td><span class="badge st-${s.status}">${STATUS_LABEL[s.status]}</span></td>
            <td>${s.status !== 'cancelled' && s.countWork ? 'Có' : 'Không'}</td>
            <td class="row-actions">
              ${s.status === 'scheduled' ? `<button class="btn btn-sm" data-act="done">Đã dạy</button>` : ''}
              ${s.status === 'done' ? `<button class="btn btn-sm" data-act="undo">Hoàn tác</button>` : ''}
              ${s.status !== 'cancelled' ? `<button class="btn btn-sm btn-warn" data-act="cancel">Nghỉ</button>` : `<button class="btn btn-sm" data-act="restore">Khôi phục</button>`}
              <button class="btn btn-sm btn-ghost" data-act="edit">Sửa</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>
    </section>

    ${makeups.length ? `<section class="card"><h2>Trial / Dạy bù gắn với lớp này (${makeups.length})</h2>
      <div class="table-wrap"><table class="tbl clickable"><thead><tr><th>Ngày</th><th>Loại</th><th>Giờ</th><th class="num">Số giờ</th><th>Trạng thái</th></tr></thead>
      <tbody>${makeups.map((s) => `<tr data-eid="${s.id}"><td>${fmtDate(s.date)}</td><td>${s.type === 'makeup' ? 'Dạy bù' : 'Trial'}</td><td>${s.startTime}–${s.endTime}</td><td class="num">${fmtHours(s.hours)}</td><td><span class="badge st-${s.status}">${STATUS_LABEL[s.status]}</span></td></tr>`).join('')}</tbody></table></div></section>` : ''}
  `;

  root.querySelector('#edit').onclick = () => openClassForm(c);
  root.querySelector('#del').onclick = async () => {
    const n = store.sessionsList().filter((s) => s.classId === id).length;
    const ok = await confirmDialog({
      title: `Xóa lớp ${c.classCode}?`, danger: true, okText: 'Xóa lớp',
      message: `Sẽ xóa lớp và <b>toàn bộ ${n} buổi</b> (kể cả buổi đã dạy và lịch sử nghỉ). Giờ công của các buổi này sẽ biến mất khỏi bảng kết quả.<br><br>Nếu lớp chỉ đã học xong, hãy đổi trạng thái thành <b>"Đã kết thúc"</b> thay vì xóa.`,
    });
    if (!ok) return;
    try { await store.deleteClass(id); toast('Đã xóa lớp.'); navigate('classes'); } catch (e) { toast(store.friendlyError(e), 'err'); }
  };
  root.querySelector('#mark-done')?.addEventListener('click', async () => {
    try { toast(`Đã đánh dấu ${await store.markPastDone({ classId: id })} buổi là "Đã dạy".`); } catch (e) { toast(store.friendlyError(e), 'err'); }
  });
  root.addEventListener('click', async (e) => {
    const eid = e.target.closest('[data-eid]');
    if (eid) return openEventForm({ id: eid.dataset.eid });
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const sid = btn.closest('tr').dataset.sid;
    const act = btn.dataset.act;
    try {
      if (act === 'done') await store.updateEvent(sid, { status: 'done' });
      else if (act === 'undo') await store.updateEvent(sid, { status: 'scheduled' });
      else if (act === 'cancel') await cancelSessionFlow(sid);
      else if (act === 'restore') await restoreSessionFlow(sid);
      else if (act === 'edit') openEventForm({ id: sid });
    } catch (ex) { toast(store.friendlyError(ex), 'err'); }
  });
}
