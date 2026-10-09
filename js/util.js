// Các hàm tiện ích thuần (không phụ thuộc DOM) — dùng được cả trong trình duyệt và Node.

export const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const DOW_FULL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
// Thứ tự hiển thị checkbox: T2 → CN
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

const pad = (n) => String(n).padStart(2, '0');

// ---------- Ngày tháng (luôn dùng chuỗi 'YYYY-MM-DD' theo giờ địa phương) ----------
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function todayISO() {
  return toISO(new Date());
}
export function nowHM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function weekday(iso) {
  return parseISO(iso).getDay(); // 0 = CN
}
export function startOfWeek(iso) {
  const wd = weekday(iso); // 0..6
  return addDays(iso, wd === 0 ? -6 : 1 - wd); // tuần bắt đầu từ thứ 2
}
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDM(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
}
export function currentMonth() {
  return todayISO().slice(0, 7);
}
export function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthOf(iso) {
  return iso.slice(0, 7);
}

// ---------- Giờ ----------
export function timeToMin(t) {
  if (!/^\d{1,2}:\d{2}$/.test(t || '')) return NaN;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
// Giờ lưu với độ chính xác cao (8 chữ số) để 50 phút × đơn giá không bị lệch đồng nào; chỉ làm tròn ở bước Thành tiền.
export const round8 = (x) => Math.round((x + Number.EPSILON) * 1e8) / 1e8;

// Số giờ giữa hai mốc thời gian (không hỗ trợ qua nửa đêm)
export function hoursBetween(start, end) {
  const a = timeToMin(start);
  const b = timeToMin(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return round8((b - a) / 60);
}

// ---------- Hiển thị ----------
export function fmtHours(h) {
  return String(round2(h || 0)).replace('.', ',');
}
export function money(n) {
  const v = Math.round(n || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + s + 'đ';
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Khác ----------
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
export function norm(s) {
  return String(s || '').trim().toLowerCase();
}
