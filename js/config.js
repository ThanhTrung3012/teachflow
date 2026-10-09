// ============================================================
//  CẤU HÌNH FIREBASE
//  1. Vào https://console.firebase.google.com → tạo project
//  2. Build → Authentication → Sign-in method → bật "Email/Password" và "Google"
//     Authentication → Settings → Authorized domains: thêm domain đang chạy ứng dụng
//  3. Build → Firestore Database → Create database
//  4. Project settings → Your apps → thêm Web app → copy firebaseConfig vào đây
//  5. Dán nội dung file firestore.rules vào Firestore → Rules → Publish
//
//  Khi CHƯA điền cấu hình (còn chữ YOUR_...), website chạy ở "chế độ thử nghiệm":
//  dữ liệu lưu ngay trong trình duyệt này để bạn dùng thử trước.
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyCIRxeUm7Wkwt609qCs_Fr9nzCuTler4q4",
  authDomain: "teachflow-91287.firebaseapp.com",
  projectId: "teachflow-91287",
  storageBucket: "teachflow-91287.firebasestorage.app",
  messagingSenderId: "349737539299",
  appId: "1:349737539299:web:8f8b3b44ef692308e797d6",
  measurementId: "G-4LZRCXVH6S"
};

export function isFirebaseConfigured() {
  return !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_');
}

export const DEFAULT_SETTINGS = {
  defaultRate: 180000, // đơn giá gợi ý khi tạo lớp
  trialRate: 40000, // đơn giá gợi ý cho ca Trial
  makeupRate: 180000, // đơn giá gợi ý cho buổi dạy bù
};
