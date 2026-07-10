// ============================================================
// AI 駕駛：前瞻導航、彎道減速、甩尾、橡皮筋、用道具
// ============================================================

function computeAiInput(kart, world, dt) {
  const track = kart.track;
  const input = { accel: true, brake: false, steer: 0, drift: false, item: false };
  if (kart.finished) {
    // 完賽後繼續慢慢跑
    kart.rubber = 0.7;
  }

  // ---------- 導航：朝前瞻點開 ----------
  const lat = track.lateralOffset(kart.pos, kart.sampleIdx);
  const isOff = Math.abs(lat) > track.halfW + 2;
  // 出賽道時直接朝前方不遠的賽道中心開回去；在賽道上則看遠一點
  const look = isOff ? 6 : 8 + Math.floor(kart.speed * 0.55);
  const lane = isOff ? 0 : kart.aiLane;
  const targetS = track.sample(kart.sampleIdx + look);
  const tx = targetS.pos.x + targetS.left.x * lane * track.halfW;
  const tz = targetS.pos.z + targetS.left.z * lane * track.halfW;
  const desired = Math.atan2(tx - kart.pos.x, tz - kart.pos.z);
  let diff = desired - kart.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  input.steer = Math.max(-1, Math.min(1, diff * 2.4));

  // ---------- 彎道減速 ----------
  const curve = track.curvatureAhead(kart.sampleIdx + 6, 22);
  const spdRatio = kart.speed / kart.baseMax;
  if (curve > 0.55 && spdRatio > 0.72) input.accel = false;
  if (curve > 1.1 && spdRatio > 0.55) { input.accel = false; input.brake = true; }

  // ---------- 甩尾（技術好的 AI 在中彎道甩尾蓄力）----------
  if (isOff || kart.spinTimer > 0) {
    kart.aiDrift = false;
  } else if (!kart.aiDrift && curve > 0.5 && curve < 1.3 && kart.speed > 18 && kart.aiSkill > 0.93) {
    kart.aiDrift = true;
    kart.aiDriftTime = 0;
  }
  if (kart.aiDrift) {
    kart.aiDriftTime = (kart.aiDriftTime || 0) + dt;
    input.drift = true;
    input.accel = true;
    input.brake = false;
    // 彎道結束 / 太慢 / 想轉的方向跟甩尾方向打架 / 甩太久 → 放開
    const fighting = kart.driftDir !== 0 && input.steer * kart.driftDir < -0.45;
    if (curve < 0.32 || kart.speed < 14 || fighting || kart.aiDriftTime > 3) kart.aiDrift = false;
  }

  // ---------- 用道具 ----------
  if (kart.item) {
    kart.aiItemTimer -= dt;
    if (kart.aiItemTimer <= 0) {
      // 依道具挑時機：龜殼在直線用、香蕉隨便丟、加速類立刻用
      const straight = curve < 0.3;
      const it = kart.item;
      if (it === 'mushroom' || it === 'star' || it === 'lightning' || it === 'coin' || it === 'banana'
        || ((it === 'green' || it === 'red') && straight)) {
        input.item = true;
        kart.aiItemTimer = 1.5 + Math.random() * 3;
      }
    }
  } else {
    kart.aiItemTimer = 1 + Math.random() * 2.5;
  }

  // ---------- 橡皮筋：落後玩家加速、領先玩家放水 ----------
  const player = world.player;
  if (player && !kart.finished) {
    const gap = (player.progress() - kart.progress()) / track.N; // 以圈為單位
    const target = 1 + Math.max(-0.07, Math.min(0.16, gap * 0.28));
    kart.rubber += (target - kart.rubber) * Math.min(1, dt * 2);
  }

  // 卡在牆邊或倒著跑太久 → 倒車修正
  if (kart.speed < 3 && !kart.finished && world.phase === 'race') {
    kart._stuck = (kart._stuck || 0) + dt;
    if (kart._stuck > 2.5) {
      input.accel = false;
      input.brake = true;
      input.steer = -input.steer;
      if (kart._stuck > 4) kart._stuck = 0;
    }
  } else {
    kart._stuck = 0;
  }

  return input;
}
