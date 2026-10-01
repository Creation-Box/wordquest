// 雲端同步引擎：狀態管理、衝突判斷、自動上傳。實際的 Google Drive／Firebase 連線在 cloud-adapters.js。
//
// adapter 介面（cloud-adapters.js 已實作兩個）：
//   connect()      登入／取得授權
//   disconnect()   登出
//   push(data)     上傳 data（群組＋單字）
//   pull()         下載並回傳 data；雲端還沒有資料時回傳 null
//   resume()       （選用）頁面重新載入後，不跳視窗就恢復連線，成功回傳 true
//
// 雲端只放「群組＋單字」，不放設定（設定裡有 Unsplash Key 等）。
// 同步規則（以內容比對，不靠時鐘）：
//   內容相同 → 不動作；自上次同步後雲端沒被別的裝置改過 → 上傳本機；
//   本機是空的 → 下載雲端；其餘（兩邊都有不同的內容）→ 手動同步會問使用者保留哪一份，自動同步則暫停並提示。
import { store, normalizeData } from './store.js';

export const PROVIDERS = {
  gdrive: { label: 'Google Drive', icon: 'hard-drive' },
  firebase: { label: 'Firebase', icon: 'flame' }
};

export const STATUS_LABELS = {
  disconnected: '未連線',
  connecting: '連線中…',
  syncing: '同步中…',
  synced: '已同步',
  error: '同步失敗'
};

const META_KEY = 'wordquest_cloud_meta';   // 每個服務各自記住「上次看到的雲端版本」
const AUTO_DELAY = 3000;                   // 資料變動後 3 秒才自動上傳

const adapters = {};
const listeners = new Set();
let state = { status: 'disconnected', connected: false, lastSync: null, error: '' };
let lastKey = '';          // 上次同步完成時的內容指紋
let lastRemoteAt = null;   // 上次同步時，雲端那份的 exportedAt
let timer = null;
let busy = false;

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};
const provider = () => store.state.settings.cloudProvider;
const currentAdapter = () => adapters[provider()];

/* ---------- 內容與指紋 ---------- */
const byId = (f) => (a, b) => (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0);
const key = (d) => {
  const n = normalizeData(d);
  return JSON.stringify([[...n.groups].sort(byId('groupId')), [...n.words].sort(byId('id'))]);
};
const payload = () => {
  const d = store.exportData();
  return { app: 'wordquest', type: 'cloud', version: d.version, exportedAt: d.exportedAt, groups: d.groups, words: d.words };
};

/* ---------- 記住每個服務上次的同步位置 ---------- */
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } };
const saveMeta = (patch) => {
  try {
    const all = readMeta();
    all[provider()] = { ...(all[provider()] || {}), ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(all));
  } catch (e) { /* 存不了就算了，下次連線會多問一次 */ }
};
const loadMeta = () => {
  const m = readMeta()[provider()] || {};
  lastRemoteAt = m.lastRemoteAt || null;
  if (m.lastSync) state = { ...state, lastSync: m.lastSync };
};

function stamp() {
  const now = Date.now();
  saveMeta({ lastRemoteAt, lastSync: now });
  setState({ status: 'synced', lastSync: now, error: '' });
}

async function pushTo(a) {
  const p = payload();
  await a.push(p);
  lastKey = key(p);
  lastRemoteAt = p.exportedAt;
  stamp();
}

function pullInto(remote) {
  store.restoreContent(remote);
  lastKey = key(store.exportData());
  lastRemoteAt = remote.exportedAt || null;
  stamp();
}

/**
 * 比對本機與雲端並處理；回傳 'pushed' | 'pulled' | 'same' | 'cancelled'。
 * decide(remote, local) 是兩邊內容不同時問使用者用的，回傳 'remote' | 'local' | null（取消）。
 * auto＝true（自動同步）或沒有 decide 時，碰到衝突就丟出 CONFLICT，不會自己做決定。
 */
async function reconcile(a, decide, auto) {
  setState({ status: 'syncing', error: '' });
  const remote = await a.pull();
  const local = payload();

  if (!remote) { await pushTo(a); return 'pushed'; }

  if (key(remote) === key(local)) {
    lastKey = key(local);
    lastRemoteAt = remote.exportedAt || null;
    stamp();
    return 'same';
  }
  if (lastRemoteAt && remote.exportedAt === lastRemoteAt) { await pushTo(a); return 'pushed'; }
  if (!local.words.length) { pullInto(remote); return 'pulled'; }

  if (auto || !decide) {
    const e = new Error('雲端有不同的內容（可能是別的裝置更新過），自動同步已暫停。請按「立即同步」選擇要保留哪一份。');
    e.code = 'CONFLICT';
    throw e;
  }
  const choice = await decide(remote, local);
  if (choice === 'remote') { pullInto(remote); return 'pulled'; }
  if (choice === 'local') { await pushTo(a); return 'pushed'; }
  return 'cancelled';
}

/* ---------- 自動上傳 ---------- */
async function autoSync() {
  const a = currentAdapter();
  if (busy || !state.connected || !a || state.status === 'error') return;
  if (key(payload()) === lastKey) return;      // 沒有實際變動（例如只是改了主題）
  busy = true;
  try { await reconcile(a, null, true); }
  catch (e) { setState({ status: 'error', error: e.message }); }
  finally { busy = false; }
}

store.subscribe(() => {
  if (!state.connected || state.status === 'connecting' || !store.state.settings.cloudAutoSync) return;
  clearTimeout(timer);
  timer = setTimeout(autoSync, AUTO_DELAY);
});

export const cloud = {
  get state() { return state; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  registerAdapter(name, impl) {
    if (!PROVIDERS[name]) throw new Error(`未知的雲端服務：${name}`);
    adapters[name] = impl;
  },
  isAvailable(name) { return Boolean(adapters[name]); },

  /** 連線並做第一次比對；回傳 'pushed' | 'pulled' | 'same' | 'cancelled' */
  async connect(name, decide) {
    const a = adapters[name];
    if (!a) throw new Error('NOT_IMPLEMENTED');
    busy = true;
    setState({ status: 'connecting', connected: false, error: '' });
    try {
      await a.connect();
      store.setSettings({ cloudProvider: name });
      loadMeta();
      setState({ connected: true });
      const action = await reconcile(a, decide, false);
      if (action === 'cancelled') await this.disconnect();
      return action;
    } catch (e) {
      setState({ status: 'error', error: e.message });
      throw e;
    } finally { busy = false; }
  },

  /** 頁面重新載入後，嘗試不跳視窗恢復連線（只有 adapter 支援 resume 時才會成功） */
  async resume() {
    const a = currentAdapter();
    if (!a?.resume || state.connected) return false;
    loadMeta();
    busy = true;
    setState({ status: 'connecting', error: '' });
    try {
      if (!(await a.resume())) { setState({ status: 'disconnected' }); return false; }
      setState({ connected: true });
      await reconcile(a, null, true);
      return true;
    } catch (e) {
      setState({ status: e.code === 'CONFLICT' || state.connected ? 'error' : 'disconnected', error: e.message });
      return false;
    } finally { busy = false; }
  },

  async disconnect() {
    clearTimeout(timer);
    const a = currentAdapter();
    try { await a?.disconnect?.(); } finally {
      store.setSettings({ cloudProvider: 'none' });
      lastKey = ''; lastRemoteAt = null;
      setState({ status: 'disconnected', connected: false, lastSync: null, error: '' });
    }
  },

  /** 立即同步；兩邊內容不同時呼叫 decide 問使用者。回傳結果同 connect */
  async syncNow(decide) {
    const a = currentAdapter();
    if (!a || !state.connected) throw new Error('NOT_CONNECTED');
    clearTimeout(timer);
    busy = true;
    try {
      const action = await reconcile(a, decide, false);
      if (action === 'cancelled') setState({ status: 'error', error: '已取消同步，本機與雲端內容不同。' });
      return action;
    } catch (e) {
      setState({ status: 'error', error: e.message });
      throw e;
    } finally { busy = false; }
  },

  /** 強制用雲端資料取代本機的群組與單字（呼叫前請先跟使用者確認） */
  async pullNow() {
    const a = currentAdapter();
    if (!a || !state.connected) throw new Error('NOT_CONNECTED');
    clearTimeout(timer);
    busy = true;
    setState({ status: 'syncing', error: '' });
    try {
      const remote = await a.pull();
      if (!remote) throw new Error('雲端還沒有備份。');
      pullInto(remote);
      return normalizeData(remote).words.length;
    } catch (e) {
      setState({ status: 'error', error: e.message });
      throw e;
    } finally { busy = false; }
  }
};
