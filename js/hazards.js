// ============================================================
// 賽道陷阱：walker 橫越馬路 / roller 沿路滾動 / geyser 定點噴發 /
//          patch 打滑區 / car NPC 車輛
// 設定在 tracks.js 的 THEMES[].hazards，模型與邏輯都在這裡
// ============================================================

const HAZARD_RADIUS = {
  goomba: 1.2, chicken: 1.1, crab: 1.2, scorpion: 1.2, hedgehog: 1.2,
  ghost: 1.4, gumball: 1.2, bird: 1.2, star: 1.5,
  tumbleweed: 1.5, haybale: 1.7, boulder: 1.8, snowball: 1.8,
  forklift: 2.0, taxi: 2.2,
  lava: 1.8, mud: 3.2, oil: 3.0, poison: 3.0, syrup: 3.0,
};

class HazardWorld {
  constructor(track, karts, scene) {
    this.track = track;
    this.karts = karts;
    this.scene = scene;
    this.list = [];
    this.time = 0;
    const rand = mulberry32(TRACKS.indexOf(track.def) * 331 + 17);

    for (const spec of (track.theme.hazards || [])) {
      for (let n = 0; n < spec.count; n++) {
        // 避開起跑區（前 10%），其餘平均分佈 + 隨機抖動
        const frac = 0.12 + (n + 0.5) / spec.count * 0.82 + (rand() - 0.5) * 0.06;
        const idx = Math.floor(track.N * frac) % track.N;
        this._spawn(spec, idx, rand);
      }
    }
  }

  _spawn(spec, idx, rand) {
    const track = this.track;
    const hz = {
      type: spec.type,
      model: spec.model,
      radius: HAZARD_RADIUS[spec.model] || 1.4,
      idx,
      idxF: idx,
      phase: rand() * Math.PI * 2,
      speed: 0,
      lat: 0,
      hiddenT: 0,
      pos: new THREE.Vector3(),
    };
    const s = track.sample(idx);

    if (spec.type === 'walker') {
      hz.speed = 0.5 + rand() * 0.5;       // 橫越頻率
      hz.ampl = track.halfW * 0.8;
      hz.mesh = buildHazardModel(spec.model, rand);
    } else if (spec.type === 'roller') {
      hz.speed = (9 + rand() * 6) * (rand() < 0.5 ? 1 : -1); // 有的順跑有的逆跑
      hz.lat = (rand() * 2 - 1) * 0.4;
      hz.mesh = new THREE.Group();
      hz.roller = buildHazardModel(spec.model, rand);
      hz.mesh.add(hz.roller);
    } else if (spec.type === 'car') {
      hz.speed = 11 + rand() * 4;           // 只順著賽道方向開
      hz.lat = (rand() < 0.5 ? 1 : -1) * 0.4;
      hz.mesh = buildHazardModel(spec.model, rand);
    } else if (spec.type === 'geyser') {
      hz.cycle = 3.5 + rand() * 1.5;
      hz.lat = (rand() * 2 - 1) * 0.55;
      hz.mesh = new THREE.Group();
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 12),
        new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55 })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.1;
      hz.mesh.add(glow);
      hz.column = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.4, 7, 10),
        new THREE.MeshLambertMaterial({ color: 0xff8a2a, emissive: 0xff5a1a, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 })
      );
      hz.column.position.y = 0;
      hz.column.scale.y = 0.01;
      hz.mesh.add(hz.column);
      const pos = s.pos.clone().addScaledVector(s.left, hz.lat * track.halfW);
      hz.pos.copy(pos);
      hz.mesh.position.copy(pos);
    } else if (spec.type === 'patch') {
      hz.lat = (rand() * 2 - 1) * 0.45;
      hz.mesh = buildHazardModel(spec.model, rand);
      const pos = s.pos.clone().addScaledVector(s.left, hz.lat * track.halfW);
      pos.y += 0.06;
      hz.pos.copy(pos);
      hz.mesh.position.copy(pos);
    }

    this.scene.add(hz.mesh);
    this.list.push(hz);
  }

  update(dt, world) {
    this.time += dt;
    const track = this.track;

    for (const hz of this.list) {
      // 被星星撞飛的暫時隱藏
      if (hz.hiddenT > 0) {
        hz.hiddenT -= dt;
        hz.mesh.visible = hz.hiddenT <= 0;
        if (hz.hiddenT > 0) continue;
      }

      let danger = true; // geyser 只有噴發時危險
      if (hz.type === 'walker') {
        const s = track.sample(hz.idx);
        const t = this.time * hz.speed + hz.phase;
        const lat = Math.sin(t) * hz.ampl;
        hz.pos.copy(s.pos).addScaledVector(s.left, lat);
        const bounce = hz.model === 'gumball' || hz.model === 'bird' ? Math.abs(Math.sin(t * 4)) * 1.2 : Math.abs(Math.sin(t * 6)) * 0.15;
        hz.pos.y = s.pos.y + (hz.model === 'ghost' ? 0.6 + Math.sin(t * 2) * 0.3 : 0) + bounce;
        hz.mesh.position.copy(hz.pos);
        // 面向移動方向
        const moving = Math.cos(t);
        hz.mesh.rotation.y = Math.atan2(s.left.x, s.left.z) + (moving > 0 ? 0 : Math.PI);
        if (hz.model === 'star') hz.mesh.rotation.y = this.time * 3;
      } else if (hz.type === 'roller' || hz.type === 'car') {
        hz.idxF += hz.speed * dt / track.segLen;
        const i0 = Math.floor(hz.idxF);
        const s = track.sample(i0);
        hz.idx = ((i0 % track.N) + track.N) % track.N;
        const wander = hz.type === 'roller' ? Math.sin(this.time * 0.7 + hz.phase) * 0.3 : 0;
        hz.pos.copy(s.pos).addScaledVector(s.left, (hz.lat + wander) * track.halfW);
        hz.pos.y = s.pos.y;
        hz.mesh.position.copy(hz.pos);
        const heading = Math.atan2(s.tan.x, s.tan.z) + (hz.speed < 0 ? Math.PI : 0);
        hz.mesh.rotation.y = heading;
        if (hz.roller) {
          const r = hz.radius;
          hz.roller.rotation.x += Math.abs(hz.speed) * dt / r;
        }
      } else if (hz.type === 'geyser') {
        const t = (this.time + hz.phase) % hz.cycle;
        const erupting = t > hz.cycle - 1.1;
        const warming = t > hz.cycle - 1.8 && !erupting;
        danger = erupting;
        const targetS = erupting ? 1 : 0.01;
        hz.column.scale.y += (targetS - hz.column.scale.y) * Math.min(1, dt * 14);
        hz.column.position.y = 3.5 * hz.column.scale.y;
        hz.mesh.children[0].material.opacity = warming ? 0.4 + Math.sin(this.time * 18) * 0.3 : 0.55;
      }
      // patch 不會動

      // 碰撞
      for (const kart of this.karts) {
        if (kart.finished || kart.falling) continue;
        const dx = kart.pos.x - hz.pos.x, dz = kart.pos.z - hz.pos.z;
        const r = hz.radius + 1.0;
        if (dx * dx + dz * dz > r * r) continue;
        if (Math.abs(kart.pos.y - hz.pos.y) > 2.5) continue;

        if (hz.type === 'patch') {
          kart.applySlip();
        } else if (danger) {
          if (kart.starTimer > 0 && (hz.type === 'walker' || hz.type === 'roller')) {
            hz.hiddenT = 6; // 星星狀態直接撞飛小怪
            hz.mesh.visible = false;
            if (kart.isPlayer) AudioSys.play('shell');
          } else {
            kart.spinOut();
          }
        }
      }
    }
  }
}

// ---------- 陷阱模型 ----------
function buildHazardModel(model, rand) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const eyes = (y, z, spacing, size) => {
    for (const sx of [-1, 1]) {
      add(new THREE.SphereGeometry(size, 6, 5), _lam(0xffffff), sx * spacing, y, z);
      add(new THREE.SphereGeometry(size * 0.45, 5, 4), _lam(0x1a1a1a), sx * spacing, y, z + size * 0.75);
    }
  };
  switch (model) {
    case 'goomba': {
      const body = add(new THREE.SphereGeometry(0.9, 10, 8), _lam(0x9a6032), 0, 0.85, 0);
      body.scale.set(1, 0.95, 0.9);
      add(new THREE.SphereGeometry(0.32, 6, 5), _lam(0x5a3a1a), -0.4, 0.18, 0.25);
      add(new THREE.SphereGeometry(0.32, 6, 5), _lam(0x5a3a1a), 0.4, 0.18, 0.25);
      eyes(1.1, 0.72, 0.32, 0.2);
      // 生氣的眉毛
      for (const sx of [-1, 1]) {
        const brow = add(new THREE.BoxGeometry(0.42, 0.09, 0.09), _lam(0x2a1a0a), sx * 0.33, 1.36, 0.8);
        brow.rotation.z = -sx * 0.5;
      }
      break;
    }
    case 'chicken': {
      add(new THREE.SphereGeometry(0.75, 10, 8), _lam(0xffffff), 0, 0.75, 0).scale.set(1, 0.95, 1.15);
      add(new THREE.SphereGeometry(0.42, 8, 6), _lam(0xffffff), 0, 1.45, 0.55);
      add(new THREE.ConeGeometry(0.13, 0.4, 4), _lam(0xffa03d), 0, 1.42, 1.0).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.16, 5, 4), _lam(0xd63b3b), 0, 1.85, 0.5);
      eyes(1.55, 0.85, 0.18, 0.09);
      for (const sx of [-1, 1]) {
        const wing = add(new THREE.SphereGeometry(0.4, 6, 5), _lam(0xf2f2f2), sx * 0.65, 0.8, -0.1);
        wing.scale.set(0.4, 0.7, 1);
      }
      add(new THREE.SphereGeometry(0.3, 6, 5), _lam(0xf2f2f2), 0, 0.95, -0.75).scale.set(0.5, 1, 0.8);
      break;
    }
    case 'crab': {
      add(new THREE.SphereGeometry(0.85, 10, 8), _lam(0xe0503a), 0, 0.6, 0).scale.set(1.25, 0.65, 0.95);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.34, 7, 6), _lam(0xd0402a), sx * 1.15, 0.7, 0.45);
        add(new THREE.SphereGeometry(0.2, 5, 4), _lam(0xd0402a), sx * 1.35, 0.85, 0.75).scale.set(1, 0.6, 1.3);
        for (let k = 0; k < 3; k++) {
          const leg = add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 4), _lam(0xd0402a), sx * (0.8 + k * 0.15), 0.3, -0.2 - k * 0.25);
          leg.rotation.z = sx * 0.9;
        }
        // 眼柄
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 4), _lam(0xe0503a), sx * 0.3, 1.15, 0.3);
        add(new THREE.SphereGeometry(0.13, 6, 5), _lam(0x1a1a1a), sx * 0.3, 1.4, 0.35);
      }
      break;
    }
    case 'scorpion': {
      add(new THREE.SphereGeometry(0.6, 8, 6), _lam(0x4a3020), 0, 0.45, 0).scale.set(1, 0.6, 1.4);
      let ty = 0.5, tz = -0.8;
      for (let k = 0; k < 4; k++) {
        add(new THREE.SphereGeometry(0.22 - k * 0.03, 6, 5), _lam(0x3a2518), 0, ty, tz);
        ty += 0.28; tz -= 0.12;
      }
      add(new THREE.ConeGeometry(0.12, 0.4, 5), _lam(0xd63b3b), 0, ty + 0.15, tz + 0.05);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.24, 6, 5), _lam(0x3a2518), sx * 0.55, 0.4, 0.75).scale.set(1.3, 0.7, 1);
      }
      eyes(0.62, 0.75, 0.18, 0.08);
      break;
    }
    case 'hedgehog': {
      add(new THREE.SphereGeometry(0.8, 10, 8), _lam(0x8a5a32), 0, 0.75, 0);
      for (let k = 0; k < 14; k++) {
        const a = rand() * Math.PI * 2, b = rand() * Math.PI * 0.5 + 0.2;
        const spike = add(new THREE.ConeGeometry(0.12, 0.65, 4), _lam(0x5a3a1a),
          Math.cos(a) * Math.sin(b) * 0.75, 0.75 + Math.cos(b) * 0.75, Math.sin(a) * Math.sin(b) * 0.75 - 0.15);
        spike.lookAt(spike.position.x * 3, spike.position.y * 3, spike.position.z * 3);
        spike.rotateX(Math.PI / 2);
      }
      add(new THREE.SphereGeometry(0.3, 6, 5), _lam(0xc9a05f), 0, 0.6, 0.75);
      add(new THREE.SphereGeometry(0.1, 5, 4), _lam(0x1a1a1a), 0, 0.68, 1.0);
      eyes(0.95, 0.65, 0.25, 0.11);
      break;
    }
    case 'ghost': {
      const body = add(new THREE.SphereGeometry(1.0, 10, 8), new THREE.MeshLambertMaterial({
        color: 0xf0f0ff, transparent: true, opacity: 0.85, emissive: 0x9090c0, emissiveIntensity: 0.4,
      }), 0, 1.2, 0);
      body.scale.y = 1.25;
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.28, 6, 5), _lam(0x1a1a2a), sx * 0.35, 1.5, 0.8);
      }
      add(new THREE.SphereGeometry(0.35, 6, 5), _lam(0xd0506a), 0, 0.85, 0.9).scale.set(0.7, 0.5, 1);
      break;
    }
    case 'gumball': {
      const c = [0xff5fa0, 0x5fd0ff, 0x8aff5f, 0xffd54f][Math.floor(rand() * 4)];
      add(new THREE.SphereGeometry(0.95, 12, 10), new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 }), 0, 0.95, 0);
      add(new THREE.SphereGeometry(0.22, 6, 5), _lam(0xffffff, 0xffffff), -0.35, 1.5, 0.45);
      break;
    }
    case 'bird': {
      add(new THREE.SphereGeometry(0.6, 8, 7), _lam(0x5fb8e8), 0, 0.9, 0).scale.set(0.9, 0.9, 1.2);
      add(new THREE.SphereGeometry(0.38, 8, 6), _lam(0x5fb8e8), 0, 1.45, 0.5);
      add(new THREE.ConeGeometry(0.12, 0.35, 4), _lam(0xffa03d), 0, 1.42, 0.95).rotation.x = Math.PI / 2;
      eyes(1.55, 0.75, 0.17, 0.09);
      for (const sx of [-1, 1]) {
        const wing = add(new THREE.BoxGeometry(0.8, 0.08, 0.5), _lam(0xf2f2f2), sx * 0.75, 1.0, 0);
        wing.rotation.z = sx * 0.35;
      }
      add(new THREE.ConeGeometry(0.2, 0.6, 4), _lam(0x4fa0d0), 0, 0.9, -0.85).rotation.x = -Math.PI / 2;
      break;
    }
    case 'star': {
      // 旋轉的星星路障
      const mat = new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xdda520, emissiveIntensity: 0.8 });
      const core = add(new THREE.SphereGeometry(0.55, 8, 7), mat, 0, 1.1, 0);
      for (let k = 0; k < 5; k++) {
        const a = k * Math.PI * 2 / 5 - Math.PI / 2;
        const spike = add(new THREE.ConeGeometry(0.32, 0.9, 4), mat, Math.cos(a) * 0.75, 1.1 + Math.sin(a) * 0.75 * -1, 0);
        spike.rotation.z = -a - Math.PI / 2;
      }
      eyes(1.2, 0.45, 0.22, 0.11);
      break;
    }
    case 'tumbleweed': {
      add(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshLambertMaterial({ color: 0x9a7a4a, wireframe: true }), 0, 1.1, 0);
      add(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ color: 0x8a6a3a, wireframe: true }), 0, 1.1, 0);
      break;
    }
    case 'haybale': {
      const bale = add(new THREE.CylinderGeometry(1.3, 1.3, 1.9, 12), _lam(0xd8b84a), 0, 1.3, 0);
      bale.rotation.z = Math.PI / 2;
      const stripe = add(new THREE.CylinderGeometry(1.34, 1.34, 0.25, 12), _lam(0xb59a3a), 0, 1.3, 0);
      stripe.rotation.z = Math.PI / 2;
      break;
    }
    case 'boulder': {
      add(new THREE.DodecahedronGeometry(1.5, 0), _lam(0x8a8078), 0, 1.4, 0);
      break;
    }
    case 'snowball': {
      add(new THREE.SphereGeometry(1.6, 12, 10), _lam(0xf8fcff), 0, 1.5, 0);
      break;
    }
    case 'forklift': {
      add(new THREE.BoxGeometry(1.6, 1.0, 2.4), _lam(0xe8b23a), 0, 0.8, 0);
      add(new THREE.BoxGeometry(1.4, 1.0, 1.2), _lam(0x3a3a3a), 0, 1.7, -0.4);
      add(new THREE.BoxGeometry(1.5, 1.8, 0.15), _lam(0x555555), 0, 1.2, 1.3);
      for (const [x, z] of [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]]) {
        const w = add(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8), _lam(0x222222), x, 0.35, z);
        w.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'taxi': {
      add(new THREE.BoxGeometry(1.9, 0.7, 3.6), _lam(0xffc93a), 0, 0.75, 0);
      add(new THREE.BoxGeometry(1.7, 0.65, 1.9), _lam(0xffc93a), 0, 1.4, -0.2);
      add(new THREE.BoxGeometry(1.55, 0.5, 1.7), _lam(0x2a3a4a), 0, 1.45, -0.2);
      add(new THREE.BoxGeometry(0.7, 0.3, 0.5), _lam(0xffffff, 0xfff0b0), 0, 1.9, -0.2);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.14, 6, 5), _lam(0xfff0b0, 0xffe066), sx * 0.6, 0.75, 1.82);
        add(new THREE.SphereGeometry(0.12, 6, 5), _lam(0xd63b3b, 0xd63b3b), sx * 0.6, 0.75, -1.82);
      }
      for (const [x, z] of [[-0.95, 1.15], [0.95, 1.15], [-0.95, -1.15], [0.95, -1.15]]) {
        const w = add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8), _lam(0x222222), x, 0.4, z);
        w.rotation.z = Math.PI / 2;
      }
      break;
    }
    // ---------- 打滑區 ----------
    case 'oil': {
      const p = add(new THREE.CircleGeometry(2.8, 14), new THREE.MeshLambertMaterial({ color: 0x14141c, transparent: true, opacity: 0.85 }), 0, 0, 0);
      p.rotation.x = -Math.PI / 2;
      p.scale.x = 1.3;
      break;
    }
    case 'mud': {
      const p = add(new THREE.CircleGeometry(3.0, 12), new THREE.MeshLambertMaterial({ color: 0x5a4028, transparent: true, opacity: 0.9 }), 0, 0, 0);
      p.rotation.x = -Math.PI / 2;
      p.scale.z = 1.25;
      break;
    }
    case 'poison': {
      const p = add(new THREE.CircleGeometry(2.8, 12), new THREE.MeshLambertMaterial({ color: 0x6a2a9a, emissive: 0x4a1a7a, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }), 0, 0, 0);
      p.rotation.x = -Math.PI / 2;
      break;
    }
    case 'syrup': {
      const p = add(new THREE.CircleGeometry(2.8, 12), new THREE.MeshLambertMaterial({ color: 0xe05f9a, transparent: true, opacity: 0.8 }), 0, 0, 0);
      p.rotation.x = -Math.PI / 2;
      p.scale.x = 1.2;
      break;
    }
  }
  return g;
}
