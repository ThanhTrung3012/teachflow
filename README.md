# TeachFlow — Quản lý lịch dạy, giờ công và lương cho giáo viên

HTML + CSS + JavaScript thuần (ES modules), không cần build. Dữ liệu lưu bằng **Firebase Authentication + Firestore**.

## 1. Chạy thử ngay (chưa cần Firebase)

Mở bằng một web server tĩnh (ES modules không chạy được khi mở file trực tiếp `file://`):

```bash
cd teachflow
npx serve . -l 5173        # hoặc: python3 -m http.server 5173
```

Mở http://localhost:5173 → **Tạo tài khoản**. Khi `js/config.js` chưa điền, web chạy ở **chế độ thử nghiệm**:
dữ liệu lưu trong trình duyệt (localStorage), dùng để làm quen trước.

## 2. Kết nối Firebase thật

1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Sign-in method** → bật **Email/Password**.
3. **Build → Firestore Database → Create database** (chọn khu vực gần bạn, ví dụ `asia-southeast1`).
4. **Project settings → Your apps → Web (`</>`)** → copy `firebaseConfig` dán vào `js/config.js`.
5. **Firestore → Rules** → dán nội dung file `firestore.rules` → **Publish**.
   (Rules đảm bảo mỗi tài khoản chỉ đọc/ghi dữ liệu có `userId` của chính mình.)
6. **Authentication → Settings → Authorized domains**: thêm tên miền bạn deploy (localhost có sẵn).

Deploy: Firebase Hosting (`firebase init hosting` → thư mục public là `.`), Netlify, GitHub Pages… đều được.

## 3. Cấu trúc code

```
index.html              khung trang
css/style.css           giao diện
js/config.js            cấu hình Firebase + đơn giá gợi ý
js/util.js              ngày giờ, tiền, tiện ích (hàm thuần)
js/calc.js              TÍNH CÔNG & TIỀN (hàm thuần)
js/schedule.js          SINH LỊCH, NGHỈ & LÙI LỊCH, KHÔI PHỤC (hàm thuần)
js/store.js             dữ liệu trong bộ nhớ + các thao tác ghi (một chỗ duy nhất ghi database)
js/adapters/firebase.js backend Firebase
js/adapters/local.js    backend thử nghiệm (localStorage)
js/forms.js             các form: lớp, buổi dạy, Trial, dạy bù, lịch cá nhân
js/pages/*.js           Dashboard, Lớp học, Lịch, Bảng kết quả, Lương, Cài đặt
js/app.js               đăng nhập, sidebar, router
tests/logic.test.mjs    kiểm thử logic:  node tests/logic.test.mjs
```

Muốn hiểu / sửa nghiệp vụ, chỉ cần đọc `calc.js` và `schedule.js` — hai file này không đụng tới giao diện hay database.

## 4. Quy tắc nghiệp vụ đã cài

**Sinh lịch.** Tạo lớp → hệ thống sinh mọi ngày từ ngày bắt đầu đến ngày kết thúc rơi vào các thứ đã chọn. Mỗi buổi là một document trong `sessions` (`type: "main"`) với giờ, đơn giá riêng.

**Lớp nghỉ một buổi** (nút *Nghỉ* ở trang chi tiết lớp, hoặc đổi trạng thái trong form):
- Buổi nghỉ **giữ nguyên ngày**, trạng thái `Nghỉ`, `countWork=false`, không đánh số buổi, **không bị xóa**.
- Các buổi phía sau **lùi 1 buổi**: nội dung buổi nghỉ được dạy ở buổi kế tiếp, v.v. (cột "Buổi" #n được đánh số lại).
- Thêm **1 buổi mới** vào ngày học kế tiếp sau buổi cuối; **ngày kết thúc lớp** tự lùi theo.
- Bấm nhầm → **Khôi phục**: lịch trở về như cũ, buổi bù tự thêm (nếu chưa dạy) được gỡ.

**Giờ công.** Một buổi được tính khi và chỉ khi: không phải lịch cá nhân, không phải buổi nghỉ, `countWork = true`, và **chính bạn là người đứng lớp** (dạy bù do giáo viên khác dạy thì không tính cho bạn).

**Tiền.** Mỗi buổi: `số giờ × đơn giá của buổi đó`, làm tròn đến đồng; tổng tiền = cộng các buổi được tính công. Không bao giờ lấy tổng giờ × một đơn giá chung.

**Dạy bù.** *Lớp của tôi* (chọn lớp có sẵn) hoặc *lớp của giáo viên khác* (nhập mã lớp, GV chính; bạn là GV thực tế → tính vào công của bạn).

**Lương.** Thực nhận = Tổng tiền công + Thưởng − Khấu trừ. Trạng thái Nháp → Đã kiểm tra → **Đã chốt**.
Khi chốt: lưu ảnh chụp từng buổi, số liệu tháng đó được giữ cố định và **không cho sửa buổi dạy của tháng đó** cho tới khi bấm *Mở khóa*.

**Buổi "Dự kiến" đã qua giờ** vẫn được tính vào tiền dự kiến; web cảnh báo và có nút *Đánh dấu tất cả đã dạy* để bạn xác nhận trước khi chốt lương.

## 5. Mô hình dữ liệu (Firestore)

`users`, `classes`, `sessions`, `personal_schedules`, `salary_months` — đúng như đặc tả, thêm một vài field phụ:
`sessions.lessonNo` (buổi thứ mấy), `autoExtra` / `compensatesFor` (buổi bù tự thêm khi nghỉ), `edited` (đã chỉnh tay, không bị ghi đè khi sửa lịch lớp),
`actualIsMe` (mình có phải người đứng lớp), `classCode/className/course` (sao chép để bảng kết quả hiển thị nhanh và ổn định),
`salary_months.lines` (ảnh chụp từng buổi khi chốt). ID document lương: `{uid}_{năm}_{tháng}`.
