// Các form dạng hộp thoại: lớp học, buổi dạy (chính / Trial / dạy bù), lịch cá nhân.
import {
  esc, todayISO, addDays, fmtDate, fmtDM, hoursBetween, timeToMin, DOW_SHORT, DOW_ORDER, norm, weekday, DOW_FULL,
} from './util.js';
import { TYPE_LABEL, STATUS_LABEL, CLASS_STATUS_LABEL, CLASS_TYPE_LABEL, calcAmount, isCounted } from './calc.js';
import { generateSlots } from './schedule.js';
import * as store from './store.js';
import { openModal, confirmDialog, toast, typeBadge, $, $$ } from './ui.js';

const field = (label, input, cls = '') => `<label class="field ${cls}"><span>${label}</span>${input}</label>`;
const opts = (map, selected) => Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`).join('');

// ======================================================================
//  FORM LỚP HỌC
// ======================================================================
export function openClassForm(cls = null, onDone) {
  const isEdit = !!cls;
  const s = store.state.settings;
  const c = cls || {
    classCode: '', className: '', course: '', classType: 'group', students: '',
    startDate: todayISO(), endDate: addDays(todayISO(), 60), studyDays: [1, 3],
    startTime: '18:00', endTime: '20:00', duration: 2, hourlyRate: s.defaultRate, status: 'active', note: '',
  };
  const dayBoxes = DOW_ORDER.map((d) => `
    <label class="chip-check"><input type="checkbox" name="days" value="${d}" ${c.studyDays.includes(d) ? 'checked' : ''}><span>${d === 0 ? 'CN' : 'Thứ ' + (d + 1)}</span></label>`).join('');

  const body = `
  <form id="class-form" class="form-grid" autocomplete="off" novalidate>
    ${field('Mã lớp *', `<input name="classCode" required value="${esc(c.classCode)}" placeholder="VD: WEB-JSI15">`)}
    ${field('Tên lớp *', `<input name="className" required value="${esc(c.className)}" placeholder="VD: Web cơ bản tối 2-4">`)}
    ${field('Khóa học', `<input name="course" value="${esc(c.course)}" placeholder="VD: Web Developer Basic">`)}
    ${field('Loại lớp', `<select name="classType">${opts(CLASS_TYPE_LABEL, c.classType)}</select>`)}
    ${field('Học viên', `<input name="students" value="${esc(c.students)}" placeholder="Tên học viên / nhóm">`, 'span-2')}
    ${field('Ngày bắt đầu *', `<input type="date" name="startDate" required value="${c.startDate}">`)}
    ${field('Ngày kết thúc dự kiến *', `<input type="date" name="endDate" required value="${c.endDate}">`)}
    <div class="field span-2"><span>Các ngày học trong tuần *</span><div class="chip-row">${dayBoxes}</div></div>
    ${field('Giờ bắt đầu *', `<input type="time" name="startTime" required value="${c.startTime}">`)}
    ${field('Giờ kết thúc *', `<input type="time" name="endTime" required value="${c.endTime}">`)}
    ${field('Số giờ mỗi buổi', `<input type="number" name="duration" min="0.25" step="0.25" value="${c.duration}">`)}
    ${field('Đơn giá mỗi giờ (đ) *', `<input type="number" name="hourlyRate" min="0" step="1000" required value="${c.hourlyRate}">`)}
    ${field('Trạng thái', `<select name="status">${opts(CLASS_STATUS_LABEL, c.status)}</select>`)}
    ${field('Ghi chú', `<textarea name="note" rows="2">${esc(c.note || '')}</textarea>`, 'span-2')}
    <div class="span-2 info-box" id="class-preview"></div>
    ${isEdit ? `<div class="span-2 hint">Khi sửa lịch học / giờ / đơn giá: các buổi <b>"Dự kiến"</b> chưa chỉnh tay sẽ được cập nhật. Buổi <b>đã dạy</b>, buổi <b>nghỉ</b> và buổi bạn đã chỉnh tay được giữ nguyên.</div>` : ''}
  </form>`;

  const m = openModal({
    title: isEdit ? `Sửa lớp ${c.classCode}` : 'Thêm lớp mới',
    body, wide: true,
    footer: `<button class="btn" data-close>Hủy</button><button class="btn btn-primary" id="class-save">${isEdit ? 'Lưu thay đổi' : 'Tạo lớp & sinh lịch'}</button>`,
  });
  const form = $('#class-form', m.el);
  let durationManual = isEdit && Number(c.duration) !== hoursBetween(c.startTime, c.endTime);

  const read = () => {
    const fd = new FormData(form);
    return {
      classCode: fd.get('classCode').trim(), className: fd.get('className').trim(), course: fd.get('course').trim(),
      classType: fd.get('classType'), students: fd.get('students').trim(),
      startDate: fd.get('startDate'), endDate: fd.get('endDate'),
      studyDays: fd.getAll('days').map(Number),
      startTime: fd.get('startTime'), endTime: fd.get('endTime'),
      duration: Number(fd.get('duration')) || 0, hourlyRate: Number(fd.get('hourlyRate')) || 0,
      status: fd.get('status'), note: fd.get('note').trim(),
    };
  };
  const refresh = () => {
    const v = read();
    const slots = generateSlots(v.startDate, v.endDate, v.studyDays);
    const box = $('#class-preview', m.el);
    if (!slots.length) box.innerHTML = '⚠️ Với ngày & thứ học đã chọn, hệ thống chưa tạo được buổi nào.';
    else {
      const total = (slots.length * v.duration);
      box.innerHTML = `📅 Khoảng này có <b>${slots.length} buổi</b> (${fmtDate(slots[0])} → ${fmtDate(slots.at(-1))}), tổng <b>${Math.round(total * 100) / 100} giờ</b>.
        ${slots[0] !== v.startDate ? `<br><span class="muted">Buổi đầu tiên là ${DOW_FULL[weekday(slots[0])]} ${fmtDate(slots[0])} vì ${fmtDate(v.startDate)} là ${DOW_FULL[weekday(v.startDate)]}, không nằm trong các thứ học.</span>` : ''}`;
    }
  };
  form.addEventListener('input', (e) => {
    if (e.target.name === 'duration') durationManual = true;
    if (['startTime', 'endTime'].includes(e.target.name) && !durationManual) {
      const h = hoursBetween(form.startTime.value, form.endTime.value);
      if (h) form.duration.value = h;
    }
    refresh();
  });
  refresh();

  $('#class-save', m.el).addEventListener('click', async (e) => {
    const v = read();
    const err = validateClass(v, cls?.id);
    if (err) return toast(err, 'err');
    if (!v.duration) v.duration = hoursBetween(v.startTime, v.endTime);
    e.target.disabled = true;
    try {
      const r = await store.saveClass(v, cls?.id);
      toast(isEdit ? (r.regenerated ? 'Đã lưu lớp và cập nhật lịch các buổi chưa dạy.' : 'Đã lưu lớp.') : `Đã tạo lớp ${v.classCode} và ${r.created} buổi học.`);
      m.close();
      onDone?.(r);
    } catch (ex) {
      toast(store.friendlyError(ex), 'err');
      e.target.disabled = false;
    }
  });
}

function validateClass(v, selfId) {
  if (!v.classCode) return 'Vui lòng nhập mã lớp.';
  if (!v.className) return 'Vui lòng nhập tên lớp.';
  if (store.classesList().some((x) => x.id !== selfId && norm(x.classCode) === norm(v.classCode))) return `Mã lớp "${v.classCode}" đã tồn tại.`;
  if (!v.startDate || !v.endDate) return 'Vui lòng chọn ngày bắt đầu và ngày kết thúc.';
  if (v.endDate < v.startDate) return 'Ngày kết thúc phải sau ngày bắt đầu.';
  if (!v.studyDays.length) return 'Chọn ít nhất một ngày học trong tuần.';
  if (Number.isNaN(timeToMin(v.startTime)) || Number.isNaN(timeToMin(v.endTime))) return 'Vui lòng nhập giờ bắt đầu và giờ kết thúc.';
  if (timeToMin(v.endTime) <= timeToMin(v.startTime)) return 'Giờ kết thúc phải sau giờ bắt đầu.';
  if (v.duration < 0) return 'Số giờ mỗi buổi không hợp lệ.';
  if (v.hourlyRate < 0) return 'Đơn giá không hợp lệ.';
  return '';
}

// ======================================================================
//  FORM BUỔI DẠY / LỊCH: mới (trial, makeup, personal) hoặc xem + sửa bất kỳ buổi nào
// ======================================================================
export function openEventForm({ id = null, type = 'trial', date = null, onDone } = {}) {
  const ev = id ? store.getEvent(id) : null;
  if (id && !ev) return toast('Không tìm thấy lịch này.', 'err');
  const t = ev ? ev.type : type;
  const isEdit = !!ev;
  const me = store.teacherName();
  const s = store.state.settings;
  const d = ev || {
    type: t, date: date || todayISO(), startTime: '18:00', endTime: '19:00', hours: 1,
    hourlyRate: t === 'trial' ? s.trialRate : s.makeupRate, status: 'scheduled', countWork: true,
    student: '', course: '', classId: '', classCode: '', className: '', mainTeacher: me, actualTeacher: me,
    makeupFor: 'own', note: '', title: '',
  };
  const cancelledMain = isEdit && t === 'main' && d.status === 'cancelled';
  const dis = cancelledMain ? 'disabled' : '';

  // --- phần riêng theo loại ---
  let head = '', specific = '';
  if (isEdit && t === 'main') {
    head = `<div class="info-box span-2">${typeBadge('main')} <b>${esc(d.classCode)}</b> · ${esc(d.className)}${d.course ? ' · ' + esc(d.course) : ''}
      ${d.lessonNo ? ` · <b>Buổi ${d.lessonNo}</b>` : ' · <b>Buổi nghỉ</b> (không đánh số)'}<br>
      <span class="muted">GV chính: ${esc(d.mainTeacher)} · GV dạy: ${esc(d.actualTeacher)}${d.student ? ' · HV: ' + esc(d.student) : ''}</span></div>`;
  }
  if (t === 'trial') {
    specific = `
      ${field('Học viên', `<input name="student" value="${esc(d.student)}" placeholder="Tên học viên trải nghiệm">`)}
      ${field('Khóa học', `<input name="course" value="${esc(d.course)}">`)}
      ${field('Giáo viên dạy', `<input name="actualTeacher" value="${esc(d.actualTeacher || me)}">`, 'span-2')}`;
  }
  if (t === 'makeup') {
    const classOpts = store.classesList().map((c) => `<option value="${c.id}" ${c.id === d.classId ? 'selected' : ''}>${esc(c.classCode)} — ${esc(c.className)}</option>`).join('');
    specific = `
      <div class="field span-2"><span>Dạy bù cho</span>
        <div class="seg">
          <label><input type="radio" name="makeupFor" value="own" ${d.makeupFor !== 'other' ? 'checked' : ''}> Lớp của tôi</label>
          <label><input type="radio" name="makeupFor" value="other" ${d.makeupFor === 'other' ? 'checked' : ''}> Lớp của giáo viên khác (dạy thay)</label>
        </div></div>
      <div class="span-2 form-grid sub" data-show="own">
        ${field('Lớp', `<select name="classId"><option value="">— Chọn lớp —</option>${classOpts}</select>`, 'span-2')}
      </div>
      <div class="span-2 form-grid sub" data-show="other">
        ${field('Mã lớp', `<input name="otherCode" value="${esc(d.makeupFor === 'other' ? d.classCode : '')}" placeholder="VD: PY02">`)}
        ${field('Khóa học', `<input name="otherCourse" value="${esc(d.makeupFor === 'other' ? d.course : '')}">`)}
        ${field('Giáo viên chính của lớp', `<input name="otherMain" value="${esc(d.makeupFor === 'other' ? d.mainTeacher : '')}" placeholder="VD: Nam">`)}
        ${field('Học viên', `<input name="otherStudent" value="${esc(d.makeupFor === 'other' ? d.student : '')}">`)}
      </div>
      ${field('Giáo viên thực tế dạy', `<input name="actualTeacher" value="${esc(d.actualTeacher || me)}">`, 'span-2')}
      <div class="span-2 hint" id="teacher-hint"></div>`;
  }
  if (t === 'personal') {
    specific = field('Tiêu đề *', `<input name="title" required value="${esc(d.title || '')}" list="personal-suggest" placeholder="Họp, đào tạo, việc cá nhân, nghỉ…">
      <datalist id="personal-suggest"><option>Họp</option><option>Đào tạo</option><option>Công việc cá nhân</option><option>Nghỉ</option><option>Công việc khác</option></datalist>`, 'span-2');
  }

  const billing = t === 'personal' ? '' : `
    ${field('Đơn giá (đ/giờ)', `<input type="number" name="hourlyRate" min="0" step="1000" value="${d.hourlyRate}" ${dis}>`)}
    <div class="field"><span>Thành tiền</span><output id="amount-out" class="amount-out"></output></div>
    ${field('Trạng thái', `<select name="status">${statusOptions(t, d.status)}</select>`)}
    <label class="field check-field"><span>Tính công</span><span class="switch"><input type="checkbox" name="countWork" ${d.countWork ? 'checked' : ''} ${dis}><i></i><b>${'Có'}</b></span></label>`;

  const body = `
  <form id="event-form" class="form-grid" autocomplete="off" novalidate>
    ${head}${specific}
    ${field('Ngày *', `<input type="date" name="date" required value="${d.date}" ${dis}>`)}
    ${t === 'personal' ? '<div></div>' : field('Số giờ', `<input type="number" name="hours" min="0" step="0.25" value="${Math.round((d.hours || 0) * 100) / 100}" ${dis}>`)}
    ${field('Giờ bắt đầu *', `<input type="time" name="startTime" required value="${d.startTime}" ${dis}>`)}
    ${field('Giờ kết thúc *', `<input type="time" name="endTime" required value="${d.endTime}" ${dis}>`)}
    ${billing}
    ${field('Ghi chú', `<textarea name="note" rows="2">${esc(d.note || '')}</textarea>`, 'span-2')}
    <div class="span-2 hint" id="event-hint"></div>
  </form>`;

  const canDelete = isEdit && t !== 'main';
  const m = openModal({
    title: isEdit ? `Chi tiết — ${TYPE_LABEL[t]}` : `Thêm ${TYPE_LABEL[t].toLowerCase()}`,
    body, wide: true,
    footer: `${canDelete ? '<button class="btn btn-danger-ghost" id="event-del" style="margin-right:auto">Xóa</button>' : ''}
      <button class="btn" data-close>Đóng</button><button class="btn btn-primary" id="event-save">${isEdit ? 'Lưu' : 'Thêm'}</button>`,
  });
  const form = $('#event-form', m.el);
  let hoursManual = isEdit && t !== 'personal' && Math.abs((d.hours || 0) - hoursBetween(d.startTime, d.endTime)) > 1e-6;

  const refresh = () => {
    if (t === 'makeup') {
      const mode = form.makeupFor.value;
      $$('[data-show]', m.el).forEach((el) => el.classList.toggle('hidden', el.dataset.show !== mode));
      const mineName = norm(form.actualTeacher.value) === norm(me) || !form.actualTeacher.value.trim();
      $('#teacher-hint', m.el).innerHTML = mineName
        ? (mode === 'other' ? 'ℹ️ Bạn dạy thay lớp của giáo viên khác: buổi này được tính vào công của <b>bạn</b> (người thực tế đứng lớp).' : '')
        : '⚠️ Giáo viên thực tế dạy không phải bạn → buổi này <b>không</b> được tính vào giờ công của bạn.';
    }
    if (t === 'personal') { $('#event-hint', m.el).textContent = 'Lịch cá nhân không tính vào giờ công.'; return; }
    const h = Number(form.hours.value) || 0;
    const rate = Number(form.hourlyRate.value) || 0;
    const mine = t !== 'makeup' && t !== 'trial' ? true : (norm(form.actualTeacher?.value) === norm(me) || !form.actualTeacher?.value.trim());
    const counted = form.countWork.checked && form.status.value !== 'cancelled' && mine;
    $('#amount-out', m.el).textContent = counted ? `${calcAmount(h, rate).toLocaleString('vi-VN')}đ` : '0đ (không tính công)';
    $('.switch b', m.el).textContent = form.countWork.checked ? 'Có' : 'Không';
    const hint = $('#event-hint', m.el);
    hint.textContent = '';
    if (isEdit && t === 'main' && !cancelledMain && form.status.value === 'cancelled') {
      hint.innerHTML = '⚠️ Chọn <b>Nghỉ</b>: buổi này được giữ lại trong lịch sử, các buổi sau tự lùi 1 buổi và hệ thống thêm 1 buổi vào cuối.';
    }
    if (cancelledMain) hint.innerHTML = 'Buổi đã nghỉ. Đổi trạng thái về "Dự kiến" để khôi phục (buổi bù tự thêm vào cuối sẽ được gỡ nếu chưa dạy).';
  };

  form.addEventListener('input', (e) => {
    if (e.target.name === 'hours') hoursManual = true;
    if (['startTime', 'endTime'].includes(e.target.name) && !hoursManual && form.hours) {
      form.hours.value = hoursBetween(form.startTime.value, form.endTime.value) || '';
    }
    if (e.target.name === 'classId' && t === 'makeup' && !isEdit) {
      const c = store.getClass(e.target.value);
      if (c) form.hourlyRate.value = c.hourlyRate;
    }
    refresh();
  });
  form.addEventListener('change', refresh);
  refresh();

  $('#event-save', m.el).addEventListener('click', async (e) => {
    try {
      const fd = new FormData(form);
      let patch;
      if (cancelledMain) {
        // buổi đã nghỉ: các ô bị khóa, chỉ đổi trạng thái (khôi phục) hoặc ghi chú
        patch = { status: fd.get('status'), note: (fd.get('note') || '').trim() };
      } else {
        const common = {
          date: fd.get('date'), startTime: fd.get('startTime'), endTime: fd.get('endTime'), note: (fd.get('note') || '').trim(),
        };
        if (!common.date) throw new Error('Vui lòng chọn ngày.');
        if (Number.isNaN(timeToMin(common.startTime)) || Number.isNaN(timeToMin(common.endTime))) throw new Error('Vui lòng nhập giờ bắt đầu và kết thúc.');
        if (timeToMin(common.endTime) <= timeToMin(common.startTime)) throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');

        if (t === 'personal') {
          const title = (fd.get('title') || '').trim();
          if (!title) throw new Error('Vui lòng nhập tiêu đề.');
          patch = { ...common, title };
        } else {
          const hours = Number(fd.get('hours')) || 0;
          if (hours <= 0) throw new Error('Số giờ phải lớn hơn 0.');
          patch = {
            ...common, hours, hourlyRate: Number(fd.get('hourlyRate')) || 0,
            status: fd.get('status'), countWork: fd.get('countWork') === 'on',
          };
          if (t === 'trial') {
            const actual = (fd.get('actualTeacher') || '').trim() || me;
            Object.assign(patch, { student: fd.get('student').trim(), course: fd.get('course').trim(), actualTeacher: actual, mainTeacher: actual, classCode: 'TRIAL', className: 'Ca Trial' });
            patch.actualIsMe = norm(actual) === norm(me);
            if (!patch.actualIsMe) patch.countWork = false;
          }
          if (t === 'makeup') {
            const actual = (fd.get('actualTeacher') || '').trim() || me;
            patch.actualTeacher = actual;
            patch.actualIsMe = norm(actual) === norm(me);
            patch.makeupFor = fd.get('makeupFor');
            if (patch.makeupFor === 'own') {
              const c = store.getClass(fd.get('classId'));
              if (!c) throw new Error('Vui lòng chọn lớp cần dạy bù.');
              Object.assign(patch, { classId: c.id, classCode: c.classCode, className: c.className, course: c.course, student: c.students || '', mainTeacher: me });
            } else {
              const code = fd.get('otherCode').trim();
              if (!code) throw new Error('Vui lòng nhập mã lớp của giáo viên khác.');
              Object.assign(patch, { classId: null, classCode: code, className: code, course: fd.get('otherCourse').trim(), student: fd.get('otherStudent').trim(), mainTeacher: fd.get('otherMain').trim() });
            }
            if (!patch.actualIsMe) patch.countWork = false;
          }
        }
      }

      // Xác nhận khi cho nghỉ buổi lớp chính
      if (isEdit && t === 'main' && !cancelledMain && patch.status === 'cancelled') {
        if (!(await confirmCancel(id))) return;
      }
      e.target.disabled = true;
      let result;
      if (isEdit) result = await store.updateEvent(id, patch);
      else if (t === 'personal') await store.createPersonal(patch);
      else await store.createSession({ ...patch, type: t });
      toast(result?.message || (isEdit ? 'Đã lưu thay đổi.' : 'Đã thêm.'));
      m.close();
      onDone?.();
    } catch (ex) {
      toast(store.friendlyError(ex), 'err');
      e.target.disabled = false;
    }
  });

  $('#event-del', m.el)?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Xóa lịch', message: 'Xóa mục này? Thao tác không thể hoàn tác.', okText: 'Xóa', danger: true }))) return;
    try {
      await store.deleteEvent(id);
      toast('Đã xóa.');
      m.close();
      onDone?.();
    } catch (ex) { toast(store.friendlyError(ex), 'err'); }
  });
}

function statusOptions(type, selected) {
  const label = { ...STATUS_LABEL };
  if (type === 'main') label.cancelled = 'Nghỉ (lùi lịch các buổi sau)';
  else label.cancelled = 'Hủy / Nghỉ';
  return opts(label, selected);
}

// ======================================================================
//  Luồng "cho nghỉ" / "khôi phục" dùng chung (nút nhanh ở trang lớp)
// ======================================================================
export async function confirmCancel(sessionId) {
  const p = store.previewCancel(sessionId);
  return confirmDialog({
    title: `Cho nghỉ buổi ${fmtDate(p.session.date)}?`,
    message: `
      <p>Lớp <b>${esc(p.cls.classCode)}</b> — buổi <b>${fmtDate(p.session.date)}</b> sẽ:</p>
      <ul class="plain-list">
        <li>Được <b>giữ lại</b> trong lịch sử với trạng thái <b>Nghỉ</b>, không tính công.</li>
        <li>Mọi buổi phía sau <b>lùi 1 buổi</b> (nội dung buổi nghỉ được dạy ở buổi kế tiếp).</li>
        <li>Thêm <b>1 buổi mới</b> vào ngày <b>${fmtDate(p.extraDate)}</b> để bù lại.</li>
        <li>Ngày kết thúc lớp: <b>${fmtDate(p.oldEnd)}</b> → <b>${fmtDate(p.newEnd)}</b>.</li>
      </ul>`,
    okText: 'Cho nghỉ & lùi lịch',
    danger: true,
  });
}

export async function cancelSessionFlow(id, onDone) {
  try {
    if (!(await confirmCancel(id))) return;
    const r = await store.updateEvent(id, { status: 'cancelled' });
    toast(r.message);
    onDone?.();
  } catch (ex) { toast(store.friendlyError(ex), 'err'); }
}

export async function restoreSessionFlow(id, onDone) {
  const s = store.getEvent(id);
  if (!(await confirmDialog({
    title: 'Khôi phục buổi học',
    message: `Khôi phục buổi <b>${fmtDate(s.date)}</b>? Buổi bù đã tự thêm ở cuối lịch (nếu chưa dạy) sẽ được gỡ để lớp không dư buổi.`,
    okText: 'Khôi phục',
  }))) return;
  try {
    const r = await store.updateEvent(id, { status: 'scheduled' });
    toast(r.message);
    onDone?.();
  } catch (ex) { toast(store.friendlyError(ex), 'err'); }
}
