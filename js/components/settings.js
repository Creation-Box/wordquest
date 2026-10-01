// 系統設定：外觀／檢視模式、語音、Unsplash Key、單字匯入匯出、完整備份、雲端同步（Google Drive／Firebase）、新手導覽
import { store, SPEECH_RATES, normalizeData } from '../store.js';
import { speakWord, isSupported, listEnglishVoices, onVoicesChanged } from '../tts.js';
import { esc, cls, confirmDialog, openDialog, toast } from '../ui.js';
import {
  MAX_FILE_BYTES, exportGroupJSON, exportGroupCSV, downloadCsvTemplate,
  parseWordFile, downloadBackup, parseBackup
} from '../backup.js';
import { cloud, PROVIDERS, STATUS_LABELS } from '../cloud.js';
import { showOnboarding } from './onboarding.js';

let root = null;
let ioGroup = null;     // 匯入／匯出目前選的群組
let unsubCloud = null;

const icons = () => window.lucide?.createIcons();
const again = () => render(root);

const THEMES = [
  { id: 'light', label: '淺色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
  { id: 'system', label: '跟隨系統', icon: 'monitor' }
];
const VIEWS = [
  { id: 'auto', label: '自動', icon: 'monitor-smartphone' },
  { id: 'mobile', label: '手機 App', icon: 'smartphone' },
  { id: 'desktop', label: '電腦 Dashboard', icon: 'monitor' }
];

/* ---------- 版面片段 ---------- */
const chosen = (on) => (on
  ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-400/15 dark:text-teal-200'
  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800');

const section = (title, desc, body) => `
  <section class="${cls.card} p-5 grid gap-4">
    <div>
      <h2 class="font-bold">${title}</h2>
      ${desc ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${desc}</p>` : ''}
    </div>
    ${body}
  </section>`;

const fileBtn = (id, label, icon, accept, disabled) => `
  <label class="file-btn ${cls.btnGhost} cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''}">
    <i data-lucide="${icon}" class="size-4"></i>${label}
    <input id="${id}" type="file" accept="${accept}" class="sr-only" ${disabled ? 'disabled' : ''}>
  </label>`;

function infoDialog(title, message) {
  const dlg = openDialog(`
    <div class="grid gap-4">
      <h2 class="text-lg font-bold">${esc(title)}</h2>
      <p class="text-sm text-slate-600 dark:text-slate-300 break-words">${esc(message)}</p>
      <div class="flex justify-end"><button type="button" data-ok class="${cls.btnPrimary}">好</button></div>
    </div>`);
  dlg.querySelector('[data-ok]').addEventListener('click', () => dlg.close());
}

/* ---------- 雲端同步區塊 ---------- */
const fmtTime = (ts) => new Date(ts).toLocaleString('zh-TW', { hour12: false });

function cloudHtml() {
  const st = cloud.state;
  const s = store.state.settings;
  const provider = s.cloudProvider;
  const label = st.connected && PROVIDERS[provider] ? `（${PROVIDERS[provider].label}）` : '';
  const resume = !st.connected && PROVIDERS[provider]
    ? `<p class="text-xs text-slate-500 dark:text-slate-400">上次使用 ${PROVIDERS[provider].label}，${provider === 'gdrive' ? '重新開啟網頁後需要再按一次「連結」才會繼續同步。' : '尚未恢復連線，請按「連結」重試（可能是 token 失效或網路問題）。'}</p>` : '';
  return `
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1" role="status">
      <span class="cloud-lamp cloud-${st.status}" aria-hidden="true"></span>
      <span class="text-sm font-medium">${STATUS_LABELS[st.status]}${label}</span>
      ${st.lastSync ? `<span class="text-xs text-slate-500 dark:text-slate-400">上次同步 ${fmtTime(st.lastSync)}</span>` : ''}
    </div>
    ${st.error ? `<p class="text-xs text-red-600 dark:text-red-400">${esc(st.error)}</p>` : ''}
    ${resume}
    <div class="grid grid-cols-2 gap-2">
      ${Object.entries(PROVIDERS).map(([id, p]) => `
        <button type="button" data-action="cloud-connect" data-provider="${id}" ${st.status === 'connecting' ? 'disabled' : ''} class="${cls.btnGhost}">
          <i data-lucide="${p.icon}" class="size-4"></i>連結 ${p.label}
        </button>`).join('')}
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-action="cloud-sync" ${st.connected && st.status !== 'syncing' ? '' : 'disabled'} class="${cls.btnPrimary}">
        <i data-lucide="refresh-cw" class="size-4"></i>立即同步
      </button>
      <button type="button" data-action="cloud-pull" ${st.connected && st.status !== 'syncing' ? '' : 'disabled'} class="${cls.btnGhost}">
        <i data-lucide="cloud-download" class="size-4"></i>從雲端還原
      </button>
      <button type="button" data-action="cloud-disconnect" ${st.connected ? '' : 'disabled'} class="${cls.btnGhost}">中斷連線</button>
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input id="cloud-auto" type="checkbox" class="size-4 accent-teal-700" ${s.cloudAutoSync ? 'checked' : ''}>
      單字或群組有變動時，自動上傳到雲端
    </label>`;
}

/** 雲端服務的設定欄位與申請步驟（不會跟著狀態燈重畫，避免打字到一半被清掉） */
function cloudConfigHtml() {
  const s = store.state.settings;
  const origin = location.origin;
  const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}`;
  const step = 'list-decimal pl-5 grid gap-1 text-xs text-slate-600 dark:text-slate-300';
  const box = 'rounded-xl border border-slate-200 dark:border-slate-800 p-3';
  return `
    <details class="${box}">
      <summary class="cursor-pointer text-sm font-medium">GitHub Gist 設定</summary>
      <div class="mt-3 grid gap-3">
        <ol class="${step}">
          <li>登入 GitHub →「Settings」→「Developer settings」→「Personal access tokens」→「Tokens (classic)」。</li>
          <li>「Generate new token (classic)」，Note 隨意填，Expiration 自選，<b>只勾 gist</b>。</li>
          <li>產生後立刻複製 token（<b>ghp_</b> 開頭），貼到下面並按儲存。fine-grained token 不支援 Gist，請用 classic。</li>
        </ol>
        <p class="text-xs text-slate-500 dark:text-slate-400">資料存在你帳號下的一個 secret gist（wordquest_backup.json）。token 只存在這台裝置的瀏覽器，不會進備份檔，也不要貼到 GitHub 上的程式碼裡。</p>
        <input id="github-token" type="password" autocomplete="off" spellcheck="false" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value="${esc(s.githubToken)}" class="${cls.input}">
        <button type="button" data-action="cloud-save-config" class="${cls.btnGhost} justify-self-start">儲存</button>
      </div>
    </details>

    <details class="${box}">
      <summary class="cursor-pointer text-sm font-medium">Google Drive 設定</summary>
      <div class="mt-3 grid gap-3">
        <ol class="${step}">
          <li>到 console.cloud.google.com 建立一個專案。</li>
          <li>「API 和服務」→「程式庫」→ 搜尋並啟用 <b>Google Drive API</b>。</li>
          <li>「OAuth 同意畫面」→ 使用者類型選「外部」，填 App 名稱和你的信箱；發布狀態維持「測試中」，在「測試使用者」加入你自己的 Gmail。</li>
          <li>「憑證」→「建立憑證」→「OAuth 用戶端 ID」→ 應用程式類型選「網頁應用程式」，「已授權的 JavaScript 來源」填 <b>${esc(origin)}</b>（只填網域，不要加 /wordquest）。</li>
          <li>把產生的「用戶端 ID」貼到下面。</li>
        </ol>
        <p class="text-xs text-slate-500 dark:text-slate-400">資料存在 App 專屬的隱藏資料夾，看不到也不會動到你其他的雲端硬碟檔案。</p>
        <input id="gdrive-client-id" type="text" autocomplete="off" spellcheck="false" placeholder="xxxxxxxx.apps.googleusercontent.com"
          value="${esc(s.gdriveClientId)}" class="${cls.input}">
        <button type="button" data-action="cloud-save-config" class="${cls.btnGhost} justify-self-start">儲存</button>
      </div>
    </details>

    <details class="${box}">
      <summary class="cursor-pointer text-sm font-medium">Firebase 設定</summary>
      <div class="mt-3 grid gap-3">
        <ol class="${step}">
          <li>到 console.firebase.google.com 建立專案（Analytics 可以關掉）。</li>
          <li>「專案設定」→「一般」→「您的應用程式」新增一個網頁應用程式，複製畫面上的 <b>firebaseConfig</b>。</li>
          <li>「Authentication」→「登入方式」啟用 <b>Google</b>；「設定」→「授權網域」加入 <b>${esc(location.hostname)}</b>。</li>
          <li>「Firestore Database」→ 建立資料庫（正式版模式即可）→「規則」貼上下面這段並發布。</li>
          <li>把 firebaseConfig 整段貼到下面。</li>
        </ol>
        <pre class="overflow-x-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs">${esc(rules)}</pre>
        <textarea id="firebase-config" rows="6" spellcheck="false" placeholder="const firebaseConfig = {&#10;  apiKey: &quot;...&quot;,&#10;  projectId: &quot;...&quot;,&#10;  ...&#10;};"
          class="${cls.input} font-mono text-xs">${esc(s.firebaseConfig)}</textarea>
        <button type="button" data-action="cloud-save-config" class="${cls.btnGhost} justify-self-start">儲存</button>
      </div>
    </details>`;
}

const saveCloudConfig = () => {
  const g = root.querySelector('#gdrive-client-id');
  const f = root.querySelector('#firebase-config');
  const t = root.querySelector('#github-token');
  const patch = {};
  if (g) patch.gdriveClientId = g.value;
  if (f) patch.firebaseConfig = f.value;
  if (t) patch.githubToken = t.value.trim();
  store.setSettings(patch);
};

/** 本機和雲端內容不同時，問使用者要保留哪一份 */
function askConflict(remote, local) {
  const rg = Array.isArray(remote.groups) ? remote.groups.length : 0;
  const rw = Array.isArray(remote.words) ? remote.words.length : 0;
  return new Promise((resolve) => {
    let picked = null;
    const dlg = openDialog(`
      <div class="grid gap-4">
        <h2 class="text-lg font-bold">本機和雲端的內容不一樣</h2>
        <div class="grid gap-1 text-sm">
          <p><b>本機：</b>${local.groups.length} 個群組、${local.words.length} 個單字</p>
          <p><b>雲端：</b>${rg} 個群組、${rw} 個單字${remote.exportedAt ? `（${esc(fmtTime(remote.exportedAt))} 上傳）` : ''}</p>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-300">選一份保留，另一份會被取代。不確定的話，先取消，匯出完整備份再回來。</p>
        <div class="grid gap-2">
          <button type="button" data-pick="remote" class="${cls.btnGhost}">用雲端取代本機</button>
          <button type="button" data-pick="local" class="${cls.btnGhost}">用本機覆蓋雲端</button>
          <button type="button" data-pick="" class="${cls.btnPrimary}">取消</button>
        </div>
      </div>`);
    dlg.addEventListener('close', () => resolve(picked));
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b) return;
      picked = b.dataset.pick || null;
      dlg.close();
    });
  });
}

const CLOUD_RESULT = {
  pushed: '本機資料已上傳到雲端',
  pulled: '已下載雲端資料到本機',
  same: '本機和雲端內容一致',
  cancelled: '已取消'
};

function refreshCloud() {
  const box = root?.querySelector('#cloud-box');
  if (!box) return;
  box.innerHTML = cloudHtml();
  icons();
}

/* ---------- 語音清單（瀏覽器可能晚一點才載入） ---------- */
function fillVoices() {
  const sel = root?.querySelector('#voice-select');
  if (!sel) return;
  const voices = listEnglishVoices();
  const cur = store.state.settings.voiceName;
  sel.innerHTML = `<option value="">自動（系統預設）</option>`
    + voices.map((v) => `<option value="${esc(v.name)}" ${v.name === cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const hint = root.querySelector('#voice-hint');
  if (hint) hint.hidden = voices.length > 0;
}
onVoicesChanged(fillVoices);

/* ---------- 畫面 ---------- */
export function render(el) {
  root = el;
  const s = store.state.settings;
  const groups = store.getGroups();
  if (!groups.some((g) => g.groupId === ioGroup)) ioGroup = groups[0]?.groupId ?? null;
  const noGroup = !ioGroup;

  const appearance = `
    <div>
      <p class="text-sm mb-2">主題</p>
      <div class="grid grid-cols-3 gap-2" role="group" aria-label="主題">
        ${THEMES.map((t) => `
          <button type="button" data-theme="${t.id}" aria-pressed="${s.theme === t.id}"
            class="flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium ${chosen(s.theme === t.id)}">
            <i data-lucide="${t.icon}" class="size-5"></i>${t.label}
          </button>`).join('')}
      </div>
    </div>
    <div>
      <p class="text-sm mb-2">檢視模式</p>
      <div class="grid grid-cols-3 gap-2" role="group" aria-label="檢視模式">
        ${VIEWS.map((v) => `
          <button type="button" data-view-mode="${v.id}" aria-pressed="${s.viewMode === v.id}"
            class="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium text-center ${chosen(s.viewMode === v.id)}">
            <i data-lucide="${v.icon}" class="size-5"></i>${v.label}
          </button>`).join('')}
      </div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        手機 App＝單欄加底部導覽列；電腦 Dashboard＝左側選單。手機上選「電腦」會改用桌面版寬度顯示，字會變小，可以用手指縮放。
      </p>
    </div>`;

  const voice = `
    <label class="grid gap-1.5 text-sm">美式英語語音
      <select id="voice-select" ${isSupported ? '' : 'disabled'} class="${cls.input}"><option value="">自動（系統預設）</option></select>
      <span id="voice-hint" hidden class="text-xs text-slate-500 dark:text-slate-400">這個瀏覽器沒有提供美式英語語音，會使用系統預設。</span>
    </label>
    <div>
      <p class="text-sm mb-2">語速</p>
      <div class="grid grid-cols-4 gap-2" role="group" aria-label="語速">
        ${[...SPEECH_RATES].reverse().map((r) => `
          <button type="button" data-rate="${r}" aria-pressed="${s.speechRate === r}"
            class="rounded-xl border px-2 py-2 text-sm font-medium ${chosen(s.speechRate === r)}">${r.toFixed(1)}×</button>`).join('')}
      </div>
    </div>
    <label class="flex items-center justify-between gap-3 text-sm">
      <span>播放單字後接著唸中文翻譯</span>
      <input id="bilingual" type="checkbox" ${s.bilingualSpeech ? 'checked' : ''} class="size-5 accent-teal-700 dark:accent-teal-400">
    </label>
    <label class="flex items-center justify-between gap-3 text-sm">
      <span>學習播放順序</span>
      <select id="play-order" class="${cls.input} w-auto">
        <option value="shuffle" ${s.playOrder === 'shuffle' ? 'selected' : ''}>隨機</option>
        <option value="sequential" ${s.playOrder === 'sequential' ? 'selected' : ''}>依序</option>
      </select>
    </label>
    <div>
      <button type="button" data-action="test-voice" ${isSupported ? '' : 'disabled'} class="${cls.btnGhost}">
        <i data-lucide="volume-2" class="size-4"></i>試聽
      </button>
      ${isSupported ? '' : '<p class="mt-2 text-sm text-slate-500">此瀏覽器不支援語音播放。</p>'}
    </div>`;

  const unsplash = `
    <div class="flex gap-2">
      <input id="unsplash-key" type="text" autocomplete="off" spellcheck="false" value="${esc(s.unsplashKey)}"
        placeholder="Access Key" class="${cls.input}">
      <button type="button" data-action="save-key" class="${cls.btnPrimary} shrink-0">儲存</button>
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400">Key 只會存在這台裝置的瀏覽器（LocalStorage），清空後按儲存即可移除。
      <a href="https://unsplash.com/developers" target="_blank" rel="noopener noreferrer" class="underline">取得 Key</a></p>`;

  const wordIO = `
    <label class="grid gap-1.5 text-sm">群組（匯出這個群組，或把檔案匯入這個群組）
      <select id="io-group" ${noGroup ? 'disabled' : ''} class="${cls.input}">
        ${groups.map((g) => `<option value="${esc(g.groupId)}" ${g.groupId === ioGroup ? 'selected' : ''}>${esc(g.groupName)}（${store.countWords(g.groupId)}）</option>`).join('')}
      </select>
    </label>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-action="export-json" ${noGroup ? 'disabled' : ''} class="${cls.btnGhost}"><i data-lucide="file-json" class="size-4"></i>匯出 JSON</button>
      <button type="button" data-action="export-csv" ${noGroup ? 'disabled' : ''} class="${cls.btnGhost}"><i data-lucide="file-spreadsheet" class="size-4"></i>匯出 CSV</button>
      ${fileBtn('import-words', '匯入單字檔', 'file-up', '.json,.csv,.txt,application/json,text/csv', noGroup)}
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400">
      匯入支援 JSON 或 CSV，同群組內已有的同名單字會略過。CSV 第一列要有欄位名稱（word、translation 等），
      沒有的話第一欄視為單字、第二欄視為中文翻譯、第三欄視為例句。
      <button type="button" data-action="csv-template" class="underline">下載 CSV 範本</button>
    </p>`;

  const backup = `
    <p class="text-sm">目前資料：${groups.length} 個群組、${store.state.words.length} 個單字</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-action="backup" class="${cls.btnPrimary}"><i data-lucide="download" class="size-4"></i>匯出完整備份</button>
      ${fileBtn('restore-file', '上傳備份還原', 'upload', '.json,application/json', false)}
    </div>
    <p class="text-xs text-slate-500 dark:text-slate-400">
      備份檔 wordquest_backup.json 包含設定（含 Unsplash Key）、群組與單字，請妥善保管。單字數每增加 20 個，系統會提醒你備份。
    </p>`;

  const cloudBody = `
    <div id="cloud-box" class="grid gap-3">${cloudHtml()}</div>
    ${cloudConfigHtml()}
    <p class="text-xs text-slate-500 dark:text-slate-400">雲端只保存群組與單字，不含設定與 Unsplash Key。兩個裝置都改過內容時，同步會問你保留哪一份。</p>`;

  const help = `
    <button type="button" data-action="tour" class="${cls.btnGhost} justify-self-start">
      <i data-lucide="circle-help" class="size-4"></i>導覽教學
    </button>`;

  const danger = `
    <p class="text-sm text-slate-500 dark:text-slate-400">所有資料只存在這台裝置的瀏覽器中，清除前建議先匯出完整備份。</p>
    <button type="button" data-action="reset" class="inline-flex items-center gap-2 justify-self-start rounded-xl border border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-400 px-4 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-500/10">
      <i data-lucide="trash-2" class="size-4"></i>清除所有資料
    </button>`;

  root.innerHTML = `
    <div class="max-w-xl grid gap-6">
      ${section('外觀', '', appearance)}
      ${section('語音朗讀', '', voice)}
      ${section('圖片搜尋', '填入 Unsplash Access Key，新增單字時就能搜尋 Unsplash 照片；沒填則使用免 Key 圖庫。', unsplash)}
      ${section('單字匯入與匯出', '以群組為單位，和別人分享或整理單字。', wordIO)}
      ${section('完整備份與還原', '一次保存或還原全部的設定、群組與單字。', backup)}
      ${section('雲端同步', '用 GitHub Gist、Google Drive 或 Firebase，讓多台裝置共用同一份單字。', cloudBody)}
      ${section('新手導覽', '', help)}
      ${section('資料', '', danger)}
    </div>`;

  root.onclick = onClick;
  root.onchange = onChange;
  unsubCloud?.();
  unsubCloud = cloud.subscribe(refreshCloud);
  fillVoices();
  icons();
}

/* ---------- 事件 ---------- */
async function onClick(e) {
  const btn = e.target.closest('[data-theme], [data-view-mode], [data-rate], [data-action]');
  if (!btn || !root.contains(btn)) return;
  const d = btn.dataset;

  if (d.theme) { store.setSettings({ theme: d.theme }); return again(); }
  if (d.viewMode) { store.setSettings({ viewMode: d.viewMode }); return again(); }
  if (d.rate) { store.setSettings({ speechRate: Number(d.rate) }); return again(); }

  switch (d.action) {
    case 'test-voice':
      speakWord({ word: 'Welcome to WordQuest', translation: '歡迎來到單字探索記' });
      break;

    case 'save-key': {
      const key = root.querySelector('#unsplash-key').value;
      store.setSettings({ unsplashKey: key });
      toast(key.trim() ? '已儲存 Key' : '已清除 Key');
      break;
    }

    case 'export-json':
    case 'export-csv': {
      const n = d.action === 'export-json' ? exportGroupJSON(ioGroup) : exportGroupCSV(ioGroup);
      toast(n ? `已匯出 ${n} 個單字` : '這個群組還沒有單字可以匯出');
      break;
    }
    case 'csv-template':
      downloadCsvTemplate();
      break;

    case 'backup':
      downloadBackup();
      toast('已匯出 wordquest_backup.json');
      break;

    case 'cloud-save-config':
      saveCloudConfig();
      toast('已儲存雲端設定');
      break;

    case 'cloud-connect': {
      const p = PROVIDERS[d.provider];
      saveCloudConfig();
      const cfg = store.state.settings;
      const MISSING = {
        gist: [!cfg.githubToken.trim(), 'GitHub token'],
        gdrive: [!cfg.gdriveClientId.trim(), '用戶端 ID'],
        firebase: [!cfg.firebaseConfig.trim(), 'firebaseConfig']
      };
      const [missing, what] = MISSING[d.provider];
      if (missing) {
        infoDialog('還沒有設定', `請先照「${p.label} 設定」裡的步驟申請，並把${what}貼上。`);
        break;
      }
      try {
        const action = await cloud.connect(d.provider, askConflict);
        toast(action === 'cancelled' ? CLOUD_RESULT.cancelled : `已連結 ${p.label}：${CLOUD_RESULT[action]}`);
        if (action === 'pulled') again();
      } catch (err) {
        infoDialog('連結失敗', err.message);
      }
      break;
    }
    case 'cloud-sync':
      try {
        const action = await cloud.syncNow(askConflict);
        toast(CLOUD_RESULT[action]);
        if (action === 'pulled') again();
      } catch (err) { infoDialog('同步失敗', err.message); }
      break;
    case 'cloud-pull': {
      const ok = await confirmDialog({
        title: '用雲端資料取代本機？',
        message: '本機的群組與單字會被雲端上的版本取代，無法復原。建議先匯出完整備份。',
        confirmText: '取代'
      });
      if (!ok) break;
      try {
        const n = await cloud.pullNow();
        toast(`已從雲端還原 ${n} 個單字`);
        again();
      } catch (err) { infoDialog('還原失敗', err.message); }
      break;
    }
    case 'cloud-disconnect':
      await cloud.disconnect();
      again();
      break;

    case 'tour':
      showOnboarding();
      break;

    case 'reset': {
      const ok = await confirmDialog({
        title: '清除所有資料？',
        message: '所有群組、單字與設定都會被刪除，無法復原。建議先匯出完整備份。',
        confirmText: '清除'
      });
      if (ok) {
        if (cloud.state.status !== 'disconnected') await cloud.disconnect().catch(() => {}); // 設定被重置，雲端連線一併收掉
        store.reset();
        toast('已清除所有資料');
        again();
      }
      break;
    }
  }
}

async function onChange(e) {
  const t = e.target;
  switch (t.id) {
    case 'voice-select':
      store.setSettings({ voiceName: t.value });
      speakWord({ word: 'Hello, welcome to WordQuest' }, { bilingual: false });
      break;
    case 'cloud-auto':
      store.setSettings({ cloudAutoSync: t.checked });
      break;
    case 'bilingual':
      store.setSettings({ bilingualSpeech: t.checked });
      break;
    case 'play-order':
      store.setSettings({ playOrder: t.value });
      break;
    case 'unsplash-key':
      store.setSettings({ unsplashKey: t.value }); // 失焦即存；提示訊息只在按「儲存」時顯示，避免重複跳出
      break;
    case 'io-group':
      ioGroup = t.value;
      break;
    case 'import-words': {
      const file = t.files?.[0];
      t.value = '';
      if (file) await importWordFile(file);
      break;
    }
    case 'restore-file': {
      const file = t.files?.[0];
      t.value = '';
      if (file) await restoreBackupFile(file);
      break;
    }
  }
}

/* ---------- 匯入單字檔 ---------- */
async function importWordFile(file) {
  if (file.size > MAX_FILE_BYTES) return infoDialog('檔案太大', '單字檔請小於 5 MB。');
  const group = store.getGroup(ioGroup);
  if (!group) return infoDialog('找不到群組', '請先建立群組，再匯入單字。');
  try {
    const { words, invalid } = parseWordFile(await file.text(), file.name);
    if (!words.length) {
      return infoDialog('沒有可以匯入的單字',
        invalid ? `有 ${invalid} 列缺少「單字」或「中文翻譯」。` : '檔案裡沒有資料。');
    }
    const { added, duplicates } = store.importWords(ioGroup, words);
    const notes = [];
    if (duplicates) notes.push(`群組內已有 ${duplicates} 個，已略過`);
    if (invalid) notes.push(`${invalid} 列缺少單字或中文翻譯，已略過`);
    infoDialog('匯入完成', `已加入「${group.groupName}」${added} 個單字。${notes.length ? `${notes.join('；')}。` : ''}`);
    again();
  } catch (err) {
    infoDialog('匯入失敗', err.message);
  }
}

/* ---------- 還原完整備份 ---------- */
async function restoreBackupFile(file) {
  if (file.size > MAX_FILE_BYTES) return infoDialog('檔案太大', '備份檔請小於 5 MB。');
  try {
    const raw = parseBackup(await file.text());
    const next = normalizeData(raw);
    const ok = await confirmDialog({
      title: '還原這份備份？',
      message: `備份內容：${next.groups.length} 個群組、${next.words.length} 個單字。還原後，目前所有的資料與設定都會被取代，無法復原。`,
      confirmText: '還原'
    });
    if (!ok) return;
    store.restore(raw);
    toast('已還原備份');
    again();
  } catch (err) {
    infoDialog('還原失敗', err.message);
  }
}
