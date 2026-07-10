// ============================================================
// 道具系統：道具箱、金幣、龜殼、香蕉、星星、閃電
// ============================================================

const ITEM_INFO = {
  mushroom:  { icon: '🍄', name: '加速蘑菇' },
  mushroom3: { icon: '🍄', name: '三重蘑菇' },
  goldmush:  { icon: '🌟', name: '黃金蘑菇' },
  green:     { icon: '🐢', name: '綠龜殼' },
  red:       { icon: '🎯', name: '紅龜殼' },
  blue:      { icon: '💙', name: '藍色飛彈龜殼' },
  banana:    { icon: '🍌', name: '香蕉皮' },
  fakebox:   { icon: '❓', name: '假道具箱' },
  bomb:      { icon: '💣', name: '炸彈' },
  ink:       { icon: '🦑', name: '墨魚' },
  bullet:    { icon: '🚀', name: '火箭衝刺' },
  star:      { icon: '⭐', name: '無敵星星' },
  lightning: { icon: '⚡', name: '閃電' },
  coin:      { icon: '🪙', name: '金幣加倍' },
};

// 可以連續使用的道具（次數）
const ITEM_USES = { mushroom3: 3, goldmush: 6 };

// 依名次的道具機率表 [道具, 權重]
const ITEM_TABLES = [
  /* 第1名 */[['coin', 24], ['banana', 24], ['fakebox', 14], ['green', 22], ['ink', 8], ['mushroom', 8]],
  /* 2-3 */  [['green', 18], ['red', 18], ['banana', 12], ['fakebox', 8], ['mushroom', 14], ['mushroom3', 10], ['ink', 8], ['coin', 8], ['bomb', 4]],
  /* 4-5 */  [['red', 16], ['mushroom3', 14], ['mushroom', 10], ['goldmush', 10], ['bomb', 12], ['star', 8], ['lightning', 8], ['ink', 8], ['green', 6], ['blue', 8]],
  /* 6-8 */  [['mushroom3', 14], ['goldmush', 15], ['star', 13], ['lightning', 11], ['blue', 12], ['bullet', 14], ['bomb', 8], ['red', 8], ['ink', 5]],
];

class ItemWorld {
  constructor(track, karts, scene, options) {
    this.track = track;
    this.karts = karts;
    this.scene = scene;
    this.enabled = !options || options.items !== false;
    this.boxes = [];
    this.coins = [];
    this.hazards = [];    // 放在地上的香蕉 / 假道具箱
    this.shells = [];     // 飛行中的龜殼 / 炸彈
    this.explosions = []; // 爆炸特效

    if (this.enabled) this._spawnBoxes();
    this._spawnCoins();
  }

  _spawnBoxes() {
    const track = this.track, N = track.N;
    const rows = 7;
    const boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    // 「?」貼圖
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#5a8aff');
    grad.addColorStop(1, '#b55aff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 36);
    const boxTex = new THREE.CanvasTexture(canvas);
    for (let r = 0; r < rows; r++) {
      const idx = Math.floor(N * (r + 0.55) / rows);
      const s = track.sample(idx);
      for (const lane of [-0.55, 0, 0.55]) {
        const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({
          map: boxTex, transparent: true, opacity: 0.88,
          emissive: 0x4488ff, emissiveIntensity: 0.45,
        }));
        const pos = s.pos.clone().addScaledVector(s.left, lane * track.halfW);
        pos.y += 1.1;
        mesh.position.copy(pos);
        this.scene.add(mesh);
        this.boxes.push({ mesh, pos, respawn: 0, hue: Math.random() });
      }
    }
  }

  _spawnCoins() {
    const track = this.track, N = track.N;
    const groups = 10;
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12);
    const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xaa8800, emissiveIntensity: 0.5 });
    for (let gI = 0; gI < groups; gI++) {
      const base = Math.floor(N * (gI + 0.3) / groups);
      const lane = ((gI % 3) - 1) * 0.45;
      for (let k = 0; k < 5; k++) {
        const s = track.sample(base + k * 4);
        const mesh = new THREE.Mesh(coinGeo, coinMat);
        const pos = s.pos.clone().addScaledVector(s.left, lane * track.halfW);
        pos.y += 0.9;
        mesh.position.copy(pos);
        mesh.rotation.z = Math.PI / 2;
        this.scene.add(mesh);
        this.coins.push({ mesh, pos, respawn: 0 });
      }
    }
  }

  rollItem(kart) {
    const rank = kart.rank;
    const table = ITEM_TABLES[rank <= 1 ? 0 : rank <= 3 ? 1 : rank <= 5 ? 2 : 3];
    let total = 0;
    for (const [, w] of table) total += w;
    let r = Math.random() * total;
    for (const [item, w] of table) {
      r -= w;
      if (r <= 0) return item;
    }
    return 'mushroom';
  }

  useItem(kart) {
    const item = kart.item;
    if (!item) return;
    // 多次使用的道具（三重蘑菇/黃金蘑菇）用完才清空
    kart.itemUses = (kart.itemUses || 1) - 1;
    if (kart.itemUses <= 0) { kart.item = null; kart.itemUses = 0; }
    switch (item) {
      case 'mushroom':
        kart.boost(1.15);
        break;
      case 'mushroom3':
        kart.boost(1.15);
        break;
      case 'goldmush':
        kart.boost(0.9);
        break;
      case 'bomb':
        this._fireShell(kart, 'bomb');
        break;
      case 'blue':
        this._fireShell(kart, 'blue');
        break;
      case 'ink': {
        // 墨魚：噴前面所有人一臉墨汁（視線受阻 + AI 方向亂飄）
        for (const other of this.karts) {
          if (other === kart || other.finished) continue;
          if (other.rank < kart.rank && other.starTimer <= 0 && other.bulletTimer <= 0) {
            other.inkTimer = 4.5;
            if (other.isPlayer) UI.showInk();
          }
        }
        AudioSys.play('ink');
        break;
      }
      case 'bullet':
        // 火箭衝刺：自動駕駛 + 無敵 + 超速
        kart.bulletTimer = 3.5;
        if (kart.isPlayer) AudioSys.play('bullet');
        break;
      case 'fakebox': {
        const behind = kart.pos.clone().addScaledVector(kart.forward(), -2.8);
        behind.y = this.track.heightAt(behind, kart.sampleIdx) + 1.0;
        this._dropFakeBox(behind);
        break;
      }
      case 'coin':
        kart.coins = Math.min(10, kart.coins + 3);
        if (kart.isPlayer) AudioSys.play('coin');
        break;
      case 'star':
        kart.starTimer = 6.5;
        if (kart.isPlayer) AudioSys.play('star');
        break;
      case 'lightning':
        for (const other of this.karts) {
          if (other === kart || other.finished) continue;
          if (other.starTimer > 0) continue;
          if (other.spinOut()) other.shrinkTimer = 4.5;
          else other.shrinkTimer = Math.max(other.shrinkTimer, 2);
        }
        AudioSys.play('lightning');
        break;
      case 'banana': {
        const behind = kart.pos.clone().addScaledVector(kart.forward(), -2.6);
        behind.y = this.track.heightAt(behind, kart.sampleIdx) + 0.4;
        this._dropBanana(behind);
        break;
      }
      case 'green':
        this._fireShell(kart, 'green');
        break;
      case 'red':
        this._fireShell(kart, 'red');
        break;
    }
  }

  _dropBanana(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffe14f });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
    body.scale.set(1, 0.7, 0.55);
    g.add(body);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), new THREE.MeshLambertMaterial({ color: 0x8a6a2a }));
    tip.position.set(0.45, 0.25, 0);
    g.add(tip);
    g.position.copy(pos);
    this.scene.add(g);
    this.hazards.push({ mesh: g, pos: pos.clone() });
  }

  _dropFakeBox(pos) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshLambertMaterial({
        color: 0xffb0b0, transparent: true, opacity: 0.85,
        emissive: 0xd04444, emissiveIntensity: 0.5,
      })
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.hazards.push({ mesh, pos: pos.clone(), kind: 'fakebox' });
  }

  _fireShell(kart, type) {
    let mesh;
    if (type === 'bomb') {
      mesh = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x22222c, emissive: 0x111118, emissiveIntensity: 0.3 }));
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 4), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
      fuse.position.y = 0.8;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd54f }));
      spark.position.y = 1.05;
      mesh.add(ball); mesh.add(fuse); mesh.add(spark);
    } else {
      const colors = { green: [0x2e9e4f, 0x0a4a1a], red: [0xd63b2e, 0x5a0a0a], blue: [0x2a5fd6, 0x0a1a5a] };
      const [c, e] = colors[type];
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8),
        new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: 0.4 }));
      if (type === 'blue') {
        // 藍龜殼有小翅膀
        for (const sx of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
          wing.position.set(sx * 0.65, 0.2, 0);
          wing.rotation.z = sx * Math.PI / 2;
          wing.scale.z = 0.3;
          mesh.add(wing);
        }
      }
    }
    const start = kart.pos.clone().addScaledVector(kart.forward(), 2.2);
    start.y += 0.6;
    mesh.position.copy(start);
    this.scene.add(mesh);

    let target = null;
    if (type === 'red') {
      // 追蹤前一名的車
      const sorted = [...this.karts].sort((a, b) => b.progress() - a.progress());
      const myPos = sorted.indexOf(kart);
      if (myPos > 0) target = sorted[myPos - 1];
    } else if (type === 'blue') {
      // 直奔第 1 名
      target = this.karts.find(k => k.rank === 1) || null;
      if (target === kart) target = null;
    }
    const speed = type === 'bomb' ? Math.max(34, kart.speed + 12) : type === 'blue' ? 66 : Math.max(52, kart.speed + 22);
    this.shells.push({
      type, mesh,
      pos: start,
      vel: kart.forward().multiplyScalar(speed),
      sampleIdx: kart.sampleIdx,
      owner: kart,
      ownerGrace: type === 'bomb' ? 1.2 : 0.5,
      target,
      bounces: 0,
      life: type === 'red' ? 9 : type === 'blue' ? 13 : type === 'bomb' ? 2.4 : 7,
    });
    if (kart.isPlayer) AudioSys.play(type === 'bomb' ? 'bomb-throw' : 'shell');
  }

  // 爆炸：範圍內的車全部旋轉，並清掉範圍內的地面道具
  _explode(pos, radius) {
    for (const kart of this.karts) {
      const dx = kart.pos.x - pos.x, dz = kart.pos.z - pos.z;
      if (dx * dx + dz * dz < radius * radius && Math.abs(kart.pos.y - pos.y) < 5) kart.spinOut();
    }
    for (let j = this.hazards.length - 1; j >= 0; j--) {
      if (this.hazards[j].pos.distanceToSquared(pos) < radius * radius) {
        this.scene.remove(this.hazards[j].mesh);
        this.hazards.splice(j, 1);
      }
    }
    const boom = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 })
    );
    boom.position.copy(pos);
    this.scene.add(boom);
    this.explosions.push({ mesh: boom, t: 0, radius });
    AudioSys.play('bomb');
  }

  update(dt, world) {
    const track = this.track;

    // 道具箱：旋轉 + 重生
    for (const box of this.boxes) {
      if (box.respawn > 0) {
        box.respawn -= dt;
        box.mesh.visible = box.respawn <= 0;
        continue;
      }
      box.hue = (box.hue + dt * 0.4) % 1;
      box.mesh.material.emissive.setHSL(box.hue, 0.8, 0.5);
      box.mesh.rotation.y += dt * 1.8;
      box.mesh.rotation.x += dt * 1.1;
      for (const kart of this.karts) {
        if (kart.item || kart.itemRoll > 0 || kart.finished) continue;
        if (kart.pos.distanceToSquared(box.pos) < 2.4 * 2.4) {
          kart.itemRoll = 1.0;
          box.respawn = 3;
          box.mesh.visible = false;
          if (kart.isPlayer) AudioSys.play('box');
          break;
        }
      }
    }

    // 金幣
    for (const coin of this.coins) {
      if (coin.respawn > 0) {
        coin.respawn -= dt;
        coin.mesh.visible = coin.respawn <= 0;
        continue;
      }
      coin.mesh.rotation.y += dt * 3;
      for (const kart of this.karts) {
        if (kart.coins >= 10 || kart.finished) continue;
        if (kart.pos.distanceToSquared(coin.pos) < 2 * 2) {
          kart.coins++;
          coin.respawn = 18;
          coin.mesh.visible = false;
          if (kart.isPlayer) AudioSys.play('coin');
          break;
        }
      }
    }

    // 地面道具（香蕉/假箱）
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      if (hz.kind === 'fakebox') { hz.mesh.rotation.y += dt * 1.8; hz.mesh.rotation.x += dt * 1.1; }
      let hit = false;
      for (const kart of this.karts) {
        if (kart.pos.distanceToSquared(hz.pos) < 1.7 * 1.7) {
          if (kart.starTimer > 0) { hit = true; break; }
          if (kart.spinOut()) { hit = true; break; }
        }
      }
      if (hit) {
        this.scene.remove(hz.mesh);
        this.hazards.splice(i, 1);
      }
    }

    // 龜殼 / 炸彈
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      sh.ownerGrace -= dt;
      if (sh.life <= 0) {
        if (sh.type === 'bomb') this._explode(sh.pos.clone(), 6); // 引信燒完
        this._removeShell(i);
        continue;
      }

      if (sh.type === 'red' && sh.target && !sh.target.finished) {
        // 紅龜殼：沿賽道追、接近後直線衝
        const toTarget = sh.target.pos.clone().sub(sh.pos);
        toTarget.y = 0;
        if (toTarget.lengthSq() < 16 * 16) {
          sh.vel.copy(toTarget.normalize().multiplyScalar(56));
        } else {
          const aheadS = track.sample(sh.sampleIdx + 10);
          const dir = aheadS.pos.clone().sub(sh.pos);
          dir.y = 0;
          sh.vel.copy(dir.normalize().multiplyScalar(56));
        }
      } else if (sh.type === 'blue' && sh.target && !sh.target.finished) {
        // 藍龜殼：沿賽道飛向第 1 名，到了就炸
        const toTarget = sh.target.pos.clone().sub(sh.pos);
        toTarget.y = 0;
        const d2 = toTarget.lengthSq();
        if (d2 < 3.5 * 3.5) {
          this._explode(sh.target.pos.clone(), 5);
          this._removeShell(i);
          continue;
        }
        if (d2 < 20 * 20) {
          sh.vel.copy(toTarget.normalize().multiplyScalar(66));
        } else {
          const aheadS = track.sample(sh.sampleIdx + 12);
          const dir = aheadS.pos.clone().sub(sh.pos);
          dir.y = 0;
          sh.vel.copy(dir.normalize().multiplyScalar(66));
        }
      }

      sh.pos.addScaledVector(sh.vel, dt);
      sh.sampleIdx = track.nearestIdx(sh.pos, sh.sampleIdx);
      sh.pos.y = track.heightAt(sh.pos, sh.sampleIdx) + (sh.type === 'blue' ? 1.6 : 0.6);

      // 撞牆反彈 / 出界（藍龜殼用飛的不管牆）
      const lat = track.lateralOffset(sh.pos, sh.sampleIdx);
      const th = track.theme;
      if (sh.type !== 'blue' && Math.abs(lat) > track.halfW + 0.6) {
        if (sh.type === 'bomb') {
          this._explode(sh.pos.clone(), 6);
          this._removeShell(i);
          continue;
        }
        if (th.open || th.voidFall || sh.bounces >= 3) {
          this._removeShell(i);
          continue;
        }
        const s = track.sample(sh.sampleIdx);
        // 沿左向量的分量反轉 = 反彈
        const latComp = sh.vel.x * s.left.x + sh.vel.z * s.left.z;
        sh.vel.x -= 2 * latComp * s.left.x;
        sh.vel.z -= 2 * latComp * s.left.z;
        sh.pos.addScaledVector(s.left, -Math.sign(lat) * (Math.abs(lat) - track.halfW - 0.5));
        sh.bounces++;
      }

      sh.mesh.position.copy(sh.pos);
      sh.mesh.rotation.y += dt * 8;

      // 撞到車（藍龜殼只理會目標）
      let removed = false;
      for (const kart of this.karts) {
        if (kart === sh.owner && sh.ownerGrace > 0) continue;
        if (sh.type === 'blue' && kart !== sh.target) continue;
        if (kart.pos.distanceToSquared(sh.pos) < 1.9 * 1.9) {
          if (sh.type === 'bomb' || sh.type === 'blue') {
            this._explode(sh.pos.clone(), sh.type === 'bomb' ? 6 : 5);
          } else {
            kart.spinOut();
          }
          this._removeShell(i);
          removed = true;
          break;
        }
      }
      if (removed) continue;

      // 撞到地面道具（香蕉/假箱）
      for (let j = this.hazards.length - 1; j >= 0; j--) {
        if (this.hazards[j].pos.distanceToSquared(sh.pos) < 1.5 * 1.5) {
          this.scene.remove(this.hazards[j].mesh);
          this.hazards.splice(j, 1);
          if (sh.type === 'bomb') this._explode(sh.pos.clone(), 6);
          this._removeShell(i);
          break;
        }
      }
    }

    // 爆炸特效：膨脹再淡出
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.t += dt;
      const grow = Math.min(1, ex.t / 0.25);
      ex.mesh.scale.setScalar(0.3 + grow * ex.radius);
      ex.mesh.material.opacity = ex.t < 0.25 ? 0.85 : Math.max(0, 0.85 * (1 - (ex.t - 0.25) / 0.35));
      if (ex.t > 0.6) {
        this.scene.remove(ex.mesh);
        ex.mesh.geometry.dispose();
        ex.mesh.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  _removeShell(i) {
    this.scene.remove(this.shells[i].mesh);
    this.shells.splice(i, 1);
  }
}
