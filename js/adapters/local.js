// Backend THỬ NGHIỆM: lưu dữ liệu trong localStorage của trình duyệt (khi chưa cấu hình Firebase).
// Giao diện giống hệt backend Firebase để có thể đổi qua lại mà không sửa code khác.
// Lưu ý: chỉ để dùng thử — không an toàn như Firebase và không đồng bộ giữa các máy.
import { norm } from '../util.js';

const KEY = 'teachflow_local_v1';
const COLS = ['classes', 'sessions', 'personal_schedules', 'salary_months'];
let listeners = [];

function read() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    if (db) return db;
  } catch { /* bỏ qua */ }
  return { accounts: {}, data: {}, session: null };
}
function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
function uidOf(email) {
  let h = 5381;
  for (const c of email) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return 'local_' + h.toString(36);
}
async function hash(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(unescape(encodeURIComponent(text)));
  }
}
const userOf = (acc) => (acc ? { uid: acc.uid, email: acc.email, displayName: acc.displayName || '' } : null);
const emit = (u) => listeners.forEach((cb) => cb(u));
const bucket = (db, uid) => (db.data[uid] ||= { user: null, classes: {}, sessions: {}, personal_schedules: {}, salary_months: {} });

export default {
  mode: 'local',

  async init() {},

  onAuth(cb) {
    listeners.push(cb);
    const db = read();
    setTimeout(() => cb(userOf(db.accounts[db.session])), 0);
  },
  async signIn(email, password) {
    const key = norm(email);
    const db = read();
    const acc = db.accounts[key];
    if (!acc || acc.pw !== (await hash(password))) {
      const e = new Error('Email hoặc mật khẩu không đúng.');
      e.code = 'auth/invalid-credential';
      throw e;
    }
    db.session = key;
    write(db);
    emit(userOf(acc));
    return userOf(acc);
  },
  async signInWithGoogle() {
    throw new Error('Đăng nhập Google chỉ khả dụng khi đã cấu hình Firebase.');
  },
  async signUp(email, password, displayName) {
    const key = norm(email);
    const db = read();
    if (db.accounts[key]) {
      const e = new Error('Email này đã được đăng ký.');
      e.code = 'auth/email-already-in-use';
      throw e;
    }
    db.accounts[key] = { uid: uidOf(key), email: key, displayName: displayName || '', pw: await hash(password) };
    db.session = key;
    write(db);
    emit(userOf(db.accounts[key]));
    return userOf(db.accounts[key]);
  },
  async signOut() {
    const db = read();
    db.session = null;
    write(db);
    emit(null);
  },
  async resetPassword() {
    throw new Error('Chế độ thử nghiệm không hỗ trợ đặt lại mật khẩu qua email.');
  },

  async loadAll(uid) {
    const b = bucket(read(), uid);
    const out = { user: b.user };
    for (const col of COLS) out[col] = Object.values(b[col]);
    return out;
  },
  async saveUser(uid, data) {
    const db = read();
    const b = bucket(db, uid);
    b.user = { ...(b.user || {}), ...data };
    write(db);
  },
  async applyOps(ops) {
    const db = read();
    const uid = db.accounts[db.session]?.uid;
    if (!uid) throw new Error('Chưa đăng nhập.');
    const b = bucket(db, uid);
    for (const o of ops) {
      if (o.type === 'set') b[o.col][o.id] = o.data;
      else delete b[o.col][o.id];
    }
    write(db);
  },
};
