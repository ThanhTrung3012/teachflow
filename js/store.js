// Store: giữ dữ liệu của người dùng trong bộ nhớ + các thao tác nghiệp vụ ghi xuống backend.
// Giao diện (pages) chỉ gọi các hàm ở đây, không tự ghi database.
import { uid, todayISO, nowHM, currentMonth, fmtDate, fmtMonth, monthOf, hoursBetween, norm } from './util.js';
import { finalizeSession, summarize, salaryLines, netSalary, calcAmount } from './calc.js';
import {
  cmpSession, generateSlots, newMainSession, renumber, lastActiveDate,
  planCancel, planRestore, planRegenerate, diffSessions, isPastScheduled,
} from './schedule.js';
import { isFirebaseConfigured, DEFAULT_SETTINGS } from './config.js';

let backend = null;

export const state = {
  user: null,
  settings: { ...DEFAULT_SETTINGS, teacherName: '' },
  classes: new Map(),
  sessions: new Map(),
  personal: new Map(),
  salary: new Map(),
  month: currentMonth(), // tháng đang xem (dùng chung Dashboard / Bảng kết quả / Lương)
};

const COL_MAP = { classes: 'classes', sessions: 'sessions', personal_schedules: 'personal', salary_months: 'salary' };
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn());

// ================= Khởi tạo & xác thực =================
export async function initBackend() {
  backend = isFirebaseConfigured()
    ? (await import('./adapters/firebase.js')).default
    : (await import('./adapters/local.js')).default;
  await backend.init();
  return backend.mode;
}
export const backendMode = () => backend?.mode;
export const onAuthChange = (cb) => backend.onAuth(cb);

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/email-already-in-use': 'Email này đã được đăng ký.',
  'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
  'auth/too-many-requests': 'Thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối internet.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
  'auth/cancelled-popup-request': 'Yêu cầu đăng nhập Google đã bị hủy.',
  'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép pop-up rồi thử lại.',
  'auth/operation-not-allowed': 'Nhà cung cấp Google chưa được bật trong Firebase Authentication.',
  'auth/unauthorized-domain': 'Tên miền hiện tại chưa được cấp phép trong Firebase Authentication.',
  'permission-denied': 'Không có quyền truy cập dữ liệu. Kiểm tra lại Firestore Rules.',
};
export function friendlyError(e) {
  return AUTH_ERRORS[e?.code] || e?.message || 'Đã có lỗi xảy ra.';
}

export const signIn = (email, pw) => backend.signIn(email.trim(), pw);
export const signInWithGoogle = () => backend.signInWithGoogle();
export const signUp = (email, pw, name) => backend.signUp(email.trim(), pw, name);
export const resetPassword = (email) => backend.resetPassword(email.trim());
export async function signOutUser() {
  await backend.signOut();
  clearData();
}

function clearData() {
  state.user = null;
  for (const k of ['classes', 'sessions', 'personal', 'salary']) state[k].clear();
}

export async function loadUserData(user) {
  const data = await backend.loadAll(user.uid);
  clearData();
  state.user = user;
  for (const [col, key] of Object.entries(COL_MAP)) for (const d of data[col] || []) state[key].set(d.id, d);

  const fallbackName = user.displayName || (user.email || '').split('@')[0];
  let profile = data.user;
  if (!profile) {
    profile = { uid: user.uid, email: user.email, displayName: fallbackName, createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS } };
    await backend.saveUser(user.uid, profile);
  }
  state.settings = { ...DEFAULT_SETTINGS, ...(profile.settings || {}), teacherName: profile.displayName || fallbackName };
  emit();
}

export async function saveSettings(patch) {
  const { teacherName, ...rest } = patch;
  const settings = { ...state.settings, ...rest };
  delete settings.teacherName;
  const data = { settings };
  if (teacherName !== undefined) data.displayName = teacherName.trim();
  await backend.saveUser(state.user.uid, data);
  state.settings = { ...state.settings, ...rest, teacherName: data.displayName ?? state.settings.teacherName };
  emit();
}

export function setMonth(ym) {
  state.month = ym || currentMonth();
  emit();
}

// ================= Đọc dữ liệu =================
export const teacherName = () => state.settings.teacherName || (state.user?.email || '').split('@')[0] || 'Tôi';
export const classesList = () => [...state.classes.values()].sort((a, b) => a.classCode.localeCompare(b.classCode));
export const getClass = (id) => state.classes.get(id);
export const sessionsList = () => [...state.sessions.values()];
export const classMain = (classId) => sessionsList().filter((s) => s.classId === classId && s.type === 'main').sort(cmpSession);

export function personalToEvent(p) {
  return {
    id: p.id, _src: 'personal', type: 'personal', classId: null,
    classCode: '', className: p.title, course: '', student: '', mainTeacher: '', actualTeacher: '',
    date: p.date, startTime: p.startTime, endTime: p.endTime,
    hours: hoursBetween(p.startTime, p.endTime), hourlyRate: 0, amount: 0,
    status: 'scheduled', countWork: false, note: p.note || '', title: p.title,
  };
}
/** Toàn bộ sự kiện: buổi dạy (sessions) + lịch cá nhân (personal_schedules) */
export function events() {
  const out = sessionsList();
  for (const p of state.personal.values()) out.push(personalToEvent(p));
  return out.sort(cmpSession);
}
export function getEvent(id) {
  if (state.sessions.has(id)) return state.sessions.get(id);
  if (state.personal.has(id)) return personalToEvent(state.personal.get(id));
  return null;
}
export const monthEvents = (ym) => events().filter((e) => monthOf(e.date) === ym);
export const monthSummary = (ym) => summarize(monthEvents(ym));

export const salaryDocId = (ym) => `${state.user.uid}_${ym.slice(0, 4)}_${Number(ym.slice(5, 7))}`;
export const salaryOf = (ym) => state.salary.get(salaryDocId(ym)) || null;
export const isMonthLocked = (ym) => salaryOf(ym)?.status === 'locked';

export function pastScheduled(filterFn = () => true) {
  const t = todayISO(), n = nowHM();
  return events().filter((e) => isPastScheduled(e, t, n) && filterFn(e));
}

// ================= Ghi dữ liệu =================
function assertUnlocked(dates) {
  for (const ym of new Set(dates.filter(Boolean).map(monthOf))) {
    if (isMonthLocked(ym)) {
      throw new Error(`Tháng ${fmtMonth(ym)} đã chốt lương. Hãy mở khóa ở trang "Lương" trước khi chỉnh sửa.`);
    }
  }
}

async function commit(ops) {
  if (!ops.length) return;
  const now = new Date().toISOString();
  const prepared = ops.map((o) => {
    if (o.type !== 'set') return o;
    const data = JSON.parse(JSON.stringify({ ...o.data, id: o.id, userId: state.user.uid, updatedAt: now, createdAt: o.data.createdAt || now }));
    return { ...o, data };
  });
  await backend.applyOps(prepared); // lỗi → ném ra, bộ nhớ không đổi
  for (const o of prepared) {
    const map = state[COL_MAP[o.col]];
    if (o.type === 'set') map.set(o.id, o.data);
    else map.delete(o.id);
  }
  emit();
}

/** Ghi kết quả của một thay đổi lịch lớp (nghỉ / khôi phục / tạo lại / sửa buổi). */
async function commitClassPlan(cls, before, after, endDate, writeClass) {
  const { changed, removed } = diffSessions(before, after);
  const beforeMap = new Map(before.map((s) => [s.id, s]));
  assertUnlocked([
    ...changed.map((s) => s.date),
    ...changed.map((s) => beforeMap.get(s.id)?.date),
    ...removed.map((s) => s.date),
  ]);
  const ops = [];
  for (const s of changed) ops.push({ type: 'set', col: 'sessions', id: s.id, data: finalizeSession(s) });
  for (const s of removed) ops.push({ type: 'delete', col: 'sessions', id: s.id });
  const activeLessons = after.filter((s) => s.status !== 'cancelled');
  const completed = activeLessons.length === 14 && activeLessons.every((s) => s.status === 'done');
  const classData = { ...cls, endDate };
  if (completed && classData.status === 'active') {
    classData.status = 'ended';
    classData.autoCompleted = true;
  } else if (!completed && classData.autoCompleted) {
    classData.status = 'active';
    delete classData.autoCompleted;
  }
  if (writeClass || endDate !== cls.endDate || classData.status !== cls.status || classData.autoCompleted !== cls.autoCompleted) {
    ops.push({ type: 'set', col: 'classes', id: cls.id, data: classData });
  }
  await commit(ops);
}

// ---------- Lớp học ----------
const SCHEDULE_KEYS = ['startDate', 'endDate', 'startTime', 'endTime', 'duration', 'hourlyRate', 'classCode', 'className', 'course', 'students'];

export async function saveClass(form, id) {
  const teacher = teacherName();
  const old = id ? state.classes.get(id) : null;
  const cls = { ...(old || {}), ...form, id: id || uid(), userId: state.user.uid };
  cls.studyDays = [...form.studyDays].map(Number).sort((a, b) => a - b);
  cls.duration = Number(form.duration) || hoursBetween(form.startTime, form.endTime);
  cls.hourlyRate = Number(form.hourlyRate) || 0;

  if (!old) {
    const dates = generateSlots(cls.startDate, cls.endDate, cls.studyDays);
    if (!dates.length) throw new Error('Khoảng ngày và các thứ học đã chọn không tạo ra buổi nào.');
    assertUnlocked(dates);
    const sessions = renumber(dates.map((d) => newMainSession(cls, d, teacher)));
    cls.endDate = lastActiveDate(sessions);
    const ops = [{ type: 'set', col: 'classes', id: cls.id, data: cls }];
    for (const s of sessions) ops.push({ type: 'set', col: 'sessions', id: s.id, data: finalizeSession(s) });
    await commit(ops);
    return { id: cls.id, created: sessions.length };
  }

  const studyChanged = JSON.stringify([...old.studyDays].sort()) !== JSON.stringify(cls.studyDays);
  const impact = studyChanged || SCHEDULE_KEYS.some((k) => String(old[k] ?? '') !== String(cls[k] ?? ''));
  if (!impact) {
    await commit([{ type: 'set', col: 'classes', id: cls.id, data: cls }]);
    return { id: cls.id, created: 0 };
  }
  if (!generateSlots(cls.startDate, cls.endDate, cls.studyDays).length) {
    throw new Error('Khoảng ngày và các thứ học đã chọn không tạo ra buổi nào.');
  }
  const before = classMain(cls.id);
  const plan = planRegenerate(cls, before, teacher);
  const after = plan.sessions.map((s) => ({ ...s, classCode: cls.classCode, className: cls.className, course: cls.course, student: cls.students || '' }));
  cls.endDate = plan.endDate;
  await commitClassPlan(cls, before, after, plan.endDate, true);
  // đồng bộ tên lớp cho dạy bù / trial gắn với lớp này (chỉ thông tin hiển thị)
  const linked = sessionsList().filter((s) => s.classId === cls.id && s.type !== 'main');
  if (linked.length) {
    await commit(linked.map((s) => ({ type: 'set', col: 'sessions', id: s.id, data: { ...s, classCode: cls.classCode, className: cls.className, course: cls.course } })));
  }
  return { id: cls.id, created: 0, regenerated: true };
}

export async function deleteClass(id) {
  const linked = sessionsList().filter((s) => s.classId === id);
  assertUnlocked(linked.map((s) => s.date));
  const ops = linked.map((s) => ({ type: 'delete', col: 'sessions', id: s.id }));
  ops.push({ type: 'delete', col: 'classes', id });
  await commit(ops);
}

// ---------- Buổi dạy ----------
/** Xem trước kết quả khi cho một buổi nghỉ (để hiện trong hộp xác nhận). Không ghi gì. */
export function previewCancel(sessionId) {
  const s = state.sessions.get(sessionId);
  const cls = state.classes.get(s.classId);
  const plan = planCancel(cls, classMain(cls.id), sessionId, teacherName());
  return { cls, session: s, extraDate: plan.extra.date, oldEnd: cls.endDate, newEnd: plan.endDate };
}

/** Tạo mới Trial / Dạy bù. */
export async function createSession(data) {
  const s = finalizeSession({ ...data, id: uid(), userId: state.user.uid });
  assertUnlocked([s.date]);
  await commit([{ type: 'set', col: 'sessions', id: s.id, data: s }]);
  return s;
}

/** Sửa một buổi bất kỳ. Với lớp chính, đổi trạng thái sang/ khỏi "Nghỉ" sẽ tự lùi/khôi phục lịch. */
export async function updateEvent(id, patch) {
  const cur = state.sessions.get(id);
  if (!cur) {
    const p = state.personal.get(id);
    if (!p) throw new Error('Không tìm thấy lịch.');
    const { title, date, startTime, endTime, note } = { ...personalToEvent(p), ...patch };
    await commit([{ type: 'set', col: 'personal_schedules', id, data: { ...p, title, date, startTime, endTime, note } }]);
    return { message: '' };
  }
  let next = { ...cur, ...patch };
  if (cur.type === 'main' && ['date', 'startTime', 'endTime'].some((k) => patch[k] !== undefined && patch[k] !== cur[k])) next.edited = true;
  next = finalizeSession(next);
  assertUnlocked([cur.date, next.date]);

  const cls = cur.type === 'main' ? state.classes.get(cur.classId) : null;
  if (!cls) {
    await commit([{ type: 'set', col: 'sessions', id, data: next }]);
    return { message: '' };
  }

  const before = classMain(cls.id);
  const wasCancelled = cur.status === 'cancelled';
  const isCancelled = next.status === 'cancelled';
  let plan, message = '';
  if (!wasCancelled && isCancelled) {
    const patched = before.map((s) => (s.id === id ? { ...next, status: cur.status } : s)); // planCancel tự đặt trạng thái Nghỉ
    plan = planCancel(cls, patched, id, teacherName());
    message = `Đã cho nghỉ buổi ${fmtDate(cur.date)}. Các buổi sau lùi 1 buổi, thêm buổi mới ngày ${fmtDate(plan.extra.date)}; ngày kết thúc lớp: ${fmtDate(plan.endDate)}.`;
  } else if (wasCancelled && !isCancelled) {
    plan = planRestore(cls, before.map((s) => (s.id === id ? next : s)), id);
    message = plan.removedExtra
      ? `Đã khôi phục buổi ${fmtDate(cur.date)} và gỡ buổi bù tự thêm ngày ${fmtDate(plan.removedExtra.date)}.`
      : `Đã khôi phục buổi ${fmtDate(cur.date)}. Lưu ý: buổi bù đã thêm trước đó không thể tự gỡ nên lớp đang dư 1 buổi — bạn có thể sửa tay.`;
  } else {
    const after = renumber(before.map((s) => (s.id === id ? next : s)));
    plan = { sessions: after, endDate: lastActiveDate(after) || cls.endDate };
  }
  await commitClassPlan(cls, before, plan.sessions, plan.endDate, false);
  return { message };
}

export async function deleteEvent(id) {
  const s = state.sessions.get(id);
  if (s) {
    if (s.type === 'main') throw new Error('Không xóa buổi của lớp chính (giữ lịch sử). Hãy dùng "Nghỉ" nếu buổi không diễn ra.');
    assertUnlocked([s.date]);
    await commit([{ type: 'delete', col: 'sessions', id }]);
    return;
  }
  if (state.personal.has(id)) await commit([{ type: 'delete', col: 'personal_schedules', id }]);
}

export async function createPersonal({ title, date, startTime, endTime, note }) {
  const id = uid();
  await commit([{ type: 'set', col: 'personal_schedules', id, data: { title, date, startTime, endTime, note: note || '' } }]);
  return id;
}

/** Đánh dấu "Đã dạy" cho các buổi đã qua giờ mà vẫn "Dự kiến". */
export async function markPastDone({ classId = null, ym = null, sessionId = null } = {}) {
  const list = sessionsList().filter((s) => (!sessionId || s.id === sessionId) && (!classId || s.classId === classId) && (!ym || monthOf(s.date) === ym));
  const t = todayISO(), n = nowHM();
  const targets = list.filter((s) => isPastScheduled(s, t, n));
  assertUnlocked(targets.map((s) => s.date));
  await commit(targets.map((s) => ({ type: 'set', col: 'sessions', id: s.id, data: { ...s, status: 'done' } })));
  return targets.length;
}

// ---------- Lương ----------
export function liveSalary(ym) {
  const evs = monthEvents(ym);
  const sum = summarize(evs);
  return { evs, sum, lines: salaryLines(evs) };
}

/** Lưu bảng lương tháng với trạng thái draft | checked | locked. */
export async function saveSalary(ym, { bonus = 0, deduction = 0, status = 'draft' }) {
  const { sum, lines } = liveSalary(ym);
  const old = salaryOf(ym);
  bonus = Math.max(0, Math.round(Number(bonus) || 0));
  deduction = Math.max(0, Math.round(Number(deduction) || 0));
  const doc = {
    ...(old || {}),
    month: Number(ym.slice(5, 7)),
    year: Number(ym.slice(0, 4)),
    totalClasses: sum.classes,
    totalSessions: sum.sessions,
    totalHours: sum.hours,
    mainHours: sum.byType.main.hours,
    trialHours: sum.byType.trial.hours,
    makeupHours: sum.byType.makeup.hours,
    totalSalary: sum.amount,
    bonus,
    deduction,
    finalSalary: netSalary(sum.amount, bonus, deduction),
    status,
    lines: status === 'locked' ? lines : null, // ảnh chụp từng buổi để đối chiếu về sau
    lockedAt: status === 'locked' ? new Date().toISOString() : null,
  };
  await commit([{ type: 'set', col: 'salary_months', id: salaryDocId(ym), data: doc }]);
  return doc;
}

/** Chỉ đổi thưởng / khấu trừ / trạng thái của tháng ĐÃ CHỐT thì không được — dùng khi mở khóa. */
export async function unlockSalary(ym) {
  const old = salaryOf(ym);
  if (!old) return;
  await commit([{ type: 'set', col: 'salary_months', id: salaryDocId(ym), data: { ...old, status: 'checked', lines: null, lockedAt: null } }]);
}

// ---------- Sao lưu ----------
export function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    user: { email: state.user.email, displayName: teacherName(), settings: state.settings },
    classes: [...state.classes.values()],
    sessions: sessionsList(),
    personal_schedules: [...state.personal.values()],
    salary_months: [...state.salary.values()],
  };
}

export { calcAmount, norm };
