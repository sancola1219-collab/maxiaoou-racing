// ============================================================
// 天氣系統：粒子（雨/雪/落櫻/沙塵/火山灰/氣泡）+ 雷暴閃電 +
//          能見度（霧）+ 抓地力影響。每場比賽從主題的 weather 池隨機挑一種
// 設定：THEMES[].weather = ['clear', 'rain', ...]（省略視為 ['clear']）
// ============================================================

const WEATHER_INFO = {
  clear:    { icon: '☀️', name: '晴朗',   grip: 1.0,  vis: 1.0,  tint: null },
  rain:     { icon: '🌧️', name: '陣雨',   grip: 0.9,  vis: 0.82, tint: 0x5a6470, darken: 0.7 },
  storm:    { icon: '⛈️', name: '雷暴',   grip: 0.84, vis: 0.68, tint: 0x3a3f4a, darken: 0.55 },
  snow:     { icon: '🌨️', name: '飄雪',   grip: 0.86, vis: 0.9,  tint: 0xd6e2ee, darken: 0.92 },
  blizzard: { icon: '❄️',  name: '暴風雪', grip: 0.78, vis: 0.5,  tint: 0xe4eef6, darken: 0.85 },
  fog:      { icon: '🌫️', name: '濃霧',   grip: 1.0,  vis: 0.42, tint: 0xbfc4cc, darken: 0.85 },
  sand:     { icon: '🏜️', name: '沙塵暴', grip: 0.94, vis: 0.5,  tint: 0xd0a25a, darken: 0.9 },
  ash:      { icon: '🌋', name: '火山灰', grip: 1.0,  vis: 0.78, tint: 0x5a3020, darken: 0.85 },
  petals:   { icon: '🌸', name: '落櫻',   grip: 1.0,  vis: 1.0,  tint: null },
  bubbles:  { icon: '🫧', name: '洋流',   grip: 1.0,  vis: 1.0,  tint: null },
};

class Weather {
  constructor(scene, type) {
    this.scene = scene;
    this.type = type || 'clear';
    this.info = WEATHER_INFO[this.type] || WEATHER_INFO.clear;
    this.gripMul = this.info.grip;
    this.time = 0;
    this.systems = [];
    this.onFlash = null;      // 螢幕閃白回呼（雷暴閃電）
    this.strikeTimer = 2 + Math.random() * 4;
    this.box = 150;           // 粒子涵蓋半徑
    this.boxY = 85;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.tex = this._softTexture();

    // 能見度：拉近霧、微調霧色與背景色調
    if (scene.fog) {
      scene.fog.far *= this.info.vis;
      scene.fog.near *= Math.max(0.6, this.info.vis);
      if (this.info.tint) {
        scene.fog.color.lerp(new THREE.Color(this.info.tint), 0.5);
        scene.background.lerp(new THREE.Color(this.info.tint), 0.4);
      }
    }
    // 雷暴/暴風雪的環境閃光燈
    if (this.type === 'storm') {
      this.flashLight = new THREE.PointLight(0xcfe0ff, 0, 900);
      this.flashLight.position.set(0, 260, 0);
      scene.add(this.flashLight);
    }

    if (this.type !== 'clear') this._build();
    scene.add(this.group);
  }

  _softTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  // 直線雨絲（LineSegments，每滴兩個端點）
  _buildStreaks(count, color, len, speed, slant, opacity) {
    const positions = new Float32Array(count * 6);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this.box * 2;
      const y = (Math.random() - 0.5) * this.boxY * 2;
      const z = (Math.random() - 0.5) * this.box * 2;
      positions[i * 6] = x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + slant * len; positions[i * 6 + 4] = y + len; positions[i * 6 + 5] = z;
      vel[i] = speed * (0.8 + Math.random() * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.LineSegments(geo, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.systems.push({ mesh, positions, vel, len, slant, kind: 'streak' });
  }

  // 飄落/上升的粒子（Points）
  _buildPoints(count, opts) {
    const positions = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.box * 2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * this.boxY * 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.tex, color: opts.color, size: opts.size,
      transparent: true, opacity: opts.opacity, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Points(geo, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.systems.push({
      mesh, positions, seed, kind: 'points',
      fall: opts.fall, sway: opts.sway, driftX: opts.driftX || 0, driftZ: opts.driftZ || 0,
    });
  }

  _build() {
    switch (this.type) {
      case 'rain':
        this._buildStreaks(900, 0xafc4dc, 3.2, 95, 0.12, 0.5);
        break;
      case 'storm':
        this._buildStreaks(1400, 0x9fb4cc, 3.8, 120, 0.28, 0.55);
        break;
      case 'snow':
        this._buildPoints(700, { color: 0xffffff, size: 1.3, opacity: 0.9, fall: 11, sway: 3.5 });
        break;
      case 'blizzard':
        this._buildPoints(1300, { color: 0xffffff, size: 1.5, opacity: 0.95, fall: 20, sway: 9, driftX: 14 });
        break;
      case 'petals':
        this._buildPoints(500, { color: 0xffb8dc, size: 1.9, opacity: 0.95, fall: 6, sway: 7 });
        this._buildPoints(120, { color: 0xffffff, size: 1.2, opacity: 0.7, fall: 5, sway: 6 });
        break;
      case 'sand':
        this._buildPoints(1100, { color: 0xd8b478, size: 2.6, opacity: 0.5, fall: 3, sway: 4, driftX: 34, driftZ: 8 });
        break;
      case 'ash':
        this._buildPoints(360, { color: 0xff7a2a, size: 1.1, opacity: 0.9, fall: -2.5, sway: 5, additive: true });
        this._buildPoints(300, { color: 0x555052, size: 1.6, opacity: 0.55, fall: 3.5, sway: 4 });
        break;
      case 'bubbles':
        this._buildPoints(420, { color: 0xcfeeff, size: 1.6, opacity: 0.5, fall: -9, sway: 4 });
        break;
    }
  }

  update(dt, camPos) {
    if (this.type === 'clear') return;
    this.time += dt;
    this.group.position.copy(camPos);
    const B = this.box, BY = this.boxY;

    for (const s of this.systems) {
      if (s.kind === 'streak') {
        const p = s.positions;
        for (let i = 0; i < s.vel.length; i++) {
          const d = s.vel[i] * dt;
          p[i * 6 + 1] -= d; p[i * 6 + 4] -= d;
          p[i * 6] += this.windX * dt; p[i * 6 + 3] += this.windX * dt;
          if (p[i * 6 + 1] < -BY) { // 落到底 → 回到頂端隨機水平位置
            const nx = (Math.random() - 0.5) * B * 2, nz = (Math.random() - 0.5) * B * 2;
            p[i * 6] = nx; p[i * 6 + 1] = BY; p[i * 6 + 2] = nz;
            p[i * 6 + 3] = nx + s.slant * s.len; p[i * 6 + 4] = BY + s.len; p[i * 6 + 5] = nz;
          }
        }
        s.mesh.geometry.attributes.position.needsUpdate = true;
      } else {
        const p = s.positions, seed = s.seed;
        for (let i = 0; i < seed.length; i++) {
          p[i * 3 + 1] -= s.fall * dt;
          p[i * 3] += (Math.sin(this.time * 1.5 + seed[i]) * s.sway + s.driftX) * dt;
          p[i * 3 + 2] += (Math.cos(this.time * 1.2 + seed[i]) * s.sway * 0.5 + s.driftZ) * dt;
          // 三軸環繞（永遠圍著攝影機）
          if (p[i * 3 + 1] < -BY) p[i * 3 + 1] += BY * 2;
          else if (p[i * 3 + 1] > BY) p[i * 3 + 1] -= BY * 2;
          if (p[i * 3] < -B) p[i * 3] += B * 2; else if (p[i * 3] > B) p[i * 3] -= B * 2;
          if (p[i * 3 + 2] < -B) p[i * 3 + 2] += B * 2; else if (p[i * 3 + 2] > B) p[i * 3 + 2] -= B * 2;
        }
        s.mesh.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 雷暴閃電：不定時劈一下，環境燈脈衝 + 螢幕閃白
    if (this.type === 'storm') {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = 3 + Math.random() * 5;
        this._flashT = 0.18;
        if (this.onFlash) this.onFlash(0.7, '#dfe8ff');
        AudioSys.play('thunder');
      }
      if (this._flashT > 0) {
        this._flashT -= dt;
        // 雙閃：一大一小
        const k = this._flashT;
        this.flashLight.intensity = (k > 0.1 ? 2.2 : (k > 0.05 ? 0.4 : 1.4)) * Math.max(0, k / 0.18);
      } else {
        this.flashLight.intensity = 0;
      }
    }
  }

  get windX() { return this._windX || (this._windX = (this.type === 'storm' ? 22 : this.type === 'rain' ? 8 : 0)); }
}

// 從主題的天氣池挑一種（用時間/隨機；GameTest 可傳 forced）
function pickWeather(theme, forced) {
  if (forced) return forced;
  const pool = theme.weather && theme.weather.length ? theme.weather : ['clear'];
  return pool[Math.floor(Math.random() * pool.length)];
}
