# 馬小歐賽車

**接手先讀 `HANDOFF.md`（細節唯一正解，含接手 SOP、版本紀錄、架構、測試法、地雷）。**

## 快速上手（30 秒版）

- 跑遊戲：`npx -y http-server -p 8123 -c-1` → http://localhost:8123
- 驗證：console 跑 `GameTest.startRace('t01','single')` + 手動推幀，詳見 HANDOFF §測試法
- 加內容（賽道/角色/主題/陷阱）只改 `js/data/tracks.js` 資料層
- 部署：commit + push main 即上線（git 身分已設在 repo config；gh 要全路徑 `"C:\Program Files\GitHub CLI\gh.exe"`）
- 改完必調 index.html 的 `?v=N` 快取號，並更新 HANDOFF 版本紀錄

## 紅線摘要（與 HANDOFF.md / AGENTS.md 三處同步）

1. three.js 鎖 r149 UMD，不升 r150+（會失去 `<script>` 載入、file:// 離線可玩性）
2. 改版必調 index.html 的 `?v=N` 快取號（13 個標籤一起 +1，目前 v=5）
3. AI 狀態機的多重退出條件不可刪（曾發生甩尾鎖死繞圈事故）
4. 純 vanilla JS 零依賴、拒絕照片貼圖（全程序化美術）
