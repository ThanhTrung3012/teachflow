// Chạy: node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { generateSlots, newMainSession, renumber, planCancel, planRestore, planRegenerate, diffSessions, nextSlotDate, lastActiveDate } from '../js/schedule.js';
import { summarize, calcAmount, isCounted, finalizeSession, netSalary } from '../js/calc.js';
import { hoursBetween, weekday, fmtHours, money, startOfWeek, shiftMonth } from '../js/util.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

const MON_WED = [1, 3];
const cls = {
  id: 'c1', userId: 'u1', classCode: 'WEB01', className: 'Web cơ bản', course: 'Web Developer Basic',
  students: 'Nhóm A', startDate: '2026-10-01', endDate: '2026-11-30', studyDays: MON_WED,
  startTime: '18:00', endTime: '20:00', duration: 2, hourlyRate: 150000,
};
const build = () => renumber(generateSlots(cls.startDate, cls.endDate, cls.studyDays).map((d) => newMainSession(cls, d, 'Trung')));

console.log('Tiện ích');
test('01/10/2026 là thứ Năm, 05/10 là thứ Hai', () => {
  assert.equal(weekday('2026-10-01'), 4);
  assert.equal(weekday('2026-10-05'), 1);
});
test('hoursBetween / định dạng', () => {
  assert.equal(hoursBetween('18:00', '20:00'), 2);
  assert.equal(hoursBetween('18:00', '19:30'), 1.5);
  assert.equal(hoursBetween('20:00', '18:00'), 0);
  assert.equal(fmtHours(1.5), '1,5');
  assert.equal(money(12450000), '12.450.000đ');
  assert.equal(startOfWeek('2026-10-08'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

console.log('Sinh lịch');
test('Thứ 2 + Thứ 4, 01/10 → 30/11 sinh đúng ngày', () => {
  const dates = generateSlots('2026-10-01', '2026-11-30', MON_WED);
  assert.deepEqual(dates.slice(0, 6), ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21']);
  assert.equal(dates.at(-1), '2026-11-30');
  assert.equal(dates.length, 17); // 9 thứ Hai + 8 thứ Tư
});
test('nextSlotDate bỏ qua ngày không học', () => {
  assert.equal(nextSlotDate('2026-11-30', MON_WED), '2026-12-02');
  assert.equal(nextSlotDate('2026-10-07', MON_WED), '2026-10-12');
});

console.log('Nghỉ & lùi lịch');
test('nghỉ 07/10: giữ buổi nghỉ, lùi số buổi, thêm 1 buổi cuối, lùi ngày kết thúc', () => {
  const sessions = build();
  const target = sessions.find((s) => s.date === '2026-10-07');
  const plan = planCancel(cls, sessions, target.id, 'Trung');
  const after = plan.sessions;

  // buổi nghỉ vẫn còn, trạng thái Nghỉ, không tính công, không có số buổi
  const kept = after.find((s) => s.date === '2026-10-07');
  assert.equal(kept.status, 'cancelled');
  assert.equal(kept.countWork, false);
  assert.equal(kept.lessonNo, null);
  assert.equal(isCounted(kept), false);

  // tổng số buổi tăng 1 (giữ lịch sử), số buổi thật sự dạy không đổi
  assert.equal(after.length, sessions.length + 1);
  assert.equal(after.filter((s) => s.status !== 'cancelled').length, sessions.length);

  // 12/10 giờ là buổi số 2 (trước đó là số 3) — tức "lùi 1 buổi"
  assert.equal(sessions.find((s) => s.date === '2026-10-12').lessonNo, 3);
  assert.equal(after.find((s) => s.date === '2026-10-12').lessonNo, 2);
  assert.equal(after.find((s) => s.date === '2026-10-05').lessonNo, 1);

  // buổi bù mới ở cuối; ngày kết thúc lùi từ 30/11 → 02/12
  assert.equal(plan.extra.date, '2026-12-02');
  assert.equal(plan.endDate, '2026-12-02');
  assert.equal(after.at(-1).lessonNo, sessions.length);
});
test('nghỉ 2 buổi liên tiếp → thêm 2 buổi cuối', () => {
  let sessions = build();
  const first = sessions[1];
  sessions = planCancel(cls, sessions, first.id, 'T').sessions;
  const second = sessions.find((s) => s.date === '2026-10-12');
  const plan = planCancel(cls, sessions, second.id, 'T');
  assert.equal(plan.endDate, '2026-12-07');
  assert.equal(plan.sessions.filter((s) => s.status !== 'cancelled').length, 17);
  assert.equal(plan.sessions.filter((s) => s.status === 'cancelled').length, 2);
});
test('khôi phục buổi nghỉ → quay lại như ban đầu', () => {
  const original = build();
  const t = original[1];
  const cancelled = planCancel(cls, original, t.id, 'T');
  const restored = planRestore(cls, cancelled.sessions, t.id);
  assert.equal(restored.removedExtra.id, cancelled.extra.id);
  assert.equal(restored.sessions.length, original.length);
  assert.equal(restored.endDate, '2026-11-30');
  assert.deepEqual(restored.sessions.map((s) => [s.date, s.lessonNo, s.status]), original.map((s) => [s.date, s.lessonNo, s.status]));
  assert.equal(restored.target.countWork, true);
});
test('khôi phục KHÔNG xóa buổi bù đã dạy', () => {
  const original = build();
  const t = original[1];
  const c = planCancel(cls, original, t.id, 'T');
  const withDoneExtra = c.sessions.map((s) => (s.id === c.extra.id ? { ...s, status: 'done' } : s));
  const r = planRestore(cls, withDoneExtra, t.id);
  assert.equal(r.removedExtra, null);
  assert.equal(r.sessions.length, withDoneExtra.length);
});
test('diffSessions chỉ trả về buổi thay đổi', () => {
  const sessions = build();
  const plan = planCancel(cls, sessions, sessions[1].id, 'T');
  const { changed, removed } = diffSessions(sessions, plan.sessions);
  assert.equal(removed.length, 0);
  // buổi nghỉ + buổi mới + các buổi bị đổi số
  assert.ok(changed.length >= 2);
  assert.ok(changed.some((s) => s.id === plan.extra.id));
});

console.log('Tạo lại lịch khi sửa lớp');
test('giữ buổi đã dạy & buổi nghỉ, cập nhật giờ/giá buổi còn lại', () => {
  let sessions = build();
  sessions[0] = { ...sessions[0], status: 'done' };
  sessions = planCancel(cls, sessions, sessions[1].id, 'T').sessions;
  const newCls = { ...cls, endDate: '2026-12-02', startTime: '19:00', endTime: '21:00', hourlyRate: 200000 };
  const plan = planRegenerate(newCls, sessions, 'T');
  assert.equal(plan.sessions.find((s) => s.date === '2026-10-05').startTime, '18:00'); // đã dạy: giữ nguyên
  assert.equal(plan.sessions.find((s) => s.date === '2026-10-05').hourlyRate, 150000);
  assert.equal(plan.sessions.find((s) => s.date === '2026-10-07').status, 'cancelled'); // nghỉ: giữ
  const later = plan.sessions.find((s) => s.date === '2026-10-12');
  assert.equal(later.startTime, '19:00');
  assert.equal(later.hourlyRate, 200000);
  assert.equal(plan.sessions.filter((s) => s.status !== 'cancelled').length, 17);
});
test('đổi sang thứ khác → xóa buổi dự kiến cũ, tạo buổi mới', () => {
  const sessions = build();
  const plan = planRegenerate({ ...cls, studyDays: [2, 4] }, sessions, 'T');
  assert.ok(plan.sessions.every((s) => [2, 4].includes(weekday(s.date))));
  assert.equal(plan.remove.length, sessions.length);
});

console.log('Giờ công & tiền công');
test('tính từng buổi với đơn giá khác nhau (không dùng một đơn giá chung)', () => {
  const evs = [
    { type: 'main', status: 'done', countWork: true, hours: 2, hourlyRate: 150000, classId: 'a' },
    { type: 'main', status: 'done', countWork: true, hours: 2, hourlyRate: 200000, classId: 'b' },
    { type: 'trial', status: 'done', countWork: true, hours: 1, hourlyRate: 100000 },
    { type: 'makeup', status: 'done', countWork: true, hours: 1.5, hourlyRate: 180000, classId: 'a' },
    { type: 'makeup', status: 'done', countWork: true, hours: 2, hourlyRate: 250000, classCode: 'PY02', actualIsMe: true },
  ];
  const s = summarize(evs);
  assert.equal(s.byType.main.hours, 4);
  assert.equal(s.byType.main.amount, 300000 + 400000);
  assert.equal(s.byType.trial.amount, 100000);
  assert.equal(s.byType.makeup.hours, 3.5);
  assert.equal(s.byType.makeup.amount, 270000 + 500000);
  assert.equal(s.hours, 4 + 1 + 3.5);
  assert.equal(s.amount, 700000 + 100000 + 770000);
  assert.equal(s.classes, 3); // a, b, PY02 (trial không phải lớp)
});
test('không tính: nghỉ, lịch cá nhân, countWork=false, GV khác dạy', () => {
  const evs = [
    { type: 'main', status: 'cancelled', countWork: true, hours: 2, hourlyRate: 150000 },
    { type: 'personal', status: 'scheduled', countWork: true, hours: 2, hourlyRate: 150000 },
    { type: 'trial', status: 'done', countWork: false, hours: 1, hourlyRate: 100000 },
    { type: 'makeup', status: 'done', countWork: true, actualIsMe: false, hours: 2, hourlyRate: 150000 },
    { type: 'main', status: 'scheduled', countWork: true, hours: 2, hourlyRate: 150000, classId: 'a' },
  ];
  const s = summarize(evs);
  assert.equal(s.hours, 2);
  assert.equal(s.amount, 300000);
  assert.equal(s.cancelled, 1);
  assert.equal(s.plannedAmount, 300000);
  assert.equal(s.doneAmount, 0);
});
test('buổi lẻ phút: 1h30 × 150.000 và thực nhận', () => {
  assert.equal(calcAmount(1.5, 150000), 225000);
  assert.equal(calcAmount(hoursBetween('18:00', '18:50'), 150000), 125000);
  assert.equal(netSalary(12450000, 500000, 200000), 12750000);
});
test('finalizeSession cập nhật amount theo điều kiện tính công', () => {
  assert.equal(finalizeSession({ type: 'trial', status: 'done', countWork: true, hours: 1, hourlyRate: 100000 }).amount, 100000);
  assert.equal(finalizeSession({ type: 'trial', status: 'cancelled', countWork: true, hours: 1, hourlyRate: 100000 }).amount, 0);
  assert.equal(finalizeSession({ type: 'personal', countWork: true, hours: 1, hourlyRate: 100000 }).amount, 0);
});
test('tổng 3 buổi 1h20 không bị lệch số', () => {
  const h = hoursBetween('18:00', '19:20');
  const s = summarize([1, 2, 3].map(() => ({ type: 'main', status: 'done', countWork: true, hours: h, hourlyRate: 90000, classId: 'a' })));
  assert.equal(s.hours, 4);
});

console.log(`\nTất cả ${passed} bài kiểm tra đều đạt.`);
