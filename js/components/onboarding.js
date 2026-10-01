// 新手導覽：三張動畫卡片（建立群組 → 翻卡與雙語發音 → 6 大模式）
import { store } from '../store.js';
import { openDialog, cls } from '../ui.js';

const MODE_ITEMS = [
  ['gallery-horizontal', '翻卡'], ['link-2', '連連看'], ['ear', '聽音辨識'],
  ['timer', '限時速刷'], ['text-cursor-input', '單字填空'], ['keyboard', '默寫練習']
];

function demoGroup() {
  return `
    <div class="ob-stage" aria-hidden="true">
      <div class="ob-folder">
        <span class="ob-folder-icon"><i data-lucide="layers" class="size-5"></i></span>
        <span class="min-w-0 text-left">
          <b class="block">水果</b>
          <small>常見水果單字</small>
        </span>
        <span class="ob-badge">3 個單字</span>
      </div>
      <div class="ob-chips">
        <span class="ob-chip" style="--d:.7s">apple　蘋果</span>
        <span class="ob-chip" style="--d:1.1s">banana　香蕉</span>
        <span class="ob-chip" style="--d:1.5s">grape　葡萄</span>
      </div>
    </div>`;
}

function demoFlip() {
  return `
    <div class="ob-stage" aria-hidden="true">
      <div class="ob-swipe">
        <div class="ob-card">
          <div class="ob-face ob-front"><span>apple</span><small>/ˈæp.əl/</small></div>
          <div class="ob-face ob-back">蘋果</div>
        </div>
      </div>
      <div class="ob-speak"><i data-lucide="volume-2" class="size-4"></i>apple ➜ 蘋果</div>
    </div>`;
}

function demoModes() {
  return `
    <div class="ob-stage" aria-hidden="true">
      <div class="ob-modes">
        ${MODE_ITEMS.map(([icon, label], i) => `
          <span class="ob-mode" style="--d:${(i * 0.15).toFixed(2)}s">
            <i data-lucide="${icon}" class="size-5"></i>${label}
          </span>`).join('')}
      </div>
    </div>`;
}

const STEPS = [
  {
    title: '建立你的第一個群組',
    text: '到「單字庫」按「新增群組」，取名叫「水果」。再按「新增單字」，輸入 apple 和「蘋果」；音標、例句、圖片都是選填。',
    demo: demoGroup
  },
  {
    title: '翻卡、滑動、聽雙語發音',
    text: '點卡片翻面看中文，左右滑動換下一張。按喇叭會先唸英文，再接著唸中文；語速和連讀可以在設定調整。',
    demo: demoFlip
  },
  {
    title: '6 種模式，換個方式記單字',
    text: '到「測驗」先選範圍（全部、群組或收藏）和順序，再挑翻卡、連連看、聽音辨識、限時速刷、單字填空或默寫練習。',
    demo: demoModes
  }
];

export function showOnboarding() {
  let step = 0;
  const dlg = openDialog('<div id="ob-root"></div>');
  dlg.setAttribute('aria-label', '新手導覽');
  const body = dlg.querySelector('#ob-root');

  const draw = () => {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    body.innerHTML = `
      <div class="grid gap-4">
        <div class="ob-slide grid gap-4">
          ${s.demo()}
          <div>
            <h2 class="text-lg font-bold">${s.title}</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">${s.text}</p>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3">
          <div class="flex gap-1.5" role="img" aria-label="第 ${step + 1} 步，共 ${STEPS.length} 步">
            ${STEPS.map((_, i) => `<span class="ob-dot ${i === step ? 'ob-dot-on' : ''}"></span>`).join('')}
          </div>
          <div class="flex gap-2">
            ${last ? '' : `<button type="button" data-skip class="${cls.btnGhost}">略過</button>`}
            ${step > 0 ? `<button type="button" data-prev class="${cls.btnGhost}">上一步</button>` : ''}
            <button type="button" data-next class="${cls.btnPrimary}">${last ? '開始使用' : '下一步'}</button>
          </div>
        </div>
      </div>`;
    window.lucide?.createIcons();
    body.querySelector('[data-next]').focus();
  };

  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-skip]')) dlg.close();
    else if (e.target.closest('[data-prev]')) { step--; draw(); }
    else if (e.target.closest('[data-next]')) {
      if (step === STEPS.length - 1) dlg.close(); else { step++; draw(); }
    }
  });

  // 不管是看完、略過、按 Esc 還是點背景，都算看過導覽
  dlg.addEventListener('close', () => {
    if (!store.state.settings.onboarded) store.setSettings({ onboarded: true });
  });
  draw();
}

/** 第一次使用（沒看過導覽、而且還沒有任何單字）時自動跳出 */
export function maybeShowOnboarding() {
  const { onboarded } = store.state.settings;
  if (!onboarded && store.state.words.length === 0) showOnboarding();
}
