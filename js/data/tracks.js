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

// 主題參數：sky 天空色 / ground 地面色 / road 路面色 / curb 路緣紅白條 /
// open=true 出賽道是草地(減速)，false 有護欄 / voidFall=true 出界會掉落虛空 /
// grip 抓地力(冰面低) / night 夜晚 / deco 裝飾物類型
const THEMES = {
  grass:   { sky: 0x87ceeb, fog: 0xbfe3f0, ground: 0x6abf4b, road: 0x555a60, curbA: 0xd63b3b, curbB: 0xf2f2f2, rail: 0xc9c9c9, deco: 'tree',    open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.45 },
  beach:   { sky: 0x8fd8ff, fog: 0xd6f0ff, ground: 0xf0dca0, road: 0x8a8f96, curbA: 0xff8a3d, curbB: 0xffffff, rail: 0xdedede, deco: 'palm',    open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.5 },
  farm:    { sky: 0xa2d8ef, fog: 0xd0ecf5, ground: 0x8fbf4d, road: 0x9a7b4f, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0xb08850, deco: 'farm',    open: true,  voidFall: false, grip: 0.95, night: false, offroad: 0.5 },
  hills:   { sky: 0x7ec8f0, fog: 0xcfe9f7, ground: 0x54b04a, road: 0x5b6067, curbA: 0xe0a53d, curbB: 0xffffff, rail: 0xc9c9c9, deco: 'tree',    open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.45 },
  desert:  { sky: 0xffd9a0, fog: 0xf5e2b8, ground: 0xe0b96a, road: 0x77706a, curbA: 0xc96f3b, curbB: 0xf5e6c8, rail: 0xb5966b, deco: 'cactus',  open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.42 },
  forest:  { sky: 0x9fd6a8, fog: 0xc6e8cc, ground: 0x3f8f3f, road: 0x6a5f52, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0x8a6a3f, deco: 'forest',  open: true,  voidFall: false, grip: 0.95, night: false, offroad: 0.4 },
  harbor:  { sky: 0x8fc8e8, fog: 0xcfe6f2, ground: 0x8f9aa5, road: 0x4f545b, curbA: 0xd63b3b, curbB: 0xffffff, rail: 0x3f6fa8, deco: 'harbor',  open: false, voidFall: false, grip: 1.0, night: false, offroad: 0.6 },
  canyon:  { sky: 0xf5c98a, fog: 0xe8cfa0, ground: 0xb5824f, road: 0x8a6a4a, curbA: 0xd63b3b, curbB: 0xf2e0c0, rail: 0x9a6f3f, deco: 'rock',    open: false, voidFall: false, grip: 1.0, night: false, offroad: 0.5 },
  snow:    { sky: 0xd8e8f5, fog: 0xeef5fa, ground: 0xf2f6fa, road: 0x6f7680, curbA: 0x3b6fd6, curbB: 0xffffff, rail: 0xb8c8d8, deco: 'snow',    open: true,  voidFall: false, grip: 0.75, night: false, offroad: 0.5 },
  swamp:   { sky: 0x2a2a45, fog: 0x3a3a55, ground: 0x3f5540, road: 0x4a4a52, curbA: 0x8a3bd6, curbB: 0xb8b8c8, rail: 0x5a5a6a, deco: 'ghost',   open: true,  voidFall: false, grip: 0.9, night: true,  offroad: 0.4 },
  lava:    { sky: 0x4a2020, fog: 0x6a3020, ground: 0x3a2a28, road: 0x555055, curbA: 0xff6a2a, curbB: 0xffd0a0, rail: 0x7a4a3a, deco: 'lava',    open: false, voidFall: false, grip: 1.0, night: true,  offroad: 0.45 },
  sky:     { sky: 0x6fb8ff, fog: 0xbfe0ff, ground: 0x6fb8ff, road: 0xe8e0d0, curbA: 0xffd54f, curbB: 0xffffff, rail: 0xf0e8d8, deco: 'cloud',   open: false, voidFall: true,  grip: 1.0, night: false, offroad: 0.6 },
  city:    { sky: 0x141428, fog: 0x1e1e3a, ground: 0x2a2a38, road: 0x3a3a44, curbA: 0x00e5ff, curbB: 0xff4fd0, rail: 0x5a5a7a, deco: 'city',    open: false, voidFall: false, grip: 1.0, night: true,  offroad: 0.55 },
  candy:   { sky: 0xffd6ec, fog: 0xffe8f4, ground: 0xffb0d8, road: 0xa87858, curbA: 0xff5fa0, curbB: 0xfff0b0, rail: 0xff9fc8, deco: 'candy',   open: true,  voidFall: false, grip: 1.0, night: false, offroad: 0.5 },
  ice:     { sky: 0xbfe8ff, fog: 0xe0f4ff, ground: 0xd8f0fa, road: 0xa8d8ea, curbA: 0x3b6fd6, curbB: 0xffffff, rail: 0x8ac8e0, deco: 'ice',     open: true,  voidFall: false, grip: 0.55, night: false, offroad: 0.6 },
  rainbow: { sky: 0x0a0a24, fog: 0x14143a, ground: 0x0a0a24, road: 0xffffff, curbA: 0xffffff, curbB: 0xffe066, rail: 0xfff0a0, deco: 'star',    open: false, voidFall: true,  grip: 0.95, night: true,  offroad: 0.6, rainbowRoad: true },
};

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
];

const CUPS = [
  { id: 'mushroom',  name: '蘑菇盃', icon: '🍄', tracks: ['t01', 't02', 't03', 't04'] },
  { id: 'flower',    name: '花之盃', icon: '🌸', tracks: ['t05', 't06', 't07', 't08'] },
  { id: 'star',      name: '星星盃', icon: '⭐', tracks: ['t09', 't10', 't11', 't12'] },
  { id: 'lightning', name: '閃電盃', icon: '⚡', tracks: ['t13', 't14', 't15', 't16'] },
];

// GP 積分（第1名~第8名）
const GP_POINTS = [15, 12, 10, 8, 7, 6, 5, 4];

function getTrack(id) { return TRACKS.find(t => t.id === id); }
