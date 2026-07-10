# 馬小歐賽車 — 交接文件（唯一正解）

3D 卡丁賽車遊戲（類瑪利歐賽車）。24 條賽道 × 6 盃賽 × 8 車手，含 14 種道具、AI 對手、甩尾噴射、金幣、賽道陷阱。
純前端、Three.js r149 打包在 repo 內（`js/three.min.js`），可離線玩。

- 線上版：https://sancola1219-collab.github.io/maxiaoou-racing/
- Repo：https://github.com/sancola1219-collab/maxiaoou-racing （push main 自動部署 Pages）
- 設計文件：`docs/superpowers/specs/2026-07-10-mario-kart-design.md`

## 給接手模型的 SOP（Codex / Claude / 其他都一樣）

1. **先讀完本檔**再動手。CLAUDE.md / AGENTS.md 只是入口摘要，細節以本檔為準。
2. **跑起來**：`npx -y http-server -p 8123 -c-1` 開 http://localhost:8123（或直接雙擊 index.html）。
3. **改之前先驗證現況**：瀏覽器 console 跑 §測試法 的 GameTest 腳本，確認 24 條賽道能完賽、console 零錯誤 —— 之後你才知道壞掉是不是你改壞的。
4. **改動原則**：加內容（賽道/角色/主題/陷阱/裝飾）優先只動 `js/data/tracks.js` 資料層；動邏輯照 §架構 找對檔案，一檔一責不要跨檔亂塞。
5. **改完必做**：index.html 全部 `?v=N` +1（目前 v=3，共 11 個標籤）→ 重跑測試 → 更新本檔（版本紀錄 + 新踩的雷）→ 紅線有變就三處同步。
6. **部署**：`git add -A && git commit && git push`（main 分支，push 即自動部署，約 30 秒生效）。
   - git 身分已設在 repo 本機 config（sancola1219-collab / sancola1220@gmail.com），不用重設
   - 這台 Windows 的 gh 不在 PATH，要用全路徑：`"C:\Program Files\GitHub CLI\gh.exe"`
   - Pages 已啟用（main 分支根目錄），不用再設定
7. **驗證上線**：`Invoke-WebRequest https://sancola1219-collab.github.io/maxiaoou-racing/js/game.js?v=<新版號>` 回 200 才算部署完成。

## 版本紀錄

| 版本 | 日期 | 內容 |
|---|---|---|
| v1 | 2026-07-10 | 初版：16 賽道×4盃賽×8車手、盃賽/單場/計時三模式、7 種道具、AI+橡皮筋、甩尾噴射、金幣、觸控、WebAudio 合成音效。當日修復 AI 甩尾鎖死事故（見紅線 3） |
| v2 | 2026-07-10 | 8 位角色專屬造型（帽/鬍/皇冠/龜殼/恐龍嘴…全員有眼睛）、車體細化+假陰影、場景豐富化（每主題 3~4 種擺設+地標+山脈+雲+氣球）、新增 hazards.js 陷阱系統（5 行為×20 模型）、角色選單 3D 縮圖、道具箱?貼圖 |
| v3 | 2026-07-11 | 賽道 16→24（月亮盃🌙 t17-20、王冠盃👑 t21-24）、新主題 4（櫻花/水底 floaty 浮力/鬼宅/太空）+ 對應地標（鳥居/沉船/鬼屋/地球）與陷阱（青蛙/魚/蝙蝠/隕石/花瓣）；道具 7→14：三重蘑菇×3、黃金蘑菇×6（HUD 顯示剩餘次數）、藍龜殼（追第 1 名爆炸）、假道具箱、炸彈（範圍爆炸）、墨魚（前方對手畫面墨漬+AI 亂飄）、火箭衝刺（3.5 秒自駕無敵）；加速時 FOV 65→76 速度感、材質快取 _lam（disposeScene 跳過 cached）、HUD DOM 快取防每幀重排 |

## 待辦池（使用者沒點頭前不要自作主張做大的）

- 手機直排版面再調（觸控按鈕位置）
- 多人同樂（分割畫面或連線）——大工程，要先問
- 更多賽道/盃賽（資料層就能加）
- 幽靈車重播（計時模式存軌跡）

## 紅線（改一處要同步 CLAUDE.md / AGENTS.md / 本檔）

1. **不要把 three.js 升到 r150+**。r150 起官方移除了 UMD 版 `three.min.js`，只剩 ES module；本專案用 `<script>` 直接載入（為了 file:// 離線可玩），升級會整個炸掉。真實事故：初建時先查過才選 r149。
2. **改版必調 `?v=N` 快取號**（index.html 內全部 11 個標籤一起 +1，目前 v=3）。GitHub Pages 快取很兇，之前專案發生過改了 JS 但玩家拿到舊檔。
3. **AI 的狀態機必須有多重退出條件**。真實事故：AI 甩尾原本只靠「彎度 < 0.22 才放開」，在連續彎道永不成立 → AI 方向鎖死繞圈衝出賽道，整場比賽卡在第 1 圈。現在退出條件有四個（彎道結束/太慢/轉向打架/超時 3 秒），改 AI 時不要刪。
4. **純 vanilla JS 零依賴**（three.min.js 是唯一例外且已本地化）、拒絕照片貼圖（美術全部程序化幾何 + Canvas 貼圖）。

## 架構（一檔一責）

| 檔案 | 職責 |
|---|---|
| `js/data/tracks.js` | **資料層**：CHARACTERS(8)、THEMES(20)、TRACKS(24)、CUPS(6)、GP_POINTS。**加賽道/角色/主題改這裡就好** |
| `js/track.js` | Track 類：Catmull-Rom 閉合曲線取樣（位置/切線/左向量）→ 路面/路緣/護欄/路基/裝飾/小地圖全部程序化生成；`nearestIdx` / `lateralOffset` / `heightAt` 是物理的基礎查詢 |
| `js/kart.js` | Kart 類：物理（加速/甩尾蓄力噴射/邊界/掉落重生/圈數/打滑）+ 車模；`buildDriver` 是 8 位角色各自的造型（帽子/皇冠/龜殼/恐龍嘴…），`buildKartMesh` 含假陰影 |
| `js/ai.js` | `computeAiInput`：前瞻導航、彎道減速、甩尾、橡皮筋（±7%~16%）、道具時機、卡住倒車 |
| `js/items.js` | ItemWorld：道具箱(?貼圖)/金幣/14 種道具（香蕉/龜殼綠紅藍/蘑菇×3種/星星/閃電/炸彈/墨魚/火箭/假箱）；`ITEM_TABLES` 是名次加權抽選表；`ITEM_USES` 是多次使用道具的次數 |
| `js/hazards.js` | HazardWorld：賽道陷阱。5 種行為（walker 橫越/roller 滾動/geyser 噴發/patch 打滑/car NPC車）× 25 種模型；設定寫在 THEMES[].hazards |
| `js/audio.js` | AudioSys：WebAudio 全合成（無音檔）；音效/引擎聲/BGM；M 鍵或按鈕靜音（localStorage `msq-muted`） |
| `js/ui.js` | UI：畫面切換、選單生成（角色/盃賽/賽道卡片）、HUD、小地圖繪製、觸控按鈕 |
| `js/game.js` | Game：固定步長主迴圈、比賽流程（倒數→比賽→結算）、GP 積分、攝影機、排名、`GameTest` 測試掛鉤 |

### 賽道表示法（核心概念）
控制點 `[x, z, 高度]` → `THREE.CatmullRomCurve3`（閉合）→ 每 ~2.2m 取樣一點（N≈400-700）。
一切都建立在取樣點上：路面網格、地面高度內插、橫向偏移（出界判定）、進度（`lap*N+idx` 排名）、小地圖、AI 導航、紅龜殼追蹤。
主題旗標：`open`（出賽道=草地減速）/ `voidFall`（掉落虛空重生，天空之城、彩虹之路）/ `grip`（冰面 0.55）/ `night`。

### 加一條新賽道的步驟
1. `TRACKS` 加一筆：`{ id, name, theme, width, laps, points: [[x,z,h?],...] }`（12~20 個控制點，閉合自動平滑）
2. 加進某個 `CUPS` 的 `tracks`（或新增盃賽）
3. `?v=N` +1，用下面的測試法跑一遍

### 加陷阱/裝飾/地標的步驟
- 陷阱：THEMES 某主題的 `hazards` 加 `{type, model, count}`；新模型在 hazards.js `buildHazardModel` 加 case + `HAZARD_RADIUS` 加半徑
- 裝飾：THEMES 的 `decos` 加 `[類型, 數量]`；新模型在 track.js `buildDecoration` 加 case
- 地標：THEMES 的 `landmark`；模型在 track.js `buildLandmark`（volcano 放賽道中心、planet 放天上，其餘放路邊）
- 角色造型都在 kart.js `buildDriver`（每人一個 case；車體/眼睛/手臂是共用件）

## 測試法（背景分頁 Canvas 測試法）

隱藏分頁不跑 rAF，遊戲已內建雙保險：(1) setInterval 備援迴圈 (2) `window.GameTest` 手動推幀。
本機起伺服器後在 console：

```js
GameTest.startRace('t16', 'single');        // 直接開賽（跳過選單）
for (let i=0;i<240;i++) GameTest.step(1/60); // 手動推幀（倒數 3.8 秒）
GameTest.setInput({accel:true, steer:0, brake:false, drift:false, item:false}); // 覆寫玩家輸入
GameTest.state();                            // 取狀態：圈數/名次/道具/所有車
// AI 自動駕駛玩家跑完全場：
const w = Game.world;
while (Game.phase !== 'results') { Game.testInput = computeAiInput(w.player, w, 1/60); Game.update(1/60); }
```

畫面驗證用像素取樣（screenshot 工具對 WebGL 畫布會逾時）：render 後**同步** `drawImage` 到 2D canvas 再 `getImageData`（renderer 沒開 preserveDrawingBuffer，跨 task 會拿到空白）。

驗收清單：24 條賽道 AI 全場跑完（`minLap >= 3`）、盃賽 4 場積分累計、計時模式存紀錄（`msq-tt-<trackId>`）、console 零錯誤。

## 已踩地雷

- **AI 甩尾鎖死**（見紅線 3）。
- **preview_screenshot 對 WebGL 逾時**：不是遊戲 bug，改用像素取樣。
- **加速度模型**：曾寫成「離目標速度越遠加速越慢」的怪公式，改為線性趨近（`speed += rate*dt` 夾到 target）。手感參數都在 Kart constructor 前幾行。
- **左向量手性**：y-up 右手座標，`left = (tan.z, 0, -tan.x)`；heading 增加=左轉。改轉向/偏移符號前先想清楚，兩處要一致（track.js 與 kart.js）。
- **無視口分頁 canvas 是 0×0**：Claude 的 browser pane（或無頭環境）`window.innerWidth = 0` → renderer 是 0×0，`drawImage` 直接丟 InvalidStateError。像素取樣前先 `Game.renderer.setSize(800, 450)` 手動給尺寸即可離屏渲染。
- **主題旗標 `floaty`**（水底）：跳更高、重力 24→10。它改 kart.js 的跳躍/重力常數，調手感時記得水底是特例。
- **材質快取 `_lam`**（track.js）：同色 Lambert 材質全場共用一份、標記 `userData.cached`，disposeScene 會跳過不銷毀。**絕不要改 `_lam` 回傳材質的顏色**，會污染所有用同色的模型。

## 本機開發

```
npx -y http-server -p 8123 -c-1    # 或任何靜態伺服器；.claude/launch.json 已設定
```
直接雙擊 index.html（file://）也能玩（這就是選 UMD three.js 的原因）。
