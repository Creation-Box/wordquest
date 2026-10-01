// 群組／單字庫：群組與單字卡的新增、編輯、刪除（CRUD）、搜尋、收藏、圖片搜尋
import { store, POS_LABELS, FAMILIARITY_LABELS } from '../store.js';
import { isSupported } from '../tts.js';
import { searchImages, trackDownload } from '../images.js';
import { esc, cls, formDialog, confirmDialog, toast } from '../ui.js';

let root = null;
let param = null; // 目前所在群組 ID（單字列表頁）

const badge = {
  New: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Learning: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  Mastered: 'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300'
};

export function render(el, p = null) {
  root = el;
  param = p;
  const { query, starredOnly } = store.ui;
  const group = param ? store.getGroup(param) : null;

  if (query || starredOnly) renderResults();
  else if (group) renderGroupDetail(group);
  else renderGroups();

  root.onclick = onClick;
  root.querySelectorAll('img[data-wq-img]').forEach((img) =>
    img.addEventListener('error', () => img.remove(), { once: true }));
  window.lucide?.createIcons();
}

const rerender = () => render(root, param);

/* ---------- 版面片段 ---------- */
function heading(titleHtml, actionsHtml = '', sub = '') {
  return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div class="min-w-0">
        <h2 class="text-xl font-bold break-words">${titleHtml}</h2>
        ${sub ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5">${esc(sub)}</p>` : ''}
      </div>
      <div class="flex flex-wrap items-center gap-2">${actionsHtml}</div>
    </div>`;
}

function emptyState(icon, title, text, actionHtml = '') {
  return `
    <div class="grid place-items-center text-center py-16 gap-4">
      <span class="grid place-items-center size-16 rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300">
        <i data-lucide="${icon}" class="size-8"></i>
      </span>
      <div>
        <h3 class="text-lg font-bold">${title}</h3>
        <p class="mt-1 text-slate-500 dark:text-slate-400">${text}</p>
      </div>
      ${actionHtml}
    </div>`;
}

const grid = (items) =>
  `<div class="masonry columns-1 sm:columns-2 xl:columns-3 gap-4">${items.join('')}</div>`;

/* ---------- 群組列表 ---------- */
function renderGroups() {
  const groups = store.getGroups().reverse();
  const addGroupBtn = `<button type="button" data-action="add-group" class="${cls.btnPrimary}"><i data-lucide="plus" class="size-4"></i>新增群組</button>`;
  const addWordBtn = groups.length
    ? `<button type="button" data-action="add-word" data-group="${esc(store.getGroups()[0].groupId)}" class="${cls.btnGhost}"><i data-lucide="book-plus" class="size-4"></i>新增單字</button>`
    : '';

  root.innerHTML = heading('群組／單字庫', addWordBtn + addGroupBtn) + (groups.length
    ? grid(groups.map(groupCard))
    : emptyState('layers', '還沒有群組', '建立第一個群組，再把單字加進去。', addGroupBtn));
}

function groupCard(g) {
  const n = store.countWords(g.groupId);
  return `
    <article class="relative ${cls.card} p-5">
      <a href="#/library/${encodeURIComponent(g.groupId)}" class="block font-bold text-lg break-words after:absolute after:inset-0 after:rounded-2xl">${esc(g.groupName)}</a>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400 break-words">${esc(g.description) || '沒有說明'}</p>
      <div class="mt-4 flex items-center justify-between">
        <span class="text-sm text-slate-600 dark:text-slate-300">${n} 個單字</span>
        <div class="relative z-10 flex">
          <button type="button" data-action="edit-group" data-id="${esc(g.groupId)}" aria-label="編輯群組" class="${cls.iconBtn}"><i data-lucide="pencil" class="size-4"></i></button>
          <button type="button" data-action="delete-group" data-id="${esc(g.groupId)}" aria-label="刪除群組" class="${cls.iconBtn}"><i data-lucide="trash-2" class="size-4"></i></button>
        </div>
      </div>
    </article>`;
}

/* ---------- 群組內的單字 ---------- */
function renderGroupDetail(g) {
  const words = store.getWordsByGroup(g.groupId).reverse();
  const addBtn = `<button type="button" data-action="add-word" data-group="${esc(g.groupId)}" class="${cls.btnPrimary}"><i data-lucide="plus" class="size-4"></i>新增單字</button>`;

  root.innerHTML = `
    <a href="#/library" class="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3">
      <i data-lucide="chevron-left" class="size-4"></i>全部群組
    </a>`
    + heading(esc(g.groupName), words.length ? addBtn : '', g.description)
    + (words.length
      ? grid(words.map((w) => wordCard(w)))
      : emptyState('book-plus', '這個群組還沒有單字', '新增第一個單字開始收集。', addBtn));
}

/* ---------- 搜尋／收藏結果 ---------- */
function renderResults() {
  const { query, starredOnly } = store.ui;
  const words = store.queryWords({ text: query, starredOnly }).reverse();
  const title = starredOnly
    ? (query ? `收藏中符合「${query}」的單字` : '收藏單字')
    : `搜尋「${query}」`;

  root.innerHTML = heading(esc(title),
    `<button type="button" data-action="clear-filters" class="${cls.btnGhost}"><i data-lucide="x" class="size-4"></i>清除篩選</button>`,
    `${words.length} 個單字`)
    + (words.length
      ? grid(words.map((w) => wordCard(w, true)))
      : emptyState(starredOnly ? 'star' : 'search-x',
          starredOnly && !query ? '還沒有收藏單字' : '找不到符合的單字',
          starredOnly && !query ? '點單字卡右上角的星號就能收藏。' : '換個關鍵字試試看。'));
}

/* ---------- 單字卡（音標／詞性／中文／★／🔊／刪除） ---------- */
function creditHtml(img) {
  if (!img.credit) return '';
  return `<p class="px-4 pt-2 text-[11px] text-slate-500 dark:text-slate-400">Photo by
    <a href="${esc(img.credit.url)}" target="_blank" rel="noopener noreferrer" class="underline">${esc(img.credit.name)}</a> on
    <a href="https://unsplash.com/?utm_source=wordquest&utm_medium=referral" target="_blank" rel="noopener noreferrer" class="underline">Unsplash</a></p>`;
}

function wordCard(w, showGroup = false) {
  const g = showGroup ? store.getGroup(w.groupId) : null;
  const meta = [w.phonetic, POS_LABELS[w.partOfSpeech]].filter(Boolean).map(esc).join('　');
  return `
    <article class="${cls.card} overflow-hidden">
      ${w.image.url ? `<img data-wq-img src="${esc(w.image.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="w-full max-h-56 object-cover">${creditHtml(w.image)}` : ''}
      <div class="p-4">
        ${g ? `<a href="#/library/${encodeURIComponent(g.groupId)}" class="text-xs text-slate-500 dark:text-slate-400 hover:underline">${esc(g.groupName)}</a>` : ''}
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="font-display text-xl font-bold break-words">${esc(w.word)}</h3>
            ${meta ? `<p class="text-sm text-slate-500 dark:text-slate-400">${meta}</p>` : ''}
          </div>
          <button type="button" data-action="toggle-star" data-id="${esc(w.id)}" aria-pressed="${w.isStarred}" aria-label="${w.isStarred ? '取消收藏' : '收藏'}"
            class="${cls.iconBtn} ${w.isStarred ? 'star-active' : ''}">
            <i data-lucide="star" class="size-5"></i>
          </button>
        </div>
        <p class="mt-2 font-medium break-words">${esc(w.translation)}</p>
        ${w.example ? `<p class="mt-2 text-sm italic text-slate-500 dark:text-slate-400 break-words">${esc(w.example)}</p>` : ''}
        <div class="mt-3 flex items-center justify-between">
          <span class="rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[w.familiarity]}">${FAMILIARITY_LABELS[w.familiarity]}</span>
          <div class="flex">
            ${isSupported ? `<button type="button" data-speak="${esc(w.id)}" aria-label="播放發音" class="${cls.iconBtn}"><i data-lucide="volume-2" class="size-4"></i></button>` : ''}
            <button type="button" data-action="edit-word" data-id="${esc(w.id)}" aria-label="編輯單字" class="${cls.iconBtn}"><i data-lucide="pencil" class="size-4"></i></button>
            <button type="button" data-action="delete-word" data-id="${esc(w.id)}" aria-label="刪除單字" class="${cls.iconBtn}"><i data-lucide="trash-2" class="size-4"></i></button>
          </div>
        </div>
      </div>
    </article>`;
}

/* ---------- 事件（🔊 由 tts.js 的全局監聽處理） ---------- */
async function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  switch (action) {
    case 'add-group': {
      const data = await groupForm();
      if (data) { store.addGroup(data); toast('已新增群組'); rerender(); }
      break;
    }
    case 'edit-group': {
      const data = await groupForm(store.getGroup(id));
      if (data) { store.updateGroup(id, data); toast('已儲存群組'); rerender(); }
      break;
    }
    case 'delete-group': {
      const g = store.getGroup(id);
      const n = store.countWords(id);
      const ok = await confirmDialog({
        title: `刪除「${g.groupName}」？`,
        message: n ? `群組內的 ${n} 個單字也會一併刪除，無法復原。` : '此動作無法復原。'
      });
      if (!ok) break;
      store.deleteGroup(id);
      toast('已刪除群組');
      if (param === id) location.hash = '#/library'; else rerender();
      break;
    }
    case 'add-word': { // 預設帶入目前群組，表單內可改選
      const data = await wordForm(null, btn.dataset.group || param);
      if (data) {
        store.addWord(data.groupId, data);
        toast(`已新增到「${store.getGroup(data.groupId).groupName}」`);
        rerender();
      }
      break;
    }
    case 'edit-word': {
      const data = await wordForm(store.getWord(id));
      if (data) { store.updateWord(id, data); toast('已儲存單字'); rerender(); }
      break;
    }
    case 'delete-word': {
      const w = store.getWord(id);
      if (await confirmDialog({ title: `刪除「${w.word}」？`, message: '此動作無法復原。' })) {
        store.deleteWord(id); toast('已刪除單字'); rerender();
      }
      break;
    }
    case 'toggle-star':
      store.toggleStar(id); rerender();
      break;
    case 'clear-filters':
      store.setUI({ query: '', starredOnly: false });
      rerender();
      break;
  }
}

/* ---------- 表單 ---------- */
const field = (label, inner, extra = '') =>
  `<label class="grid gap-1 text-sm font-medium ${extra}">${label}${inner}</label>`;

function groupForm(g = null) {
  return formDialog(`
    <form class="grid gap-4" novalidate>
      <h2 class="text-lg font-bold">${g ? '編輯群組' : '新增群組'}</h2>
      ${field('群組名稱', `<input name="groupName" maxlength="30" value="${esc(g?.groupName)}" placeholder="例如：水果" class="${cls.input}">`)}
      ${field('說明（選填）', `<input name="description" maxlength="80" value="${esc(g?.description)}" placeholder="例如：常見水果單字" class="${cls.input}">`)}
      <p data-error hidden class="text-sm text-red-600 dark:text-red-400"></p>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancel class="${cls.btnGhost}">取消</button>
        <button type="submit" class="${cls.btnPrimary}">儲存</button>
      </div>
    </form>`,
  (d) => (d.groupName.trim() ? '' : '請輸入群組名稱'));
}

/** w 有值＝編輯；否則是新增，defaultGroupId 為預設所屬群組 */
function wordForm(w = null, defaultGroupId = null) {
  const groups = store.getGroups();
  const curGroup = w?.groupId || defaultGroupId || groups[0]?.groupId;
  const options = (map, cur, blank) =>
    (blank ? `<option value="">${blank}</option>` : '')
    + Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  const groupOptions = groups.map((g) =>
    `<option value="${esc(g.groupId)}" ${g.groupId === curGroup ? 'selected' : ''}>${esc(g.groupName)}</option>`).join('');

  return formDialog(`
    <form class="grid gap-4 max-h-[75dvh] overflow-y-auto -mx-1 px-1" novalidate>
      <h2 class="text-lg font-bold">${w ? '編輯單字' : '新增單字'}</h2>
      ${field('所屬群組', `<select name="groupId" class="${cls.input}">${groupOptions}</select>`)}
      <div class="grid gap-4 sm:grid-cols-2">
        ${field('單字', `<input name="word" maxlength="60" value="${esc(w?.word)}" placeholder="apple" class="${cls.input}">`)}
        ${field('音標（選填）', `<input name="phonetic" maxlength="60" value="${esc(w?.phonetic)}" placeholder="/ˈæp.əl/" class="${cls.input}">`)}
        ${field('詞性', `<select name="partOfSpeech" class="${cls.input}">${options(POS_LABELS, w?.partOfSpeech, '未指定')}</select>`)}
        ${field('熟悉度', `<select name="familiarity" class="${cls.input}">${options(FAMILIARITY_LABELS, w?.familiarity || 'New')}</select>`)}
      </div>
      ${field('中文翻譯', `<input name="translation" maxlength="100" value="${esc(w?.translation)}" placeholder="蘋果" class="${cls.input}">`)}
      ${field('例句（選填）', `<textarea name="example" rows="2" maxlength="300" class="${cls.input}">${esc(w?.example)}</textarea>`)}

      <div class="grid gap-1 text-sm font-medium">
        <label for="wf-image">圖片（選填）</label>
        <div class="flex gap-2">
          <input id="wf-image" name="imageUrl" inputmode="url" value="${esc(w?.image.url)}" placeholder="貼上圖片網址，或按「搜尋圖片」" class="${cls.input}">
          <button type="button" data-img-search class="${cls.btnGhost} shrink-0"><i data-lucide="image-plus" class="size-4"></i>搜尋圖片</button>
        </div>
        <input type="hidden" name="creditName" value="${esc(w?.image.credit?.name)}">
        <input type="hidden" name="creditUrl" value="${esc(w?.image.credit?.url)}">
        <img data-img-preview alt="" hidden referrerpolicy="no-referrer" class="mt-1 h-28 w-full rounded-xl object-cover">
        <div data-img-panel hidden class="mt-1"></div>
      </div>

      <label class="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="isStarred" ${w?.isStarred ? 'checked' : ''} class="size-4 accent-teal-700 dark:accent-teal-400">加入收藏
      </label>
      <p data-error hidden class="text-sm text-red-600 dark:text-red-400"></p>
      <div class="flex justify-end gap-2">
        <button type="button" data-cancel class="${cls.btnGhost}">取消</button>
        <button type="submit" class="${cls.btnPrimary}">儲存</button>
      </div>
    </form>`,
  (d) => {
    if (!store.getGroup(d.groupId)) return '請先選擇所屬群組';
    if (!d.word.trim()) return '請輸入單字';
    if (!d.translation.trim()) return '請輸入中文翻譯';
    if (d.imageUrl.trim() && !/^https?:\/\//i.test(d.imageUrl.trim())) return '圖片網址需以 http:// 或 https:// 開頭';
    return '';
  },
  mountImagePicker).then((d) => d && ({
    ...d,
    isStarred: d.isStarred === 'on',
    imageCredit: d.creditName && d.creditUrl ? { name: d.creditName, url: d.creditUrl } : null
  }));
}

/* ---------- 「搜尋圖片」：Unsplash（有 Key）／免 Key 圖庫 ---------- */
function mountImagePicker(form) {
  const urlInput = form.elements.imageUrl;
  const credName = form.elements.creditName;
  const credUrl = form.elements.creditUrl;
  const panel = form.querySelector('[data-img-panel]');
  const preview = form.querySelector('[data-img-preview]');
  const err = form.querySelector('[data-error]');
  let searching = false;

  const showPreview = () => {
    const u = urlInput.value.trim();
    preview.hidden = !/^https?:\/\//i.test(u);
    if (!preview.hidden) preview.src = u;
  };
  showPreview();

  urlInput.addEventListener('input', () => { credName.value = ''; credUrl.value = ''; }); // 手動改網址＝不再是同一張照片
  urlInput.addEventListener('change', showPreview);
  preview.addEventListener('error', () => { preview.hidden = true; });

  form.querySelector('[data-img-search]').addEventListener('click', async () => {
    const q = form.elements.word.value.trim();
    if (!q) {
      err.textContent = '請先輸入單字，再搜尋圖片';
      err.hidden = false;
      form.elements.word.focus();
      return;
    }
    if (searching) return;
    searching = true;
    err.hidden = true;
    panel.hidden = false;
    panel.innerHTML = '<p class="text-sm font-normal text-slate-500 dark:text-slate-400">搜尋中…</p>';

    const key = store.state.settings.unsplashKey;
    const res = await searchImages(q, { key });
    searching = false;

    panel.innerHTML = `
      <p class="mb-2 text-xs font-normal text-slate-500 dark:text-slate-400">${esc(res.note)}</p>
      <div class="grid grid-cols-3 gap-2">
        ${res.items.map((it, i) => `
          <button type="button" data-pick="${i}" aria-label="選用第 ${i + 1} 張圖片" class="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-600 focus-visible:border-teal-600">
            <img src="${esc(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="aspect-[3/2] w-full object-cover">
          </button>`).join('')}
      </div>`;
    panel.querySelectorAll('img').forEach((img) =>
      img.addEventListener('error', () => img.closest('button')?.remove(), { once: true }));

    panel.onclick = (e) => {
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const item = res.items[Number(pick.dataset.pick)];
      urlInput.value = item.url;
      credName.value = item.credit?.name || '';
      credUrl.value = item.credit?.url || '';
      showPreview();
      panel.hidden = true;
      trackDownload(item, key);
    };
  });
}
