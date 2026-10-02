# WordQuest 單字探索記

純前端的單字學習 App（HTML + ES Modules + Tailwind CDN），資料只存在瀏覽器的 LocalStorage。

## 執行方式
ES Modules 不能用 `file://` 直接開，請在專案資料夾啟動本機伺服器：

    python3 -m http.server 8000
    # 瀏覽器開 http://localhost:8000

第一次載入需要網路（Tailwind、Lucide 圖示、Google Fonts 都是 CDN）。
部署時把整個資料夾放到任何靜態網站空間即可（GitHub Pages、Netlify 等）。

## 功能
- 群組／單字庫：群組與單字的新增、編輯、刪除、搜尋、★ 收藏、圖片（Unsplash 或貼網址）
- 學習模式：翻卡、左右滑動；🔊 只唸目前看到的那一面（英文面唸英文、中文面唸中文）
- 測驗模式：連連看（預設不發音，頁面上可開關）、聽音辨識、限時速刷、單字填空（隨機挖字母、至少顯示 1 個、一字母一格、可播放英文）、默寫練習（一字母一格）（翻卡導向學習模式）
  - 填空／默寫的「提示」會補上一格正確字母並鎖定，用了提示仍可列入答對
- 系統設定：主題、檢視模式、語音與語速、Unsplash Key、群組 JSON／CSV 匯入匯出、完整備份與還原、每 20 個單字的備份提醒、雲端同步（GitHub Gist／Google Drive／Firebase）、新手導覽

## 檔案結構
    index.html
    css/custom.css, css/phase5.css, css/theme.css
    js/app.js            Router、主題、檢視模式、搜尋
    js/store.js          LocalStorage 資料層
    js/ui.js             共用 UI（對話框、toast、樣式常數）
    js/tts.js            Web Speech 雙語發音
    js/images.js         圖片搜尋
    js/backup.js         匯入匯出、備份與提醒
    js/cloud.js          雲端同步引擎（狀態、衝突判斷、自動上傳）
    js/cloud-adapters.js GitHub Gist／Google Drive／Firebase 連線
    js/share.js          群組分享（產生 Gist 連結；尚未接上畫面）
    js/i18n.js           介面語言（中文／English／中英對照），依字典即時換字
    js/components/       group、flashcard、modes、settings、onboarding

## 雲端同步
三種擇一，都需要自己申請（免費），步驟在「系統設定 → 雲端同步」展開對應的設定說明：
- **GitHub Gist**：產生只勾 gist 的 classic token 貼上即可，資料放在你帳號下的 secret gist。
- **Google Drive**：建立 OAuth 用戶端 ID，資料放在 App 專屬隱藏資料夾，不碰其他檔案。
- **Firebase**：建立專案、啟用 Google 登入與 Firestore，貼上 firebaseConfig 與安全規則。

重點行為：
- 雲端只存群組與單字，不存設定與 Unsplash Key。
- 連線後單字有變動會在 3 秒後自動上傳（可關閉）。
- 兩邊內容不同時（例如另一台裝置改過），自動同步會暫停，按「立即同步」選擇保留本機或雲端。
- Gist、Firebase 重新開啟網頁會自動恢復連線；Google Drive 需要再按一次「連結」。
- 授權網域／來源要填 GitHub Pages 的網域，例如 `https://creation-box.github.io`。

## 備註
- 完整備份檔含 Unsplash Key，分享前請留意。

## v6 更新
- 版面放大：桌面版學習、測驗、系統設定改用更寬的版面（設定頁大螢幕為雙欄），大螢幕基準字級也放大。
- 系統設定新增「介面語言」：中文介面、English UI、中英介面（預設）。翻譯字典在 `js/i18n.js`，沒收錄的字串維持中文。
- 單字庫（列表與群組頁）新增「匯入單字檔」，可選群組後匯入 JSON／CSV。
- 淺色主題加上柔和漸層與卡片陰影；深色主題卡片、側欄、輸入框分層更清楚。
