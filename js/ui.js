// Thành phần giao diện dùng chung: toast, hộp thoại, huy hiệu, bộ chọn tháng.
import { esc, fmtMonth, shiftMonth, currentMonth } from './util.js';
import { TYPE_LABEL, STATUS_LABEL, CLASS_STATUS_LABEL } from './calc.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Toast ----------
export function toast(message, kind = 'ok', ms = 4200) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('hide'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// ---------- Modal ----------
/** Mở hộp thoại. body là HTML. Trả về { el, close }. */
export function openModal({ title, body, footer = '', wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Đóng">✕</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  document.body.classList.add('modal-open');
  const close = () => {
    wrap.remove();
    if (!root.children.length) document.body.classList.remove('modal-open');
    onClose?.();
  };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap._down = true; });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || (e.target === wrap && wrap._down)) close();
    wrap._down = false;
  });
  const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { el: wrap, close };
}

export function confirmDialog({ title = 'Xác nhận', message, okText = 'Đồng ý', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const m = openModal({
      title,
      body: `<div class="confirm-msg">${message}</div>`,
      footer: `<button class="btn" data-close>Hủy</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`,
      onClose: () => done(false),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done(true); m.close(); });
  });
}

// ---------- Huy hiệu ----------
export const typeBadge = (t) => `<span class="badge type-${t}">${esc(TYPE_LABEL[t] || t)}</span>`;
export function statusBadge(e) {
  if (e.type === 'personal') return '<span class="muted">—</span>';
  return `<span class="badge st-${e.status}">${esc(STATUS_LABEL[e.status] || e.status)}</span>`;
}
export const classStatusBadge = (s) => `<span class="badge cs-${s}">${esc(CLASS_STATUS_LABEL[s] || s)}</span>`;

// ---------- Bộ chọn tháng ----------
export function monthPickerHTML(ym, { allowAll = false } = {}) {
  return `
    <div class="month-picker">
      <button class="icon-btn" data-month-step="-1" aria-label="Tháng trước">‹</button>
      <input type="month" data-month-input value="${ym || ''}" aria-label="Chọn tháng">
      <button class="icon-btn" data-month-step="1" aria-label="Tháng sau">›</button>
      <button class="btn btn-sm" data-month-today>Tháng này</button>
      ${allowAll ? '<button class="btn btn-sm" data-month-all>Tất cả</button>' : ''}
    </div>`;
}
export function bindMonthPicker(root, getMonth, setMonth) {
  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-month-step]');
    if (step) setMonth(shiftMonth(getMonth() || currentMonth(), Number(step.dataset.monthStep)));
    if (e.target.closest('[data-month-today]')) setMonth(currentMonth());
    if (e.target.closest('[data-month-all]')) setMonth('');
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-month-input]')) setMonth(e.target.value || '');
  });
}

export const monthTitle = (ym) => (ym ? `THÁNG ${fmtMonth(ym)}` : 'TẤT CẢ CÁC THÁNG');

export function emptyState(text, action = '') {
  return `<div class="empty"><div class="empty-ico">📭</div><p>${text}</p>${action}</div>`;
}

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
