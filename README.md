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
- 學習模式：翻卡、左右滑動、雙語發音
- 測驗模式：連連看、聽音辨識、限時速刷、單字填空、默寫練習（翻卡導向學習模式）
- 系統設定：主題、檢視模式、語音與語速、Unsplash Key、群組 JSON／CSV 匯入匯出、完整備份與還原、每 20 個單字的備份提醒、雲端同步介面（預留）、新手導覽

## 檔案結構
    index.html
    css/custom.css, css/phase5.css
    js/app.js            Router、主題、檢視模式、搜尋
    js/store.js          LocalStorage 資料層
    js/ui.js             共用 UI（對話框、toast、樣式常數）
    js/tts.js            Web Speech 雙語發音
    js/images.js         圖片搜尋
    js/backup.js         匯入匯出、備份與提醒
    js/cloud.js          雲端同步 adapter 介面（尚未接實際服務）
    js/components/       group、flashcard、modes、settings、onboarding

## 備註
- 完整備份檔含 Unsplash Key，分享前請留意。
- 雲端同步要接 Google Drive／Firebase，請照 `js/cloud.js` 開頭的說明註冊 adapter。
