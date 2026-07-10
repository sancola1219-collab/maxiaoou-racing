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
    scene.fog = new THREE.Fog(th.fog, 120, th.night ? 420 : 620);

    this._buildRoad(scene, th);
    this._buildGround(scene, th);
    if (!th.open && !th.voidFall) this._buildRails(scene, th);
    this._buildStartGate(scene, th);
    this._buildDecorations(scene, th);
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
    const count = 90;
    for (let n = 0; n < count; n++) {
      const spot = this._sideSpot(6, 60);
      // 開放賽道的裝飾放在平地上；封閉/高架賽道跟著路面高度
      const y = th.open ? 0 : spot.y;
      const deco = buildDecoration(th.deco, this.rand);
      if (!deco) continue;
      deco.position.set(spot.x, th.deco === 'cloud' ? spot.y - 10 - this.rand() * 15 : y, spot.z);
      deco.rotation.y = this.rand() * Math.PI * 2;
      group.add(deco);
    }
    if (th.deco === 'star') {
      // 彩虹之路：滿天星斗
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
function _lam(color, emissive) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: emissive || 0x000000,
    emissiveIntensity: emissive ? 0.7 : 0,
  });
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
    case 'star':
      return null; // 星星另外大量生成
  }
  return g;
}
