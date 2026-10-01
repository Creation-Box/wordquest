// 學習模式：翻卡 + 左右滑動切換 + 雙語發音
import { store, POS_LABELS } from '../store.js';
import { isSupported } from '../tts.js';
import { esc, cls } from '../ui.js';

const SWIPE_MIN = 60;      // 最小滑動距離（px）
const TAP_SLOP = 10;       // 位移小於這個值才算「點一下」
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let root = null;
let scope = 'all';         // 'all' | 'starred' | groupId
let deck = [];             // 單字 id 陣列（依 playOrder 決定是否洗牌）
let index = 0;
let busy = false;

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function buildDeck() {
  if (scope !== 'all' && scope !== 'starred' && !store.getGroup(scope)) scope = 'all';
  const words = scope === 'all' ? store.state.words
    : scope === 'starred' ? store.queryWords({ starredOnly: true })
    : store.getWordsByGroup(scope);
  deck = words.map((w) => w.id);
  if (store.state.settings.playOrder === 'shuffle') shuffle(deck);
  index = 0;
}

const current = () => store.getWord(deck[index]);
const $ = (sel) => root.querySelector(sel);

export function render(el) {
  root = el;
  busy = false;
  buildDeck();

  const sel = (v) => (scope === v ? 'selected' : '');
  root.innerHTML = `
    <div class="max-w-md mx-auto">
      <div class="flex items-center justify-between gap-3 mb-4">
        <select id="fc-scope" aria-label="學習範圍" class="${cls.input} w-auto max-w-[70%]">
          <option value="all" ${sel('all')}>全部單字</option>
          <option value="starred" ${sel('starred')}>★ 收藏單字</option>
          ${store.getGroups().map((g) => `<option value="${esc(g.groupId)}" ${sel(g.groupId)}>${esc(g.groupName)}</option>`).join('')}
        </select>
        <span id="fc-progress" class="text-sm text-slate-500 dark:text-slate-400 tabular-nums"></span>
      </div>
      <div id="fc-body"></div>
    </div>`;

  $('#fc-scope').addEventListener('change', (e) => { scope = e.target.value; render(root); });
  drawBody();
  window.lucide?.createIcons();
}

function drawBody() {
  const body = $('#fc-body');
  if (!deck.length) {
    $('#fc-progress').textContent = '';
    body.innerHTML = `
      <div class="grid place-items-center text-center py-16 gap-4">
        <span class="grid place-items-center size-16 rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300">
          <i data-lucide="gallery-horizontal" class="size-8"></i>
        </span>
        <div>
          <h2 class="text-lg font-bold">${scope === 'starred' ? '還沒有收藏單字' : '這個範圍沒有單字'}</h2>
          <p class="mt-1 text-slate-500 dark:text-slate-400">先到單字庫新增單字，再回來學習。</p>
        </div>
        <a href="#/library" class="${cls.btnPrimary}">前往單字庫</a>
      </div>`;
    return;
  }

  const round = `${cls.btnGhost} size-12 !p-0 rounded-full`;
  body.innerHTML = `
    <div id="fc-stage" class="flip-scene swipe-area">
      <div id="fc-drag" style="will-change: transform">
        <div id="fc-card" class="flip-card h-80" tabindex="0" role="button" aria-label="點擊翻面，左右滑動切換單字卡"></div>
      </div>
    </div>
    <div class="mt-6 flex items-center justify-center gap-3">
      <button type="button" id="fc-prev" aria-label="上一張" class="${round}"><i data-lucide="chevron-left" class="size-5"></i></button>
      ${isSupported ? `<button type="button" id="fc-speak" aria-label="播放發音" class="${round}"><i data-lucide="volume-2" class="size-5"></i></button>` : ''}
      <button type="button" id="fc-star" aria-label="收藏" aria-pressed="false" class="${round}"><i data-lucide="star" class="size-5"></i></button>
      <button type="button" id="fc-next" aria-label="下一張" class="${round}"><i data-lucide="chevron-right" class="size-5"></i></button>
    </div>
    <p class="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">點卡片翻面，左右滑動或按方向鍵切換</p>`;

  showCard();
  $('#fc-prev').addEventListener('click', () => go(-1));
  $('#fc-next').addEventListener('click', () => go(1));
  $('#fc-star').addEventListener('click', () => { store.toggleStar(deck[index]); updateStar(); });
  bindGestures();
}

/* ---------- 卡片內容 ---------- */
function faces(w) {
  const credit = w.image.credit
    ? `<span class="absolute bottom-1 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">Photo by ${esc(w.image.credit.name)} / Unsplash</span>` : '';
  const img = w.image.url
    ? `<div class="relative h-36 shrink-0"><img data-wq-img draggable="false" src="${esc(w.image.url)}" alt="" referrerpolicy="no-referrer" class="size-full object-cover">${credit}</div>` : '';
  const pos = POS_LABELS[w.partOfSpeech];

  return `
    <div class="flip-face flex flex-col overflow-hidden rounded-3xl ${cls.card}">
      ${img}
      <div class="flex-1 grid place-content-center text-center px-4">
        <p class="font-display text-4xl font-bold break-words">${esc(w.word)}</p>
        ${w.phonetic ? `<p class="mt-1 text-slate-500 dark:text-slate-400">${esc(w.phonetic)}</p>` : ''}
      </div>
    </div>
    <div class="flip-face flip-back flex flex-col justify-center gap-3 overflow-y-auto rounded-3xl bg-teal-700 dark:bg-teal-400 text-white dark:text-teal-950 p-6 text-center shadow-sm">
      <p class="text-3xl font-bold break-words">${esc(w.translation)}</p>
      ${pos ? `<p class="text-sm opacity-80">${pos}</p>` : ''}
      ${w.example ? `<p class="text-sm italic opacity-90 break-words">${esc(w.example)}</p>` : ''}
    </div>`;
}

function updateStar() {
  const w = current();
  const star = $('#fc-star');
  star.classList.toggle('star-active', w.isStarred);
  star.setAttribute('aria-pressed', String(w.isStarred));
  star.setAttribute('aria-label', w.isStarred ? '取消收藏' : '收藏');
}

function showCard() {
  const w = current();
  const card = $('#fc-card');
  card.classList.add('no-anim');            // 換卡時不要播放翻回正面的動畫
  card.classList.remove('is-flipped');
  card.innerHTML = faces(w);
  void card.offsetWidth;
  card.classList.remove('no-anim');
  card.querySelectorAll('img[data-wq-img]').forEach((img) =>
    img.addEventListener('error', () => img.remove(), { once: true }));

  $('#fc-progress').textContent = `${index + 1} / ${deck.length}`;
  const speak = $('#fc-speak');
  if (speak) speak.dataset.speak = w.id;    // 🔊 由 tts.js 的全局監聽處理
  updateStar();
}

const flip = () => $('#fc-card').classList.toggle('is-flipped');

/* ---------- 切換與動畫 ---------- */
function setPos(el, x, opacity, rotate = 0) {
  el.style.transition = 'none';
  el.style.transform = `translateX(${x}px) rotate(${rotate}deg)`;
  el.style.opacity = opacity;
  void el.offsetWidth;
}
function animateTo(el, x, opacity, ms) {
  el.style.transition = `transform ${ms}ms ease-out, opacity ${ms}ms ease-out`;
  el.style.transform = `translateX(${x}px)`;
  el.style.opacity = opacity;
  return new Promise((r) => setTimeout(r, ms + 20));
}

/** dir = 1 下一張（舊卡往左滑出），dir = -1 上一張 */
async function go(dir) {
  if (busy || deck.length < 2) return;
  busy = true;
  const drag = $('#fc-drag');
  const w = drag.offsetWidth;
  const anim = !reduceMotion();

  if (anim) await animateTo(drag, -dir * w * 1.1, 0, 160);
  index = (index + dir + deck.length) % deck.length;
  showCard();
  if (anim) {
    setPos(drag, dir * w * 0.5, 0);
    await animateTo(drag, 0, 1, 200);
  }
  setPos(drag, 0, 1);
  busy = false;
}

async function snapBack() {
  const drag = $('#fc-drag');
  if (reduceMotion()) return setPos(drag, 0, 1);
  await animateTo(drag, 0, 1, 160);
  setPos(drag, 0, 1);
}

/* ---------- 手勢：Pointer Events（觸控與滑鼠通用） ---------- */
function bindGestures() {
  const stage = $('#fc-stage');
  const drag = $('#fc-drag');
  const card = $('#fc-card');
  let pid = null, sx = 0, sy = 0, dx = 0, travel = 0, dragging = false, moved = false;

  stage.addEventListener('pointerdown', (e) => {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0; travel = 0;
    dragging = true; moved = false;
    try { stage.setPointerCapture(pid); } catch (err) { /* 忽略 */ }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    dx = e.clientX - sx;
    const dy = e.clientY - sy;
    travel = Math.max(travel, Math.abs(dx), Math.abs(dy));
    if (!moved && Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) moved = true;
    if (moved) setPos(drag, dx, 1 - Math.min(Math.abs(dx) / stage.offsetWidth, 1) * 0.5, dx / 25);
  });

  const finish = (e, cancelled) => {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    const threshold = Math.max(SWIPE_MIN, stage.offsetWidth * 0.2);
    if (moved) {
      if (!cancelled && Math.abs(dx) >= threshold && deck.length > 1) go(dx < 0 ? 1 : -1);
      else snapBack();
    } else if (!cancelled && travel < TAP_SLOP) {
      flip(); // 點一下＝翻面
    }
  };
  stage.addEventListener('pointerup', (e) => finish(e, false));
  stage.addEventListener('pointercancel', (e) => finish(e, true));

  card.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
}
