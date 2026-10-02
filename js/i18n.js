// 介面語言：中文／English／中英對照（預設）。
// 做法：各元件的原始中文字串不動，由這裡依字典在畫面上即時換字（文字節點，以及 placeholder／aria-label／title）。
// 字典裡沒有的字串維持中文；使用者自己的單字內容通常不在字典裡，不會被動到。
// 要補翻譯：在 DICT 加一行「中文: 'English'」；含數字的句子加在 PATTERNS。
import { store } from './store.js';

const DICT = {
  // 導覽與標頭
  '群組／單字庫': 'Library', '單字庫': 'Words', '學習模式': 'Study', '學習': 'Study',
  '測驗模式': 'Quiz', '測驗': 'Quiz', '系統設定': 'Settings', '設定': 'Settings',
  '資料只存在這台裝置的瀏覽器中。': 'Data is stored only in this browser.',
  '搜尋單字、翻譯或例句': 'Search words, translations or examples',
  '主要導覽': 'Main navigation', '清除搜尋': 'Clear search', '收藏專區': 'Starred', '切換深淺色主題': 'Toggle theme',
  // 單字庫
  '新增群組': 'New group', '新增單字': 'Add word', '匯入單字檔': 'Import word file',
  '還沒有群組': 'No groups yet', '建立第一個群組，再把單字加進去。': 'Create your first group, then add words.',
  '沒有說明': 'No description', '全部群組': 'All groups', '這個群組還沒有單字': 'No words in this group yet',
  '新增第一個單字開始收集。': 'Add your first word to start collecting.', '清除篩選': 'Clear filters',
  '收藏單字': 'Starred words', '還沒有收藏單字': 'No starred words yet', '找不到符合的單字': 'No matching words',
  '換個關鍵字試試看。': 'Try another keyword.', '點單字卡右上角的星號就能收藏。': 'Tap the star on a card to save it.',
  '編輯群組': 'Edit group', '刪除群組': 'Delete group', '取消收藏': 'Unstar', '收藏': 'Star',
  '播放發音': 'Play pronunciation', '編輯單字': 'Edit word', '刪除單字': 'Delete word',
  '新單字': 'New', '學習中': 'Learning', '已熟練': 'Mastered',
  '取消': 'Cancel', '儲存': 'Save', '刪除': 'Delete', '好': 'OK',
  '群組名稱': 'Group name', '說明（選填）': 'Description (optional)', '所屬群組': 'Group', '單字': 'Word',
  '音標（選填）': 'Phonetic (optional)', '詞性': 'Part of speech', '熟悉度': 'Familiarity', '中文翻譯': 'Translation',
  '例句（選填）': 'Example (optional)', '圖片（選填）': 'Image (optional)', '搜尋圖片': 'Search images',
  '加入收藏': 'Add to starred', '未指定': 'Unspecified',
  '名詞': 'Noun', '動詞': 'Verb', '形容詞': 'Adjective', '副詞': 'Adverb', '介系詞': 'Preposition',
  '連接詞': 'Conjunction', '代名詞': 'Pronoun', '感嘆詞': 'Interjection', '片語': 'Phrase', '其他': 'Other',
  '已新增群組': 'Group added', '已儲存群組': 'Group saved', '已刪除群組': 'Group deleted',
  '已儲存單字': 'Word saved', '已刪除單字': 'Word deleted', '此動作無法復原。': 'This cannot be undone.',
  '請輸入群組名稱': 'Enter a group name', '請輸入單字': 'Enter a word', '請輸入中文翻譯': 'Enter a translation',
  '匯入到群組': 'Import into group', '單字檔（JSON 或 CSV）': 'Word file (JSON or CSV)',
  '下載 CSV 範本': 'Download CSV template', '匯入': 'Import',
  '請選擇要匯入的檔案': 'Choose a file to import', '請先選擇群組': 'Choose a group first',
  // 學習
  '學習範圍': 'Study scope', '全部單字': 'All words', '★ 收藏單字': '★ Starred words',
  '這個範圍沒有單字': 'No words in this scope', '先到單字庫新增單字，再回來學習。': 'Add words in the library first.',
  '前往單字庫': 'Go to library', '上一張': 'Previous', '下一張': 'Next', '播放英文': 'Play English', '播放中文': 'Play Chinese',
  '點卡片翻面，左右滑動或按方向鍵切換': 'Tap to flip; swipe or use arrow keys to move',
  // 測驗
  '範圍': 'Scope', '順序': 'Order', '隨機': 'Shuffle', '依序': 'Sequential',
  '翻卡': 'Flashcards', '連連看': 'Matching', '聽音辨識': 'Listening', '限時速刷': 'Timed', '單字填空': 'Fill in', '默寫練習': 'Spelling',
  '翻面看中文，左右滑動換卡，發音依顯示面': 'Flip to see Chinese; swipe to change cards',
  '把英文和中文配成一對，一輪 6 組': 'Match English with Chinese, 6 pairs per round',
  '聽發音，選出正確的單字': 'Listen and pick the right word',
  '60 秒內看英文選中文，答越多越好': 'Pick the Chinese meaning within 60 seconds',
  '看中文和例句，把缺的字母補上': 'Fill in the missing letters from the clues',
  '看中文（可聽發音），一格一格拼出單字': 'Spell the word letter by letter',
  '返回測驗選單': 'Back to quiz menu', '返回選單': 'Back to menu', '下一題': 'Next', '看結果': 'See results',
  '檢查': 'Check', '提示': 'Hint', '再玩一次': 'Play again', '全部加入收藏': 'Star all', '聽發音': 'Listen',
  '各點一個英文和一個中文，配成一對': 'Tap one English and one Chinese to pair them',
  '發音：開': 'Sound: on', '發音：關': 'Sound: off', '全部答對！': 'Perfect!', '很不錯，繼續保持。': 'Nice work, keep it up.',
  // 設定
  '外觀': 'Appearance', '語音朗讀': 'Speech', '圖片搜尋': 'Image search', '單字匯入與匯出': 'Import & export',
  '完整備份與還原': 'Backup & restore', '雲端同步': 'Cloud sync', '新手導覽': 'Tutorial', '資料': 'Data',
  '介面語言': 'Interface language', '主題': 'Theme', '淺色': 'Light', '深色': 'Dark', '跟隨系統': 'System',
  '檢視模式': 'View mode', '自動': 'Auto', '手機 App': 'Mobile app', '電腦 Dashboard': 'Desktop dashboard',
  '美式英語語音': 'US English voice', '自動（系統預設）': 'Auto (system default)', '語速': 'Speed', '試聽': 'Test voice',
  '播放單字後接著唸中文翻譯': 'Read the translation after the word', '學習播放順序': 'Study order',
  '匯出 JSON': 'Export JSON', '匯出 CSV': 'Export CSV', '匯出完整備份': 'Export full backup', '上傳備份還原': 'Restore from backup',
  '以群組為單位，和別人分享或整理單字。': 'Share or organize words by group.',
  '一次保存或還原全部的設定、群組與單字。': 'Save or restore all settings, groups and words at once.',
  '用 GitHub Gist、Google Drive 或 Firebase，讓多台裝置共用同一份單字。': 'Sync words across devices with GitHub Gist, Google Drive or Firebase.',
  '立即同步': 'Sync now', '從雲端還原': 'Restore from cloud', '中斷連線': 'Disconnect',
  '單字或群組有變動時，自動上傳到雲端': 'Auto-upload to the cloud when words or groups change',
  '未連線': 'Disconnected', '連線中…': 'Connecting…', '同步中…': 'Syncing…', '已同步': 'Synced', '同步失敗': 'Sync failed',
  '導覽教學': 'Tutorial', '清除所有資料': 'Erase all data', '還原': 'Restore', '取代': 'Replace', '清除': 'Erase'
};

const PATTERNS = [
  [/^(\d+) 個單字$/, (n) => `${n} word${n === '1' ? '' : 's'}`],
  [/^連結 (.+)$/, (p) => `Connect ${p}`],
  [/^已匯入 (\d+) 個單字(?:，略過 (\d+) 個重複)?$/, (n, d) => `Imported ${n} word(s)${d ? `, skipped ${d} duplicate(s)` : ''}`],
  [/^已匯出 (\d+) 個單字$/, (n) => `Exported ${n} word(s)`],
  [/^需要再複習（(\d+)）$/, (n) => `Review needed (${n})`],
  [/^答對率 (\d+)%$/, (n) => `Accuracy ${n}%`],
  [/^已新增到「(.+)」$/, (g) => `Added to "${g}"`],
  [/^刪除「(.+)」？$/, (x) => `Delete "${x}"?`],
  [/^搜尋「(.+)」$/, (q) => `Search "${q}"`],
  [/^已收藏 (\d+) 個單字$/, (n) => `Starred ${n} word(s)`]
];

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = 'script,style,textarea,pre,[data-no-i18n]';
const OPTS = { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS };

let mode = 'both';
let obs = null;
const textOrig = new WeakMap();  // 文字節點 → 原始中文
const attrOrig = new WeakMap();  // 元素 → { 屬性: { orig, out } }

/** 依介面語言翻譯一段字串；沒有中文或字典查不到就原樣回傳 */
export function translate(text, m = mode) {
  const key = String(text).trim();
  if (m === 'zh' || !key || !/[\u4e00-\u9fff]/.test(key)) return text;
  let en = DICT[key];
  if (!en) {
    for (const [re, fn] of PATTERNS) {
      const hit = key.match(re);
      if (hit) { en = fn(...hit.slice(1)); break; }
    }
  }
  if (!en) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  return lead + (m === 'en' ? en : `${key} ${en}`) + tail;
}

function doText(n) {
  const p = n.parentElement;
  if (!p || p.closest(SKIP)) return;
  let orig = textOrig.get(n);
  if (orig === undefined) { orig = n.data; textOrig.set(n, orig); }
  const out = translate(orig);
  if (n.data !== out) n.data = out;
}

function doEl(el) {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur == null) continue;
    const rec = attrOrig.get(el) || {};
    if (!rec[a] || cur !== rec[a].out) rec[a] = { orig: cur, out: cur }; // 程式改過屬性 → 以新值為原文
    const out = translate(rec[a].orig);
    rec[a].out = out;
    if (cur !== out) el.setAttribute(a, out);
    attrOrig.set(el, rec);
  }
}

function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 || root.closest(SKIP)) return;
  doEl(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === 3) doText(n); else doEl(n);
  }
}

function applyAll() {
  obs.disconnect();
  document.documentElement.lang = mode === 'en' ? 'en' : 'zh-Hant';
  walk(document.body);
  obs.observe(document.body, OPTS);
}

function onMutations(list) {
  obs.disconnect();
  for (const m of list) {
    if (m.type === 'childList') m.addedNodes.forEach(walk);
    else if (m.type === 'attributes' && m.target.nodeType === 1) doEl(m.target);
  }
  obs.observe(document.body, OPTS);
}

export function initI18n() {
  mode = store.state.settings.uiLang;
  obs = new MutationObserver(onMutations);
  store.subscribe(() => {
    const next = store.state.settings.uiLang;
    if (next !== mode) { mode = next; applyAll(); }
  });
  applyAll();
}
