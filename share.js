// 群組分享：把一個群組存成你 GitHub 帳號下的 secret gist，朋友貼上連結就能匯入（朋友不需要登入或 token）
import { store } from './store.js';
import { ghApi } from './cloud-adapters.js';

const SHARE_FILE = 'wordquest_group.json';

/** 產生分享連結；回傳 { url, count }。沒有 token 會丟出 NO_TOKEN */
export async function shareGroup(groupId) {
  if (!store.state.settings.githubToken.trim()) throw new Error('NO_TOKEN');
  const g = store.getGroup(groupId);
  const words = store.getWordsByGroup(groupId);
  if (!g || !words.length) throw new Error('這個群組還沒有單字可以分享。');

  // 只分享單字內容，不含個人的收藏與熟悉度
  const data = {
    app: 'wordquest', type: 'group', version: store.state.version, exportedAt: new Date().toISOString(),
    group: { groupName: g.groupName, description: g.description },
    words: words.map((w) => ({
      word: w.word, phonetic: w.phonetic, partOfSpeech: w.partOfSpeech,
      translation: w.translation, example: w.example, imageUrl: w.image.url
    }))
  };
  const res = await ghApi('/gists', {
    method: 'POST',
    body: { description: `WordQuest 分享：${g.groupName}`, public: false, files: { [SHARE_FILE]: { content: JSON.stringify(data, null, 2) } } }
  });
  const gist = await res.json();
  return { url: gist.html_url, count: words.length };
}

/** 讀取朋友分享的連結（或單純貼 gist 代碼）；回傳 { name, text }，不使用你的 token */
export async function fetchShared(input) {
  const ids = String(input || '').match(/[0-9a-f]{20,40}(?![0-9a-f])/gi);
  if (!ids) throw new Error('看不懂這個連結，請貼上完整的分享連結。');
  const res = await ghApi(`/gists/${ids[ids.length - 1]}`, { token: '' });
  if (res.status === 404) throw new Error('找不到這份分享（連結錯誤，或對方已經刪除）。');
  const files = (await res.json()).files || {};
  const file = files[SHARE_FILE] || Object.values(files).find((f) => /\.json$/i.test(f.filename));
  if (!file) throw new Error('這個連結不是 WordQuest 的分享。');
  const text = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
  let name = '';
  try { name = JSON.parse(text).group?.groupName || ''; } catch (e) { /* 交給匯入流程報錯 */ }
  return { name, text };
}
