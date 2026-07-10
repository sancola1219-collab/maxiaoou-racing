// ============================================================
// 賽車：物理（加速/甩尾/碰撞/圈數）+ 3D 模型
// ============================================================

function buildKartMesh(char) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: char.body });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const skinMat = new THREE.MeshLambertMaterial({ color: char.skin });
  const capMat = new THREE.MeshLambertMaterial({ color: char.cap });

  // 車身（面向 +z）
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.6), bodyMat);
  chassis.position.y = 0.55;
  g.add(chassis);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.8), bodyMat);
  nose.position.set(0, 0.6, 1.55);
  g.add(nose);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.4), darkMat);
  bumper.position.set(0, 0.45, -1.35);
  g.add(bumper);

  // 輪子
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  g.userData.wheels = [];
  for (const [x, z] of [[-0.95, 0.9], [0.95, 0.9], [-0.95, -0.95], [0.95, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
    g.userData.wheels.push(w);
  }

  // 駕駛
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.55), bodyMat);
  torso.position.set(0, 1.1, -0.35);
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), skinMat);
  head.position.set(0, 1.75, -0.35);
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), capMat);
  cap.position.set(0, 1.82, -0.35);
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.4), capMat);
  brim.position.set(0, 1.86, 0.05);
  g.add(brim);

  // 甩尾火花（隱藏，蓄力時顯示）
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0x55aaff });
  g.userData.sparks = [];
  for (const x of [-0.95, 0.95]) {
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), sparkMat);
    spark.position.set(x, 0.25, -1.15);
    spark.visible = false;
    g.add(spark);
    g.userData.sparks.push(spark);
  }
  g.userData.tintables = [chassis, nose, torso];
  return g;
}

class Kart {
  constructor(char, track, index, isPlayer) {
    this.char = char;
    this.track = track;
    this.index = index;
    this.isPlayer = isPlayer;
    this.mesh = buildKartMesh(char);

    const st = char.stats;
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
    this.maxLapReached = false;
    this.finished = false;
    this.finishTime = 0;
    this.coins = 0;
    this.item = null;
    this.itemRoll = 0;
    this.boostTimer = 0;
    this.starTimer = 0;
    this.shrinkTimer = 0;
    this.spinTimer = 0;
    this.invulnTimer = 0;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.wasDrifting = false;
    this.offroad = false;
    this.spinAngle = 0;
    this.rank = this.index + 1;
    this.syncMesh();
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  get maxSpeed() {
    let m = this.baseMax * (1 + Math.min(this.coins, 10) * 0.008);
    if (this.starTimer > 0) m *= 1.22;
    if (this.shrinkTimer > 0) m *= 0.72;
    if (!this.isPlayer) m *= this.aiSkill * this.rubber;
    return m;
  }

  boost(dur) {
    this.boostTimer = Math.max(this.boostTimer, dur);
    if (this.isPlayer) AudioSys.play('boost');
  }

  spinOut() {
    if (this.starTimer > 0 || this.invulnTimer > 0 || this.boostTimer > 0.8) return false;
    this.spinTimer = 1.1;
    this.speed *= 0.35;
    this.coins = Math.max(0, this.coins - 3);
    this.driftDir = 0;
    this.driftCharge = 0;
    if (this.isPlayer) AudioSys.play('spin');
    return true;
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
    for (const t of ['boostTimer', 'starTimer', 'shrinkTimer', 'spinTimer', 'invulnTimer']) {
      if (this[t] > 0) this[t] = Math.max(0, this[t] - dt);
    }
    if (this.itemRoll > 0) {
      this.itemRoll -= dt;
      if (this.itemRoll <= 0) {
        this.item = world.items.rollItem(this);
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
      this.vy = 5; this.grounded = false; // 起跳
      if (this.isPlayer) AudioSys.play('hop');
    }
    if (input.drift && canDrift) {
      if (this.driftDir === 0 && Math.abs(steer) > 0.25) this.driftDir = Math.sign(steer);
      if (this.driftDir !== 0) {
        // 甩尾中：轉向被限制在甩尾方向的一個範圍內
        const bias = 0.42 + 0.62 * Math.max(0, steer * this.driftDir);
        turn = this.driftDir * bias * this.steerRate;
        this.driftCharge += dt * (0.9 + Math.abs(steer) * 0.55);
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
    this.heading += turn * dt * (th.grip < 0.8 ? 0.85 : 1);

    // ---------- 速度 ----------
    let target = 0;
    let rate = this.accelRate;
    if (!spinning && input.accel) target = this.maxSpeed;
    if (!spinning && input.brake) { target = input.accel ? target * 0.55 : -9; rate = 22; }
    if (this.offroad && this.boostTimer <= 0 && this.starTimer <= 0) target = Math.min(target, this.baseMax * th.offroad);
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
    // 甩尾側滑 + 低抓地力側滑
    if (this.driftDir !== 0) {
      const leftV = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this.pos.addScaledVector(leftV, -this.driftDir * this.speed * 0.28 * dt);
    }

    // ---------- 垂直 ----------
    this.sampleIdx = track.nearestIdx(this.pos, this.sampleIdx);
    const groundY = track.heightAt(this.pos, this.sampleIdx);
    if (!this.grounded) {
      this.vy -= 24 * dt;
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
    // 甩尾火花
    const sparks = this.mesh.userData.sparks;
    if (sparks) {
      const show = this.driftDir !== 0 && this.driftCharge > 1.1;
      for (const sp of sparks) {
        sp.visible = show;
        if (show) sp.material.color.setHex(this.driftCharge > 2.2 ? 0xff8822 : 0x55aaff);
      }
    }
    // 星星無敵：車身彩虹閃爍
    const tintables = this.mesh.userData.tintables;
    if (tintables) {
      if (this.starTimer > 0) {
        const c = new THREE.Color();
        c.setHSL((performance.now() * 0.002) % 1, 0.9, 0.6);
        for (const m of tintables) m.material.color.copy(c);
      } else {
        for (const m of tintables) m.material.color.setHex(this.char.body);
      }
    }
  }
}
