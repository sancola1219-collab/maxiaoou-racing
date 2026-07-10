// ============================================================
// 視覺特效：GPU 友善的環狀粒子池（一個 draw call）
// 噴射火焰 / 甩尾煙 / 星星拖尾 / 爆炸爆裂 / 火箭尾焰
// 其他系統呼叫 world.fx.burst(...) 生成爆裂；每幀讀車輛狀態產生拖尾
// ============================================================

class EffectsWorld {
  constructor(scene) {
    this.max = 900;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.base = new Float32Array(this.max * 3); // 原始顏色
    this.col = new Float32Array(this.max * 3);  // 目前顏色（隨壽命變暗）
    this.life = new Float32Array(this.max);
    this.ttl = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.head = 0;
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -99999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.5, map: this._tex(), vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._starCol = new THREE.Color();
  }

  _tex() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, ttl, grav) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = r; this.base[i * 3 + 1] = g; this.base[i * 3 + 2] = b;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = ttl; this.ttl[i] = ttl; this.grav[i] = grav || 0;
  }

  // 爆裂：從一點朝四面八方噴 n 顆
  burst(pos, n, color, speed, ttl, grav) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = speed * (0.4 + Math.random() * 0.6);
      const horiz = Math.sqrt(1 - up * up * 0.5);
      this.spawn(
        pos.x, pos.y + 0.5, pos.z,
        Math.cos(a) * sp * horiz, up * sp * 0.9 + 2, Math.sin(a) * sp * horiz,
        c.r, c.g, c.b, ttl * (0.6 + Math.random() * 0.5), grav === undefined ? 9 : grav
      );
    }
  }

  update(dt, world, camera) {
    // ---- 車輛拖尾 ----
    for (const kart of world.karts) {
      if (kart.falling) continue;
      const fwd = kart.forward();
      const rearX = kart.pos.x - fwd.x * 1.5, rearZ = kart.pos.z - fwd.z * 1.5;
      const rearY = kart.pos.y + 0.5;

      // 噴射火焰（甩尾噴射 / 蘑菇）與 火箭尾焰
      if (kart.boostTimer > 0 || kart.bulletTimer > 0) {
        const n = kart.bulletTimer > 0 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const jx = (Math.random() - 0.5) * 1.1, jz = (Math.random() - 0.5) * 1.1;
          // 橘黃火焰，火箭偏藍白核心
          const hot = kart.bulletTimer > 0 || Math.random() < 0.4;
          const r = hot ? 1.0 : 1.0, g = hot ? 0.8 : 0.45, b = hot ? 0.35 : 0.1;
          this.spawn(
            rearX + jx, rearY + Math.random() * 0.3, rearZ + jz,
            -fwd.x * 6 + jx * 2, 1.5 + Math.random() * 2, -fwd.z * 6 + jz * 2,
            r, g, b, 0.4 + Math.random() * 0.25, -4
          );
        }
      }

      // 甩尾煙（蓄力中）：藍→橘火花對應蓄力等級
      if (kart.driftDir !== 0 && kart.driftCharge > 0.5 && kart.grounded) {
        const level = kart.driftCharge > 2.2 ? 2 : kart.driftCharge > 1.1 ? 1 : 0;
        const cols = [[0.55, 0.75, 0.55], [0.35, 0.65, 1.0], [1.0, 0.55, 0.15]][level];
        for (const side of [-0.9, 0.9]) {
          const lx = fwd.z * side, lz = -fwd.x * side;
          this.spawn(
            rearX + lx, rearY - 0.2, rearZ + lz,
            (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3,
            cols[0], cols[1], cols[2], 0.35 + Math.random() * 0.2, -2
          );
        }
      }

      // 星星無敵拖尾（彩虹閃）
      if (kart.starTimer > 0 && Math.random() < 0.9) {
        const col = this._starCol.setHSL((this.head * 0.13) % 1, 1, 0.6);
        this.spawn(
          kart.pos.x + (Math.random() - 0.5) * 1.6, kart.pos.y + 0.5 + Math.random() * 1.5, kart.pos.z + (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2,
          col.r, col.g, col.b, 0.5, 1
        );
      }
    }

    // ---- 積分所有粒子 ----
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -99999; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt; // grav 負值 = 上飄
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.ttl[i]; // 1→0 淡出
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
