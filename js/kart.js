// ============================================================
// 賽車：物理（加速/甩尾/碰撞/圈數/打滑）+ 8 位角色造型 3D 模型
// ============================================================

function _kmat(color, emissive, opacity) {
  const m = new THREE.MeshLambertMaterial({ color });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.6; }
  if (opacity !== undefined) { m.transparent = true; m.opacity = opacity; }
  return m;
}

// ---------- 車體（10 種車型，主色跟角色）----------
// 車頭朝 +z；駕駛透過 driverY 墊高（怪獸卡車/坦克）
function buildKartMesh(char, kartDef) {
  kartDef = kartDef || (typeof KARTS !== 'undefined' ? KARTS[0] : { model: 'standard' });
  const g = new THREE.Group();
  const P = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const bodyMat = _kmat(char.body);
  const darkMat = _kmat(0x24242a);
  const greyMat = _kmat(0x8a8a92);

  g.userData.wheels = [];
  const addWheel = (x, z, r, w) => {
    const wg = new THREE.Group();
    wg.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), darkMat));
    wg.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.02, 8), _kmat(0xd8d84a)));
    wg.rotation.z = Math.PI / 2;
    wg.position.set(x, r, z);
    g.add(wg);
    g.userData.wheels.push(wg);
    return wg;
  };
  const steering = (y, z) => {
    const col = P(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 5), darkMat, 0, y - 0.17, z + 0.1);
    col.rotation.x = 0.7;
    const st = P(new THREE.TorusGeometry(0.22, 0.05, 6, 12), darkMat, 0, y, z);
    st.rotation.x = -0.85;
  };

  let driverY = 0;
  let sparkX = 0.92;

  switch (kartDef.model) {
    case 'rocket': {
      // 平躺的火箭：圓筒身 + 錐頭 + 尾翼 + 大噴嘴
      const tube = P(new THREE.CylinderGeometry(0.58, 0.62, 2.4, 12), bodyMat, 0, 0.7, -0.1);
      tube.rotation.x = Math.PI / 2;
      const nose = P(new THREE.ConeGeometry(0.58, 1.0, 12), _kmat(0xd63b3b), 0, 0.7, 1.6);
      nose.rotation.x = Math.PI / 2;
      const nozzle = P(new THREE.CylinderGeometry(0.42, 0.6, 0.5, 10), greyMat, 0, 0.7, -1.5);
      nozzle.rotation.x = Math.PI / 2;
      P(new THREE.SphereGeometry(0.28, 8, 6), _kmat(0xffa03d, 0xff6a1a), 0, 0.7, -1.75);
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const fin = P(new THREE.BoxGeometry(0.1, 0.7, 0.6), _kmat(0xd63b3b), Math.sin(a) * 0.62, 0.7 + Math.cos(a) * 0.62, -1.0);
        fin.rotation.z = -a;
      }
      // 駕駛艙開口
      P(new THREE.BoxGeometry(0.85, 0.3, 1.0), darkMat, 0, 1.05, -0.4);
      addWheel(-0.85, 0.9, 0.36, 0.3); addWheel(0.85, 0.9, 0.36, 0.3);
      addWheel(-0.85, -0.9, 0.36, 0.3); addWheel(0.85, -0.9, 0.36, 0.3);
      driverY = 0.35;
      break;
    }
    case 'formula': {
      // F1：低扁流線身 + 尖鼻 + 前後定風翼 + 外露大輪
      P(new THREE.BoxGeometry(0.75, 0.4, 2.6), bodyMat, 0, 0.55, 0);
      const nose = P(new THREE.BoxGeometry(0.4, 0.28, 1.0), bodyMat, 0, 0.5, 1.7);
      nose.scale.z = 1.1;
      P(new THREE.BoxGeometry(1.9, 0.08, 0.45), _kmat(0xf2f2f2), 0, 0.35, 2.1);      // 前翼
      for (const sx of [-1, 1]) P(new THREE.BoxGeometry(0.08, 0.5, 0.4), greyMat, sx * 0.5, 1.0, -1.35);
      P(new THREE.BoxGeometry(1.7, 0.1, 0.55), _kmat(0xf2f2f2), 0, 1.28, -1.4);      // 尾翼
      P(new THREE.SphereGeometry(0.4, 8, 6), darkMat, 0, 0.82, 0.35).scale.set(0.9, 0.5, 1.6); // 座艙前緣
      addWheel(-0.95, 1.15, 0.42, 0.4); addWheel(0.95, 1.15, 0.42, 0.4);
      addWheel(-0.95, -1.05, 0.5, 0.45); addWheel(0.95, -1.05, 0.5, 0.45);
      break;
    }
    case 'beetle': {
      // 圓滾滾金龜車：大圓頂 + 圓擋泥板
      const dome = P(new THREE.SphereGeometry(1.05, 14, 10), bodyMat, 0, 0.85, 0.1);
      dome.scale.set(0.85, 0.75, 1.25);
      P(new THREE.SphereGeometry(0.5, 10, 8), _kmat(0xbfe8ff), 0, 1.15, 0.85).scale.set(1.3, 0.6, 0.5); // 擋風玻璃
      for (const [sx, sz] of [[-0.8, 0.85], [0.8, 0.85], [-0.8, -0.8], [0.8, -0.8]]) {
        P(new THREE.SphereGeometry(0.32, 8, 6), bodyMat, sx, 0.55, sz).scale.set(0.5, 0.7, 1.1); // 擋泥板
      }
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.12, 6, 5), _kmat(0xfff0b0, 0xffe066), sx * 0.4, 0.75, 1.25); // 大燈
      addWheel(-0.8, 0.85, 0.34, 0.28); addWheel(0.8, 0.85, 0.34, 0.28);
      addWheel(-0.8, -0.8, 0.34, 0.28); addWheel(0.8, -0.8, 0.34, 0.28);
      driverY = 0.15;
      break;
    }
    case 'monster': {
      // 怪獸卡車：高底盤皮卡 + 巨輪 + 避震柱
      P(new THREE.BoxGeometry(1.5, 0.5, 2.6), bodyMat, 0, 1.15, 0);
      P(new THREE.BoxGeometry(1.3, 0.5, 1.0), bodyMat, 0, 1.6, 0.35);       // 車頭艙
      P(new THREE.BoxGeometry(1.1, 0.35, 0.08), _kmat(0xbfe8ff), 0, 1.68, 0.86); // 擋風玻璃
      P(new THREE.BoxGeometry(1.55, 0.12, 0.5), darkMat, 0, 0.95, 1.35);    // 前保桿
      for (const [sx, sz] of [[-0.8, 0.95], [0.8, 0.95], [-0.8, -0.95], [0.8, -0.95]]) {
        const strut = P(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 5), greyMat, sx, 0.85, sz);
        strut.rotation.z = sx * 0.3;
      }
      addWheel(-1.0, 0.95, 0.68, 0.5); addWheel(1.0, 0.95, 0.68, 0.5);
      addWheel(-1.0, -0.95, 0.68, 0.5); addWheel(1.0, -0.95, 0.68, 0.5);
      driverY = 0.75;
      sparkX = 1.0;
      break;
    }
    case 'bike': {
      // 摩托車：細長車身 + 前後兩輪 + 把手
      P(new THREE.BoxGeometry(0.45, 0.4, 1.9), bodyMat, 0, 0.72, 0);
      P(new THREE.SphereGeometry(0.35, 8, 6), bodyMat, 0, 0.85, 0.75).scale.set(1, 0.8, 1.4); // 油箱
      const windshield = P(new THREE.BoxGeometry(0.4, 0.4, 0.06), _kmat(0xbfe8ff), 0, 1.25, 1.05);
      windshield.rotation.x = -0.3;
      const bar = P(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), greyMat, 0, 1.15, 0.95);
      bar.rotation.z = Math.PI / 2;
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.07, 5, 4), darkMat, sx * 0.4, 1.15, 0.95);
      const fork = P(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5), greyMat, 0, 0.75, 1.15);
      fork.rotation.x = 0.35;
      P(new THREE.CylinderGeometry(0.1, 0.13, 0.6, 6), greyMat, 0.18, 0.55, -0.95).rotation.x = -0.4; // 排氣管
      addWheel(0, 1.15, 0.46, 0.22);
      addWheel(0, -0.95, 0.46, 0.26);
      driverY = 0.2;
      sparkX = 0.45;
      break;
    }
    case 'tank': {
      // 坦克：寬車體 + 兩側履帶 + 短砲管
      P(new THREE.BoxGeometry(1.4, 0.55, 2.5), bodyMat, 0, 0.75, 0);
      P(new THREE.BoxGeometry(1.0, 0.35, 1.2), bodyMat, 0, 1.2, -0.2); // 砲塔
      const barrel = P(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 7), greyMat, 0, 1.28, 0.8);
      barrel.rotation.x = Math.PI / 2 - 0.08;
      P(new THREE.SphereGeometry(0.12, 6, 5), darkMat, 0, 1.28, 1.35);
      for (const sx of [-1, 1]) {
        const tread = P(new THREE.BoxGeometry(0.45, 0.55, 2.7), darkMat, sx * 0.88, 0.45, 0);
        tread.scale.y = 0.9;
        for (let k = 0; k < 4; k++) {
          P(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 7), greyMat, sx * 0.88, 0.28, -1 + k * 0.66).rotation.z = Math.PI / 2;
        }
      }
      driverY = 0.45;
      sparkX = 0.88;
      break;
    }
    case 'cloud': {
      // 雲朵車：一團白雲 + 角色色彩帶（無輪，漂浮）
      const cloudMat = _kmat(0xf8fbff);
      const body = new THREE.Group();
      const CP = (r, x, y, z) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
        m.position.set(x, y, z);
        body.add(m);
        return m;
      };
      CP(0.85, 0, 0.6, 0.2).scale.y = 0.75;
      CP(0.6, 0.7, 0.55, -0.5); CP(0.6, -0.7, 0.55, -0.5);
      CP(0.55, 0, 0.5, 1.1); CP(0.5, 0.55, 0.5, 0.9); CP(0.5, -0.55, 0.5, 0.9);
      CP(0.55, 0, 0.65, -1.1);
      // 角色色彩帶
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 6, 16), bodyMat);
      ribbon.rotation.x = Math.PI / 2;
      ribbon.position.y = 0.55;
      body.add(ribbon);
      g.add(body);
      g.userData.floatGroup = body;
      driverY = 0.3;
      sparkX = 0.7;
      break;
    }
    case 'donut': {
      // 甜甜圈：平放的大甜甜圈 + 粉紅糖霜 + 彩色碎糖
      const base = P(new THREE.TorusGeometry(1.0, 0.42, 10, 18), _kmat(0xc98d4a), 0, 0.62, 0);
      base.rotation.x = Math.PI / 2;
      const icing = P(new THREE.TorusGeometry(1.0, 0.36, 10, 18), _kmat(0xff8adf), 0, 0.74, 0);
      icing.rotation.x = Math.PI / 2;
      icing.scale.z = 0.7;
      const sprinkleCols = [0xffe066, 0x5fd0ff, 0x8aff5f, 0xffffff, char.body];
      for (let k = 0; k < 10; k++) {
        const a = k * Math.PI * 2 / 10 + 0.3;
        const spr = P(new THREE.BoxGeometry(0.16, 0.05, 0.06), _kmat(sprinkleCols[k % 5]), Math.cos(a) * 1.0, 0.95, Math.sin(a) * 1.0);
        spr.rotation.y = a + 0.8;
      }
      addWheel(-0.75, 0.8, 0.3, 0.26); addWheel(0.75, 0.8, 0.3, 0.26);
      addWheel(-0.75, -0.8, 0.3, 0.26); addWheel(0.75, -0.8, 0.3, 0.26);
      driverY = 0.1;
      break;
    }
    case 'ufo': {
      // 幽浮：金屬飛碟 + 角色色圓頂 + 環繞燈（無輪，漂浮）
      const body = new THREE.Group();
      const saucer = new THREE.Mesh(new THREE.SphereGeometry(1.35, 16, 10), greyMat);
      saucer.scale.set(1, 0.28, 1);
      saucer.position.y = 0.55;
      body.add(saucer);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 8, 20), _kmat(0x6a7a95));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.55;
      body.add(rim);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
      dome.position.set(0, 0.68, 0.55);
      body.add(dome);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI * 2 / 8;
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), _kmat(0x8affff, 0x2ae8d8));
        light.position.set(Math.cos(a) * 1.05, 0.55, Math.sin(a) * 1.05);
        body.add(light);
      }
      g.add(body);
      g.userData.floatGroup = body;
      driverY = 0.35;
      sparkX = 0.8;
      break;
    }
    default: { // standard 標準卡丁（原版）
      P(new THREE.BoxGeometry(1.35, 0.28, 2.5), bodyMat, 0, 0.5, 0);
      const nose = P(new THREE.SphereGeometry(0.62, 10, 8), bodyMat, 0, 0.58, 1.15);
      nose.scale.set(1.05, 0.55, 1.15);
      for (const sx of [-1, 1]) {
        const pod = P(new THREE.SphereGeometry(0.42, 8, 7), bodyMat, sx * 0.78, 0.52, -0.15);
        pod.scale.set(0.75, 0.6, 1.9);
      }
      P(new THREE.BoxGeometry(1.5, 0.14, 0.5), darkMat, 0, 0.36, 1.72);
      P(new THREE.BoxGeometry(1.0, 0.55, 0.6), darkMat, 0, 0.75, -1.15);
      for (const sx of [-1, 1]) {
        const pipe = P(new THREE.CylinderGeometry(0.11, 0.15, 0.7, 7), greyMat, sx * 0.32, 1.05, -1.42);
        pipe.rotation.x = -0.5;
      }
      P(new THREE.BoxGeometry(0.85, 0.7, 0.18), _kmat(0x3a3a42), 0, 1.05, -0.85);
      steering(1.12, 0.32);
      addWheel(-0.92, 0.95, 0.42, 0.36); addWheel(0.92, 0.95, 0.42, 0.36);
      addWheel(-0.92, -0.95, 0.42, 0.36); addWheel(0.92, -0.95, 0.42, 0.36);
      break;
    }
  }

  // 駕駛（每位角色不同造型；高底盤車墊高）
  const driver = buildDriver(char);
  driver.position.y = driverY;
  g.add(driver);

  // 甩尾火花
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x55aaff });
  g.userData.sparks = [];
  for (const x of [-sparkX, sparkX]) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), sparkMat);
    spark.position.set(x, 0.25, -1.2);
    spark.visible = false;
    g.add(spark);
    g.userData.sparks.push(spark);
  }

  // 假陰影（跳起時留在地面）
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);
  g.userData.shadow = shadow;

  g.userData.bodyMat = bodyMat;
  return g;
}

// ---------- 角色造型 ----------
// 座標系：車頭朝 +z，駕駛坐在 z≈-0.5，頭部中心 y≈1.7
function buildDriver(char) {
  const d = new THREE.Group();
  const P = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    d.add(m);
    return m;
  };
  const skin = _kmat(char.skin);
  const SZ = -0.5; // 座位 z

  // 通用五官：眼睛（白+黑瞳，讓每個角色都有表情）
  const eyes = (y, zFront, spacing, size, pupilColor) => {
    for (const sx of [-1, 1]) {
      P(new THREE.SphereGeometry(size, 8, 6), _kmat(0xffffff), sx * spacing, y, SZ + zFront).scale.z = 0.55;
      P(new THREE.SphereGeometry(size * 0.5, 6, 5), _kmat(pupilColor || 0x1a1a2a), sx * spacing, y, SZ + zFront + size * 0.55);
    }
  };
  // 通用手臂（伸向方向盤）+ 手套
  const arms = (sleeveColor, gloveColor) => {
    for (const sx of [-1, 1]) {
      const arm = P(new THREE.CylinderGeometry(0.09, 0.11, 0.78, 6), _kmat(sleeveColor), sx * 0.33, 1.18, -0.05);
      arm.rotation.x = -1.05;
      arm.rotation.z = sx * 0.28;
      P(new THREE.SphereGeometry(0.13, 7, 6), _kmat(gloveColor), sx * 0.2, 1.16, 0.28);
    }
  };

  switch (char.id) {
    case 'mario':
    case 'luigi': {
      const c = char.body;
      // 吊帶褲 + 上衣
      P(new THREE.BoxGeometry(0.78, 0.72, 0.5), _kmat(0x2a4fd0), 0, 1.02, SZ);
      P(new THREE.BoxGeometry(0.8, 0.3, 0.52), _kmat(c), 0, 1.32, SZ);
      for (const sx of [-1, 1]) P(new THREE.BoxGeometry(0.16, 0.5, 0.53), _kmat(0x2a4fd0), sx * 0.2, 1.28, SZ);
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.06, 5, 4), _kmat(0xffe066), sx * 0.2, 1.4, SZ + 0.28);
      arms(c, 0xffffff);
      // 頭 + 大鼻子 + 翹鬍子 + 耳朵
      P(new THREE.SphereGeometry(0.42, 12, 10), skin, 0, 1.72, SZ);
      P(new THREE.SphereGeometry(0.14, 8, 6), skin, 0, 1.66, SZ + 0.42);
      const mus = P(new THREE.SphereGeometry(0.2, 8, 5), _kmat(0x3a2a1a), 0, 1.55, SZ + 0.36);
      mus.scale.set(1.6, 0.35, 0.5);
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.1, 6, 5), skin, sx * 0.4, 1.68, SZ - 0.05);
      eyes(1.8, 0.36, 0.15, 0.11);
      // 帽子 + 帽沿 + 徽章
      const cap = P(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), _kmat(c), 0, 1.82, SZ);
      cap.scale.z = 1.05;
      const brim = P(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10, 1, false, -Math.PI / 2, Math.PI), _kmat(c), 0, 1.9, SZ + 0.3);
      brim.scale.z = 1.4;
      const badge = P(new THREE.SphereGeometry(0.13, 8, 6), _kmat(0xffffff), 0, 1.98, SZ + 0.36);
      badge.scale.z = 0.4;
      break;
    }
    case 'peach': {
      // 洋裝（圓錐裙）+ 澎袖
      P(new THREE.ConeGeometry(0.62, 0.95, 12), _kmat(0xf58fbb), 0, 0.98, SZ);
      P(new THREE.BoxGeometry(0.6, 0.45, 0.42), _kmat(0xf58fbb), 0, 1.3, SZ);
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.17, 8, 6), _kmat(0xff9fc8), sx * 0.36, 1.42, SZ);
      // 藍寶石胸針
      P(new THREE.SphereGeometry(0.08, 6, 5), _kmat(0x3b6fd6, 0x3b6fd6), 0, 1.32, SZ + 0.24);
      arms(0xf58fbb, 0xffffff);
      // 頭 + 金色長髮
      P(new THREE.SphereGeometry(0.4, 12, 10), skin, 0, 1.72, SZ);
      const hairMat = _kmat(0xffd54f);
      const hairTop = P(new THREE.SphereGeometry(0.44, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), hairMat, 0, 1.78, SZ - 0.02);
      hairTop.scale.z = 1.1;
      const hairBack = P(new THREE.SphereGeometry(0.3, 10, 8), hairMat, 0, 1.35, SZ - 0.38);
      hairBack.scale.set(0.85, 1.7, 0.7);
      for (const sx of [-1, 1]) {
        const bang = P(new THREE.SphereGeometry(0.14, 7, 6), hairMat, sx * 0.32, 1.85, SZ + 0.25);
        bang.scale.y = 1.4;
      }
      eyes(1.78, 0.34, 0.15, 0.11, 0x2a5fd0);
      // 嘴唇 + 耳環
      P(new THREE.SphereGeometry(0.07, 6, 5), _kmat(0xe05f7a), 0, 1.58, SZ + 0.38).scale.set(1.6, 0.6, 0.6);
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.05, 5, 4), _kmat(0x3b6fd6, 0x3b6fd6), sx * 0.41, 1.62, SZ);
      // 皇冠
      P(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 8), _kmat(0xffe066, 0xdda520), 0, 2.16, SZ);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        P(new THREE.SphereGeometry(0.05, 5, 4), _kmat(0xd63b5f), Math.cos(a) * 0.15, 2.28, SZ + Math.sin(a) * 0.15);
      }
      break;
    }
    case 'toad': {
      // 白背心 + 藍外套
      P(new THREE.BoxGeometry(0.72, 0.65, 0.48), _kmat(0x3b5fd6), 0, 1.05, SZ);
      P(new THREE.BoxGeometry(0.3, 0.6, 0.5), _kmat(0xffffff), 0, 1.05, SZ + 0.02);
      arms(0x3b5fd6, 0xffffff);
      // 小臉
      P(new THREE.SphereGeometry(0.32, 10, 8), skin, 0, 1.58, SZ);
      eyes(1.62, 0.27, 0.13, 0.1);
      // 招牌大蘑菇頭：白底紅點
      const capM = P(new THREE.SphereGeometry(0.58, 14, 10), _kmat(0xf8f8f8), 0, 1.92, SZ);
      capM.scale.y = 0.82;
      const spots = [[0, 0.35, 0.45], [0.42, 0.3, 0.15], [-0.42, 0.3, 0.15], [0.25, 0.35, -0.4], [-0.25, 0.35, -0.4]];
      for (const [sx, sy, szz] of spots) {
        const spot = P(new THREE.SphereGeometry(0.16, 8, 6), _kmat(0xe53935), sx, 1.92 + sy, SZ + szz);
        spot.scale.setScalar(0.9);
      }
      break;
    }
    case 'bowser': {
      const bodyC = _kmat(0xd9e04f); // 黃綠肚
      P(new THREE.SphereGeometry(0.44, 10, 8), bodyC, 0, 1.08, SZ).scale.set(1, 0.9, 0.8);
      arms(0xd9e04f, 0xd9e04f);
      // 龜殼（背後，綠殼白刺）
      const shell = P(new THREE.SphereGeometry(0.5, 12, 9, 0, Math.PI * 2, 0, Math.PI / 1.8), _kmat(0x2f7d32), 0, 1.15, SZ - 0.3);
      shell.rotation.x = 1.25;
      for (const [sx, sy] of [[0, 0.25], [0.28, 0], [-0.28, 0], [0, -0.25]]) {
        const spike = P(new THREE.ConeGeometry(0.11, 0.32, 6), _kmat(0xfff3d0), sx, 1.2 + sy, SZ - 0.62);
        spike.rotation.x = -1.4;
      }
      // 大頭 + 突出的嘴
      P(new THREE.SphereGeometry(0.44, 12, 10), _kmat(0xc9d04a), 0, 1.75, SZ);
      const snout = P(new THREE.SphereGeometry(0.28, 10, 8), _kmat(0xf2e8c0), 0, 1.62, SZ + 0.36);
      snout.scale.set(1.25, 0.75, 1);
      // 獠牙
      for (const sx of [-1, 1]) {
        P(new THREE.ConeGeometry(0.05, 0.16, 5), _kmat(0xffffff), sx * 0.22, 1.5, SZ + 0.5);
      }
      // 鼻孔
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.04, 5, 4), _kmat(0x5a4a1a), sx * 0.1, 1.72, SZ + 0.58);
      eyes(1.88, 0.34, 0.17, 0.1, 0xd63b2e);
      // 紅眉毛 + 紅髮
      for (const sx of [-1, 1]) {
        const brow = P(new THREE.BoxGeometry(0.22, 0.07, 0.08), _kmat(0xd0452a), sx * 0.17, 2.0, SZ + 0.36);
        brow.rotation.z = -sx * 0.4;
      }
      const hair = P(new THREE.SphereGeometry(0.2, 8, 6), _kmat(0xd0452a), 0, 2.15, SZ - 0.05);
      hair.scale.set(1.2, 0.7, 1.3);
      // 白色小角
      for (const sx of [-1, 1]) {
        const horn = P(new THREE.ConeGeometry(0.09, 0.3, 6), _kmat(0xfff3d0), sx * 0.35, 2.12, SZ);
        horn.rotation.z = -sx * 0.6;
      }
      break;
    }
    case 'yoshi': {
      const green = _kmat(0x59c135);
      // 身體：綠背白肚
      P(new THREE.SphereGeometry(0.42, 10, 8), green, 0, 1.05, SZ).scale.set(1, 0.95, 0.85);
      P(new THREE.SphereGeometry(0.32, 9, 7), _kmat(0xffffff), 0, 1.0, SZ + 0.18).scale.set(0.9, 0.9, 0.6);
      arms(0x59c135, 0x59c135);
      // 紅色龜鞍
      const saddle = P(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), _kmat(0xd63b2e), 0, 1.1, SZ - 0.3);
      saddle.rotation.x = 1.3;
      P(new THREE.TorusGeometry(0.3, 0.05, 6, 12), _kmat(0xffffff), 0, 1.1, SZ - 0.34).rotation.x = 0.28;
      // 頭 + 大圓鼻
      P(new THREE.SphereGeometry(0.38, 12, 10), green, 0, 1.72, SZ);
      const snout = P(new THREE.SphereGeometry(0.3, 10, 8), green, 0, 1.6, SZ + 0.38);
      snout.scale.set(1.15, 0.85, 1.15);
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.05, 5, 4), _kmat(0x2a6a1a), sx * 0.13, 1.7, SZ + 0.62);
      // 恐龍式頭頂眼睛
      for (const sx of [-1, 1]) {
        P(new THREE.SphereGeometry(0.14, 8, 6), _kmat(0xffffff), sx * 0.14, 2.05, SZ + 0.12);
        P(new THREE.SphereGeometry(0.07, 6, 5), _kmat(0x1a1a2a), sx * 0.14, 2.07, SZ + 0.24);
      }
      // 背鰭
      for (let k = 0; k < 3; k++) {
        const fin = P(new THREE.SphereGeometry(0.1, 6, 5), _kmat(0xd63b2e), 0, 1.95 - k * 0.22, SZ - 0.3 - k * 0.08);
        fin.scale.set(0.5, 1, 1);
      }
      // 紅色小臉頰
      break;
    }
    case 'kong': {
      const fur = _kmat(0x6a4222);
      const tan = _kmat(0xc99a6a);
      P(new THREE.SphereGeometry(0.48, 10, 8), fur, 0, 1.05, SZ).scale.set(1.1, 0.95, 0.85);
      P(new THREE.SphereGeometry(0.3, 8, 7), tan, 0, 1.0, SZ + 0.22).scale.set(0.95, 0.8, 0.5);
      // 紅領帶
      P(new THREE.BoxGeometry(0.2, 0.42, 0.08), _kmat(0xd63b2e), 0, 1.05, SZ + 0.36).rotation.x = 0.15;
      P(new THREE.BoxGeometry(0.24, 0.12, 0.1), _kmat(0xb52a1e), 0, 1.3, SZ + 0.34);
      arms(0x6a4222, 0xc99a6a);
      // 大頭 + 突出下顎
      P(new THREE.SphereGeometry(0.42, 12, 10), fur, 0, 1.72, SZ);
      const muzzle = P(new THREE.SphereGeometry(0.3, 10, 8), tan, 0, 1.58, SZ + 0.3);
      muzzle.scale.set(1.2, 0.8, 0.9);
      P(new THREE.SphereGeometry(0.06, 5, 4), _kmat(0x3a2a1a), 0.09, 1.62, SZ + 0.55);
      P(new THREE.SphereGeometry(0.06, 5, 4), _kmat(0x3a2a1a), -0.09, 1.62, SZ + 0.55);
      // 嘴縫
      P(new THREE.BoxGeometry(0.3, 0.03, 0.1), _kmat(0x4a2a12), 0, 1.48, SZ + 0.5);
      eyes(1.84, 0.32, 0.14, 0.1);
      // 呆毛
      const crest = P(new THREE.ConeGeometry(0.1, 0.3, 6), fur, 0, 2.2, SZ);
      crest.rotation.z = 0.3;
      // 大耳朵
      for (const sx of [-1, 1]) P(new THREE.SphereGeometry(0.12, 6, 5), tan, sx * 0.4, 1.78, SZ - 0.08);
      break;
    }
    case 'boo': {
      // 幽靈：整個駕駛就是一團白色幽靈
      const ghostMat = new THREE.MeshLambertMaterial({
        color: 0xf4f4ff, transparent: true, opacity: 0.92, emissive: 0x8888bb, emissiveIntensity: 0.35,
      });
      const body = P(new THREE.SphereGeometry(0.52, 14, 12), ghostMat, 0, 1.45, SZ);
      body.scale.set(1, 1.15, 0.95);
      // 尾巴尖
      const tail = P(new THREE.ConeGeometry(0.2, 0.5, 8), ghostMat, 0, 0.85, SZ - 0.25);
      tail.rotation.x = Math.PI - 0.5;
      // 短短的手
      for (const sx of [-1, 1]) {
        const hand = P(new THREE.SphereGeometry(0.15, 7, 6), ghostMat, sx * 0.55, 1.35, SZ + 0.15);
        hand.scale.set(1.4, 0.7, 0.8);
      }
      // 瞇瞇眼（斜的黑豆眼）
      for (const sx of [-1, 1]) {
        const eye = P(new THREE.SphereGeometry(0.11, 7, 6), _kmat(0x14142a), sx * 0.2, 1.68, SZ + 0.42);
        eye.scale.set(0.65, 1.2, 0.5);
        eye.rotation.z = sx * 0.45;
      }
      // 張嘴 + 吐舌
      const mouth = P(new THREE.SphereGeometry(0.2, 8, 6), _kmat(0x2a1a3a), 0, 1.38, SZ + 0.44);
      mouth.scale.set(1.1, 0.7, 0.5);
      const tongue = P(new THREE.SphereGeometry(0.13, 7, 5), _kmat(0xe05f7a), 0, 1.28, SZ + 0.52);
      tongue.scale.set(0.9, 0.5, 1.4);
      tongue.rotation.x = 0.5;
      break;
    }
  }
  return d;
}

// 角色 + 車種 → 最終能力值（夾在 1~6）
function combineStats(char, kartDef) {
  const st = {};
  for (const k of ['speed', 'accel', 'handling', 'weight']) {
    st[k] = Math.max(1, Math.min(6, char.stats[k] + ((kartDef.stats && kartDef.stats[k]) || 0)));
  }
  return st;
}

class Kart {
  constructor(char, track, index, isPlayer, kartDef) {
    this.char = char;
    this.kartDef = kartDef || (typeof KARTS !== 'undefined' ? KARTS[0] : { model: 'standard', stats: {}, perk: null });
    this.track = track;
    this.index = index;
    this.isPlayer = isPlayer;
    this.mesh = buildKartMesh(char, this.kartDef);
    this.perk = this.kartDef.perk || null;

    const st = combineStats(char, this.kartDef);
    this.effStats = st;
    this.baseMax = 30 + st.speed * 1.15;      // 極速
    this.accelRate = 8 + st.accel * 1.9;       // 加速度
    this.steerRate = 1.55 + st.handling * 0.16; // 轉向速率
    this.weight = st.weight;

    // AI 個性
    this.aiSkill = 0.9 + Math.random() * 0.1;
    this.aiLane = (Math.random() * 2 - 1) * 0.35; // 慣用車道偏移
    this.aiDrift = false;
    this.aiItemTimer = 0;
    this.rubber = 1;

    this.reset();
  }

  reset() {
    const slot = this.track.gridSlot(this.index);
    this.pos = slot.pos.clone();
    this.pos.y = this.track.sample(slot.idx).pos.y;
    this.heading = slot.heading;
    this.sampleIdx = slot.idx;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this.falling = false;
    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.coins = this.perk === 'coin' ? 3 : 0; // 甜甜圈號：開場自帶金幣
    this.item = null;
    this.itemUses = 0;
    this.itemRoll = 0;
    this.boostTimer = 0;
    this.starTimer = 0;
    this.shrinkTimer = 0;
    this.spinTimer = 0;
    this.invulnTimer = 0;
    this.slipTimer = 0;
    this.slipPhase = 0;
    this.inkTimer = 0;
    this.bulletTimer = 0;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.wasDrifting = false;
    this.offroad = false;
    this.spinAngle = 0;
    this.rank = this.index + 1;
    this._groundY = this.pos.y;
    this.syncMesh();
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get maxSpeed() {
    let m = this.baseMax * (1 + Math.min(this.coins, 10) * 0.008);
    if (this.starTimer > 0) m *= 1.22;
    if (this.bulletTimer > 0) m *= 1.55;
    if (this.shrinkTimer > 0) m *= 0.72;
    if (!this.isPlayer) m *= this.aiSkill * this.rubber;
    return m;
  }

  boost(dur) {
    this.boostTimer = Math.max(this.boostTimer, dur);
    if (this.isPlayer) AudioSys.play('boost');
  }

  spinOut() {
    if (this.starTimer > 0 || this.bulletTimer > 0 || this.invulnTimer > 0 || this.spinTimer > 0 || this.boostTimer > 0.8) return false;
    this.spinTimer = this.perk === 'armor' ? 0.55 : 1.1; // 坦克：暈眩減半
    this.speed *= 0.35;
    this.coins = Math.max(0, this.coins - 3);
    this.driftDir = 0;
    this.driftCharge = 0;
    if (this.isPlayer) AudioSys.play('spin');
    return true;
  }

  // 打滑（油漬/泥巴等地面陷阱）：方向亂晃 + 減速
  applySlip() {
    if (this.perk === 'hover') return; // 雲朵/漂浮車：地面陷阱無效
    if (this.starTimer > 0 || this.bulletTimer > 0 || this.boostTimer > 0.3) return; // 星星/火箭免疫
    if (this.slipTimer <= 0) {
      this.slipPhase = 0;
      if (this.isPlayer) AudioSys.play('bump');
    }
    this.slipTimer = 0.45;
  }

  respawn() {
    const s = this.track.sample(this.sampleIdx);
    this.pos.copy(s.pos);
    this.pos.y = s.pos.y + 0.5;
    this.heading = Math.atan2(s.tan.x, s.tan.z);
    this.speed = 0;
    this.vy = 0;
    this.falling = false;
    this.invulnTimer = 2;
    if (this.isPlayer) AudioSys.play('fall');
  }

  update(dt, input, world) {
    const track = this.track, th = track.theme;

    // 計時器
    for (const t of ['boostTimer', 'starTimer', 'shrinkTimer', 'spinTimer', 'invulnTimer', 'slipTimer', 'inkTimer', 'bulletTimer']) {
      if (this[t] > 0) this[t] = Math.max(0, this[t] - dt);
    }
    if (this.itemRoll > 0) {
      this.itemRoll -= dt;
      if (this.itemRoll <= 0) {
        this.item = world.items.rollItem(this);
        this.itemUses = ITEM_USES[this.item] || 1;
        if (this.isPlayer) AudioSys.play('item');
      }
    }

    const spinning = this.spinTimer > 0;
    if (spinning) this.spinAngle += dt * 12;
    else this.spinAngle = 0;

    // ---------- 掉落虛空 ----------
    if (this.falling) {
      this.vy -= 40 * dt;
      this.pos.y += this.vy * dt;
      this.pos.addScaledVector(this.forward(), this.speed * dt * 0.5);
      const roadY = track.sample(this.sampleIdx).pos.y;
      if (this.pos.y < roadY - 16) this.respawn();
      this.syncMesh();
      return;
    }

    // ---------- 甩尾 ----------
    const steer = spinning ? 0 : input.steer;
    let turn = 0;
    const canDrift = this.grounded && this.speed > 13 && !spinning;
    if (input.drift && !this.wasDrifting && this.grounded && !spinning) {
      this.vy = th.floaty ? 6 : 5; this.grounded = false; // 起跳（水中跳更高）
      if (this.isPlayer) AudioSys.play('hop');
    }
    if (input.drift && canDrift) {
      if (this.driftDir === 0 && Math.abs(steer) > 0.25) this.driftDir = Math.sign(steer);
      if (this.driftDir !== 0) {
        // 甩尾中：轉向被限制在甩尾方向的一個範圍內
        const bias = 0.42 + 0.62 * Math.max(0, steer * this.driftDir);
        turn = this.driftDir * bias * this.steerRate;
        this.driftCharge += dt * (0.9 + Math.abs(steer) * 0.55) * (this.perk === 'drift' ? 1.3 : 1); // 摩托：蓄力+30%
      }
    } else {
      if (this.driftDir !== 0) {
        // 放開甩尾 → 依蓄力給噴射
        if (this.driftCharge > 2.2) this.boost(1.5);
        else if (this.driftCharge > 1.1) this.boost(0.85);
        this.driftDir = 0;
        this.driftCharge = 0;
      }
      // 一般轉向（速度太低轉不動，高速略降低轉向靈敏）
      const spdFactor = Math.min(1, this.speed / 12) * (1 - Math.min(0.35, this.speed / this.baseMax * 0.3));
      turn = steer * this.steerRate * spdFactor;
    }
    this.wasDrifting = input.drift;
    // 有效抓地力 = 主題抓地力 × 天氣抓地力（雨/雪/暴風雪更滑）
    const grip = th.grip * (world.weather ? world.weather.gripMul : 1);
    this.heading += turn * dt * (grip < 0.8 ? 0.85 : 1);
    // 打滑：方向亂晃
    if (this.slipTimer > 0) {
      this.slipPhase += dt * 16;
      this.heading += Math.sin(this.slipPhase) * 2.4 * dt;
    }

    // ---------- 速度 ----------
    let target = 0;
    let rate = this.accelRate;
    if (!spinning && input.accel) target = this.maxSpeed;
    if (!spinning && input.brake) { target = input.accel ? target * 0.55 : -9; rate = 22; }
    if (this.offroad && this.boostTimer <= 0 && this.starTimer <= 0) {
      // 怪獸卡車：越野幾乎不減速
      const f = this.perk === 'offroad' ? Math.min(0.95, th.offroad * 1.9) : th.offroad;
      target = Math.min(target, this.baseMax * f);
    }
    if (this.slipTimer > 0) target = Math.min(target, this.baseMax * 0.72);
    if (this.boostTimer > 0) { target = this.maxSpeed * 1.38; rate = 55; }
    if (this.speed < target) {
      this.speed = Math.min(target, this.speed + rate * dt);
    } else {
      const decel = this.offroad ? 30 : (input.brake ? 30 : 11);
      this.speed = Math.max(target, this.speed - decel * dt);
    }

    // ---------- 位移 ----------
    const fwd = this.forward();
    this.pos.addScaledVector(fwd, this.speed * dt);
    // 甩尾側滑
    if (this.driftDir !== 0) {
      const leftV = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this.pos.addScaledVector(leftV, -this.driftDir * this.speed * 0.28 * dt);
    }

    // ---------- 垂直 ----------
    this.sampleIdx = track.nearestIdx(this.pos, this.sampleIdx);
    const groundY = track.heightAt(this.pos, this.sampleIdx);
    this._groundY = groundY;
    if (!this.grounded) {
      // 水中浮力落下飄飄的；UFO 滯空久跳更遠
      this.vy -= (th.floaty ? 10 : 24) * (this.perk === 'glide' ? 0.55 : 1) * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) { this.pos.y = groundY; this.vy = 0; this.grounded = true; }
    } else {
      this.pos.y = groundY;
    }

    // ---------- 賽道邊界 ----------
    const lat = track.lateralOffset(this.pos, this.sampleIdx);
    const s = track.sample(this.sampleIdx);
    if (th.voidFall) {
      this.offroad = false;
      if (Math.abs(lat) > track.halfW + 1.2) {
        this.falling = true;
        this.grounded = false;
        this.vy = Math.min(this.vy, 0);
      }
    } else if (th.open) {
      this.offroad = Math.abs(lat) > track.halfW + 0.6;
      const limit = track.halfW + 26;
      if (Math.abs(lat) > limit) {
        const excess = Math.abs(lat) - limit;
        this.pos.addScaledVector(s.left, -Math.sign(lat) * excess);
      }
    } else {
      this.offroad = false;
      const limit = track.halfW + 0.9;
      if (Math.abs(lat) > limit) {
        const excess = Math.abs(lat) - limit;
        this.pos.addScaledVector(s.left, -Math.sign(lat) * excess);
        this.speed *= Math.pow(0.25, dt * 4);
        if (this.isPlayer && this.speed > 8) AudioSys.play('bump');
      }
    }

    // ---------- 圈數 ----------
    const N = track.N;
    const prev = this._prevIdx === undefined ? this.sampleIdx : this._prevIdx;
    if (prev > N * 0.8 && this.sampleIdx < N * 0.2) {
      this.lap++;
      if (!this.finished && this.lap > track.laps) {
        this.finished = true;
        this.finishTime = world.raceTime;
      } else if (this.isPlayer && this.lap > 1 && this.lap <= track.laps) {
        AudioSys.play('lap');
        world.onLap && world.onLap(this.lap);
      }
    } else if (prev < N * 0.2 && this.sampleIdx > N * 0.8) {
      this.lap--; // 倒退過線要扣回來，防作弊
    }
    this._prevIdx = this.sampleIdx;

    this.syncMesh(dt);
  }

  progress() {
    return this.lap * this.track.N + this.sampleIdx;
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading + this.spinAngle;
    const scale = this.shrinkTimer > 0 ? 0.55 : 1;
    this.mesh.scale.setScalar(scale);
    // 輪子滾動
    if (dt && this.mesh.userData.wheels) {
      for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.2;
    }
    // 漂浮車（雲朵/UFO）上下飄
    const floatGroup = this.mesh.userData.floatGroup;
    if (floatGroup) floatGroup.position.y = Math.sin(performance.now() * 0.0035 + this.index) * 0.12 + 0.08;
    // 假陰影貼在地面（跳起時留在原地縮小）
    const shadow = this.mesh.userData.shadow;
    if (shadow) {
      if (this.falling) {
        shadow.visible = false;
      } else {
        shadow.visible = true;
        const air = Math.max(0, this.pos.y - (this._groundY !== undefined ? this._groundY : this.pos.y));
        shadow.position.y = -air + 0.04;
        const sh = 1 / (1 + air * 0.25);
        shadow.scale.setScalar(sh / scale);
      }
    }
    // 甩尾火花
    const sparks = this.mesh.userData.sparks;
    if (sparks) {
      const show = this.driftDir !== 0 && this.driftCharge > 1.1;
      for (const sp of sparks) {
        sp.visible = show;
        if (show) sp.material.color.setHex(this.driftCharge > 2.2 ? 0xff8822 : 0x55aaff);
      }
    }
    // 星星無敵：車身彩虹閃爍；火箭衝刺：橘紅熾熱
    const bodyMat = this.mesh.userData.bodyMat;
    if (bodyMat) {
      if (this.starTimer > 0) {
        bodyMat.color.setHSL((performance.now() * 0.002) % 1, 0.9, 0.6);
        bodyMat.emissive.copy(bodyMat.color).multiplyScalar(0.4);
      } else if (this.bulletTimer > 0) {
        bodyMat.color.setHex(0xff8a2a);
        bodyMat.emissive.setHex(0xff5a1a);
      } else {
        bodyMat.color.setHex(this.char.body);
        bodyMat.emissive.setHex(0x000000);
      }
    }
  }
}
