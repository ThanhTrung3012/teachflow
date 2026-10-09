// Backend thật: Firebase Authentication + Firestore (SDK modular, tải từ CDN).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup,
  signOut, sendPasswordResetEmail, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from '../config.js';

let app, auth, db;
const COLS = ['classes', 'sessions', 'personal_schedules', 'salary_months'];

const toUser = (u) => (u ? { uid: u.uid, email: u.email, displayName: u.displayName || '' } : null);

export default {
  mode: 'firebase',

  async init() {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  },

  onAuth(cb) {
    return onAuthStateChanged(auth, (u) => cb(toUser(u)));
  },
  async signIn(email, password) {
    const r = await signInWithEmailAndPassword(auth, email, password);
    return toUser(r.user);
  },
  async signInWithGoogle() {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    return toUser(result.user);
  },
  async signUp(email, password, displayName) {
    const r = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(r.user, { displayName });
    return toUser(r.user);
  },
  async signOut() {
    await signOut(auth);
  },
  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  },

  /** Tải toàn bộ dữ liệu của MỘT người dùng (luôn lọc theo userId). */
  async loadAll(uid) {
    const out = {};
    await Promise.all(
      COLS.map(async (col) => {
        const snap = await getDocs(query(collection(db, col), where('userId', '==', uid)));
        out[col] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      })
    );
    const u = await getDoc(doc(db, 'users', uid));
    out.user = u.exists() ? u.data() : null;
    return out;
  },

  async saveUser(uid, data) {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  },

  /** ops: [{type:'set'|'delete', col, id, data}] — ghi theo lô (tối đa 400 thao tác/lô). */
  async applyOps(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      for (const o of ops.slice(i, i + 400)) {
        const ref = doc(db, o.col, o.id);
        if (o.type === 'set') batch.set(ref, o.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }
  },
};
