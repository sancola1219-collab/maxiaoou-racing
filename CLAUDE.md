# 馬小歐賽車

**接手先讀 `HANDOFF.md`（細節唯一正解）。**

紅線摘要（與 HANDOFF.md / AGENTS.md 三處同步）：
1. three.js 鎖 r149 UMD，不升 r150+（會失去 `<script>` 載入、file:// 離線可玩性）
2. 改版必調 index.html 的 `?v=N` 快取號（10 個標籤一起 +1）
3. AI 狀態機的多重退出條件不可刪（曾發生甩尾鎖死繞圈事故）
4. 純 vanilla JS 零依賴、拒絕照片貼圖（全程序化美術）

擴充內容（賽道/角色/主題/盃賽）只改 `js/data/tracks.js` 資料層。
測試用 `window.GameTest`（手動推幀 + 狀態取樣），詳見 HANDOFF §測試法。
