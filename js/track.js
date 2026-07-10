// ============================================================
// 賽道引擎：曲線取樣、路面/護欄/裝飾網格生成、小地圖、最近點查詢
// ============================================================

// 種子隨機數（讓每條賽道的裝飾位置固定）
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Track {
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    this.width = def.width;
    this.halfW = def.width / 2;
    this.laps = def.laps;
    this.rand = mulberry32(TRACKS.indexOf(def) * 1013 + 7);

    const pts = def.points.map(p => new THREE.Vector3(p[0], p[2] || 0, p[1]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();

    const N = this.N = Math.max(400, Math.round(this.length / 2.2));
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const pos = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const left = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      this.samples.push({ pos, tan, left });
    }
    this.segLen = this.length / N;
  }

  sample(i) {
    const N = this.N;
    return this.samples[((i % N) + N) % N];
  }

  // 從上次已知的索引附近找最近取樣點（避免全域搜尋）
  nearestIdx(pos, lastIdx) {
    const N = this.N;
    let best = -1, bestD = Infinity;
    for (let di = -18; di <= 50; di++) {
      const i = ((lastIdx + di) % N + N) % N;
      const s = this.samples[i];
      const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    // 離太遠時做全域搜尋（重生、被打飛等情況）
    if (bestD > (this.width * 4) ** 2) {
      for (let i = 0; i < N; i += 3) {
        const s = this.samples[i];
        const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  // 橫向偏移（+ 為左側）
  lateralOffset(pos, idx) {
    const s = this.sample(idx);
    return (pos.x - s.pos.x) * s.left.x + (pos.z - s.pos.z) * s.left.z;
  }

  // 路面高度（在取樣點 idx 與 idx+1 間內插）
  heightAt(pos, idx) {
    const s0 = this.sample(idx), s1 = this.sample(idx + 1);
    const dx = s1.pos.x - s0.pos.x, dz = s1.pos.z - s0.pos.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((pos.x - s0.pos.x) * dx + (pos.z - s0.pos.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    return s0.pos.y + (s1.pos.y - s0.pos.y) * t;
  }

  // 前方彎道彎曲程度（給 AI 減速用），回傳 0(直線)~PI(迴轉)
  curvatureAhead(idx, ahead) {
    const t0 = this.sample(idx).tan, t1 = this.sample(idx + ahead).tan;
    const dot = Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z));
    return Math.acos(dot);
  }

  // 起跑格位置：8 台車、兩兩一排，排在起跑線後方
  gridSlot(rank) {
    const row = Math.floor(rank / 2), col = rank % 2;
    const idx = this.N - 10 - row * 7;
    const s = this.sample(idx);
    const lat = (col === 0 ? 1 : -1) * this.halfW * 0.35;
    const pos = s.pos.clone().addScaledVector(s.left, lat);
    const heading = Math.atan2(s.tan.x, s.tan.z);
    return { pos, heading, idx: ((idx % this.N) + this.N) % this.N };
  }

  // ---------- 場景建構 ----------
  build(scene) {
    const th = this.theme;
    scene.background = new THREE.Color(th.sky);
    scene.fog = new THREE.Fog(th.fog, th.fogNear || 120, th.fogFar || (th.night ? 420 : 620));

    this._buildRoad(scene, th);
    this._buildGround(scene, th);
    if (!th.open && !th.voidFall) this._buildRails(scene, th);
    this._buildStartGate(scene, th);
    this._buildDecorations(scene, th);
    this._buildLandmark(scene, th);
    this._buildSkyExtras(scene, th);
    this._buildMinimap();
  }

  _roadVert(i, side) { // side: +1 左緣, -1 右緣
    const s = this.sample(i);
    return [
      s.pos.x + s.left.x * this.halfW * side,
      s.pos.y,
      s.pos.z + s.left.z * this.halfW * side,
    ];
  }

  _ribbon(latA, latB, yOff, colorFn) {
    // 沿賽道生成一條帶狀網格，latA/latB 為兩側橫向偏移，colorFn(i) 回傳 THREE.Color
    const N = this.N;
    const positions = [], colors = [], indices = [];
    for (let i = 0; i <= N; i++) {
      const s = this.sample(i);
      const c = colorFn(i % N);
      positions.push(
        s.pos.x + s.left.x * latA, s.pos.y + yOff, s.pos.z + s.left.z * latA,
        s.pos.x + s.left.x * latB, s.pos.y + yOff, s.pos.z + s.left.z * latB,
      );
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < N) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }

  _buildRoad(scene, th) {
    const hw = this.halfW;
    const roadC = new THREE.Color(th.road);
    // 路面（彩虹賽道用漸層色）
    const road = this._ribbon(hw, -hw, 0, (i) => {
      if (th.rainbowRoad) {
        const c = new THREE.Color();
        c.setHSL((i / this.N * 6) % 1, 0.85, 0.55);
        return c;
      }
      return roadC;
    });
    scene.add(road);
    // 兩側紅白路緣
    const cA = new THREE.Color(th.curbA), cB = new THREE.Color(th.curbB);
    const stripe = (i) => (Math.floor(i / 6) % 2 === 0 ? cA : cB);
    scene.add(this._ribbon(hw + 1.4, hw, 0.06, stripe));
    scene.add(this._ribbon(-hw, -hw - 1.4, 0.06, stripe));
    // 高架路段的路基側牆（讓有高度的路看起來像築堤/橋）
    const maxY = Math.max(...this.def.points.map(p => p[2] || 0));
    if (maxY > 0.5 && !th.voidFall) {
      const dark = roadC.clone().multiplyScalar(0.5);
      for (const side of [1, -1]) {
        const N = this.N;
        const positions = [], indices = [];
        for (let i = 0; i <= N; i++) {
          const s = this.sample(i);
          const x = s.pos.x + s.left.x * (hw + 1.4) * side;
          const z = s.pos.z + s.left.z * (hw + 1.4) * side;
          positions.push(x, s.pos.y + 0.06, z, x, -0.5, z);
          if (i < N) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: dark, side: THREE.DoubleSide })));
      }
    }
    // 起跑線（黑白格）
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#fff' : '#111';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const s0 = this.sample(0);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, 4),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(s0.tan.x, s0.tan.z);
    line.position.set(s0.pos.x, s0.pos.y + 0.08, s0.pos.z);
    scene.add(line);
  }

  _buildGround(scene, th) {
    if (th.voidFall) return; // 天空賽道沒有地面
    const geo = new THREE.PlaneGeometry(2400, 2400);
    const mat = new THREE.MeshLambertMaterial({ color: th.ground });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.4;
    scene.add(ground);
  }

  _buildRails(scene, th) {
    const hw = this.halfW;
    const railC = new THREE.Color(th.rail);
    for (const side of [1, -1]) {
      const N = this.N;
      const positions = [], indices = [];
      for (let i = 0; i <= N; i++) {
        const s = this.sample(i);
        const x = s.pos.x + s.left.x * (hw + 1.6) * side;
        const z = s.pos.z + s.left.z * (hw + 1.6) * side;
        positions.push(x, s.pos.y + 1.3, z, x, s.pos.y - 0.2, z);
        if (i < N) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: railC, side: THREE.DoubleSide,
        emissive: th.night ? railC : 0x000000, emissiveIntensity: th.night ? 0.5 : 0,
      })));
    }
  }

  _buildStartGate(scene, th) {
    const s0 = this.sample(0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd63b3b });
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 9, 8);
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(
        s0.pos.x + s0.left.x * (this.halfW + 1.5) * side, s0.pos.y + 4.5,
        s0.pos.z + s0.left.z * (this.halfW + 1.5) * side
      );
      scene.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + 5, 2, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xffd54f })
    );
    banner.position.set(s0.pos.x, s0.pos.y + 9.5, s0.pos.z);
    banner.rotation.y = Math.atan2(s0.left.x, s0.left.z) + Math.PI / 2;
    scene.add(banner);
  }

  // 隨機取一個賽道旁的位置（給裝飾用）
  _sideSpot(minDist, maxDist) {
    const i = Math.floor(this.rand() * this.N);
    const s = this.samples[i];
    const side = this.rand() < 0.5 ? 1 : -1;
    const d = this.halfW + minDist + this.rand() * (maxDist - minDist);
    return {
      x: s.pos.x + s.left.x * d * side,
      z: s.pos.z + s.left.z * d * side,
      y: s.pos.y,
      near: s,
    };
  }

  _buildDecorations(scene, th) {
    const group = new THREE.Group();
    for (const [type, count] of (th.decos || [])) {
      if (type === 'star') continue; // 星星在 _buildSkyExtras 大量生成
      for (let n = 0; n < count; n++) {
        const spot = this._sideSpot(6, 60);
        // 開放賽道的裝飾放在平地上；封閉/高架賽道跟著路面高度
        const y = th.open ? 0 : spot.y;
        const deco = buildDecoration(type, this.rand);
        if (!deco) continue;
        deco.position.set(spot.x, type === 'cloud' ? spot.y - 10 - this.rand() * 15 : y, spot.z);
        deco.rotation.y = this.rand() * Math.PI * 2;
        group.add(deco);
      }
    }
    // 起跑門旁的彩色氣球串（每條賽道都有，比賽氣氛）
    const s0 = this.sample(0);
    for (const side of [1, -1]) {
      const balloons = buildDecoration('balloons', this.rand);
      balloons.position.set(
        s0.pos.x + s0.left.x * (this.halfW + 5) * side, s0.pos.y,
        s0.pos.z + s0.left.z * (this.halfW + 5) * side
      );
      group.add(balloons);
    }
    scene.add(group);
  }

  // 大型地標：放在離賽道有點距離的顯眼位置
  _buildLandmark(scene, th) {
    if (!th.landmark) return;
    const lm = buildLandmark(th.landmark, this.rand);
    if (!lm) return;
    if (th.landmark === 'volcano') {
      // 火山放在賽道中心（賽道繞著它跑）
      let cx = 0, cz = 0;
      for (const p of this.def.points) { cx += p[0]; cz += p[1]; }
      lm.position.set(cx / this.def.points.length, 0, cz / this.def.points.length);
    } else if (th.landmark === 'planet' || th.landmark === 'earth') {
      lm.position.set(300, 120, -260);
    } else {
      const spot = this._sideSpot(50, 90);
      lm.position.set(spot.x, th.open ? 0 : spot.y, spot.z);
    }
    scene.add(lm);
  }

  // 遠景：山脈環、高空雲、彩虹賽道的滿天星斗
  _buildSkyExtras(scene, th) {
    const group = new THREE.Group();
    if (th.mountains) {
      const mat = new THREE.MeshLambertMaterial({ color: th.mountains });
      for (let n = 0; n < 12; n++) {
        const a = (n / 12) * Math.PI * 2 + this.rand() * 0.4;
        const r = 620 + this.rand() * 200;
        const h = 90 + this.rand() * 130;
        const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 7), mat);
        m.position.set(Math.cos(a) * r, h / 2 - 20, Math.sin(a) * r);
        group.add(m);
        if (h > 160) { // 高山加雪頂
          const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.32, 7), new THREE.MeshLambertMaterial({ color: 0xf5fafd }));
          cap.position.set(m.position.x, h - h * 0.16 - 20, m.position.z);
          group.add(cap);
        }
      }
    }
    if (th.cloudSky) {
      for (let n = 0; n < 12; n++) {
        const cloud = buildDecoration('cloud', this.rand);
        const a = this.rand() * Math.PI * 2, r = 150 + this.rand() * 350;
        cloud.position.set(Math.cos(a) * r, 60 + this.rand() * 50, Math.sin(a) * r);
        cloud.scale.setScalar(2 + this.rand() * 2);
        group.add(cloud);
      }
    }
    if ((th.decos || []).some(([t]) => t === 'star')) {
      for (let n = 0; n < 220; n++) {
        const star = new THREE.Mesh(
          new THREE.SphereGeometry(0.9 + this.rand() * 1.4, 5, 4),
          new THREE.MeshBasicMaterial({ color: [0xffffff, 0xffe066, 0x9fd0ff][n % 3] })
        );
        const a = this.rand() * Math.PI * 2, r = 450 + this.rand() * 350;
        star.position.set(Math.cos(a) * r, -100 + this.rand() * 400, Math.sin(a) * r);
        group.add(star);
      }
    }
    scene.add(group);
  }

  _buildMinimap() {
    const size = 180;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
    }
    const pad = 16;
    const scale = Math.min((size - pad * 2) / (maxX - minX), (size - pad * 2) / (maxZ - minZ));
    const ox = (size - (maxX - minX) * scale) / 2 - minX * scale;
    const oz = (size - (maxZ - minZ) * scale) / 2 - minZ * scale;
    this.mapTransform = (pos) => [pos.x * scale + ox, pos.z * scale + oz];

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= this.N; i += 4) {
      const [x, y] = this.mapTransform(this.sample(i).pos);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // 起點標記
    const [sx, sy] = this.mapTransform(this.sample(0).pos);
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
    this.minimapCanvas = canvas;
  }
}

// ---------- 裝飾物模型 ----------
// 材質快取：同色材質共用一份（省記憶體與建立成本）。
// 快取材質標記 cached，disposeScene 會跳過不銷毀。絕不要改 _lam 回傳材質的顏色！
const _lamCache = new Map();
function _lam(color, emissive) {
  const key = color + '|' + (emissive || 0);
  let m = _lamCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive: emissive || 0x000000,
      emissiveIntensity: emissive ? 0.7 : 0,
    });
    m.userData.cached = true;
    _lamCache.set(key, m);
  }
  return m;
}

function buildDecoration(type, rand) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (type) {
    case 'tree': case 'forest': {
      const s = type === 'forest' ? 1.3 : 1;
      add(new THREE.CylinderGeometry(0.5 * s, 0.7 * s, 3 * s, 6), _lam(0x7b4a21), 0, 1.5 * s, 0);
      add(new THREE.ConeGeometry(2.4 * s, 4.5 * s, 8), _lam(0x2e7d32), 0, 5 * s, 0);
      break;
    }
    case 'palm': {
      add(new THREE.CylinderGeometry(0.4, 0.6, 6, 6), _lam(0x9a6f3f), 0, 3, 0);
      for (let k = 0; k < 5; k++) {
        const leaf = add(new THREE.ConeGeometry(0.5, 3.5, 5), _lam(0x3fa03f), 0, 6.2, 0);
        leaf.rotation.z = Math.PI / 2.4;
        leaf.rotation.y = k * Math.PI * 2 / 5;
        leaf.translateY(1.4);
      }
      break;
    }
    case 'farm': {
      if (rand() < 0.5) {
        add(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), _lam(0x7b4a21), 0, 1.5, 0);
        add(new THREE.ConeGeometry(2.4, 4.5, 8), _lam(0x4a9a3f), 0, 5, 0);
      } else {
        const bale = add(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 10), _lam(0xd8b84a), 0, 1.4, 0);
        bale.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'cactus': {
      add(new THREE.CylinderGeometry(0.6, 0.7, 4.5, 7), _lam(0x3f8f3f), 0, 2.2, 0);
      add(new THREE.CylinderGeometry(0.35, 0.4, 1.8, 6), _lam(0x3f8f3f), 1.1, 3.2, 0);
      add(new THREE.CylinderGeometry(0.35, 0.4, 1.4, 6), _lam(0x3f8f3f), -1.1, 2.7, 0);
      break;
    }
    case 'harbor': {
      const colors = [0xc9542a, 0x3f6fa8, 0x4a9a3f, 0xb59a2a];
      add(new THREE.BoxGeometry(4, 3, 2.6), _lam(colors[Math.floor(rand() * 4)]), 0, 1.5, 0);
      if (rand() < 0.4) add(new THREE.BoxGeometry(4, 3, 2.6), _lam(colors[Math.floor(rand() * 4)]), 0.4, 4.5, 0);
      break;
    }
    case 'rock': {
      const s = 1.5 + rand() * 2.5;
      add(new THREE.DodecahedronGeometry(s, 0), _lam(0x9a6f4a), 0, s * 0.6, 0);
      break;
    }
    case 'snow': {
      if (rand() < 0.4) {
        add(new THREE.SphereGeometry(1.5, 10, 8), _lam(0xffffff), 0, 1.3, 0);
        add(new THREE.SphereGeometry(1.05, 10, 8), _lam(0xffffff), 0, 3.2, 0);
        add(new THREE.SphereGeometry(0.7, 10, 8), _lam(0xffffff), 0, 4.5, 0);
        const nose = add(new THREE.ConeGeometry(0.16, 0.9, 6), _lam(0xe07b2a), 0, 4.5, 0.7);
        nose.rotation.x = Math.PI / 2;
      } else {
        add(new THREE.CylinderGeometry(0.5, 0.7, 3, 6), _lam(0x6a4a2a), 0, 1.5, 0);
        add(new THREE.ConeGeometry(2.4, 4.5, 8), _lam(0xd8ecdc), 0, 5, 0);
      }
      break;
    }
    case 'ghost': {
      if (rand() < 0.5) {
        add(new THREE.CylinderGeometry(0.3, 0.6, 5, 5), _lam(0x2a2a30), 0, 2.5, 0);
        add(new THREE.ConeGeometry(0.1, 2.2, 4), _lam(0x2a2a30), 0.8, 4.5, 0).rotation.z = -0.8;
        add(new THREE.ConeGeometry(0.1, 1.8, 4), _lam(0x2a2a30), -0.7, 4, 0).rotation.z = 0.9;
      } else {
        const ghost = add(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshLambertMaterial({
          color: 0xe8e8f5, transparent: true, opacity: 0.75, emissive: 0x8888aa, emissiveIntensity: 0.5,
        }), 0, 3 + rand() * 3, 0);
        ghost.scale.y = 1.3;
      }
      break;
    }
    case 'lava': {
      const s = 1.5 + rand() * 2;
      add(new THREE.DodecahedronGeometry(s, 0), rand() < 0.4 ? _lam(0x3a2a28, 0xff5a1a) : _lam(0x4a3a35), 0, s * 0.6, 0);
      break;
    }
    case 'cloud': {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      for (let k = 0; k < 4; k++) {
        const puff = add(new THREE.SphereGeometry(2.5 + rand() * 2, 8, 6), mat, (k - 1.5) * 3, rand() * 1.2, rand() * 2 - 1);
        puff.scale.y = 0.6;
      }
      break;
    }
    case 'city': {
      const h = 12 + rand() * 30;
      const neon = [0x00e5ff, 0xff4fd0, 0xffe14f, 0x7a5fff][Math.floor(rand() * 4)];
      add(new THREE.BoxGeometry(6 + rand() * 5, h, 6 + rand() * 5), new THREE.MeshLambertMaterial({
        color: 0x1e1e2e, emissive: neon, emissiveIntensity: 0.25,
      }), 0, h / 2, 0);
      add(new THREE.BoxGeometry(3, 0.8, 3), _lam(neon, neon), 0, h + 0.4, 0);
      break;
    }
    case 'candy': {
      if (rand() < 0.5) {
        add(new THREE.CylinderGeometry(0.35, 0.35, 6, 8), _lam(0xffffff), 0, 3, 0);
        add(new THREE.SphereGeometry(1.8, 12, 10), _lam([0xff5fa0, 0x5fd0ff, 0xffd54f][Math.floor(rand() * 3)]), 0, 6.8, 0);
      } else {
        add(new THREE.CylinderGeometry(0.4, 0.4, 5, 8), _lam(0xff5f5f), 0, 2.5, 0);
        add(new THREE.TorusGeometry(1, 0.4, 8, 12, Math.PI), _lam(0xff5f5f), 0, 5, 0);
      }
      break;
    }
    case 'ice': {
      const s = 1 + rand() * 1.5;
      add(new THREE.ConeGeometry(s, s * 4, 6), new THREE.MeshLambertMaterial({
        color: 0xbfe8ff, transparent: true, opacity: 0.85, emissive: 0x4a8ab5, emissiveIntensity: 0.3,
      }), 0, s * 2, 0);
      break;
    }
    case 'flower': {
      const colors = [0xff5f8a, 0xffd54f, 0xff8a3d, 0xb57aff, 0xffffff];
      const c = colors[Math.floor(rand() * colors.length)];
      add(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 5), _lam(0x3f8f3f), 0, 0.55, 0);
      for (let k = 0; k < 5; k++) {
        const petal = add(new THREE.SphereGeometry(0.28, 6, 5), _lam(c), 0, 1.15, 0);
        petal.scale.set(1, 0.4, 0.6);
        petal.rotation.y = k * Math.PI * 2 / 5;
        petal.translateX(0.32);
      }
      add(new THREE.SphereGeometry(0.18, 6, 5), _lam(0xffe066), 0, 1.2, 0);
      break;
    }
    case 'bush': {
      const green = rand() < 0.5 ? 0x3f9a3f : 0x54b04a;
      add(new THREE.SphereGeometry(1.1, 8, 6), _lam(green), 0, 0.8, 0).scale.y = 0.8;
      add(new THREE.SphereGeometry(0.8, 8, 6), _lam(green), 0.9, 0.6, 0.2).scale.y = 0.8;
      add(new THREE.SphereGeometry(0.7, 8, 6), _lam(green), -0.8, 0.55, -0.2).scale.y = 0.8;
      if (rand() < 0.4) for (let k = 0; k < 3; k++) {
        add(new THREE.SphereGeometry(0.12, 5, 4), _lam(0xff4f5f), rand() * 1.6 - 0.8, 0.9 + rand() * 0.5, 0.7);
      }
      break;
    }
    case 'mushroom': {
      const s = 0.6 + rand() * 0.9;
      add(new THREE.CylinderGeometry(0.28 * s, 0.36 * s, 1.4 * s, 7), _lam(0xf2e8d8), 0, 0.7 * s, 0);
      const cap = add(new THREE.SphereGeometry(0.95 * s, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), _lam(rand() < 0.5 ? 0xd63b3b : 0xb57aff), 0, 1.3 * s, 0);
      cap.scale.y = 0.75;
      for (let k = 0; k < 4; k++) {
        const a = rand() * Math.PI * 2, r = rand() * 0.6 * s;
        add(new THREE.SphereGeometry(0.16 * s, 5, 4), _lam(0xffffff), Math.cos(a) * r, 1.55 * s, Math.sin(a) * r);
      }
      break;
    }
    case 'corn': {
      for (let k = 0; k < 3; k++) {
        const x = (k - 1) * 0.9 + rand() * 0.3;
        add(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 5), _lam(0x4a9a3f), x, 1.6, 0);
        const leaf = add(new THREE.ConeGeometry(0.35, 1.6, 4), _lam(0x5ab04a), x + 0.35, 1.6, 0);
        leaf.rotation.z = -0.9;
        add(new THREE.SphereGeometry(0.28, 6, 5), _lam(0xffd54f), x, 2.6, 0).scale.y = 1.8;
      }
      break;
    }
    case 'umbrella': {
      const c = [0xff5f5f, 0x5fd0ff, 0xffd54f, 0xff8adf][Math.floor(rand() * 4)];
      add(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 6), _lam(0xf2f2f2), 0, 1.7, 0);
      const top = add(new THREE.SphereGeometry(2.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), _lam(c), 0, 2.9, 0);
      top.scale.y = 0.75;
      if (rand() < 0.5) {
        const towel = add(new THREE.BoxGeometry(2.2, 0.08, 1.2), _lam(0xffffff), 2.4, 0.06, 0.6);
        towel.rotation.y = rand() * Math.PI;
      }
      break;
    }
    case 'bones': {
      add(new THREE.SphereGeometry(0.7, 8, 6), _lam(0xf2ecd8), 0, 0.5, 0).scale.set(1, 0.9, 1.2);
      add(new THREE.SphereGeometry(0.22, 5, 4), _lam(0x2a2a2a), 0.25, 0.62, 0.55);
      add(new THREE.SphereGeometry(0.22, 5, 4), _lam(0x2a2a2a), -0.25, 0.62, 0.55);
      for (let k = 0; k < 3; k++) {
        const rib = add(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 5), _lam(0xf2ecd8), -1.2 - k * 0.6, 0.15, 0);
        rib.rotation.x = Math.PI / 2;
      }
      break;
    }
    case 'crane': {
      add(new THREE.BoxGeometry(1.2, 16, 1.2), _lam(0xe8b23a), 0, 8, 0);
      add(new THREE.BoxGeometry(12, 0.9, 0.9), _lam(0xe8b23a), 4.5, 15.5, 0);
      add(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), _lam(0x555555), 9, 12.5, 0);
      add(new THREE.BoxGeometry(2.4, 1.6, 1.6), _lam([0xc9542a, 0x3f6fa8, 0x4a9a3f][Math.floor(rand() * 3)]), 9, 9, 0);
      break;
    }
    case 'streetlight': {
      add(new THREE.CylinderGeometry(0.14, 0.18, 7.5, 6), _lam(0x3a3a44), 0, 3.75, 0);
      add(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 5), _lam(0x3a3a44), 1.1, 7.4, 0).rotation.z = Math.PI / 2;
      add(new THREE.SphereGeometry(0.4, 8, 6), _lam(0xfff0b0, 0xffe066), 2.1, 7.2, 0);
      break;
    }
    case 'gumdrop': {
      const c = [0xff5fa0, 0x5fd0ff, 0x8aff5f, 0xffd54f, 0xb57aff][Math.floor(rand() * 5)];
      const s = 0.8 + rand() * 1.2;
      const drop = add(new THREE.SphereGeometry(s, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), _lam(c), 0, s * 0.5, 0);
      drop.scale.y = 1.1;
      break;
    }
    case 'balloons': {
      const colors = [0xd63b3b, 0xffd54f, 0x3b6fd6, 0x4a9a3f, 0xff8adf];
      for (let k = 0; k < 5; k++) {
        const h = 5 + rand() * 3.5;
        const x = rand() * 2.4 - 1.2, z = rand() * 2.4 - 1.2;
        add(new THREE.CylinderGeometry(0.02, 0.02, h, 3), _lam(0xd8d8d8), x, h / 2, z);
        const b = add(new THREE.SphereGeometry(0.65, 8, 7), _lam(colors[k % 5]), x, h + 0.5, z);
        b.scale.y = 1.2;
      }
      break;
    }
    case 'sakura': {
      // 櫻花樹：粉紅花球
      add(new THREE.CylinderGeometry(0.45, 0.65, 3.2, 6), _lam(0x6a4a2a), 0, 1.6, 0);
      const pink = [0xffb0d8, 0xff9fc8, 0xffc8e0];
      add(new THREE.SphereGeometry(2.2, 9, 7), _lam(pink[Math.floor(rand() * 3)]), 0, 4.4, 0);
      add(new THREE.SphereGeometry(1.4, 8, 6), _lam(pink[Math.floor(rand() * 3)]), 1.4, 3.6, 0.5);
      add(new THREE.SphereGeometry(1.2, 8, 6), _lam(pink[Math.floor(rand() * 3)]), -1.3, 3.8, -0.4);
      // 地上的落花
      for (let k = 0; k < 4; k++) {
        const petal = add(new THREE.CircleGeometry(0.22, 6), _lam(0xffc8e0), rand() * 5 - 2.5, 0.03, rand() * 5 - 2.5);
        petal.rotation.x = -Math.PI / 2;
      }
      break;
    }
    case 'lantern': {
      // 石燈籠
      add(new THREE.BoxGeometry(0.9, 0.3, 0.9), _lam(0x8a8a88), 0, 0.15, 0);
      add(new THREE.CylinderGeometry(0.18, 0.24, 1.4, 6), _lam(0x9a9a98), 0, 1.0, 0);
      add(new THREE.BoxGeometry(1.0, 0.7, 1.0), _lam(0xa5a5a2), 0, 2.05, 0);
      add(new THREE.SphereGeometry(0.22, 6, 5), _lam(0xfff0b0, 0xffd54f), 0, 2.05, 0);
      add(new THREE.ConeGeometry(0.95, 0.6, 4), _lam(0x8a8a88), 0, 2.7, 0);
      break;
    }
    case 'coral': {
      const c = [0xff6a8a, 0xff9a5f, 0xb57aff, 0x5fd0a0][Math.floor(rand() * 4)];
      for (let k = 0; k < 5; k++) {
        const branch = add(new THREE.CylinderGeometry(0.1, 0.22, 1.6 + rand() * 1.6, 5), _lam(c),
          rand() * 1.2 - 0.6, 0.9 + rand() * 0.6, rand() * 1.2 - 0.6);
        branch.rotation.z = (rand() - 0.5) * 0.9;
        branch.rotation.x = (rand() - 0.5) * 0.9;
      }
      break;
    }
    case 'seaweed': {
      for (let k = 0; k < 3; k++) {
        const blade = add(new THREE.CylinderGeometry(0.08, 0.16, 2.8 + rand() * 2, 5), _lam(0x2f8f5f),
          (k - 1) * 0.5, 1.6 + rand() * 0.8, rand() * 0.4 - 0.2);
        blade.rotation.z = (rand() - 0.5) * 0.5;
        blade.scale.z = 0.4;
      }
      break;
    }
    case 'bubble': {
      const mat = new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35 });
      for (let k = 0; k < 4; k++) {
        add(new THREE.SphereGeometry(0.2 + rand() * 0.4, 7, 6), mat, rand() * 2 - 1, 1 + rand() * 7, rand() * 2 - 1);
      }
      break;
    }
    case 'grave': {
      if (rand() < 0.6) {
        add(new THREE.BoxGeometry(1.1, 1.6, 0.25), _lam(0x8a8a92), 0, 0.8, 0);
        add(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 10, 1, false, 0, Math.PI), _lam(0x8a8a92), 0, 1.6, 0).rotation.x = Math.PI / 2;
      } else {
        // 十字架
        add(new THREE.BoxGeometry(0.28, 1.8, 0.22), _lam(0x7a7a82), 0, 0.9, 0);
        add(new THREE.BoxGeometry(0.95, 0.26, 0.22), _lam(0x7a7a82), 0, 1.3, 0);
      }
      const mound = add(new THREE.SphereGeometry(0.8, 7, 5), _lam(0x3a4a3a), 0, 0, 0.6);
      mound.scale.set(1, 0.3, 1.4);
      break;
    }
    case 'pumpkin': {
      const s = 0.6 + rand() * 0.8;
      const body = add(new THREE.SphereGeometry(s, 10, 8), _lam(0xe8762a, rand() < 0.4 ? 0xff8a2a : 0), 0, s * 0.85, 0);
      body.scale.y = 0.8;
      add(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 5), _lam(0x4a6a2a), 0, s * 1.55, 0);
      // 眼睛（三角形）
      for (const sx of [-1, 1]) {
        const eye = add(new THREE.ConeGeometry(0.16 * s, 0.3 * s, 3), _lam(0x1a0a00), sx * 0.35 * s, s * 0.95, s * 0.85);
        eye.rotation.x = 0.2;
      }
      break;
    }
    case 'satellite': {
      add(new THREE.BoxGeometry(0.8, 0.8, 1.2), _lam(0xc9c9d2), 0, 0, 0);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(2.2, 0.06, 0.9), _lam(0x2a4a9a, 0x2a4a9a), sx * 1.6, 0, 0);
      }
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), _lam(0x8a8a92), 0, 0.7, 0);
      add(new THREE.SphereGeometry(0.12, 6, 5), _lam(0xff5f5f, 0xff5f5f), 0, 1.1, 0);
      break;
    }
    case 'star':
      return null; // 星星另外大量生成
  }
  return g;
}

// ---------- 大型地標 ----------
function buildLandmark(type, rand) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  switch (type) {
    case 'windmill': {
      add(new THREE.CylinderGeometry(3.5, 5, 22, 8), _lam(0xe8e0d0), 0, 11, 0);
      add(new THREE.ConeGeometry(4.5, 5, 8), _lam(0xc9542a), 0, 24.5, 0);
      const hub = add(new THREE.SphereGeometry(1, 8, 6), _lam(0x7b4a21), 0, 20, 4.2);
      for (let k = 0; k < 4; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11, 0.3), _lam(0xf2e8d8));
        blade.position.set(0, 5.5, 0);
        const arm = new THREE.Group();
        arm.add(blade);
        arm.rotation.z = k * Math.PI / 2 + 0.4;
        arm.position.copy(hub.position);
        g.add(arm);
      }
      break;
    }
    case 'pyramid': {
      add(new THREE.ConeGeometry(38, 34, 4), _lam(0xd8b26a), 0, 17, 0);
      add(new THREE.ConeGeometry(22, 20, 4), _lam(0xc9a05f), 55, 10, 25);
      break;
    }
    case 'lighthouse': {
      for (let k = 0; k < 5; k++) {
        add(new THREE.CylinderGeometry(2.6 - k * 0.25, 2.8 - k * 0.25, 4.5, 10), _lam(k % 2 === 0 ? 0xd63b3b : 0xf2f2f2), 0, 2.25 + k * 4.5, 0);
      }
      add(new THREE.CylinderGeometry(1.6, 1.6, 2.5, 8), _lam(0xfff0b0, 0xffe066), 0, 24, 0);
      add(new THREE.ConeGeometry(2.2, 2.5, 8), _lam(0x8a3a2a), 0, 26.5, 0);
      break;
    }
    case 'igloo': {
      const dome = add(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), _lam(0xf2f8fc), 0, 0, 0);
      dome.scale.y = 0.8;
      const door = add(new THREE.CylinderGeometry(2, 2, 4, 8, 1, false, 0, Math.PI), _lam(0xe0ecf5), 0, 0, 6);
      door.rotation.z = Math.PI / 2;
      door.rotation.y = Math.PI / 2;
      break;
    }
    case 'volcano': {
      add(new THREE.ConeGeometry(60, 55, 10), _lam(0x4a3530), 0, 27.5, 0);
      add(new THREE.CylinderGeometry(14, 18, 6, 10), _lam(0xff5a1a, 0xff5a1a), 0, 53, 0);
      // 噴出的岩漿塊
      for (let k = 0; k < 5; k++) {
        add(new THREE.SphereGeometry(1.5 + rand() * 1.5, 6, 5), _lam(0xff8a2a, 0xff6a1a), rand() * 30 - 15, 58 + rand() * 14, rand() * 30 - 15);
      }
      break;
    }
    case 'planet': {
      add(new THREE.SphereGeometry(30, 16, 12), _lam(0xe8a05f), 0, 0, 0);
      const ring = add(new THREE.TorusGeometry(46, 4, 8, 28), _lam(0xffd54f), 0, 0, 0);
      ring.rotation.x = Math.PI / 2.4;
      add(new THREE.SphereGeometry(8, 10, 8), _lam(0xbfd8ff), 70, 25, -30);
      break;
    }
    case 'castle': {
      const pink = 0xffb0d8, cream = 0xfff0e0;
      add(new THREE.BoxGeometry(16, 12, 12), _lam(cream), 0, 6, 0);
      for (const [x, z] of [[-8, 6], [8, 6], [-8, -6], [8, -6]]) {
        add(new THREE.CylinderGeometry(2.5, 2.5, 16, 8), _lam(cream), x, 8, z);
        add(new THREE.ConeGeometry(3.2, 6, 8), _lam(pink), x, 19, z);
      }
      add(new THREE.ConeGeometry(4, 8, 8), _lam(pink), 0, 16, 0);
      add(new THREE.BoxGeometry(3.5, 5, 0.5), _lam(0xa87858), 0, 2.5, 6.2);
      break;
    }
    case 'torii': {
      // 紅色鳥居
      const red = _lam(0xd0402a);
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.9, 1.1, 16, 8), red, sx * 7, 8, 0);
      const top = add(new THREE.BoxGeometry(20, 1.6, 1.8), red, 0, 16.5, 0);
      top.rotation.z = 0;
      add(new THREE.BoxGeometry(17, 1.1, 1.4), red, 0, 13.8, 0);
      add(new THREE.BoxGeometry(1.2, 2.0, 1.0), red, 0, 15.1, 0);
      break;
    }
    case 'wreck': {
      // 沉船（斜插在海底）
      const hull = add(new THREE.CylinderGeometry(4.5, 6, 26, 8), _lam(0x6a4a32), 0, 6, 0);
      hull.rotation.z = Math.PI / 2 - 0.35;
      hull.scale.y = 0.7;
      const mast = add(new THREE.CylinderGeometry(0.4, 0.5, 16, 6), _lam(0x5a3f2a), 2, 14, 0);
      mast.rotation.z = -0.35;
      add(new THREE.BoxGeometry(0.4, 5, 8), _lam(0x8a7a5f), 5.5, 16, 0);
      // 破洞
      add(new THREE.SphereGeometry(2, 8, 6), _lam(0x1a2a3a), -6, 4.5, 3.5);
      break;
    }
    case 'mansion': {
      // 鬼屋大宅：黑色大宅 + 發光窗
      const dark = _lam(0x1f1a2a);
      add(new THREE.BoxGeometry(22, 14, 12), dark, 0, 7, 0);
      add(new THREE.ConeGeometry(9, 7, 4), _lam(0x14101f), 0, 17.5, 0);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(6, 18, 7), dark, sx * 11, 9, 0);
        add(new THREE.ConeGeometry(4.5, 6, 4), _lam(0x14101f), sx * 11, 21, 0);
      }
      // 發光的窗戶
      for (const [x, y] of [[-6, 8], [0, 8], [6, 8], [-6, 4], [6, 4], [-11, 12], [11, 12], [-11, 6], [11, 6]]) {
        add(new THREE.BoxGeometry(1.6, 2.2, 0.3), _lam(0xffb84a, 0xff9a2a), x, y, 6.2);
      }
      add(new THREE.BoxGeometry(3.5, 5.5, 0.4), _lam(0x0a0a12), 0, 2.75, 6.2);
      break;
    }
    case 'earth': {
      // 藍色地球 + 月亮
      add(new THREE.SphereGeometry(34, 16, 12), _lam(0x3b6fd6), 0, 0, 0);
      const landMat = _lam(0x4a9a3f);
      for (let k = 0; k < 7; k++) {
        const a = rand() * Math.PI * 2, b = (rand() - 0.5) * 2.4;
        const blob = add(new THREE.SphereGeometry(9 + rand() * 7, 8, 6), landMat,
          Math.cos(a) * Math.cos(b) * 30, Math.sin(b) * 30, Math.sin(a) * Math.cos(b) * 30);
        blob.scale.setScalar(0.55);
      }
      add(new THREE.SphereGeometry(9, 10, 8), _lam(0xd8d8e0), 75, 30, -20);
      break;
    }
  }
  return g;
}
