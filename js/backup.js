// 資料備份：群組單字 JSON／CSV 匯出入、完整備份與還原、每 20 個單字的備份提醒
import { store, POS_LABELS, FAMILIARITY_LABELS, BACKUP_STEP } from './store.js';
import { openDialog, cls } from './ui.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const today = () => new Date().toISOString().slice(0, 10);
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30) || 'group';

/** 觸發瀏覽器下載文字檔 */
export function downloadFile(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =====================================================================
   群組單字：匯出
   ===================================================================== */
const WORD_FIELDS = ['word', 'phonetic', 'partOfSpeech', 'translation', 'example', 'imageUrl', 'isStarred', 'familiarity'];

const wordRow = (w) => ({
  word: w.word, phonetic: w.phonetic, partOfSpeech: w.partOfSpeech, translation: w.translation,
  example: w.example, imageUrl: w.image.url, isStarred: w.isStarred, familiarity: w.familiarity
});

/** 匯出群組為 JSON；回傳匯出的單字數（0＝沒有東西可匯出，不會下載） */
export function exportGroupJSON(groupId) {
  const g = store.getGroup(groupId);
  const words = store.getWordsByGroup(groupId);
  if (!g || !words.length) return 0;
  const data = {
    app: 'wordquest', type: 'group', version: store.state.version, exportedAt: new Date().toISOString(),
    group: { groupName: g.groupName, description: g.description },
    words: words.map(wordRow)
  };
  downloadFile(`wordquest_${safeName(g.groupName)}_${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  return words.length;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvText = (rows) => `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`; // BOM：Excel 才不會把中文開成亂碼

/** 匯出群組為 CSV；回傳匯出的單字數 */
export function exportGroupCSV(groupId) {
  const g = store.getGroup(groupId);
  const words = store.getWordsByGroup(groupId);
  if (!g || !words.length) return 0;
  const rows = [WORD_FIELDS, ...words.map((w) => WORD_FIELDS.map((f) => wordRow(w)[f]))];
  downloadFile(`wordquest_${safeName(g.groupName)}_${today()}.csv`, csvText(rows), 'text/csv;charset=utf-8');
  return words.length;
}

export function downloadCsvTemplate() {
  const rows = [
    WORD_FIELDS,
    ['apple', '/ˈæp.əl/', 'noun', '蘋果', 'I eat an apple every day.', '', 'false', 'New'],
    ['banana', '/bəˈnæn.ə/', 'noun', '香蕉', 'Bananas are rich in potassium.', '', 'false', 'New']
  ];
  downloadFile('wordquest_template.csv', csvText(rows), 'text/csv;charset=utf-8');
}

/* =====================================================================
   群組單字：匯入（JSON／CSV）
   ===================================================================== */

/** 解析 CSV：支援引號、換行、逗號、BOM；標題列用 tab 分隔時也能讀 */
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = !first.includes(',') && first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const HEADER_ALIASES = {
  word: ['word', '單字', '英文'],
  phonetic: ['phonetic', '音標'],
  partOfSpeech: ['partofspeech', 'pos', '詞性'],
  translation: ['translation', '中文翻譯', '中文', '翻譯', '解釋'],
  example: ['example', '例句'],
  imageUrl: ['imageurl', 'image', '圖片', '圖片網址'],
  isStarred: ['isstarred', 'starred', '收藏'],
  familiarity: ['familiarity', '熟悉度']
};
const fieldOf = (h) => {
  const k = h.trim().toLowerCase().replace(/[\s_-]/g, '');
  return Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(k)) || null;
};
const POS_BY_LABEL = Object.fromEntries(Object.entries(POS_LABELS).map(([k, v]) => [v, k]));
const FAM_BY_LABEL = Object.fromEntries(Object.entries(FAMILIARITY_LABELS).map(([k, v]) => [v, k]));
const FAM_BY_KEY = Object.fromEntries(Object.keys(FAMILIARITY_LABELS).map((k) => [k.toLowerCase(), k]));
const toPos = (v) => { v = v.trim(); return v.toLowerCase() in POS_LABELS ? v.toLowerCase() : (POS_BY_LABEL[v] || ''); };
const toFam = (v) => { v = v.trim(); return FAM_BY_KEY[v.toLowerCase()] || FAM_BY_LABEL[v] || 'New'; };
const toBool = (v) => /^(true|1|yes|y|是|★|✓)$/i.test(v.trim());

function wordsFromCSV(text) {
  const table = parseCSV(text);
  if (!table.length) return [];
  let cols = table[0].map(fieldOf);
  let body = table.slice(1);
  if (!cols.includes('word')) { // 沒有標題列：第一欄單字、第二欄中文翻譯、第三欄例句
    cols = ['word', 'translation', 'example'];
    body = table;
  }
  return body.map((r) => {
    const o = {};
    cols.forEach((f, i) => { if (f) o[f] = r[i] ?? ''; });
    return {
      word: o.word, phonetic: o.phonetic, translation: o.translation, example: o.example,
      partOfSpeech: toPos(o.partOfSpeech ?? ''), familiarity: toFam(o.familiarity ?? ''),
      isStarred: toBool(o.isStarred ?? ''), imageUrl: o.imageUrl
    };
  });
}

function wordsFromJSON(data) {
  if (data && data.type === 'backup') {
    throw new Error('這是完整備份檔，請改用「還原備份」。');
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : null;
  if (!list) throw new Error('JSON 裡找不到單字清單（需要陣列，或含 words 陣列的物件）。');
  return list.filter((x) => x && typeof x === 'object').map((x) => ({
    word: x.word, phonetic: x.phonetic, translation: x.translation, example: x.example,
    partOfSpeech: x.partOfSpeech, familiarity: x.familiarity,
    isStarred: x.isStarred === true || x.isStarred === 'true',
    imageUrl: x.imageUrl ?? x.image?.url
  }));
}

/** 讀入單字檔，回傳 { words, invalid }；words 只含有單字和中文翻譯的列 */
export function parseWordFile(text, filename = '') {
  let rows;
  if (/\.json$/i.test(filename) || /^\s*[[{]/.test(text)) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('JSON 格式錯誤，無法讀取。'); }
    rows = wordsFromJSON(data);
  } else {
    rows = wordsFromCSV(text);
  }
  const words = rows.filter((r) => String(r.word ?? '').trim() && String(r.translation ?? '').trim());
  return { words, invalid: rows.length - words.length };
}

/* =====================================================================
   完整備份／還原
   ===================================================================== */
const milestoneOf = (n) => Math.floor(n / BACKUP_STEP) * BACKUP_STEP;

export function downloadBackup() {
  const data = store.exportData();
  downloadFile('wordquest_backup.json', JSON.stringify(data, null, 2), 'application/json');
  store.setSettings({ backupMilestone: milestoneOf(store.state.words.length) }); // 剛備份過，這個里程碑不再提醒
}

export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('檔案不是有效的 JSON。'); }
  if (!d || typeof d !== 'object' || !Array.isArray(d.groups) || !Array.isArray(d.words)) {
    throw new Error('這不是 WordQuest 的完整備份檔（缺少 groups 或 words）。');
  }
  return d;
}

/* =====================================================================
   自動閾值提醒：單字數每跨過 20 的倍數，就跳出一次備份建議
   ===================================================================== */
function remindDialog(count) {
  return new Promise((resolve) => {
    const dlg = openDialog(`
      <div class="grid gap-4">
        <h2 class="text-lg font-bold">建議現在備份</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300">
          單字庫已經累積 ${count} 個單字。資料只存在這台裝置的瀏覽器裡，清除瀏覽資料或換手機就會消失。
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" data-later class="${cls.btnGhost}">稍後</button>
          <button type="button" data-now class="${cls.btnPrimary}">立即備份</button>
        </div>
      </div>`);
    dlg.addEventListener('close', resolve);
    dlg.querySelector('[data-later]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-now]').addEventListener('click', () => { downloadBackup(); dlg.close(); });
  });
}

export function initBackupReminder() {
  let showing = false;
  store.subscribe(() => {
    const n = store.state.words.length;
    const m = milestoneOf(n);
    const last = store.state.settings.backupMilestone;

    if (m < last) { store.setSettings({ backupMilestone: m }); return; } // 單字變少：往下校正，之後才會再提醒
    if (m > last && m > 0 && !showing) {
      showing = true;
      store.setSettings({ backupMilestone: m }); // 先記下，不論使用者選哪個都不會重複跳
      remindDialog(n).finally(() => { showing = false; });
    }
  });
}
