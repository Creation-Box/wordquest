// 共用 UI 工具：跳脫、樣式常數、對話框、提示訊息
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const cls = {
  card: 'wq-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm',
  btnPrimary: 'wq-primary inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-teal-950 px-4 py-2.5 text-sm font-medium',
  btnGhost: 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50',
  btnDanger: 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 text-sm font-medium',
  iconBtn: 'wq-icon grid place-items-center size-9 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800',
  input: 'wq-input w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-normal outline-none focus:border-teal-600 dark:focus:border-teal-400'
};

const refreshIcons = () => window.lucide?.createIcons();

export function openDialog(html) {
  const dlg = document.createElement('dialog');
  dlg.className = 'wq-dialog';
  dlg.innerHTML = `<div class="p-5">${html}</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // 點背景關閉
  dlg.showModal();
  refreshIcons();
  return dlg;
}

/** 表單對話框：回傳表單資料物件；取消則回傳 null。validate 回傳錯誤訊息字串即擋下送出。 */
export function formDialog(html, validate, onMount) {
  return new Promise((resolve) => {
    const dlg = openDialog(html);
    const form = dlg.querySelector('form');
    const err = form.querySelector('[data-error]');
    let result = null;
    dlg.addEventListener('close', () => resolve(result));
    form.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const msg = validate ? validate(data) : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      result = data;
      dlg.close();
    });
    if (onMount) onMount(form, dlg);
    form.querySelector('input, textarea, select')?.focus();
  });
}

export function confirmDialog({ title, message, confirmText = '刪除' }) {
  return new Promise((resolve) => {
    const dlg = openDialog(`
      <div class="grid gap-4">
        <h2 class="text-lg font-bold">${esc(title)}</h2>
        <p class="text-sm text-slate-600 dark:text-slate-300">${esc(message)}</p>
        <div class="flex justify-end gap-2">
          <button type="button" data-cancel class="${cls.btnGhost}">取消</button>
          <button type="button" data-ok class="${cls.btnDanger}">${esc(confirmText)}</button>
        </div>
      </div>`);
    let ok = false;
    dlg.addEventListener('close', () => resolve(ok));
    dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    dlg.querySelector('[data-ok]').addEventListener('click', () => { ok = true; dlg.close(); });
  });
}

export function toast(message) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-50 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 text-sm shadow-lg';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
