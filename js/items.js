// ============================================================
// 道具系統：道具箱、金幣、龜殼、香蕉、星星、閃電
// ============================================================

const ITEM_INFO = {
  mushroom:  { icon: '🍄', name: '加速蘑菇' },
  green:     { icon: '🐢', name: '綠龜殼' },
  red:       { icon: '🎯', name: '紅龜殼' },
  banana:    { icon: '🍌', name: '香蕉皮' },
  star:      { icon: '⭐', name: '無敵星星' },
  lightning: { icon: '⚡', name: '閃電' },
  coin:      { icon: '🪙', name: '金幣加倍' },
};

// 依名次的道具機率表 [道具, 權重]
const ITEM_TABLES = [
  /* 第1名 */[['coin', 30], ['banana', 32], ['green', 26], ['mushroom', 8], ['red', 4]],
  /* 2-3 */  [['green', 24], ['red', 22], ['banana', 16], ['mushroom', 22], ['coin', 12], ['star', 2], ['lightning', 2]],
  /* 4-5 */  [['red', 20], ['mushroom', 30], ['green', 12], ['star', 12], ['lightning', 12], ['banana', 6], ['coin', 8]],
  /* 6-8 */  [['mushroom', 30], ['star', 24], ['lightning', 22], ['red', 14], ['green', 6], ['coin', 4]],
];

class ItemWorld {
  constructor(track, karts, scene, options) {
    this.track = track;
    this.karts = karts;
    this.scene = scene;
    this.enabled = !options || options.items !== false;
    this.boxes = [];
    this.coins = [];
    this.hazards = [];   // 放在地上的香蕉
    this.shells = [];    // 飛行中的龜殼

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
    kart.item = null;
    switch (item) {
      case 'mushroom':
        kart.boost(1.15);
        break;
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

  _fireShell(kart, type) {
    const geo = new THREE.SphereGeometry(0.65, 10, 8);
    const mat = new THREE.MeshLambertMaterial({
      color: type === 'green' ? 0x2e9e4f : 0xd63b2e,
      emissive: type === 'green' ? 0x0a4a1a : 0x5a0a0a, emissiveIntensity: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
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
    }
    this.shells.push({
      type, mesh,
      pos: start,
      vel: kart.forward().multiplyScalar(Math.max(52, kart.speed + 22)),
      sampleIdx: kart.sampleIdx,
      owner: kart,
      ownerGrace: 0.5,
      target,
      bounces: 0,
      life: type === 'red' ? 9 : 7,
    });
    if (kart.isPlayer) AudioSys.play('shell');
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

    // 香蕉
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
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

    // 龜殼
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      sh.ownerGrace -= dt;
      if (sh.life <= 0) { this._removeShell(i); continue; }

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
      }

      sh.pos.addScaledVector(sh.vel, dt);
      sh.sampleIdx = track.nearestIdx(sh.pos, sh.sampleIdx);
      sh.pos.y = track.heightAt(sh.pos, sh.sampleIdx) + 0.6;

      // 撞牆反彈 / 出界消失
      const lat = track.lateralOffset(sh.pos, sh.sampleIdx);
      const th = track.theme;
      if (Math.abs(lat) > track.halfW + 0.6) {
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

      // 撞到車
      let removed = false;
      for (const kart of this.karts) {
        if (kart === sh.owner && sh.ownerGrace > 0) continue;
        if (kart.pos.distanceToSquared(sh.pos) < 1.9 * 1.9) {
          kart.spinOut();
          this._removeShell(i);
          removed = true;
          break;
        }
      }
      if (removed) continue;

      // 撞到香蕉
      for (let j = this.hazards.length - 1; j >= 0; j--) {
        if (this.hazards[j].pos.distanceToSquared(sh.pos) < 1.5 * 1.5) {
          this.scene.remove(this.hazards[j].mesh);
          this.hazards.splice(j, 1);
          this._removeShell(i);
          break;
        }
      }
    }
  }

  _removeShell(i) {
    this.scene.remove(this.shells[i].mesh);
    this.shells.splice(i, 1);
  }
}
