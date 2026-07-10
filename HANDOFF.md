# 馬小歐賽車 — 交接文件（唯一正解）

3D 卡丁賽車遊戲（類瑪利歐賽車）。16 條賽道 × 4 盃賽 × 8 車手，含道具、AI 對手、甩尾噴射、金幣系統。
純前端、Three.js r149 打包在 repo 內（`js/three.min.js`），可離線玩。

- 線上版：https://sancola1219-collab.github.io/maxiaoou-racing/
- Repo：https://github.com/sancola1219-collab/maxiaoou-racing （push main 自動部署 Pages）
- 設計文件：`docs/superpowers/specs/2026-07-10-mario-kart-design.md`

## 紅線（改一處要同步 CLAUDE.md / AGENTS.md / 本檔）

1. **不要把 three.js 升到 r150+**。r150 起官方移除了 UMD 版 `three.min.js`，只剩 ES module；本專案用 `<script>` 直接載入（為了 file:// 離線可玩），升級會整個炸掉。真實事故：初建時先查過才選 r149。
2. **改版必調 `?v=N` 快取號**（index.html 內全部 10 個標籤一起 +1）。GitHub Pages 快取很兇，之前專案發生過改了 JS 但玩家拿到舊檔。
3. **AI 的狀態機必須有多重退出條件**。真實事故：AI 甩尾原本只靠「彎度 < 0.22 才放開」，在連續彎道永不成立 → AI 方向鎖死繞圈衝出賽道，整場比賽卡在第 1 圈。現在退出條件有四個（彎道結束/太慢/轉向打架/超時 3 秒），改 AI 時不要刪。
4. **純 vanilla JS 零依賴**（three.min.js 是唯一例外且已本地化）、拒絕照片貼圖（美術全部程序化幾何 + Canvas 貼圖）。

## 架構（一檔一責）

| 檔案 | 職責 |
|---|---|
| `js/data/tracks.js` | **資料層**：CHARACTERS(8)、THEMES(16)、TRACKS(16)、CUPS(4)、GP_POINTS。**加賽道/角色/主題改這裡就好** |
| `js/track.js` | Track 類：Catmull-Rom 閉合曲線取樣（位置/切線/左向量）→ 路面/路緣/護欄/路基/裝飾/小地圖全部程序化生成；`nearestIdx` / `lateralOffset` / `heightAt` 是物理的基礎查詢 |
| `js/kart.js` | Kart 類：物理（加速/甩尾蓄力噴射/邊界/掉落重生/圈數）+ 程序化車模；`buildKartMesh` |
| `js/ai.js` | `computeAiInput`：前瞻導航、彎道減速、甩尾、橡皮筋（±7%~16%）、道具時機、卡住倒車 |
| `js/items.js` | ItemWorld：道具箱/金幣/香蕉/綠紅龜殼/星星/閃電；`ITEM_TABLES` 是名次加權抽選表 |
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

驗收清單：16 條賽道 AI 全場跑完（`minLap >= 3`）、盃賽 4 場積分累計、計時模式存紀錄（`msq-tt-<trackId>`）、console 零錯誤。

## 已踩地雷

- **AI 甩尾鎖死**（見紅線 3）。
- **preview_screenshot 對 WebGL 逾時**：不是遊戲 bug，改用像素取樣。
- **加速度模型**：曾寫成「離目標速度越遠加速越慢」的怪公式，改為線性趨近（`speed += rate*dt` 夾到 target）。手感參數都在 Kart constructor 前幾行。
- **左向量手性**：y-up 右手座標，`left = (tan.z, 0, -tan.x)`；heading 增加=左轉。改轉向/偏移符號前先想清楚，兩處要一致（track.js 與 kart.js）。

## 本機開發

```
npx -y http-server -p 8123 -c-1    # 或任何靜態伺服器；.claude/launch.json 已設定
```
直接雙擊 index.html（file://）也能玩（這就是選 UMD three.js 的原因）。
