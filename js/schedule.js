// Logic lịch học: sinh buổi, nghỉ & lùi lịch, khôi phục, tạo lại lịch.
// Toàn bộ là hàm thuần: nhận dữ liệu vào, trả kết quả ra, KHÔNG ghi database.
// Nhờ vậy dễ kiểm thử (tests/logic.test.mjs) và dễ đọc.
import { addDays, weekday, uid, hoursBetween } from './util.js';
import { calcAmount } from './calc.js';

export function cmpSession(a, b) {
  return (a.date + ' ' + (a.startTime || '')).localeCompare(b.date + ' ' + (b.startTime || ''));
}

/** Ngày học kế tiếp (TRƯỚC HẾT sau afterISO) theo các thứ trong tuần. */
export function nextSlotDate(afterISO, studyDays) {
  if (!studyDays || !studyDays.length) throw new Error('Lớp chưa có ngày học trong tuần.');
  let d = addDays(afterISO, 1);
  for (let i = 0; i < 7; i++) {
    if (studyDays.includes(weekday(d))) return d;
    d = addDays(d, 1);
  }
  throw new Error('Không tìm được ngày học kế tiếp.');
}

/** Tất cả ngày học từ startISO đến endISO (gồm cả hai đầu) rơi vào các thứ đã chọn. */
export function generateSlots(startISO, endISO, studyDays, max = 1000) {
  const out = [];
  if (!startISO || !endISO || !studyDays?.length) return out;
  let d = startISO;
  while (d <= endISO && out.length < max) {
    if (studyDays.includes(weekday(d))) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Tạo một buổi của lớp chính theo cấu hình lớp. */
export function newMainSession(cls, date, teacher, extra = {}) {
  const hours = Number(cls.duration) || hoursBetween(cls.startTime, cls.endTime);
  return {
    id: uid(),
    userId: cls.userId,
    classId: cls.id,
    type: 'main',
    date,
    startTime: cls.startTime,
    endTime: cls.endTime,
    hours,
    hourlyRate: Number(cls.hourlyRate) || 0,
    amount: calcAmount(hours, cls.hourlyRate),
    status: 'scheduled',
    countWork: true,
    mainTeacher: teacher,
    actualTeacher: teacher,
    actualIsMe: true,
    student: cls.students || '',
    classCode: cls.classCode,
    className: cls.className,
    course: cls.course,
    lessonNo: null,
    note: '',
    edited: false,
    ...extra,
  };
}

/** Đánh số lại "buổi thứ mấy": buổi nghỉ không có số, các buổi còn lại đánh từ 1. */
export function renumber(sessions) {
  const sorted = [...sessions].sort(cmpSession);
  let n = 1;
  return sorted.map((s) => ({ ...s, lessonNo: s.status === 'cancelled' ? null : n++ }));
}

/** Ngày của buổi cuối cùng chưa nghỉ (= ngày kết thúc thực tế của lớp). */
export function lastActiveDate(sessions) {
  let last = null;
  for (const s of sessions) {
    if (s.status !== 'cancelled' && (!last || s.date > last)) last = s.date;
  }
  return last;
}

/**
 * LỚP NGHỈ MỘT BUỔI → lùi toàn bộ lịch phía sau 1 buổi.
 *
 * Cách hiểu (khớp ví dụ trong đặc tả):
 *  - Buổi nghỉ GIỮ NGUYÊN ngày, đổi trạng thái "Nghỉ", không tính công, không đánh số.
 *  - Các buổi phía sau giữ nguyên ngày nhưng "buổi thứ mấy" lùi 1 bậc:
 *    nội dung của buổi 07/10 được dạy vào 12/10, của 12/10 dạy vào 14/10, ...
 *  - Thêm 1 buổi mới ở ngày học kế tiếp sau buổi cuối để bù lại → ngày kết thúc lớp lùi theo.
 *
 * @param cls            lớp (cần studyDays)
 * @param classMain      TẤT CẢ buổi 'main' hiện có của lớp (target đã ở trạng thái mới nếu có sửa kèm theo)
 * @param targetId       id buổi nghỉ
 * @returns {{sessions, target, extra, endDate}} sessions = toàn bộ buổi main của lớp SAU khi xử lý
 */
export function planCancel(cls, classMain, targetId, teacher) {
  const main = [...classMain].sort(cmpSession);
  const target = main.find((s) => s.id === targetId);
  if (!target) throw new Error('Không tìm thấy buổi học.');
  if (target.type !== 'main') throw new Error('Chỉ buổi của lớp chính mới lùi lịch.');
  if (target.status === 'cancelled') throw new Error('Buổi này đã nghỉ rồi.');

  const last = main[main.length - 1];
  const extraDate = nextSlotDate(last.date, cls.studyDays);
  const extra = newMainSession(cls, extraDate, teacher, { autoExtra: true, compensatesFor: target.id });

  const cancelled = {
    ...target,
    status: 'cancelled',
    prevCountWork: target.countWork,
    countWork: false,
    amount: 0,
  };
  const after = renumber(main.map((s) => (s.id === target.id ? cancelled : s)).concat(extra));
  return {
    sessions: after,
    target: after.find((s) => s.id === target.id),
    extra: after.find((s) => s.id === extra.id),
    endDate: lastActiveDate(after) || cls.endDate,
  };
}

/**
 * KHÔI PHỤC buổi đã nghỉ (bấm nhầm). Buổi trở lại đúng ngày cũ, và buổi bù tự thêm vào cuối
 * (nếu còn ở trạng thái "Dự kiến") bị gỡ đi để lớp không dư buổi.
 */
export function planRestore(cls, classMain, targetId) {
  const main = [...classMain].sort(cmpSession);
  const target = main.find((s) => s.id === targetId);
  if (!target) throw new Error('Không tìm thấy buổi học.');
  const restored = {
    ...target,
    status: target.status === 'cancelled' ? 'scheduled' : target.status,
    countWork: target.prevCountWork ?? true,
    prevCountWork: null,
    amount: calcAmount(target.hours, target.hourlyRate),
  };

  // Tìm buổi bù tự sinh để gỡ: ưu tiên đúng buổi đã sinh ra cho buổi này, nếu không thì buổi tự sinh cuối cùng.
  const extras = main.filter((s) => s.autoExtra && s.status === 'scheduled' && s.id !== target.id);
  const removedExtra = extras.find((s) => s.compensatesFor === target.id) || extras[extras.length - 1] || null;

  const remaining = main
    .filter((s) => !removedExtra || s.id !== removedExtra.id)
    .map((s) => (s.id === target.id ? restored : s));
  const after = renumber(remaining);
  return {
    sessions: after,
    target: after.find((s) => s.id === target.id),
    removedExtra,
    endDate: lastActiveDate(after) || cls.endDate,
  };
}

/**
 * Tạo lại lịch khi sửa cấu hình lớp (đổi ngày/giờ/thứ/đơn giá…).
 * Giữ nguyên: buổi đã dạy, buổi nghỉ, và buổi đã chỉnh tay (edited).
 * Cập nhật / xóa / thêm: các buổi còn lại ở trạng thái "Dự kiến".
 */
export function planRegenerate(cls, classMain, teacher) {
  const slots = generateSlots(cls.startDate, cls.endDate, cls.studyDays);
  const slotSet = new Set(slots);
  const covered = new Set();
  const remove = [];
  const kept = [];

  const fixed = classMain.filter((s) => s.status !== 'scheduled' || s.edited);
  const flexible = classMain.filter((s) => !(s.status !== 'scheduled' || s.edited)).sort(cmpSession);
  for (const s of fixed) {
    kept.push(s);
    covered.add(s.date);
  }
  for (const s of flexible) {
    if (slotSet.has(s.date) && !covered.has(s.date)) {
      const hours = Number(cls.duration) || hoursBetween(cls.startTime, cls.endTime);
      kept.push({
        ...s,
        startTime: cls.startTime,
        endTime: cls.endTime,
        hours,
        hourlyRate: Number(cls.hourlyRate) || 0,
        amount: calcAmount(hours, cls.hourlyRate),
        classCode: cls.classCode,
        className: cls.className,
        course: cls.course,
        student: cls.students || '',
      });
      covered.add(s.date);
    } else {
      remove.push(s.id);
    }
  }
  const added = slots.filter((d) => !covered.has(d)).map((d) => newMainSession(cls, d, teacher));
  const after = renumber([...kept, ...added]);
  return { sessions: after, remove, endDate: lastActiveDate(after) || cls.endDate };
}

/** So sánh danh sách buổi trước/sau để chỉ ghi những gì thay đổi. */
export function diffSessions(before, after) {
  const beforeMap = new Map(before.map((s) => [s.id, s]));
  const afterIds = new Set(after.map((s) => s.id));
  const changed = after.filter((s) => {
    const b = beforeMap.get(s.id);
    return !b || JSON.stringify(b) !== JSON.stringify(s);
  });
  const removed = before.filter((s) => !afterIds.has(s.id));
  return { changed, removed };
}

/** Buổi đã qua giờ mà vẫn "Dự kiến" (cần xác nhận đã dạy). */
export function isPastScheduled(s, todayISO, nowHM) {
  if (s.status !== 'scheduled' || s.type === 'personal') return false;
  if (s.date < todayISO) return true;
  return s.date === todayISO && (s.endTime || '23:59') <= nowHM;
}
