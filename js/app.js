// 主程式進入點：Router（Hash）+ Tab 切換 + Header（搜尋／收藏／主題）+ 檢視模式 + 備份提醒 + 新手導覽
import { store } from './store.js';
import { initSpeakButtons } from './tts.js';
import { initBackupReminder } from './backup.js';
import { cloud } from './cloud.js';
import './cloud-adapters.js'; // 註冊 Google Drive／Firebase adapter
import * as library from './components/group.js';
import * as study from './components/flashcard.js';
import * as quiz from './components/modes.js';
import * as settings from './components/settings.js';
import { maybeShowOnboarding } from './components/onboarding.js';
import { initI18n } from './i18n.js';

const routes = {
  library:  { title: '群組／單字庫', view: library },
  study:    { title: '學習模式',     view: study },
  quiz:     { title: '測驗模式',     view: quiz },
  settings: { title: '系統設定',     view: settings }
};
const DEFAULT_ROUTE = 'library';

export function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ---------- 主題 ---------- */
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const t = store.state.settings.theme;
  return t === 'dark' || (t === 'system' && darkQuery.matches);
}

function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle('dark', dark);
  document.getElementById('meta-theme')?.setAttribute('content', dark ? '#020617' : '#f8fafc');
}

darkQuery.addEventListener('change', applyTheme);

/* ---------- 檢視模式：自動／手機 App／電腦 Dashboard ---------- */
const VIEWPORT_DEFAULT = 'width=device-width, initial-scale=1, viewport-fit=cover';
const VIEWPORT_DESKTOP = 'width=1100, viewport-fit=cover'; // 手機上用桌面版寬度，讓 md: 版面生效

function applyViewMode() {
  const mode = store.state.settings.viewMode;
  const root = document.documentElement;
  root.classList.toggle('view-mobile', mode === 'mobile');   // 寬螢幕上強制單欄＋底部導覽（見 phase5.css）
  root.classList.toggle('view-desktop', mode === 'desktop');
  const meta = document.getElementById('meta-viewport');
  const next = mode === 'desktop' ? VIEWPORT_DESKTOP : VIEWPORT_DEFAULT;
  if (meta && meta.getAttribute('content') !== next) meta.setAttribute('content', next);
}

document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    store.setSettings({ theme: isDark() ? 'light' : 'dark' });
    if (parseHash().name === 'settings') renderRoute();
  });
});

/* ---------- Router ---------- */
// 格式：#/<tab> 或 #/<tab>/<param>（例如 #/library/grp_xxx）
function parseHash() {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/');
  if (!routes[name]) return { name: DEFAULT_ROUTE, param: null };
  return { name, param: param ? decodeURIComponent(param) : null };
}

function renderRoute() {
  const { name, param } = parseHash();
  const { title, view } = routes[name];

  document.querySelectorAll('[data-view]').forEach((el) => {
    const active = el.dataset.view === name;
    el.hidden = !active;
    if (active) {
      view.render(el, param);
      el.classList.remove('view-enter');
      void el.offsetWidth; // 重新觸發淡入動畫
      el.classList.add('view-enter');
    }
  });

  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  document.getElementById('page-title').textContent = title;
  document.title = `${title}｜WordQuest 單字探索記`;
  window.scrollTo(0, 0);
  refreshIcons();
}

window.addEventListener('hashchange', renderRoute);

/* ---------- Header：搜尋與 ★ 收藏專區 ---------- */
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const starBtn = document.getElementById('star-filter');

function syncHeader() {
  const { query, starredOnly } = store.ui;
  starBtn.classList.toggle('star-active', starredOnly);
  starBtn.setAttribute('aria-pressed', String(starredOnly));
  searchClear.hidden = !query && !searchInput.value;
  if (document.activeElement !== searchInput && searchInput.value !== query) searchInput.value = query;
}

// 搜尋與收藏都只在「單字庫」分頁顯示結果
function showLibrary() {
  if (parseHash().name === 'library') renderRoute();
  else location.hash = '#/library';
}

let searchTimer;
searchInput.addEventListener('input', () => {
  searchClear.hidden = !searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    store.setUI({ query: searchInput.value.trim() });
    showLibrary();
  }, 200);
});

function clearSearch() {
  searchInput.value = '';
  store.setUI({ query: '' });
  showLibrary();
}
searchClear.addEventListener('click', () => { clearSearch(); searchInput.focus(); });
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSearch(); });
document.getElementById('search-form').addEventListener('submit', (e) => e.preventDefault());

starBtn.addEventListener('click', () => {
  store.setUI({ starredOnly: !store.ui.starredOnly });
  showLibrary();
});

// 點「單字庫」入口（Tab、Logo）時清掉搜尋與收藏篩選
document.querySelectorAll('a[href="#/library"]').forEach((a) => {
  a.addEventListener('click', () => {
    if (!store.ui.query && !store.ui.starredOnly) return;
    searchInput.value = '';
    store.setUI({ query: '', starredOnly: false });
    if (location.hash === '#/library') renderRoute(); // hash 沒變就不會觸發 hashchange
  });
});

store.subscribe(() => { applyTheme(); applyViewMode(); syncHeader(); });

initI18n(); // 介面語言（中文／English／中英），要在第一次畫面渲染前啟動
initSpeakButtons();
applyTheme();
applyViewMode();
syncHeader();
renderRoute();
initBackupReminder();
cloud.resume(); // 之前連過 Gist／Firebase 的話，自動恢復連線與同步（Google Drive 需要按一次「連結」）
setTimeout(maybeShowOnboarding, 500); // 第一次使用時跳出新手導覽
