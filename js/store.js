// LocalStorage 資料庫模組：資料規格、初始化、CRUD、查詢、備份還原、批次匯入
const KEY = 'wordquest_data';
export const DATA_VERSION = '2.4.0';
export const BACKUP_STEP = 20; // 每新增 20 個單字提醒備份一次

export const SPEECH_RATES = [0.5, 0.8, 1.0, 1.2];
export const POS_LABELS = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
  preposition: '介系詞', conjunction: '連接詞', pronoun: '代名詞',
  interjection: '感嘆詞', phrase: '片語', other: '其他'
};
export const FAMILIARITY_LABELS = { New: '新單字', Learning: '學習中', Mastered: '已熟練' };
export const VIEW_MODES = ['auto', 'mobile', 'desktop'];
export const CLOUD_PROVIDERS = ['none', 'gdrive', 'firebase'];

const POS = Object.keys(POS_LABELS);
const FAMILIARITY = Object.keys(FAMILIARITY_LABELS);
const THEMES = ['light', 'dark', 'system'];
const PLAY_ORDERS = ['shuffle', 'sequential'];

/* ---------- 工具 ---------- */
const nowISO = () => new Date().toISOString();
let seq = 0; // 同一毫秒批次建立時，用序號避免 ID 重複
const genId = (prefix) =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const nearestRate = (r) => {
  r = Number(r);
  if (!Number.isFinite(r)) return 1.0;
  return SPEECH_RATES.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best));
};
const milestoneOf = (n) => Math.floor(n / BACKUP_STEP) * BACKUP_STEP;

// 全新使用者（本地沒有資料）會得到一個預設群組
const createDefaults = () => ({
  version: DATA_VERSION,
  settings: {
    theme: 'system', viewMode: 'auto', speechRate: 1.0,
    bilingualSpeech: true, playOrder: 'shuffle', unsplashKey: '',
    voiceName: '',          // 指定的美式英語語音名稱；空字串＝自動
    onboarded: false,       // 是否看過新手導覽
    backupMilestone: 0,     // 已提醒過的單字數里程碑（20 的倍數）
    cloudProvider: 'none',  // 雲端同步：none | gdrive | firebase
    gdriveClientId: '',     // Google OAuth 用戶端 ID（使用者自己建立）
    firebaseConfig: '',     // Firebase 網頁應用程式的 firebaseConfig（文字）
    cloudAutoSync: true     // 連線後，單字或群組有變動就自動上傳
  },
  groups: [{ groupId: 'grp_default', groupName: '我的單字', description: '預設群組', createdAt: nowISO() }],
  words: []
});

function makeCredit(c) {
  if (!c || typeof c !== 'object') return null;
  const name = str(c.name, 60);
  const url = str(c.url, 300);
  if (!name || !/^https:\/\/unsplash\.com\//i.test(url)) return null;
  return { name, url };
}

function makeImage(url, credit) {
  url = str(url, 500);
  if (!/^https?:\/\//i.test(url)) return { sourceType: 'none', url: '' };
  let host;
  try { host = new URL(url).hostname; } catch (e) { return { sourceType: 'none', url: '' }; }
  const img = { sourceType: host.endsWith('unsplash.com') ? 'unsplash' : 'custom', url };
  const c = makeCredit(credit);
  if (c && img.sourceType === 'unsplash') img.credit = c; // Unsplash 圖片的攝影師署名
  return img;
}

function buildGroup(d) {
  return {
    groupId: d.groupId || genId('grp_'),
    groupName: str(d.groupName, 30),
    description: str(d.description, 80),
    createdAt: d.createdAt || nowISO()
  };
}

function buildWord(groupId, d) {
  // 改了圖片網址卻沒帶署名時，舊署名一併作廢
  const credit = 'imageCredit' in d ? d.imageCredit : (d.imageUrl !== undefined ? null : d.image?.credit);
  return {
    id: d.id || genId('wq_word_'),
    groupId,
    word: str(d.word, 60),
    phonetic: str(d.phonetic, 60),
    partOfSpeech: POS.includes(d.partOfSpeech) ? d.partOfSpeech : '',
    translation: str(d.translation, 100),
    example: str(d.example, 300),
    isStarred: Boolean(d.isStarred),
    image: makeImage(d.imageUrl !== undefined ? d.imageUrl : d.image?.url, credit),
    familiarity: FAMILIARITY.includes(d.familiarity) ? d.familiarity : 'New',
    createdAt: d.createdAt || nowISO()
  };
}

/**
 * 把任何來源（LocalStorage、備份檔）的資料整理成合法結構。
 * 設定只收已知欄位；群組與單字逐筆重建，壞掉的會被丟掉。
 */
export function normalizeData(raw) {
  const base = createDefaults();
  if (!raw || typeof raw !== 'object') return base;

  const rs = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = { ...base.settings };
  for (const k of Object.keys(base.settings)) if (k in rs) settings[k] = rs[k];

  if (!THEMES.includes(settings.theme)) settings.theme = base.settings.theme;
  if (!VIEW_MODES.includes(settings.viewMode)) settings.viewMode = base.settings.viewMode;
  if (!PLAY_ORDERS.includes(settings.playOrder)) settings.playOrder = base.settings.playOrder;
  settings.speechRate = nearestRate(settings.speechRate);
  settings.bilingualSpeech = Boolean(settings.bilingualSpeech);
  settings.unsplashKey = str(settings.unsplashKey, 100);
  settings.voiceName = str(settings.voiceName, 200);
  settings.onboarded = Boolean(settings.onboarded);
  if (!CLOUD_PROVIDERS.includes(settings.cloudProvider)) settings.cloudProvider = base.settings.cloudProvider;
  settings.gdriveClientId = str(settings.gdriveClientId, 200);
  settings.firebaseConfig = str(settings.firebaseConfig, 2000);
  settings.cloudAutoSync = Boolean(settings.cloudAutoSync);

  const groups = (Array.isArray(raw.groups) ? raw.groups : [])
    .filter((g) => g && g.groupId && g.groupName).map(buildGroup);
  const ids = new Set(groups.map((g) => g.groupId));
  const words = (Array.isArray(raw.words) ? raw.words : [])
    .filter((w) => w && w.id && ids.has(w.groupId)).map((w) => buildWord(w.groupId, w));

  // 舊資料沒有里程碑時，從目前的單字數開始算，避免更新後立刻跳提醒
  settings.backupMilestone = 'backupMilestone' in rs
    ? Math.max(0, Math.floor(Number(rs.backupMilestone)) || 0)
    : milestoneOf(words.length);

  return { version: DATA_VERSION, settings, groups, words };
}

/* ---------- 讀取／存檔 ---------- */
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || typeof raw !== 'object') return createDefaults();
    return normalizeData(raw);
  } catch (e) {
    return createDefaults(); // 資料損毀時使用預設值
  }
}

const hadData = (() => { try { return localStorage.getItem(KEY) !== null; } catch (e) { return true; } })();
let state = load();
const listeners = new Set();
const ui = { query: '', starredOnly: false }; // 暫存狀態（不存檔）

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('[store] 無法寫入 LocalStorage', e); }
}
function notify() { listeners.forEach((fn) => fn(state)); }
function commit(mutator) {
  mutator(state);
  state.version = DATA_VERSION;
  save();
  notify();
}

if (!hadData) save(); // 初始化：第一次進站就把預設結構寫進 LocalStorage

/* ---------- 對外 API ---------- */
export const store = {
  get state() { return state; },
  get ui() { return ui; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setUI(patch) { Object.assign(ui, patch); notify(); },
  setSettings(patch) {
    const p = { ...patch };
    if ('theme' in p && !THEMES.includes(p.theme)) delete p.theme;
    if ('viewMode' in p && !VIEW_MODES.includes(p.viewMode)) delete p.viewMode;
    if ('playOrder' in p && !PLAY_ORDERS.includes(p.playOrder)) delete p.playOrder;
    if ('cloudProvider' in p && !CLOUD_PROVIDERS.includes(p.cloudProvider)) delete p.cloudProvider;
    if ('speechRate' in p) p.speechRate = nearestRate(p.speechRate);
    if ('unsplashKey' in p) p.unsplashKey = str(p.unsplashKey, 100);
    if ('voiceName' in p) p.voiceName = str(p.voiceName, 200);
    if ('onboarded' in p) p.onboarded = Boolean(p.onboarded);
    if ('gdriveClientId' in p) p.gdriveClientId = str(p.gdriveClientId, 200);
    if ('firebaseConfig' in p) p.firebaseConfig = str(p.firebaseConfig, 2000);
    if ('cloudAutoSync' in p) p.cloudAutoSync = Boolean(p.cloudAutoSync);
    if ('backupMilestone' in p) p.backupMilestone = Math.max(0, Math.floor(Number(p.backupMilestone)) || 0);
    commit((s) => Object.assign(s.settings, p));
  },
  reset() {
    commit((s) => { const d = createDefaults(); s.settings = d.settings; s.groups = d.groups; s.words = d.words; });
  },

  /* 備份／還原 */
  /** 完整備份（Settings + Groups + Words），回傳的是深拷貝 */
  exportData() {
    return JSON.parse(JSON.stringify({
      app: 'wordquest', type: 'backup', version: DATA_VERSION, exportedAt: nowISO(),
      settings: state.settings, groups: state.groups, words: state.words
    }));
  },
  /** 用備份內容取代目前所有資料；回傳還原後的筆數 */
  restore(raw) {
    const next = normalizeData(raw);
    next.settings.backupMilestone = milestoneOf(next.words.length); // 剛還原，不需要立刻提醒
    commit((s) => { s.settings = next.settings; s.groups = next.groups; s.words = next.words; });
    return { groups: next.groups.length, words: next.words.length };
  },

  /** 只取代群組與單字，保留本機設定（雲端下載用；設定裡有 API Key 等，不跟著雲端走） */
  restoreContent(raw) {
    const next = normalizeData(raw);
    commit((s) => {
      s.groups = next.groups;
      s.words = next.words;
      s.settings.backupMilestone = milestoneOf(next.words.length);
    });
    return { groups: next.groups.length, words: next.words.length };
  },

  /* 群組 */
  getGroups() { return [...state.groups]; },
  getGroup(id) { return state.groups.find((g) => g.groupId === id) || null; },
  addGroup(data) {
    const g = buildGroup({ groupName: data.groupName, description: data.description });
    commit((s) => s.groups.push(g));
    return g;
  },
  updateGroup(id, patch) {
    commit((s) => {
      const g = s.groups.find((x) => x.groupId === id);
      if (!g) return;
      if ('groupName' in patch) g.groupName = str(patch.groupName, 30) || g.groupName;
      if ('description' in patch) g.description = str(patch.description, 80);
    });
  },
  deleteGroup(id) { // 連同群組內的單字一併刪除
    commit((s) => {
      s.groups = s.groups.filter((g) => g.groupId !== id);
      s.words = s.words.filter((w) => w.groupId !== id);
    });
  },

  /* 單字 */
  getWord(id) { return state.words.find((w) => w.id === id) || null; },
  getWordsByGroup(groupId) { return state.words.filter((w) => w.groupId === groupId); },
  countWords(groupId) { return this.getWordsByGroup(groupId).length; },
  addWord(groupId, data) {
    if (!this.getGroup(groupId)) return null; // 單字一定要屬於某個群組
    const w = buildWord(groupId, { ...data, id: undefined, createdAt: undefined });
    commit((s) => s.words.push(w));
    return w;
  },
  /**
   * 批次匯入到指定群組（只存一次、只通知一次）。
   * 群組內已有的同名單字（不分大小寫）會略過。回傳 { added, duplicates }。
   */
  importWords(groupId, list) {
    if (!this.getGroup(groupId)) return { added: 0, duplicates: 0 };
    const seen = new Set(state.words.filter((w) => w.groupId === groupId).map((w) => w.word.toLowerCase()));
    const created = [];
    let duplicates = 0;
    for (const d of list) {
      const w = buildWord(groupId, { ...d, id: undefined, createdAt: undefined });
      if (!w.word || !w.translation) continue;
      const k = w.word.toLowerCase();
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k);
      created.push(w);
    }
    if (created.length) commit((s) => created.forEach((w) => s.words.push(w)));
    return { added: created.length, duplicates };
  },
  updateWord(id, patch) { // patch.groupId 可把單字移到別的群組
    commit((s) => {
      const i = s.words.findIndex((w) => w.id === id);
      if (i === -1) return;
      const cur = s.words[i];
      const gid = patch.groupId && s.groups.some((g) => g.groupId === patch.groupId) ? patch.groupId : cur.groupId;
      s.words[i] = buildWord(gid, { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt });
    });
  },
  toggleStar(id) {
    const w = this.getWord(id);
    if (w) this.updateWord(id, { isStarred: !w.isStarred });
  },
  deleteWord(id) { commit((s) => { s.words = s.words.filter((w) => w.id !== id); }); },

  /** 搜尋 word / translation / phonetic / example；可只看收藏 */
  queryWords({ text = '', starredOnly = false, groupId = null } = {}) {
    const q = text.trim().toLowerCase();
    return state.words.filter((w) => {
      if (groupId && w.groupId !== groupId) return false;
      if (starredOnly && !w.isStarred) return false;
      if (!q) return true;
      return [w.word, w.translation, w.phonetic, w.example].some((f) => f.toLowerCase().includes(q));
    });
  }
};
