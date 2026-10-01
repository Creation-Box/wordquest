// 圖片搜尋：Unsplash API（需 Key）＋ 免 Key 圖庫備援
const UTM = 'utm_source=wordquest&utm_medium=referral';

async function searchUnsplash(query, key) {
  const params = new URLSearchParams({ query, per_page: '9', orientation: 'landscape' });
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }
  });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return (data.results || []).map((p) => ({
    thumb: p.urls.thumb,
    url: p.urls.small,
    credit: { name: p.user.name, url: `${p.user.links.html}?${UTM}` },
    downloadLocation: p.links.download_location
  }));
}

// 免 Key：依關鍵字取圖，lock 固定亂數種子，同一個網址每次載入都是同一張
function searchKeyless(query) {
  const kw = query.trim().toLowerCase().split(/\s+/).map(encodeURIComponent).join(',');
  const seed = [...query].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 900;
  return Array.from({ length: 6 }, (_, i) => {
    const url = `https://loremflickr.com/480/320/${kw}?lock=${seed + i}`;
    return { thumb: url, url, credit: null, downloadLocation: null };
  });
}

/** 回傳 { source, note, items }；有 Key 先用 Unsplash，失敗或無結果就退回免 Key 圖庫 */
export async function searchImages(query, { key = '' } = {}) {
  let note;
  if (key) {
    try {
      const items = await searchUnsplash(query, key);
      if (items.length) return { source: 'unsplash', note: '圖片來自 Unsplash', items };
      note = 'Unsplash 找不到相關圖片，改用免 Key 圖庫。';
    } catch (e) {
      note = e.message === '401' ? 'Unsplash Key 無效，改用免 Key 圖庫。'
        : e.message === '403' ? 'Unsplash 已達使用上限，改用免 Key 圖庫。'
        : 'Unsplash 連線失敗，改用免 Key 圖庫。';
    }
  } else {
    note = '尚未設定 Unsplash Key，使用免 Key 圖庫（相關度較低）。可到「系統設定」填入 Key，或直接貼上圖片網址。';
  }
  return { source: 'keyless', note, items: searchKeyless(query) };
}

/** Unsplash API 規範：使用者選用照片時要回報一次 download */
export function trackDownload(item, key) {
  if (!item?.downloadLocation || !key) return;
  fetch(item.downloadLocation, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
}
