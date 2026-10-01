// 雲端同步（預留介面）：只提供狀態管理與 adapter 掛接點，還沒有接任何實際的雲端 API。
//
// 之後要接 Google Drive 或 Firebase，只要實作一個 adapter 並註冊：
//
//   import { cloud } from './cloud.js';
//   cloud.registerAdapter('firebase', {
//     async connect()   { /* 登入、取得授權 */ },
//     async disconnect(){ /* 登出 */ },
//     async push(data)  { /* data＝store.exportData() 的完整備份，上傳 */ },
//     async pull()      { /* 下載並回傳備份物件；沒有資料回傳 null */ }
//   });
//
// 註冊後，設定頁的「連結」「立即同步」「中斷連線」按鈕與狀態燈就會開始運作。
// 衝突處理（以誰為準）由 adapter 自己決定；還原資料請用 store.restore(await cloud.pull())。
import { store } from './store.js';

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

const adapters = {};
const listeners = new Set();
let state = { status: 'disconnected', lastSync: null, error: '' };

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};
const currentAdapter = () => adapters[store.state.settings.cloudProvider];

export const cloud = {
  get state() { return state; },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  registerAdapter(provider, impl) {
    if (!PROVIDERS[provider]) throw new Error(`未知的雲端服務：${provider}`);
    adapters[provider] = impl;
  },
  isAvailable(provider) { return Boolean(adapters[provider]); },

  /** 沒有 adapter 時丟出 NOT_IMPLEMENTED，狀態維持「未連線」 */
  async connect(provider) {
    const a = adapters[provider];
    if (!a) throw new Error('NOT_IMPLEMENTED');
    setState({ status: 'connecting', error: '' });
    try {
      await a.connect();
      store.setSettings({ cloudProvider: provider });
      setState({ status: 'synced' });
    } catch (e) {
      setState({ status: 'error', error: e.message });
      throw e;
    }
  },

  async disconnect() {
    const a = currentAdapter();
    try { await a?.disconnect?.(); } finally {
      store.setSettings({ cloudProvider: 'none' });
      setState({ status: 'disconnected', lastSync: null, error: '' });
    }
  },

  async syncNow() {
    const a = currentAdapter();
    if (!a) throw new Error('NOT_CONNECTED');
    setState({ status: 'syncing', error: '' });
    try {
      await a.push(store.exportData());
      setState({ status: 'synced', lastSync: Date.now() });
    } catch (e) {
      setState({ status: 'error', error: e.message });
      throw e;
    }
  },

  async pull() {
    const a = currentAdapter();
    if (!a) throw new Error('NOT_CONNECTED');
    return a.pull();
  }
};
