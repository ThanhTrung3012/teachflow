// Tính giờ công / tiền công. Toàn bộ là hàm thuần, tính TỪNG BUỔI rồi mới cộng lại.
import { round2, round8, norm } from './util.js';

export const TYPE_LABEL = { main: 'Lớp chính', trial: 'Trial', makeup: 'Dạy bù', personal: 'Lịch cá nhân' };
export const STATUS_LABEL = { scheduled: 'Dự kiến', done: 'Đã dạy', cancelled: 'Nghỉ' };
export const CLASS_STATUS_LABEL = { active: 'Đang dạy', ended: 'Đã kết thúc', paused: 'Tạm dừng' };
export const CLASS_TYPE_LABEL = { group: 'Nhóm', one: '1-1' };

/** Thành tiền = số giờ × đơn giá của CHÍNH buổi đó (làm tròn đến đồng). */
export function calcAmount(hours, rate) {
  return Math.round((Number(hours) || 0) * (Number(rate) || 0));
}

/** Buổi do chính mình đứng lớp? (dạy bù do GV khác dạy thì không tính vào công của mình) */
export function isMine(s) {
  return s.actualIsMe !== false;
}

/**
 * Điều kiện DUY NHẤT để một buổi được đưa vào giờ công:
 *  - không phải lịch cá nhân
 *  - không phải buổi nghỉ
 *  - countWork = true
 *  - mình là người thực tế đứng lớp
 */
export function isCounted(s) {
  return s.type !== 'personal' && s.status !== 'cancelled' && !!s.countWork && isMine(s);
}

/** Số tiền thực sự được trả cho buổi này (0 nếu không tính công). */
export function payable(s) {
  return isCounted(s) ? calcAmount(s.hours, s.hourlyRate) : 0;
}

/** Chuẩn hóa một buổi trước khi lưu: làm tròn giờ, cập nhật thành tiền. */
export function finalizeSession(s) {
  const out = { ...s };
  out.hours = round8(Number(out.hours) || 0);
  out.hourlyRate = Number(out.hourlyRate) || 0;
  if (out.type === 'personal') out.countWork = false;
  out.amount = payable(out);
  return out;
}

/** Lý do không tính công (để hiển thị trong bảng kết quả). */
export function notCountedReason(s) {
  if (isCounted(s)) return '';
  if (s.type === 'personal') return 'Lịch cá nhân';
  if (s.status === 'cancelled') return 'Buổi nghỉ';
  if (!isMine(s)) return 'GV khác dạy';
  return 'Không tính công';
}

const emptyBucket = () => ({ sessions: 0, hours: 0, amount: 0 });

/** Tổng hợp một danh sách buổi (đã lọc theo tháng) thành số liệu giờ công / tiền. */
export function summarize(events) {
  const byType = { main: emptyBucket(), trial: emptyBucket(), makeup: emptyBucket() };
  const classKeys = new Set();
  let cancelled = 0;
  let doneHours = 0, doneAmount = 0, plannedHours = 0, plannedAmount = 0;
  let sessions = 0, hours = 0, amount = 0;

  for (const s of events) {
    if (s.type !== 'personal' && s.status === 'cancelled') cancelled++;
    if (!isCounted(s)) continue;
    const h = Number(s.hours) || 0;
    const a = calcAmount(s.hours, s.hourlyRate);
    const b = byType[s.type];
    if (!b) continue;
    b.sessions++; b.hours += h; b.amount += a;
    sessions++; hours += h; amount += a;
    if (s.status === 'done') { doneHours += h; doneAmount += a; }
    else { plannedHours += h; plannedAmount += a; }
    if (s.type === 'main' || s.type === 'makeup') {
      classKeys.add(s.classId || 'x:' + norm(s.classCode || s.className));
    }
  }
  for (const k of Object.keys(byType)) byType[k].hours = round2(byType[k].hours);
  return {
    sessions,
    classes: classKeys.size,
    hours: round2(hours),
    amount,
    byType,
    cancelled,
    doneHours: round2(doneHours),
    doneAmount,
    plannedHours: round2(plannedHours),
    plannedAmount,
  };
}

/** Thực nhận = Tổng tiền công + Thưởng − Khấu trừ. */
export function netSalary(total, bonus, deduction) {
  return (Number(total) || 0) + (Number(bonus) || 0) - (Number(deduction) || 0);
}

/** Các dòng chi tiết (chỉ buổi tính công) — dùng để chốt lương và đối chiếu ngược. */
export function salaryLines(events) {
  return events
    .filter(isCounted)
    .map((s) => ({
      id: s.id,
      date: s.date,
      type: s.type,
      classCode: s.classCode || '',
      className: s.className || '',
      startTime: s.startTime,
      endTime: s.endTime,
      hours: Number(s.hours) || 0,
      rate: Number(s.hourlyRate) || 0,
      amount: calcAmount(s.hours, s.hourlyRate),
      status: s.status,
    }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
}
