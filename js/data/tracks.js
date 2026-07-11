// ============================================================
// 資料層：角色、主題、賽道、盃賽
// 想新增賽道 / 角色 / 主題，改這個檔案就好
// 賽道控制點格式：[x, z, 高度(可省略,預設0)]，會用閉合曲線平滑連接
// ============================================================

const CHARACTERS = [
  { id: 'mario',  name: '馬小歐',   body: 0xd83a2e, cap: 0xd83a2e, skin: 0xf6c9a0, stats: { speed: 3, accel: 3, handling: 3, weight: 3 } },
  { id: 'luigi',  name: '綠綠',     body: 0x2e9e4f, cap: 0x2e9e4f, skin: 0xf6c9a0, stats: { speed: 2, accel: 4, handling: 4, weight: 2 } },
  { id: 'peach',  name: '蜜桃公主', body: 0xf58fbb, cap: 0xffd54f, skin: 0xf9d7b8, stats: { speed: 3, accel: 3, handling: 4, weight: 2 } },
  { id: 'toad',   name: '菇菇',     body: 0xf2f2f2, cap: 0xe53935, skin: 0xf6c9a0, stats: { speed: 2, accel: 5, handling: 4, weight: 1 } },
  { id: 'bowser', name: '龍霸王',   body: 0xc9a227, cap: 0x2f7d32, skin: 0xd9e04f, stats: { speed: 5, accel: 1, handling: 2, weight: 5 } },
  { id: 'yoshi',  name: '恐恐龍',   body: 0x59c135, cap: 0xffffff, skin: 0x59c135, stats: { speed: 4, accel: 3, handling: 3, weight: 2 } },
  { id: 'kong',   name: '猩猩王',   body: 0x7b4a21, cap: 0x7b4a21, skin: 0xc98d5a, stats: { speed: 4, accel: 2, handling: 2, weight: 5 } },
  { id: 'boo',    name: '幽幽',     body: 0xe8e8f5, cap: 0x9575cd, skin: 0xe8e8f5, stats: { speed: 2, accel: 4, handling: 5, weight: 1 } },
];

// 車種：stats 是加在角色能力上的修正值（最終值夾在 1~6）
// model 對應 kart.js buildKartMesh 的 case；perk 特殊能力在 kart.js 各處實作：
//   offroad=出賽道幾乎不減速 / drift=甩尾蓄力+30% / armor=暈眩時間減半 /
//   hover=打滑區無效(車體漂浮) / coin=開場自帶3金幣 / glide=空中重力小跳更遠
const KARTS = [
  { id: 'standard', name: '標準卡丁',  model: 'standard', desc: '均衡好上手',        stats: {}, perk: null },
  { id: 'rocket',   name: '火箭飛彈',  model: 'rocket',   desc: '極速最快但不好控',  stats: { speed: 2, accel: -1, handling: -1 }, perk: null },
  { id: 'formula',  name: 'F1 方程式', model: 'formula',  desc: '過彎之王',          stats: { speed: 1, handling: 2, accel: -2 }, perk: null },
  { id: 'beetle',   name: '迷你甲蟲',  model: 'beetle',   desc: '起步超快的小可愛',  stats: { accel: 2, handling: 1, speed: -2 }, perk: null },
  { id: 'monster',  name: '怪獸卡車',  model: 'monster',  desc: '草地沙地照樣飆',    stats: { speed: 1, weight: 2, handling: -2 }, perk: 'offroad', perkDesc: '越野：出賽道幾乎不減速' },
  { id: 'bike',     name: '疾風摩托',  model: 'bike',     desc: '甩尾蓄力特別快',    stats: { speed: 1, handling: 1, weight: -2 }, perk: 'drift', perkDesc: '甩尾火花蓄力 +30%' },
  { id: 'tank',     name: '重裝坦克',  model: 'tank',     desc: '皮粗肉厚撞不怕',    stats: { weight: 3, speed: -1, accel: -1 }, perk: 'armor', perkDesc: '被攻擊的暈眩時間減半' },
  { id: 'cloud',    name: '雲朵飄飄',  model: 'cloud',    desc: '飄在路上的雲',      stats: { handling: 2, accel: 1, speed: -2 }, perk: 'hover', perkDesc: '漂浮：油漬泥巴完全無效' },
  { id: 'donut',    name: '甜甜圈號',  model: 'donut',    desc: '甜甜的加分車',      stats: { accel: 1, handling: 1, speed: -1 }, perk: 'coin', perkDesc: '每場開賽自帶 3 金幣' },
  { id: 'ufo',      name: '幽浮 UFO',  model: 'ufo',      desc: '外星漂浮科技',      stats: { speed: 1, accel: 1, weight: -2 }, perk: 'glide', perkDesc: '滯空久，跳躍飛更遠' },
];
function getKart(id) { return KARTS.find(k => k.id === id) || KARTS[0]; }

// 主題參數：sky 天空色 / ground 地面色 / road 路面色 / curb 路緣紅白條 /
// open=true 出賽道是草地(減速)，false 有護欄 / voidFall=true 出界會掉落虛空 /
// grip 抓地力(冰面低) / night 夜晚
// decos: [裝飾類型, 數量]（模型在 track.js buildDecoration）
// landmark: 大型地標（track.js _buildLandmark）
// mountains: 遠景山脈環 / cloudSky: 天上飄雲
// hazards: 賽道陷阱 [{type, model, count}]（邏輯與模型在 hazards.js）
//   type: walker=橫越馬路 / roller=沿路滾動 / geyser=定點噴發 / patch=打滑區 / car=NPC車
const THEMES = {
  grass:   { sky: 0x87ceeb, fog: 0xbfe3f0, ground: 0x6abf4b, road: 0x555a60, curbA: 0xd63b3b, curbB: 0xf2f2f2, rail: 0xc9c9c9, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.45,
    decos: [['tree', 40], ['flower', 30], ['bush', 18], ['rock', 6]], mountains: 0x4a9a5a, cloudSky: true,
    hazards: [{ type: 'walker', model: 'goomba', count: 4 }] },
  beach:   { sky: 0x8fd8ff, fog: 0xd6f0ff, ground: 0xf0dca0, road: 0x8a8f96, curbA: 0xff8a3d, curbB: 0xffffff, rail: 0xdedede, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.5,
    decos: [['palm', 32], ['umbrella', 14], ['rock', 8], ['bush', 8]], cloudSky: true,
    hazards: [{ type: 'walker', model: 'crab', count: 5 }] },
  farm:    { sky: 0xa2d8ef, fog: 0xd0ecf5, ground: 0x8fbf4d, road: 0x9a7b4f, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0xb08850, open: true,  voidFall: false, grip: 0.95, night: false, offroad: 0.5,
    decos: [['farm', 30], ['flower', 22], ['corn', 16], ['bush', 8]], landmark: 'windmill', mountains: 0x5aa04a, cloudSky: true,
    hazards: [{ type: 'walker', model: 'chicken', count: 5 }, { type: 'patch', model: 'mud', count: 3 }] },
  hills:   { sky: 0x7ec8f0, fog: 0xcfe9f7, ground: 0x54b04a, road: 0x5b6067, curbA: 0xe0a53d, curbB: 0xffffff, rail: 0xc9c9c9, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.45,
    decos: [['tree', 36], ['flower', 24], ['bush', 14], ['rock', 8]], mountains: 0x3f8a4f, cloudSky: true,
    hazards: [{ type: 'roller', model: 'haybale', count: 2 }, { type: 'walker', model: 'goomba', count: 3 }] },
  desert:  { sky: 0xffd9a0, fog: 0xf5e2b8, ground: 0xe0b96a, road: 0x77706a, curbA: 0xc96f3b, curbB: 0xf5e6c8, rail: 0xb5966b, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.42,
    decos: [['cactus', 32], ['rock', 20], ['bones', 8]], landmark: 'pyramid', mountains: 0xc9a05f,
    hazards: [{ type: 'roller', model: 'tumbleweed', count: 3 }, { type: 'walker', model: 'scorpion', count: 3 }] },
  forest:  { sky: 0x9fd6a8, fog: 0xc6e8cc, ground: 0x3f8f3f, road: 0x6a5f52, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0x8a6a3f, open: true,  voidFall: false, grip: 0.95, night: false, offroad: 0.4,
    decos: [['forest', 44], ['mushroom', 20], ['bush', 14], ['flower', 10]], mountains: 0x2f6a3f,
    hazards: [{ type: 'walker', model: 'hedgehog', count: 4 }, { type: 'patch', model: 'mud', count: 2 }] },
  harbor:  { sky: 0x8fc8e8, fog: 0xcfe6f2, ground: 0x8f9aa5, road: 0x4f545b, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0x3f6fa8, open: false, voidFall: false, grip: 1.0, night: false, offroad: 0.6,
    decos: [['harbor', 34], ['crane', 6], ['rock', 4]], landmark: 'lighthouse', cloudSky: true,
    hazards: [{ type: 'patch', model: 'oil', count: 4 }, { type: 'car', model: 'forklift', count: 2 }] },
  canyon:  { sky: 0xf5c98a, fog: 0xe8cfa0, ground: 0xb5824f, road: 0x8a6a4a, curbA: 0xd63b3b, curbB: 0xf2e0c0, rail: 0x9a6f3f, open: false, voidFall: false, grip: 1.0, night: false, offroad: 0.5,
    decos: [['rock', 38], ['cactus', 12], ['bones', 6]], mountains: 0xa5713f,
    hazards: [{ type: 'roller', model: 'boulder', count: 3 }] },
  snow:    { sky: 0xd8e8f5, fog: 0xeef5fa, ground: 0xf2f6fa, road: 0x6f7680, curbA: 0x3b6fd6, curbB: 0xffffff, rail: 0xb8c8d8, open: true,  voidFall: false, grip: 0.75, night: false, offroad: 0.5,
    decos: [['snow', 36], ['ice', 12], ['rock', 6]], landmark: 'igloo', mountains: 0xe8f0f8,
    hazards: [{ type: 'roller', model: 'snowball', count: 4 }] },
  swamp:   { sky: 0x2a2a45, fog: 0x3a3a55, ground: 0x3f5540, road: 0x4a4a52, curbA: 0x8a3bd6, curbB: 0xb8b8c8, rail: 0x5a5a6a, open: true,  voidFall: false, grip: 0.9, night: true,  offroad: 0.4,
    decos: [['ghost', 36], ['mushroom', 14], ['bush', 8]],
    hazards: [{ type: 'walker', model: 'ghost', count: 4 }, { type: 'patch', model: 'poison', count: 3 }] },
  lava:    { sky: 0x4a2020, fog: 0x6a3020, ground: 0x3a2a28, road: 0x555055, curbA: 0xff6a2a, curbB: 0xffd0a0, rail: 0x7a4a3a, open: false, voidFall: false, grip: 1.0, night: true,  offroad: 0.45,
    decos: [['lava', 40]], landmark: 'volcano',
    hazards: [{ type: 'geyser', model: 'lava', count: 6 }] },
  sky:     { sky: 0x6fb8ff, fog: 0xbfe0ff, ground: 0x6fb8ff, road: 0xe8e0d0, curbA: 0xffd54f, curbB: 0xffffff, rail: 0xf0e8d8, open: false, voidFall: true,  grip: 1.0, night: false, offroad: 0.6,
    decos: [['cloud', 46]], landmark: 'planet',
    hazards: [{ type: 'walker', model: 'bird', count: 3 }] },
  city:    { sky: 0x141428, fog: 0x1e1e3a, ground: 0x2a2a38, road: 0x3a3a44, curbA: 0x00e5ff, curbB: 0xff4fd0, rail: 0x5a5a7a, open: false, voidFall: false, grip: 1.0, night: true,  offroad: 0.55,
    decos: [['city', 42], ['streetlight', 14]],
    hazards: [{ type: 'car', model: 'taxi', count: 3 }, { type: 'patch', model: 'oil', count: 2 }] },
  candy:   { sky: 0xffd6ec, fog: 0xffe8f4, ground: 0xffb0d8, road: 0xa87858, curbA: 0xff5fa0, curbB: 0xfff0b0, rail: 0xff9fc8, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.5,
    decos: [['candy', 30], ['gumdrop', 16], ['flower', 12]], landmark: 'castle', cloudSky: true,
    hazards: [{ type: 'walker', model: 'gumball', count: 4 }, { type: 'patch', model: 'syrup', count: 2 }] },
  ice:     { sky: 0xbfe8ff, fog: 0xe0f4ff, ground: 0xd8f0fa, road: 0xa8d8ea, curbA: 0x3b6fd6, curbB: 0xffffff, rail: 0x8ac8e0, open: true,  voidFall: false, grip: 0.55, night: false, offroad: 0.6,
    decos: [['ice', 30], ['snow', 16], ['rock', 6]], landmark: 'igloo', mountains: 0xd0e8f5,
    hazards: [{ type: 'roller', model: 'snowball', count: 3 }] },
  rainbow: { sky: 0x0a0a24, fog: 0x14143a, ground: 0x0a0a24, road: 0xffffff, curbA: 0xffffff, curbB: 0xffe066, rail: 0xfff0a0, open: false, voidFall: true,  grip: 0.95, night: true,  offroad: 0.6, rainbowRoad: true,
    decos: [['star', 1]], landmark: 'planet',
    hazards: [{ type: 'walker', model: 'star', count: 3 }] },
  sakura:  { sky: 0xa8d8f0, fog: 0xf5dce8, ground: 0x7abf5a, road: 0x6a6a72, curbA: 0xff8ac8, curbB: 0xffffff, rail: 0xc9c9c9, open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.45,
    decos: [['sakura', 34], ['lantern', 12], ['flower', 20], ['bush', 10]], landmark: 'torii', mountains: 0x8fb56a, cloudSky: true,
    hazards: [{ type: 'walker', model: 'frog', count: 4 }, { type: 'patch', model: 'petals', count: 2 }] },
  // floaty=true：水中浮力，跳躍飄、重力小
  underwater: { sky: 0x1a5a8a, fog: 0x2a6a9a, fogNear: 40, fogFar: 330, ground: 0xc9b98a, road: 0x4a7a8a, curbA: 0x2ae8d8, curbB: 0xf0f8ff, rail: 0x3a8aa5, open: true, voidFall: false, grip: 0.9, night: false, offroad: 0.5, floaty: true,
    decos: [['coral', 28], ['seaweed', 24], ['bubble', 20], ['rock', 8]], landmark: 'wreck',
    hazards: [{ type: 'walker', model: 'fish', count: 5 }] },
  haunted: { sky: 0x1a1228, fog: 0x2a1f3a, ground: 0x2f3a2f, road: 0x3f3a45, curbA: 0xff8a2a, curbB: 0x9a8ab5, rail: 0x5a4a6a, open: true, voidFall: false, grip: 0.92, night: true, offroad: 0.4,
    decos: [['grave', 22], ['pumpkin', 14], ['ghost', 18], ['mushroom', 8]], landmark: 'mansion',
    hazards: [{ type: 'walker', model: 'bat', count: 4 }, { type: 'patch', model: 'poison', count: 2 }] },
  space:   { sky: 0x05050f, fog: 0x0a0a1a, ground: 0x05050f, road: 0x8a92a5, curbA: 0x00e5ff, curbB: 0xffffff, rail: 0x6a7a95, open: false, voidFall: true, grip: 1.0, night: true, offroad: 0.6,
    decos: [['star', 1], ['satellite', 12]], landmark: 'earth',
    hazards: [{ type: 'roller', model: 'asteroid', count: 3 }] },
};

// 每個主題的天氣池：每場比賽隨機挑一種（重複的權重高 → 較常出現）
// 天氣種類與效果定義在 weather.js 的 WEATHER_INFO；新增天氣改那裡
const THEME_WEATHER = {
  grass:   ['clear', 'clear', 'rain'],
  beach:   ['clear', 'clear', 'clear'],
  farm:    ['clear', 'clear', 'rain', 'fog'],
  hills:   ['clear', 'clear', 'rain', 'fog'],
  desert:  ['clear', 'clear', 'sand'],
  forest:  ['clear', 'clear', 'rain', 'fog'],
  harbor:  ['clear', 'clear', 'rain', 'fog'],
  canyon:  ['clear', 'clear', 'sand'],
  snow:    ['snow', 'snow', 'blizzard'],
  swamp:   ['fog', 'fog', 'storm'],
  lava:    ['ash', 'ash', 'clear'],
  sky:     ['clear', 'clear'],
  city:    ['clear', 'rain', 'storm'],
  candy:   ['clear', 'clear'],
  ice:     ['snow', 'snow', 'clear', 'blizzard'],
  rainbow: ['clear'],
  sakura:  ['petals', 'petals', 'clear'],
  underwater: ['bubbles'],
  haunted: ['fog', 'fog', 'storm'],
  space:   ['clear'],
};
for (const id in THEMES) THEMES[id].weather = THEME_WEATHER[id] || ['clear'];

const TRACKS = [
  // ---------- 蘑菇盃 ----------
  { id: 't01', name: '綠茵草原', theme: 'grass', width: 18, laps: 3, points: [
    [0,-140],[80,-135],[150,-100],[175,-30],[160,40],[110,90],[40,110],[-30,100],[-90,120],[-150,110],[-185,50],[-180,-30],[-140,-100],[-70,-135],
  ]},
  { id: 't02', name: '陽光沙灘', theme: 'beach', width: 18, laps: 3, points: [
    [0,-160],[90,-150],[160,-110],[195,-30],[170,50],[105,105],[25,85],[-45,55],[-115,85],[-175,60],[-205,-10],[-180,-90],[-110,-145],[-50,-158],
  ]},
  { id: 't03', name: '快樂農場', theme: 'farm', width: 17, laps: 3, points: [
    [0,-150],[100,-152],[172,-138],[192,-78],[186,0],[192,80],[170,140],[80,152],[0,146],[-62,152],[-92,102],[-60,52],[-92,0],[-60,-52],[-92,-102],[-62,-146],
  ]},
  { id: 't04', name: '丘陵飛坡', theme: 'hills', width: 17, laps: 3, points: [
    [0,-150,0],[90,-140,2],[150,-90,8],[172,-10,14],[150,70,8],[80,122,2],[0,142,0],[-80,122,6],[-150,80,12],[-182,0,18],[-150,-80,10],[-80,-130,3],
  ]},
  // ---------- 花之盃 ----------
  { id: 't05', name: '金字塔沙漠', theme: 'desert', width: 17, laps: 3, points: [
    [0,-180],[110,-172],[192,-120],[212,-40],[182,32],[122,62],[72,112],[92,172],[32,202],[-42,172],[-32,112],[-82,72],[-152,92],[-212,52],[-222,-30],[-182,-110],[-102,-162],
  ]},
  { id: 't06', name: '綠蔭森林', theme: 'forest', width: 15, laps: 3, points: [
    [0,-160],[70,-152],[122,-110],[100,-60],[142,-20],[192,12],[182,72],[122,102],[62,82],[12,112],[32,162],[-30,192],[-92,162],[-82,112],[-132,82],[-182,42],[-172,-20],[-122,-52],[-142,-102],[-92,-142],
  ]},
  { id: 't07', name: '港灣碼頭', theme: 'harbor', width: 16, laps: 3, points: [
    [0,-160],[120,-162],[182,-150],[192,-90],[132,-70],[122,-10],[182,12],[192,82],[152,152],[62,162],[0,122],[-62,162],[-152,152],[-192,92],[-162,32],[-102,22],[-92,-40],[-162,-62],[-192,-122],[-122,-160],
  ]},
  { id: 't08', name: '菇菇峽谷', theme: 'canyon', width: 13, laps: 3, points: [
    [0,-170,10],[90,-162,12],[162,-122,16],[182,-40,22],[152,32,18],[172,102,24],[112,152,20],[32,132,14],[-42,152,18],[-122,142,22],[-182,82,16],[-162,0,10],[-182,-80,8],[-122,-142,6],[-52,-162,8],
  ]},
  // ---------- 星星盃 ----------
  { id: 't09', name: '白雪山道', theme: 'snow', width: 16, laps: 3, points: [
    [0,-170,0],[100,-166,4],[172,-122,10],[192,-40,18],[162,32,26],[92,62,30],[22,42,26],[-52,72,22],[8,112,18],[82,142,14],[32,192,10],[-62,202,8],[-142,172,6],[-192,102,4],[-182,10,2],[-152,-72,0],[-92,-142,0],
  ]},
  { id: 't10', name: '幽靈沼澤', theme: 'swamp', width: 15, laps: 3, points: [
    [0,-152],[-72,-162],[-132,-122],[-112,-62],[-162,-22],[-192,42],[-142,92],[-82,72],[-42,122],[-72,172],[0,192],[72,162],[52,112],[112,92],[172,62],[182,0],[132,-42],[152,-102],[92,-152],
  ]},
  { id: 't11', name: '火山熔岩', theme: 'lava', width: 16, laps: 3, points: [
    [0,-190,4],[110,-182,8],[192,-132,14],[222,-40,20],[202,62,26],[132,132,30],[32,152,32],[-72,142,30],[-162,102,24],[-212,12,18],[-192,-90,10],[-112,-162,6],
  ]},
  { id: 't12', name: '天空之城', theme: 'sky', width: 15, laps: 3, points: [
    [0,-160,40],[90,-152,44],[162,-102,50],[172,-20,56],[132,52,60],[152,122,56],[82,162,52],[0,142,48],[-82,162,52],[-162,112,46],[-182,32,42],[-152,-52,40],[-162,-122,44],[-82,-162,42],
  ]},
  // ---------- 閃電盃 ----------
  { id: 't13', name: '霓虹都市', theme: 'city', width: 17, laps: 3, points: [
    [0,-200],[150,-202],[230,-182],[242,-112],[192,-82],[192,-22],[242,10],[252,90],[202,142],[102,152],[42,192],[-62,196],[-132,162],[-122,102],[-182,82],[-232,32],[-222,-52],[-162,-92],[-172,-152],[-92,-196],
  ]},
  { id: 't14', name: '糖果樂園', theme: 'candy', width: 16, laps: 3, points: [
    [0,-150],[80,-162],[132,-102],[92,-52],[152,-12],[202,42],[152,92],[92,72],[62,132],[112,172],[42,202],[-42,172],[-22,112],[-92,92],[-162,122],[-212,62],[-172,2],[-102,-22],[-142,-82],[-72,-132],
  ]},
  { id: 't15', name: '酷寒冰河', theme: 'ice', width: 22, laps: 3, points: [
    [0,-180],[120,-172],[212,-112],[242,0],[202,112],[92,172],[-32,182],[-142,152],[-222,72],[-232,-40],[-172,-132],[-82,-172],
  ]},
  { id: 't16', name: '彩虹之路', theme: 'rainbow', width: 14, laps: 3, points: [
    [0,-260,60],[140,-252,66],[250,-192,74],[300,-80,84],[280,42,92],[192,122,86],[102,92,78],[22,142,72],[62,232,66],[-42,292,60],[-162,262,56],[-242,182,52],[-192,92,58],[-262,12,66],[-302,-90,74],[-232,-192,66],[-112,-252,60],
  ]},
  // ---------- 月亮盃 ----------
  { id: 't17', name: '櫻花公園', theme: 'sakura', width: 17, laps: 3, points: [
    [0,-150],[85,-145],[140,-95],[125,-40],[165,10],[195,75],[150,130],[85,110],[30,150],[-40,180],[-105,150],[-90,95],[-140,60],[-185,10],[-165,-60],[-110,-95],[-125,-145],[-60,-165],
  ]},
  { id: 't18', name: '水底世界', theme: 'underwater', width: 19, laps: 3, points: [
    [0,-170],[100,-160],[180,-110],[210,-30],[185,55],[120,110],[35,125],[-45,100],[-120,130],[-190,95],[-215,15],[-185,-70],[-120,-125],[-45,-160],
  ]},
  { id: 't19', name: '幽靈鬼宅', theme: 'haunted', width: 14, laps: 3, points: [
    [0,-160],[70,-155],[125,-115],[105,-60],[160,-35],[185,25],[135,65],[75,45],[45,95],[95,135],[55,185],[-15,160],[-30,105],[-85,85],[-70,35],[-125,15],[-180,55],[-215,-5],[-175,-65],[-115,-45],[-95,-105],[-140,-150],[-70,-170],
  ]},
  { id: 't20', name: '星際基地', theme: 'space', width: 14, laps: 3, points: [
    [0,-170,55],[95,-160,60],[165,-110,66],[185,-30,72],[150,45,78],[170,115,72],[100,160,66],[15,135,60],[-70,165,64],[-150,120,70],[-180,40,76],[-150,-40,70],[-170,-115,62],[-95,-160,56],
  ]},
  // ---------- 王冠盃 ----------
  { id: 't21', name: '綠茵大賽道', theme: 'grass', width: 20, laps: 3, points: [
    [0,-220],[130,-222],[250,-215],[290,-150],[280,-60],[290,40],[250,130],[150,160],[60,140],[-30,160],[-120,140],[-160,80],[-140,10],[-160,-60],[-230,-90],[-250,-160],[-180,-210],[-90,-222],
  ]},
  { id: 't22', name: '火山試煉', theme: 'lava', width: 15, laps: 3, points: [
    [0,-200,4],[105,-190,10],[185,-140,18],[215,-55,26],[185,30,32],[110,60,36],[45,105,40],[95,155,44],[25,195,40],[-60,165,34],[-45,105,28],[-110,75,22],[-180,105,18],[-220,35,12],[-195,-55,8],[-130,-115,6],[-150,-175,4],[-75,-200,2],
  ]},
  { id: 't23', name: '賭城大道', theme: 'city', width: 18, laps: 3, points: [
    [0,-230],[160,-232],[260,-215],[275,-140],[220,-110],[225,-45],[280,-15],[290,70],[240,125],[245,185],[170,215],[80,190],[20,225],[-80,230],[-150,195],[-140,130],[-200,110],[-245,55],[-230,-25],[-170,-60],[-185,-130],[-245,-160],[-215,-220],[-110,-232],
  ]},
  { id: 't24', name: '彩虹狂想曲', theme: 'rainbow', width: 13, laps: 3, points: [
    [0,-290,70],[150,-280,76],[265,-225,84],[330,-120,94],[310,-10,100],[230,60,92],[260,150,84],[175,210,78],[75,175,72],[-15,215,68],[10,300,64],[-90,320,60],[-190,275,58],[-160,190,62],[-240,150,68],[-310,80,76],[-320,-30,84],[-260,-140,76],[-150,-195,68],[-170,-270,62],[-70,-295,64],
  ]},
];

const CUPS = [
  { id: 'mushroom',  name: '蘑菇盃', icon: '🍄', tracks: ['t01', 't02', 't03', 't04'] },
  { id: 'flower',    name: '花之盃', icon: '🌸', tracks: ['t05', 't06', 't07', 't08'] },
  { id: 'star',      name: '星星盃', icon: '⭐', tracks: ['t09', 't10', 't11', 't12'] },
  { id: 'lightning', name: '閃電盃', icon: '⚡', tracks: ['t13', 't14', 't15', 't16'] },
  { id: 'moon',      name: '月亮盃', icon: '🌙', tracks: ['t17', 't18', 't19', 't20'] },
  { id: 'crown',     name: '王冠盃', icon: '👑', tracks: ['t21', 't22', 't23', 't24'] },
];

// GP 積分（第1名~第8名）
const GP_POINTS = [15, 12, 10, 8, 7, 6, 5, 4];

function getTrack(id) { return TRACKS.find(t => t.id === id); }
