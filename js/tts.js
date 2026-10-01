// 全局雙語 TTS 發音模組（Web Speech API）
import { store } from './store.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
export const isSupported = Boolean(synth);

const norm = (l) => (l || '').replace('_', '-').toLowerCase();

/** 所有美式英語（en-US）語音，供設定頁挑選 */
export function listEnglishVoices() {
  if (!synth) return [];
  return synth.getVoices().filter((v) => norm(v.lang) === 'en-us');
}

/** 語音清單載入完成（部分瀏覽器是非同步）時通知 */
export function onVoicesChanged(fn) {
  if (synth) synth.addEventListener('voiceschanged', fn);
}

/** 依語系挑選最合適的語音：英文先用設定頁指定的語音，再找完全相同（如 en-US），最後找同語言（如 en-GB） */
function pickVoice(lang) {
  if (!synth) return null;
  const voices = synth.getVoices();
  const want = norm(lang);
  const base = want.split('-')[0];

  if (want === 'en-us') {
    const name = store.state.settings.voiceName;
    const chosen = name && voices.find((v) => v.name === name);
    if (chosen) return chosen;
  }
  return voices.find((v) => norm(v.lang) === want)
    || voices.find((v) => norm(v.lang).startsWith(`${base}-`))
    || null;
}
if (synth) synth.getVoices(); // 預先觸發語音清單載入

/** 依序播放多段語音；回傳的 Promise 在最後一段結束（或被中斷）時 resolve */
export function speakSequence(items, rate = 1) {
  if (!synth) return Promise.resolve();
  const queue = items.filter((i) => i.text);
  synth.cancel();
  if (!queue.length) return Promise.resolve();

  return new Promise((resolve) => {
    queue.forEach((item, idx) => {
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang;
      u.rate = rate;
      const voice = pickVoice(item.lang);
      if (voice) u.voice = voice;
      if (idx === queue.length - 1) u.onend = u.onerror = () => resolve();
      synth.speak(u); // 佇列保證：英文唸完才會接著唸中文
    });
  });
}

export function speak(text, { lang = 'en-US', rate } = {}) {
  return speakSequence([{ text, lang }], rate ?? store.state.settings.speechRate);
}

/**
 * 雙語連播：先用 en-US 唸 word，接著用 zh-TW 唸 translation。
 * 語速與是否連播預設讀取設定（speechRate：1.2 / 1.0 / 0.8 / 0.5；bilingualSpeech）。
 */
export function speakWord(wordObj, { rate, bilingual } = {}) {
  const s = store.state.settings;
  const items = [{ text: wordObj.word, lang: 'en-US' }];
  if ((bilingual ?? s.bilingualSpeech) && wordObj.translation) {
    items.push({ text: wordObj.translation, lang: 'zh-TW' });
  }
  return speakSequence(items, rate ?? s.speechRate);
}

export function stop() {
  if (synth) synth.cancel();
}

/**
 * 全局發音按鈕：任何帶有 data-speak="<單字 id>" 的元素被點擊就會發音。
 * 單字清單、卡片、學習模式都只要輸出這個屬性，不必各自綁事件。
 */
export function initSpeakButtons() {
  let activeBtn = null;
  let playId = 0;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-speak]');
    if (!btn) return;
    const w = store.getWord(btn.dataset.speak);
    if (!w) return;

    activeBtn?.classList.remove('is-speaking');
    activeBtn = btn;
    btn.classList.add('is-speaking');
    const id = ++playId;
    speakWord(w).then(() => {
      if (id !== playId) return; // 已被新的播放取代
      btn.classList.remove('is-speaking');
      activeBtn = null;
    });
  });
}
