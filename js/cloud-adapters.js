// 雲端同步 adapter：Google Drive（App Data 隱藏資料夾）與 Firebase（Auth + Firestore）
// 兩者都需要使用者自己建立專案並把 ID／設定貼到「系統設定 → 雲端同步」，步驟見設定頁的說明。
import { store } from './store.js';
import { cloud } from './cloud.js';

const loadScript = (src, ready) => new Promise((resolve, reject) => {
  if (ready()) return resolve();
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.onload = () => (ready() ? resolve() : reject(new Error('登入元件載入不完整，請重新整理再試。')));
  s.onerror = () => reject(new Error('無法載入登入元件，請檢查網路連線。'));
  document.head.appendChild(s);
});

/* =====================================================================
   Google Drive：只用 drive.appdata 範圍，檔案放在 App 專屬的隱藏資料夾，
   不會出現在使用者的雲端硬碟清單，也碰不到其他檔案。
   ===================================================================== */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'wordquest_backup.json';
let token = '';
let tokenExpiry = 0;

function requestToken(prompt) {
  const clientId = store.state.settings.gdriveClientId.trim();
  if (!clientId) return Promise.reject(new Error('請先在設定頁填入 Google OAuth 用戶端 ID。'));
  return loadScript('https://accounts.google.com/gsi/client', () => window.google?.accounts?.oauth2).then(() =>
    new Promise((resolve, reject) => {
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          token = r.access_token;
          tokenExpiry = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          resolve(token);
        },
        error_callback: (e) => reject(new Error(
          e?.type === 'popup_closed' ? '已取消 Google 授權視窗。'
            : e?.type === 'popup_failed_to_open' ? '瀏覽器擋住了授權視窗，請允許彈出視窗後再試。'
            : (e?.message || '授權失敗')))
      }).requestAccessToken({ prompt });
    }));
}

async function driveCall(url, init = {}, retry = true) {
  if (!token || Date.now() > tokenExpiry - 60000) await requestToken(''); // 授權一小時後過期，過期就重新取得
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) { token = ''; return driveCall(url, init, false); }
  if (!res.ok) {
    const hint = res.status === 403 ? '（請確認已啟用 Google Drive API，且你的帳號在「測試使用者」名單內）' : '';
    throw new Error(`Google Drive 回應錯誤 ${res.status}${hint}`);
  }
  return res;
}

async function findFileId() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await driveCall(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)&pageSize=1`);
  return (await res.json()).files?.[0]?.id || null;
}

const gdrive = {
  async connect() { await requestToken(''); },
  async disconnect() {
    if (token) window.google?.accounts?.oauth2?.revoke(token, () => {});
    token = ''; tokenExpiry = 0;
  },
  async pull() {
    const id = await findFileId();
    if (!id) return null;
    const res = await driveCall(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    return res.json();
  },
  async push(data) {
    const content = JSON.stringify(data);
    const id = await findFileId();
    if (id) {
      await driveCall(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: content
      });
      return;
    }
    const b = `wq${Math.random().toString(36).slice(2)}`;
    const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
      + `${JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })}\r\n`
      + `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n--${b}--`;
    await driveCall('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body
    });
  }
};

/* =====================================================================
   Firebase：Google 登入 + Firestore（users/<uid>/wordquest/backup 一份文件）
   ===================================================================== */
const FB = 'https://www.gstatic.com/firebasejs/10.14.1';
const FB_DOC_LIMIT = 900000; // Firestore 單一文件上限約 1 MiB，留一點餘裕
let fb = null;               // { app, auth, fs } 三個模組
let auth = null;
let db = null;

/** 接受 Firebase 主控台直接複製的 `const firebaseConfig = { apiKey: "...", ... };`，也接受標準 JSON */
export function parseFirebaseConfig(text) {
  const src = String(text || '').trim();
  const a = src.indexOf('{'), z = src.lastIndexOf('}');
  if (a < 0 || z < a) throw new Error('請先在設定頁貼上 firebaseConfig。');
  const body = src.slice(a, z + 1);
  let cfg;
  try { cfg = JSON.parse(body); } catch (e) {
    try {
      cfg = JSON.parse(body
        .replace(/\/\/.*$/gm, '')
        .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}'));
    } catch (e2) { throw new Error('firebaseConfig 格式看不懂，請整段從 Firebase 主控台複製。'); }
  }
  if (!cfg.apiKey || !cfg.projectId) throw new Error('firebaseConfig 缺少 apiKey 或 projectId。');
  return cfg;
}

function fbError(e) {
  const code = e?.code || '';
  if (code === 'auth/unauthorized-domain') {
    return `網域尚未授權：到 Firebase → Authentication → 設定 → 授權網域，加入 ${location.hostname}`;
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '已取消登入視窗。';
  if (code === 'auth/popup-blocked') return '瀏覽器擋住了登入視窗，請允許彈出視窗後再試。';
  if (code === 'auth/operation-not-allowed') return '尚未啟用 Google 登入：Firebase → Authentication → 登入方式 → 啟用 Google。';
  if (code === 'permission-denied') return 'Firestore 安全規則不允許存取，請照設定說明貼上規則。';
  if (code === 'failed-precondition' || code === 'not-found') return '尚未建立 Firestore 資料庫，請到 Firebase 主控台建立。';
  return e?.message || '雲端連線失敗';
}

async function fbInit() {
  const cfg = parseFirebaseConfig(store.state.settings.firebaseConfig);
  if (!fb) {
    const [app, au, fs] = await Promise.all([
      import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`), import(`${FB}/firebase-firestore.js`)
    ]).catch(() => { throw new Error('無法載入 Firebase 元件，請檢查網路連線。'); });
    fb = { app, auth: au, fs };
  }
  const app = fb.app.getApps().find((x) => x.name === 'wordquest') || fb.app.initializeApp(cfg, 'wordquest');
  auth = fb.auth.getAuth(app);
  db = fb.fs.getFirestore(app);
}

const fbRef = () => fb.fs.doc(db, 'users', auth.currentUser.uid, 'wordquest', 'backup');
const guard = async (fn) => { try { return await fn(); } catch (e) { throw new Error(fbError(e)); } };

const firebase = {
  connect: () => guard(async () => {
    await fbInit();
    if (!auth.currentUser) await fb.auth.signInWithPopup(auth, new fb.auth.GoogleAuthProvider());
  }),
  /** Firebase 會記住登入狀態，重新載入頁面時不用再跳視窗 */
  async resume() {
    if (!store.state.settings.firebaseConfig.trim()) return false;
    try {
      await fbInit();
      await auth.authStateReady?.();
      return Boolean(auth.currentUser);
    } catch (e) { return false; }
  },
  disconnect: () => guard(async () => { if (auth) await fb.auth.signOut(auth); }),
  pull: () => guard(async () => {
    const snap = await fb.fs.getDoc(fbRef());
    return snap.exists() ? JSON.parse(snap.data().json) : null;
  }),
  push: (data) => guard(async () => {
    const json = JSON.stringify(data);
    if (new TextEncoder().encode(json).length > FB_DOC_LIMIT) {
      throw new Error('資料量超過 Firestore 單一文件的 1 MB 上限，請改用 Google Drive 同步。');
    }
    await fb.fs.setDoc(fbRef(), { json, updatedAt: Date.now() });
  })
};

cloud.registerAdapter('gdrive', gdrive);
cloud.registerAdapter('firebase', firebase);
