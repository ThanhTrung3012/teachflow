// Theo dõi các nguồn thu nhập tự khai báo theo năm, tách biệt bảng lương KPI.
import { money } from '../util.js';
import * as store from '../store.js';
import { toast } from '../ui.js';

const FIELDS = [
  ['trackedSalary', 'Tiền lương'],
  ['trackedBonus', 'Tiền thưởng'],
  ['preTaxIncome', 'Thu nhập chưa tính thuế'],
];
let activeYear = null;

export function render(root) {
  const currentYear = Number(store.state.month.slice(0, 4));
  activeYear ??= currentYear;
  const selectedYear = activeYear;
  const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`);
  const records = months.map((ym) => store.salaryOf(ym) || {});
  const val = (record, field) => Math.max(0, Number(record[field]) || 0);
  const rowTotal = (record) => FIELDS.reduce((sum, [field]) => sum + val(record, field), 0);
  const annual = records.reduce((sum, record) => sum + rowTotal(record), 0);
  const filledMonths = records.filter((record) => FIELDS.some(([field]) => val(record, field) > 0)).length;
  const average = filledMonths ? annual / filledMonths : 0;
  const totalFor = (field) => records.reduce((sum, record) => sum + val(record, field), 0);
  const thisYear = new Date().getFullYear();

  root.innerHTML = `
    <div class="page-head income-head">
      <div><p class="eyebrow">KẾ HOẠCH TÀI CHÍNH CÁ NHÂN</p><h1>Thu nhập năm <span class="muted">${selectedYear}</span></h1><p class="muted">Ghi lại thu nhập theo tháng để theo dõi tổng và mức trung bình.</p></div>
      <div class="btn-row"><label class="income-year-label" for="income-year">Năm</label><select id="income-year" aria-label="Chọn năm">${Array.from({ length: 7 }, (_, i) => thisYear - 3 + i).map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    </div>
    <div class="stat-grid income-stats">
      <div class="stat stat-accent"><span>Tổng thu nhập năm</span><b class="salary-value" id="income-summary-total">${money(annual)}</b><em id="income-summary-months">${filledMonths ? `Đã ghi ${filledMonths}/12 tháng` : 'Chưa có dữ liệu'}</em></div>
      <div class="stat"><span>Trung bình mỗi tháng</span><b class="salary-value" id="income-summary-average">${money(average)}</b><em id="income-summary-average-note">Tính trên ${filledMonths} tháng có thu nhập</em></div>
      <div class="stat"><span>Tổng tiền lương</span><b class="salary-value" id="income-summary-salary">${money(totalFor('trackedSalary'))}</b><em>Trong năm ${selectedYear}</em></div>
    </div>
    <section class="card income-card">
      <div class="income-table-head"><div><h2>Thu nhập theo tháng</h2><p class="muted">Nhập số tiền bằng đồng (₫). Mức trung bình chỉ tính các tháng có thu nhập.</p></div><span class="income-lock-note">▣ Dữ liệu riêng tư của bạn</span></div>
      <div class="table-wrap"><table class="tbl income-table"><thead><tr><th>Tháng</th><th>Tiền lương</th><th>Tiền thưởng</th><th>Thu nhập chưa tính thuế</th><th class="num">Tổng tháng</th></tr></thead>
      <tbody>${records.map((record, index) => `<tr><th scope="row">Tháng ${index + 1}</th>${FIELDS.map(([field, label]) => `<td><label class="sr-only" for="income-${index}-${field}">Tháng ${index + 1} — ${label}</label><input class="income-input" id="income-${index}-${field}" type="number" min="0" step="100000" inputmode="numeric" placeholder="0" value="${val(record, field) || ''}" data-month="${index}" data-field="${field}" aria-label="Tháng ${index + 1} — ${label}"></td>`).join('')}<td class="num income-row-total" data-row-total="${index}">${money(rowTotal(record))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Cả năm</td>${FIELDS.map(([field]) => `<td class="income-col-total" data-field-total="${field}">${money(totalFor(field))}</td>`).join('')}<td class="num" id="income-grand-total">${money(annual)}</td></tr></tfoot></table></div>
      <div class="income-actions"><span class="muted">Thay đổi sẽ được lưu khi bạn bấm nút.</span><button class="btn btn-primary" id="save-income">Lưu thu nhập năm</button></div>
    </section>`;

  root.querySelector('#income-year').onchange = (event) => {
    activeYear = Number(event.target.value);
    render(root);
  };
  root.querySelector('.income-table').addEventListener('input', (event) => {
    if (!event.target.matches('.income-input')) return;
    const row = Number(event.target.dataset.month);
    const rowInputs = [...root.querySelectorAll(`.income-input[data-month="${row}"]`)];
    const rowSum = rowInputs.reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
    root.querySelector(`[data-row-total="${row}"]`).textContent = money(rowSum);
    const sums = Object.fromEntries(FIELDS.map(([field]) => [field, [...root.querySelectorAll(`.income-input[data-field="${field}"]`)].reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0)]));
    FIELDS.forEach(([field]) => { root.querySelector(`[data-field-total="${field}"]`).textContent = money(sums[field]); });
    const grandTotal = Object.values(sums).reduce((sum, amount) => sum + amount, 0);
    root.querySelector('#income-grand-total').textContent = money(grandTotal);
    const monthCount = Array.from({ length: 12 }, (_, index) => [...root.querySelectorAll(`.income-input[data-month="${index}"]`)].some((input) => Number(input.value) > 0)).filter(Boolean).length;
    root.querySelector('#income-summary-total').textContent = money(grandTotal);
    root.querySelector('#income-summary-months').textContent = monthCount ? `Đã ghi ${monthCount}/12 tháng` : 'Chưa có dữ liệu';
    root.querySelector('#income-summary-average').textContent = money(monthCount ? grandTotal / monthCount : 0);
    root.querySelector('#income-summary-average-note').textContent = `Tính trên ${monthCount} tháng có thu nhập`;
    root.querySelector('#income-summary-salary').textContent = money(sums.trackedSalary);
  });
  root.querySelector('#save-income').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const values = months.map((_, index) => Object.fromEntries(FIELDS.map(([field]) => [field, Math.max(0, Math.round(Number(root.querySelector(`.income-input[data-month="${index}"][data-field="${field}"]`).value) || 0))])));
      await store.saveIncomeYear(selectedYear, values);
      toast(`Đã lưu thu nhập năm ${selectedYear}.`);
    } catch (error) {
      toast(store.friendlyError(error), 'err');
    } finally { button.disabled = false; }
  };
}
