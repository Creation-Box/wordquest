// 測驗模式：先選範圍與順序，再挑 6 種玩法
// 翻卡（導向學習模式）／連連看／聽音辨識／限時速刷／單字填空／默寫練習（填空與默寫都是一字母一格）
// 路由：#/quiz 是選單，#/quiz/<mode> 直接開始（mode＝match | listen | timed | fill | spell）
import { store, POS_LABELS } from '../store.js';
import { speak, stop as stopSpeech, isSupported } from '../tts.js';
import { esc, cls, toast } from '../ui.js';

const MODES = [
  { id: 'flip',   label: '翻卡',     icon: 'gallery-horizontal', desc: '翻面看中文，左右滑動換卡，發音依顯示面', href: '#/study' },
  { id: 'match',  label: '連連看',   icon: 'link-2',             desc: '把英文和中文配成一對，一輪 6 組' },
  { id: 'listen', label: '聽音辨識', icon: 'ear',                desc: '聽發音，選出正確的單字' },
  { id: 'timed',  label: '限時速刷', icon: 'timer',              desc: '60 秒內看英文選中文，答越多越好' },
  { id: 'fill',   label: '單字填空', icon: 'text-cursor-input',  desc: '看中文和例句，把缺的字母補上' },
  { id: 'spell',  label: '默寫練習', icon: 'keyboard',           desc: '看中文（可聽發音），一格一格拼出單字' }
];
const MATCH_ROUND = 6;
const TIMED_SECONDS = 60;

let root = null;
let G = null;          // 目前這一局的狀態
let timer = null;      // 限時速刷的倒數
let later = null;      // 延遲動作（自動下一題、翻錯後復原）
let scope = 'all';     // 'all' | 'starred' | groupId
let order = '';        // '' = 跟隨設定的播放順序
let matchSound = false; // 連連看是否播放英文發音（預設關閉，頁面上可切換）

const $ = (sel) => root.querySelector(sel);
const icons = () => window.lucide?.createIcons();
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const orderNow = () => order || store.state.settings.playOrder;
const cur = () => store.getWord(G.curId);

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function stopAll() {
  clearInterval(timer); timer = null;
  clearTimeout(later); later = null;
  stopSpeech();
}

/* ---------- 範圍 ---------- */
function poolIds() {
  if (scope !== 'all' && scope !== 'starred' && !store.getGroup(scope)) scope = 'all';
  const words = scope === 'all' ? store.state.words
    : scope === 'starred' ? store.queryWords({ starredOnly: true })
    : store.getWordsByGroup(scope);
  const ids = words.map((w) => w.id);
  return orderNow() === 'shuffle' ? shuffle(ids) : ids;
}

/* ---------- 共用樣式與外框 ---------- */
const OPT = 'w-full text-left rounded-xl border px-4 py-3 md:py-4 text-base md:text-lg font-medium bg-white dark:bg-slate-900 transition-colors';
const OPT_STATE = {
  idle: 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
  ok:   'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-400/15 dark:text-teal-200',
  bad:  'border-red-500 bg-red-50 text-red-800 dark:border-red-400 dark:bg-red-500/15 dark:text-red-200',
  dim:  'border-slate-200 dark:border-slate-800 opacity-50'
};

function shell(title, right, body) {
  root.innerHTML = `
    <div class="max-w-md md:max-w-3xl mx-auto">
      <div class="flex items-center justify-between gap-3 mb-4">
        <button type="button" data-action="exit" aria-label="返回測驗選單" class="${cls.iconBtn}"><i data-lucide="arrow-left" class="size-5"></i></button>
        <h2 class="font-bold">${esc(title)}</h2>
        <span class="text-sm tabular-nums text-slate-500 dark:text-slate-400 min-w-16 text-right">${right}</span>
      </div>
      ${body}
    </div>`;
  icons();
}

function notice(title, text) {
  stopAll();
  G = null;
  root.innerHTML = `
    <div class="max-w-md mx-auto grid place-items-center text-center py-16 gap-4">
      <span class="grid place-items-center size-16 rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300">
        <i data-lucide="list-checks" class="size-8"></i>
      </span>
      <div>
        <h2 class="text-lg font-bold">${esc(title)}</h2>
        <p class="mt-1 text-slate-500 dark:text-slate-400">${esc(text)}</p>
      </div>
      <div class="flex gap-2">
        <button type="button" data-action="exit" class="${cls.btnGhost}">返回測驗選單</button>
        <a href="#/library" class="${cls.btnPrimary}">前往單字庫</a>
      </div>
    </div>`;
  icons();
}

/* =====================================================================
   選單
   ===================================================================== */
function showSetup() {
  stopAll();
  G = null;
  const count = poolIds().length;
  const sel = (v) => (scope === v ? 'selected' : '');
  const ord = orderNow();

  root.innerHTML = `
    <div class="grid gap-6">
      <section class="${cls.card} p-5 grid gap-4 max-w-3xl">
        <div class="grid grid-cols-2 gap-3">
          <label class="grid gap-1.5 text-sm">範圍
            <select id="q-scope" class="${cls.input}">
              <option value="all" ${sel('all')}>全部單字</option>
              <option value="starred" ${sel('starred')}>★ 收藏單字</option>
              ${store.getGroups().map((g) => `<option value="${esc(g.groupId)}" ${sel(g.groupId)}>${esc(g.groupName)}</option>`).join('')}
            </select>
          </label>
          <label class="grid gap-1.5 text-sm">順序
            <select id="q-order" class="${cls.input}">
              <option value="shuffle" ${ord === 'shuffle' ? 'selected' : ''}>隨機</option>
              <option value="sequential" ${ord === 'sequential' ? 'selected' : ''}>依序</option>
            </select>
          </label>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">這個範圍共 ${count} 個單字${count ? '' : '，先到單字庫新增，或換一個範圍'}。</p>
      </section>

      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        ${MODES.map((m) => {
          const off = m.id === 'listen' && !isSupported;
          const inner = `
            <span class="grid place-items-center size-11 shrink-0 rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300">
              <i data-lucide="${m.icon}" class="size-6"></i>
            </span>
            <span class="min-w-0">
              <b class="block">${m.label}</b>
              <span class="block text-sm text-slate-500 dark:text-slate-400">${off ? '此瀏覽器不支援語音播放' : m.desc}</span>
            </span>`;
          const base = `${cls.card} p-4 flex items-center gap-3 text-left w-full hover:border-teal-600 dark:hover:border-teal-400 ${off ? 'opacity-50 pointer-events-none' : ''}`;
          return m.href
            ? `<a href="${m.href}" class="${base}">${inner}</a>`
            : `<button type="button" data-mode="${m.id}" ${off ? 'disabled' : ''} class="${base}">${inner}</button>`;
        }).join('')}
      </div>
    </div>`;
  icons();
}

/* =====================================================================
   開始一局
   ===================================================================== */
function start(id) {
  stopAll();
  const ids = poolIds();
  if (!ids.length) return notice('這個範圍沒有單字', '先到單字庫新增單字，或換一個範圍。');
  if (id === 'match' && ids.length < 2) return notice('單字太少', '連連看至少需要 2 個單字。');
  if ((id === 'listen' || id === 'timed') && store.state.words.length < 2) return notice('單字太少', '選擇題需要單字庫裡至少有 2 個單字，才有選項可以選。');
  if (id === 'listen' && !isSupported) return notice('不支援語音', '這個瀏覽器不支援語音播放，無法使用聽音辨識。');

  G = { mode: id, ids, i: 0, curId: ids[0], correct: 0, total: ids.length, wrong: new Set(), answered: false, pick: null };
  if (id === 'match') startMatch();
  else if (id === 'listen') askChoice();
  else if (id === 'timed') startTimed();
  else askTyped();
}

const modeLabel = () => MODES.find((m) => m.id === G.mode).label;

/* =====================================================================
   選擇題：聽音辨識（選單字）與限時速刷（選中文）
   ===================================================================== */
function choicesFor(w, field) {
  const seen = new Set([norm(w[field])]);
  const picks = [];
  for (const x of shuffle(store.state.words.filter((o) => o.id !== w.id && o[field]))) {
    const k = norm(x[field]);
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push(x);
    if (picks.length === 3) break;
  }
  return shuffle([w, ...picks]).map((x) => x.id);
}

function askChoice() {
  const g = G;
  g.curId = g.ids[g.i];
  g.answered = false;
  g.pick = null;
  g.opts = choicesFor(cur(), g.mode === 'timed' ? 'translation' : 'word');
  drawChoice();
  if (g.mode === 'listen') speak(cur().word);
}

function drawChoice() {
  const g = G, w = cur();
  const timed = g.mode === 'timed';
  const field = timed ? 'translation' : 'word';

  const prompt = timed
    ? `<p class="font-display text-4xl md:text-6xl font-bold break-words">${esc(w.word)}</p>
       ${w.phonetic ? `<p class="mt-1 text-slate-500 dark:text-slate-400">${esc(w.phonetic)}</p>` : ''}`
    : `<button type="button" data-action="say" aria-label="再聽一次" class="${cls.btnGhost} size-20 !p-0 rounded-full mx-auto">
         <i data-lucide="volume-2" class="size-9"></i>
       </button>
       <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">聽發音，選出正確的單字（點喇叭再聽一次）</p>`;

  const opts = g.opts.map((id) => {
    const x = store.getWord(id);
    const st = !g.answered ? 'idle' : id === g.curId ? 'ok' : id === g.pick ? 'bad' : 'dim';
    return `<button type="button" data-choice="${esc(id)}" ${g.answered ? 'disabled' : ''} class="${OPT} ${OPT_STATE[st]}">${esc(x[field])}</button>`;
  }).join('');

  const answer = !timed && g.answered
    ? `<p class="text-center text-sm"><b>${esc(w.word)}</b>　${esc(w.translation)}</p>
       <button type="button" data-action="next" class="${cls.btnPrimary} w-full">${g.i + 1 >= g.ids.length ? '看結果' : '下一題'}</button>` : '';

  const bar = timed
    ? `<div class="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-4">
         <div id="tbar" class="h-full bg-teal-600 dark:bg-teal-400" style="width:${(g.time / TIMED_SECONDS) * 100}%"></div>
       </div>` : '';

  shell(modeLabel(),
    timed ? `<span id="tm">${g.time}</span> 秒　答對 ${g.correct}` : `${g.i + 1} / ${g.ids.length}`,
    `${bar}
     <div class="${cls.card} p-6 md:p-10 text-center">${prompt}</div>
     <div class="mt-4 grid gap-2">${opts}</div>
     <div class="mt-4 grid gap-3">${answer}</div>`);
  if (!timed && g.answered) $('[data-action="next"]')?.focus();
}

function answerChoice(id) {
  const g = G;
  if (!g || g.answered) return;
  g.answered = true;
  g.pick = id;
  const ok = id === g.curId;
  if (ok) g.correct++; else g.wrong.add(g.curId);
  if (g.mode === 'timed') g.total++;
  drawChoice();
  if (g.mode === 'timed') {
    later = setTimeout(() => { if (G === g) nextTimed(); }, ok ? 350 : 900);
  }
}

function nextChoice() {
  if (!G || !G.answered) return;
  G.i++;
  if (G.i >= G.ids.length) finish(); else askChoice();
}

/* ----- 限時速刷 ----- */
function startTimed() {
  G.time = TIMED_SECONDS;
  G.total = 0;       // 速刷的「題數」是實際作答數
  askChoice();
  timer = setInterval(tick, 1000);
}

function nextTimed() {
  G.i++;
  if (G.i >= G.ids.length) { // 單字用完就重新洗牌繼續，直到時間到
    G.i = 0;
    if (orderNow() === 'shuffle') shuffle(G.ids);
  }
  askChoice();
}

function tick() {
  // 切到別的分頁（路由）後，這一局就悄悄結束，不要在背景繼續倒數
  if (!G || G.mode !== 'timed' || !root.isConnected || root.hidden) { stopAll(); return; }
  G.time--;
  const tm = $('#tm'), bar = $('#tbar');
  if (tm) tm.textContent = G.time;
  if (bar) bar.style.width = `${(Math.max(G.time, 0) / TIMED_SECONDS) * 100}%`;
  if (G.time <= 0) finish();
}

/* =====================================================================
   連連看
   ===================================================================== */
function startMatch() {
  const ids = G.ids;
  G.chunks = [];
  for (let i = 0; i < ids.length; i += MATCH_ROUND) G.chunks.push(ids.slice(i, i + MATCH_ROUND));
  if (G.chunks.length > 1 && G.chunks.at(-1).length === 1) { // 最後一輪只剩 1 組就併到上一輪
    const last = G.chunks.pop();
    G.chunks.at(-1).push(...last);
  }
  G.round = 0;
  newRound();
}

function newRound() {
  const ids = G.chunks[G.round];
  G.left = ids.slice();
  G.right = shuffle(ids.slice());
  G.done = new Set();
  G.sel = null;
  G.bad = null;
  drawMatch();
}

function drawMatch() {
  const g = G;
  const tile = (side, id, label) => {
    const done = g.done.has(id);
    const sel = g.sel && g.sel.side === side && g.sel.id === id;
    const bad = g.bad && g.bad[side] === id;
    const st = done ? OPT_STATE.ok + ' opacity-60' : bad ? OPT_STATE.bad : sel ? 'border-teal-600 ring-2 ring-teal-600/40 dark:border-teal-400 dark:ring-teal-400/40' : OPT_STATE.idle;
    return `<button type="button" data-tile="${side}:${esc(id)}" ${done ? 'disabled' : ''}
      class="${OPT} ${st} !px-3 !py-3 text-center break-words">${esc(label)}</button>`;
  };
  shell(modeLabel(), `${g.round + 1} / ${g.chunks.length}`, `
    <div class="mb-3 flex items-center justify-between gap-3">
      <p class="text-sm text-slate-500 dark:text-slate-400">各點一個英文和一個中文，配成一對</p>
      ${isSupported ? `<button type="button" data-action="match-sound" aria-pressed="${matchSound}" aria-label="切換英文發音"
        class="${cls.btnGhost} !px-3 !py-1.5 shrink-0"><i data-lucide="${matchSound ? 'volume-2' : 'volume-x'}" class="size-4"></i>${matchSound ? '發音：開' : '發音：關'}</button>` : ''}
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="grid gap-2 content-start">${g.left.map((id) => tile('L', id, store.getWord(id).word)).join('')}</div>
      <div class="grid gap-2 content-start">${g.right.map((id) => tile('R', id, store.getWord(id).translation)).join('')}</div>
    </div>`);
}

function pickTile(side, id) {
  const g = G;
  if (!g || g.bad || g.done.has(id)) return;
  if (side === 'L' && matchSound && isSupported) speak(store.getWord(id).word);

  if (!g.sel || g.sel.side === side) { g.sel = { side, id }; return drawMatch(); }

  const leftId = side === 'L' ? id : g.sel.id;
  const rightId = side === 'R' ? id : g.sel.id;
  g.sel = null;

  if (leftId === rightId) {
    g.done.add(leftId);
    drawMatch();
    if (g.done.size === g.left.length) {
      later = setTimeout(() => {
        if (G !== g) return;
        if (g.round + 1 < g.chunks.length) { g.round++; newRound(); } else finish();
      }, 450);
    }
  } else {
    g.wrong.add(leftId);
    g.wrong.add(rightId);
    g.bad = { L: leftId, R: rightId };
    drawMatch();
    later = setTimeout(() => { if (G === g) { g.bad = null; drawMatch(); } }, 500);
  }
}

/* =====================================================================
   單字填空與默寫練習（都是打字作答）
   ===================================================================== */
function askTyped() {
  G.curId = G.ids[G.i];
  G.answered = false;
  G.hint = 0;
  G.ok = false;
  G.lastCell = -1;
  G.cells = buildCells(cur().word, G.mode);
  drawTyped();
  const first = G.cells.findIndex((c) => c.t === 'edit');
  if (first >= 0) focusCell(first);
}

/* ----- 字母格：一個字母一個框 -----
   cells 的 t（type）：
     edit  可輸入的框        given 單字填空預先顯示的字母（鎖定）
     hint  按提示補上的字母（鎖定）   fixed 連字號、撇號等符號（只顯示）   space 單字之間的空格 */
const isLetter = (c) => /[\p{L}\p{N}]/u.test(c);

function buildCells(word, mode) {
  const cells = [...word].map((ch) =>
    ch === ' ' ? { t: 'space', ch } : isLetter(ch) ? { t: 'edit', ch, val: '' } : { t: 'fixed', ch });

  // 單字填空：隨機挖掉部分字母，保底至少顯示 1 個字母（例如 Blue → B _ u _）
  if (mode === 'fill') {
    const idx = cells.map((c, i) => (c.t === 'edit' ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) { // 只有 1 個字母的單字沒辦法既顯示又挖空，維持全空
      const keep = 1 + Math.floor(Math.random() * Math.ceil(idx.length / 2)); // 顯示 1 ~ 一半（無條件進位）
      shuffle(idx).slice(0, keep).forEach((i) => { cells[i].t = 'given'; cells[i].val = cells[i].ch; });
    }
  }
  return cells;
}

const sameLetter = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const nextEdit = (i, dir) => {
  for (let j = i + dir; j >= 0 && j < G.cells.length; j += dir) if (G.cells[j].t === 'edit') return j;
  return -1;
};
const cellEl = (i) => root.querySelector(`[data-cell="${i}"]`);

function focusCell(i) {
  const el = cellEl(i);
  if (!el) return;
  el.focus();
  el.select?.();
}

function setCell(i, v) {
  G.cells[i].val = v;
  const el = cellEl(i);
  if (el) el.value = v;
}

const BOX = 'grid place-items-center rounded-lg border-2 font-display font-bold text-center leading-none p-0 outline-none';
const BOX_LOCKED = {
  given: 'bg-teal-50 border-teal-300 text-teal-800 dark:bg-teal-400/10 dark:border-teal-500/50 dark:text-teal-200',
  hint:  'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-400/10 dark:border-amber-400/60 dark:text-amber-200'
};
const BOX_IDLE = 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 dark:focus:border-teal-400 dark:focus:ring-teal-400/30';

function cellsHtml() {
  const g = G;
  const n = g.cells.filter((c) => c.t === 'edit' || c.t === 'given' || c.t === 'hint').length;
  const size = n <= 8 ? 'size-11 md:size-14 text-2xl md:text-3xl' : n <= 12 ? 'size-9 md:size-12 text-xl md:text-2xl' : 'size-8 text-lg';

  // 以空格切成一個個單字，避免換行時把同一個單字拆在兩邊
  const groups = [];
  let curGroup = null;
  g.cells.forEach((c, i) => {
    if (c.t === 'space') { curGroup = null; return; }
    if (!curGroup) { curGroup = []; groups.push(curGroup); }
    curGroup.push([c, i]);
  });

  const one = (c, i) => {
    if (c.t === 'fixed') return `<span class="self-center px-0.5 font-display text-2xl text-slate-500 dark:text-slate-400">${esc(c.ch)}</span>`;
    if (c.t === 'given' || c.t === 'hint') return `<span class="${BOX} ${size} ${BOX_LOCKED[c.t]}">${esc(c.val)}</span>`;
    if (g.answered) { // 作答後：對的綠色、錯的紅色，沒填的顯示正確字母（淡色）
      const right = sameLetter(c.val, c.ch);
      return `<span class="${BOX} ${size} ${right ? OPT_STATE.ok : OPT_STATE.bad} ${c.val ? '' : 'opacity-60'}">${esc(c.val || c.ch)}</span>`;
    }
    return `<input data-cell="${i}" type="text" value="${esc(c.val)}" aria-label="第 ${i + 1} 個字母"
      autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
      class="${BOX} ${size} ${BOX_IDLE}">`;
  };

  return groups
    .map((grp) => `<span class="flex flex-wrap justify-center gap-1">${grp.map(([c, i]) => one(c, i)).join('')}</span>`)
    .join('');
}

function drawTyped() {
  const g = G, w = cur();
  const pos = POS_LABELS[w.partOfSpeech];

  let prompt = `<p class="text-3xl md:text-4xl font-bold break-words">${esc(w.translation)}</p>
    ${pos ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${pos}</p>` : ''}`;
  if (g.mode === 'fill' && w.example) {
    const re = new RegExp(reEsc(w.word), 'gi');
    const blanked = re.test(w.example) ? w.example.replace(re, '＿＿＿＿') : '';
    if (blanked) prompt += `<p class="mt-3 text-sm italic text-slate-600 dark:text-slate-300 break-words">${esc(blanked)}</p>`;
  }
  // 單字填空、默寫練習都可以播放英文單字
  if (isSupported) prompt += `<button type="button" data-action="say" class="${cls.btnGhost} mt-3"><i data-lucide="volume-2" class="size-4"></i>${g.mode === 'fill' ? '播放英文' : '聽發音'}</button>`;

  const feedback = !g.answered ? '' : g.ok
    ? `<p class="text-center text-sm text-teal-700 dark:text-teal-300">答對了！${g.hint ? `（用了 ${g.hint} 次提示）` : ''}</p>`
    : `<p class="text-center text-sm text-red-700 dark:text-red-300">正確答案：<b>${esc(w.word)}</b></p>`;
  const exampleFull = g.answered && g.mode === 'fill' && w.example
    ? `<p class="text-center text-sm italic text-slate-500 dark:text-slate-400 break-words">${esc(w.example)}</p>` : '';
  const hasBlank = g.cells.some((c) => c.t === 'edit');

  shell(modeLabel(), `${g.i + 1} / ${g.ids.length}`, `
    <div class="${cls.card} p-6 md:p-10 text-center">${prompt}</div>
    <form data-form="typed" class="mt-4 grid gap-4" autocomplete="off">
      <div id="q-cells" role="group" aria-label="作答格" class="flex flex-wrap justify-center gap-x-4 gap-y-2">${cellsHtml()}</div>
      ${feedback}${exampleFull}
      <div class="flex gap-2">
        <button type="button" data-action="hint" ${g.answered || !hasBlank ? 'disabled' : ''} class="${cls.btnGhost}">
          <i data-lucide="lightbulb" class="size-4"></i>提示
        </button>
        <button type="submit" class="${cls.btnPrimary} flex-1">${g.answered ? (g.i + 1 >= g.ids.length ? '看結果' : '下一題') : '檢查'}</button>
      </div>
    </form>`);
  if (g.answered) $('button[type="submit"]')?.focus();
}

/** 提示：補上一格正確字母。優先補目前選中的格子，其次是第一個還沒填對的格子。補上的格子鎖定，仍可列入答對。 */
function useHint() {
  const g = G;
  if (!g || g.answered) return;
  const wrongAt = (i) => g.cells[i]?.t === 'edit' && !sameLetter(g.cells[i].val, g.cells[i].ch);
  let target = wrongAt(g.lastCell) ? g.lastCell : g.cells.findIndex((c, i) => wrongAt(i));
  if (target < 0) { toast('所有字母都已經填對了，按「檢查」就可以了'); return; }

  const c = g.cells[target];
  c.t = 'hint';
  c.val = c.ch;
  g.hint++;
  $('#q-cells').innerHTML = cellsHtml();

  const nxt = nextEdit(target, 1);
  const fallback = g.cells.findIndex((x) => x.t === 'edit');
  const f = nxt >= 0 ? nxt : fallback;
  if (f >= 0) focusCell(f);
  else $('button[type="submit"]')?.focus();
  g.lastCell = f;
  if (!g.cells.some((x) => x.t === 'edit')) $('[data-action="hint"]')?.setAttribute('disabled', '');
}

function checkTyped() {
  const g = G;
  if (g.answered) return;
  g.answered = true;
  g.ok = g.cells.every((c) => c.t !== 'edit' || sameLetter(c.val, c.ch));
  if (g.ok) g.correct++; else g.wrong.add(g.curId);
  drawTyped();
}

function nextTyped() {
  G.i++;
  if (G.i >= G.ids.length) finish(); else askTyped();
}

/* ----- 字母格的鍵盤／貼上處理 ----- */
const cellOf = (e) => (G && !G.answered ? e.target.closest?.('[data-cell]') : null);

function onCellInput(e) {
  const el = cellOf(e);
  if (!el) return;
  const i = Number(el.dataset.cell);
  const ch = [...el.value].filter((c) => !/\s/.test(c)).at(-1) ?? ''; // 格子裡已有字時，保留新打的那一個
  setCell(i, ch);
  if (ch) { const n = nextEdit(i, 1); if (n >= 0) focusCell(n); }
}

function onCellKey(e) {
  const el = cellOf(e);
  if (!el) return;
  const i = Number(el.dataset.cell);
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (G.cells[i].val) { setCell(i, ''); return; }
    const p = nextEdit(i, -1);
    if (p >= 0) { setCell(p, ''); focusCell(p); }
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const p = nextEdit(i, -1);
    if (p >= 0) focusCell(p);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const n = nextEdit(i, 1);
    if (n >= 0) focusCell(n);
  }
}

function onCellPaste(e) {
  const el = cellOf(e);
  if (!el) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData)?.getData('text') ?? '';
  let j = Number(el.dataset.cell);
  let last = j;
  for (const ch of [...text].filter(isLetter)) {
    if (j < 0) break;
    setCell(j, ch);
    last = j;
    j = nextEdit(j, 1);
  }
  focusCell(j >= 0 ? j : last);
}

function onCellFocus(e) {
  const el = cellOf(e);
  if (!el) return;
  G.lastCell = Number(el.dataset.cell);
  el.select?.(); // 點到有字的格子時整格選取，直接打字就是取代
}

/* =====================================================================
   結果
   ===================================================================== */
function finish() {
  const g = G;
  stopAll();
  if (!g) return;

  if (g.mode === 'match') g.correct = g.total - g.wrong.size; // 第一次就配對成功的單字數
  g.correct = Math.max(0, g.correct);

  // 答錯的單字：還是「新單字」就改成「學習中」
  for (const id of g.wrong) {
    const w = store.getWord(id);
    if (w && w.familiarity === 'New') store.updateWord(id, { familiarity: 'Learning' });
  }

  const total = g.total;
  const pct = total ? Math.round((g.correct / total) * 100) : 0;
  const msg = !total ? '時間到，這次沒有作答。' : pct === 100 ? '全部答對！' : pct >= 80 ? '很不錯，繼續保持。' : pct >= 50 ? '還可以更好，看看下面答錯的單字。' : '多練習幾次就會進步。';
  const wrongWords = [...g.wrong].map((id) => store.getWord(id)).filter(Boolean);

  shell(modeLabel(), '', `
    <div class="${cls.card} p-6 md:p-10 text-center grid gap-1">
      <p class="font-display text-5xl font-bold">${g.correct}<span class="text-2xl text-slate-400"> / ${total}</span></p>
      <p class="text-slate-500 dark:text-slate-400">${total ? `答對率 ${pct}%` : ''}</p>
      <p class="mt-1 text-sm">${msg}</p>
    </div>
    ${wrongWords.length ? `
      <section class="mt-4 ${cls.card} p-4 grid gap-3">
        <h3 class="font-bold text-sm">需要再複習（${wrongWords.length}）</h3>
        <ul class="grid gap-2">
          ${wrongWords.map((w) => `
            <li class="flex items-center justify-between gap-3">
              <span class="min-w-0 break-words"><b>${esc(w.word)}</b>　<span class="text-slate-500 dark:text-slate-400">${esc(w.translation)}</span></span>
              ${isSupported ? `<button type="button" data-speak="${esc(w.id)}" aria-label="播放發音" class="${cls.iconBtn} shrink-0"><i data-lucide="volume-2" class="size-4"></i></button>` : ''}
            </li>`).join('')}
        </ul>
        <button type="button" data-action="star-wrong" class="${cls.btnGhost} justify-self-start"><i data-lucide="star" class="size-4"></i>全部加入收藏</button>
      </section>` : ''}
    <div class="mt-4 flex gap-2">
      <button type="button" data-action="exit" class="${cls.btnGhost} flex-1">返回選單</button>
      <button type="button" data-action="retry" class="${cls.btnPrimary} flex-1"><i data-lucide="rotate-ccw" class="size-4"></i>再玩一次</button>
    </div>`);
}

/* =====================================================================
   事件
   ===================================================================== */
function onClick(e) {
  const t = e.target.closest('[data-mode], [data-action], [data-choice], [data-tile]');
  if (!t || !root.contains(t)) return;
  const d = t.dataset;

  if (d.mode) { // 選單 → 用路由進入，瀏覽器的上一頁就能回到選單
    if (location.hash === `#/quiz/${d.mode}`) start(d.mode);
    else location.hash = `#/quiz/${d.mode}`;
    return;
  }
  if (d.choice) return answerChoice(d.choice);
  if (d.tile) { const [side, ...rest] = d.tile.split(':'); return pickTile(side, rest.join(':')); }

  switch (d.action) {
    case 'exit':
      stopAll();
      if (location.hash === '#/quiz') showSetup(); else location.hash = '#/quiz';
      break;
    case 'retry':
      if (G) start(G.mode);
      break;
    case 'next':
      nextChoice();
      break;
    case 'say':
      if (G?.curId) speak(cur().word);
      break;
    case 'hint':
      useHint();
      break;
    case 'match-sound':
      matchSound = !matchSound;
      if (!matchSound) stopSpeech();
      if (G?.mode === 'match') drawMatch();
      break;
    case 'star-wrong': {
      let n = 0;
      for (const id of G?.wrong ?? []) {
        const w = store.getWord(id);
        if (w && !w.isStarred) { store.updateWord(id, { isStarred: true }); n++; }
      }
      toast(n ? `已收藏 ${n} 個單字` : '都已經在收藏裡了');
      break;
    }
  }
}

function onChange(e) {
  if (e.target.id === 'q-scope') { scope = e.target.value; showSetup(); }
  else if (e.target.id === 'q-order') { order = e.target.value; showSetup(); }
}

function onSubmit(e) {
  if (e.target.dataset.form !== 'typed') return;
  e.preventDefault();
  if (!G) return;
  if (G.answered) nextTyped();
  else checkTyped();
}

/* ---------- 進入點（app.js 的 Router 呼叫） ---------- */
export function render(el, param) {
  stopAll();
  root = el;
  root.onclick = onClick;
  root.onchange = onChange;
  root.onsubmit = onSubmit;
  root.oninput = onCellInput;
  root.onkeydown = onCellKey;
  root.onpaste = onCellPaste;
  if (!root.dataset.cellFocus) { // focusin 沒有 on* 屬性，只綁一次
    root.addEventListener('focusin', onCellFocus);
    root.dataset.cellFocus = '1';
  }

  const mode = MODES.find((m) => m.id === param && !m.href);
  if (mode) start(mode.id);
  else showSetup();
}
