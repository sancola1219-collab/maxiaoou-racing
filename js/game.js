// ============================================================
// 主程式：遊戲迴圈、比賽流程、攝影機、排名、輸入
// ============================================================

const Game = {
  renderer: null,
  scene: null,
  camera: null,
  world: null,
  phase: 'menu', // menu / countdown / race / paused / results
  mode: null,    // gp / single / tt
  currentTrackId: null,
  gp: null,      // { cupId, raceIdx, totals: {charId: 分數} }
  ttMushrooms: 0,
  keys: {},
  prevItemKey: false,
  countdownT: 0,
  countdownShown: null,
  finishWait: 0,
  pausedFrom: null,
  testInput: null, // 測試用：覆寫玩家輸入

  init() {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyM') {
        AudioSys.init();
        const muted = AudioSys.toggleMute();
        document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
      }
      if (e.code === 'Enter' && this.phase === 'menu') {
        const title = document.getElementById('screen-title');
        if (!title.classList.contains('hidden')) { AudioSys.init(); UI.show('screen-mode'); }
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    UI.init({
      onStartGp: (cupId, charId) => {
        this.mode = 'gp';
        this.gp = { cupId, raceIdx: 0, totals: {} };
        for (const ch of CHARACTERS) this.gp.totals[ch.id] = 0;
        this.startRace(CUPS.find(c => c.id === cupId).tracks[0], charId);
      },
      onStartSingle: (trackId, charId) => { this.mode = 'single'; this.gp = null; this.startRace(trackId, charId); },
      onStartTt: (trackId, charId) => { this.mode = 'tt'; this.gp = null; this.startRace(trackId, charId); },
      onPause: () => this.togglePause(),
      onResume: () => this.togglePause(),
      onRestart: () => { this.togglePause(); this.startRace(this.currentTrackId, this.playerCharId); },
      onQuit: () => this.quitToMenu(),
    });

    // 主迴圈 + 背景分頁備援
    let lastT = performance.now();
    let acc = 0;
    const STEP = 1 / 60;
    this._frame = () => {
      const now = performance.now();
      let dt = (now - lastT) / 1000;
      lastT = now;
      dt = Math.min(dt, 0.1);
      acc = Math.min(acc + dt, 0.15);
      while (acc >= STEP) { this.update(STEP); acc -= STEP; }
      this.render();
    };
    this._lastRaf = performance.now();
    const loop = () => {
      this._lastRaf = performance.now();
      this._frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setInterval(() => {
      if (performance.now() - this._lastRaf > 300) this._frame();
    }, 100);
  },

  get playerCharId() { return UI.selection.charId; },

  // ---------- 比賽建立 ----------
  startRace(trackId, charId) {
    charId = charId || this.playerCharId;
    this.currentTrackId = trackId;
    if (this.scene) disposeScene(this.scene);

    this.scene = new THREE.Scene();
    const track = new Track(getTrack(trackId));
    track.build(this.scene);
    const th = track.theme;

    // 燈光
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888866, th.night ? 0.55 : 1.0);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, th.night ? 0.35 : 0.75);
    dir.position.set(120, 180, 60);
    this.scene.add(dir);

    // 車手：玩家 + 7 台 AI（計時模式只有玩家）
    const playerChar = CHARACTERS.find(c => c.id === charId);
    const karts = [];
    if (this.mode === 'tt') {
      const player = new Kart(playerChar, track, 0, true);
      karts.push(player);
      this.ttMushrooms = 2;
      karts[0].item = 'mushroom';
      karts[0].itemUses = 1;
    } else {
      const aiChars = CHARACTERS.filter(c => c.id !== charId);
      for (let i = 0; i < 7; i++) karts.push(new Kart(aiChars[i], track, i, false));
      karts.push(new Kart(playerChar, track, 7, true)); // 玩家從最後起跑
    }
    for (const k of karts) this.scene.add(k.mesh);
    const player = karts.find(k => k.isPlayer);

    const items = new ItemWorld(track, karts, this.scene, { items: this.mode !== 'tt' });
    const hazards = new HazardWorld(track, karts, this.scene);

    // 天氣：從主題天氣池隨機挑一種（GameTest 可用 Game.forcedWeather 指定）
    const weatherType = pickWeather(th, this.forcedWeather);
    const weather = new Weather(this.scene, weatherType);
    weather.onFlash = (intensity, color) => UI.flashScreen(intensity, color);
    items.onLightning = () => UI.flashScreen(0.85, '#fff9d0');

    // 燈光受天氣調暗
    if (weather.info.darken) hemi.intensity *= weather.info.darken;

    const fx = new EffectsWorld(this.scene);
    items.fx = fx; // 讓爆炸/道具能生成粒子

    this.world = {
      track, karts, player, items, hazards, weather, fx,
      raceTime: 0,
      phase: 'countdown',
      onLap: (lap) => {
        UI.announce(lap === track.laps ? '最後一圈！' : '第 ' + lap + ' 圈', 1600);
      },
    };

    this.phase = 'countdown';
    this.countdownT = 3.8;
    this.countdownShown = null;
    this.finishWait = 0;

    UI.show(null);
    UI.setRacing(true);
    UI.setTrackMinimap(track);
    const wInfo = weather.info;
    UI.announce(track.def.name + (weatherType !== 'clear' ? '　' + wInfo.icon + wInfo.name : ''), 2200);
    AudioSys.init();
    AudioSys.stopBgm();
    AudioSys.startBgm(th.night);

    this.updateCamera(1, true);
  },

  quitToMenu() {
    this.phase = 'menu';
    this.world = null;
    this.gp = null;
    UI.setRacing(false);
    UI.countdown(null);
    UI.show('screen-mode');
    AudioSys.stopEngine();
    AudioSys.stopBgm();
    if (this.scene) { disposeScene(this.scene); this.scene = null; }
  },

  togglePause() {
    if (this.phase === 'paused') {
      this.phase = this.pausedFrom;
      UI.show(null);
    } else if (this.phase === 'race' || this.phase === 'countdown') {
      this.pausedFrom = this.phase;
      this.phase = 'paused';
      UI.show('screen-pause');
    }
  },

  // ---------- 玩家輸入 ----------
  playerInput() {
    if (this.testInput) return this.testInput;
    const k = this.keys, t = UI.touchState;
    const keySteer = ((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0);
    return {
      accel: !!(k.ArrowUp || k.KeyW || t.accel),
      brake: !!(k.ArrowDown || k.KeyS || t.brake),
      steer: Math.max(-1, Math.min(1, keySteer + (t.steer || 0))), // 搖桿是類比值
      drift: !!(k.ShiftLeft || k.ShiftRight || k.Space || t.drift),
      item: !!(k.ControlLeft || k.ControlRight || k.KeyE || k.Enter || t.item),
    };
  },

  // ---------- 更新 ----------
  update(dt) {
    if (this.phase === 'countdown') this.updateCountdown(dt);
    else if (this.phase === 'race') this.updateRace(dt);
  },

  updateCountdown(dt) {
    this.countdownT -= dt;
    const n = Math.ceil(this.countdownT);
    if (this.countdownT > 0 && n <= 3) {
      if (this.countdownShown !== n) {
        this.countdownShown = n;
        UI.countdown(n);
        AudioSys.play('count');
      }
    }
    if (this.countdownT <= 0) {
      UI.countdown('GO!');
      AudioSys.play('go');
      setTimeout(() => UI.countdown(null), 700);
      this.phase = 'race';
      this.world.phase = 'race';
      AudioSys.startEngine();
      // 起跑噴射
      if (this.playerInput().accel) this.world.player.boost(0.9);
      for (const kart of this.world.karts) {
        if (!kart.isPlayer && Math.random() < 0.6) kart.boost(0.5 + Math.random() * 0.5);
      }
    }
    for (const kart of this.world.karts) kart.syncMesh();
    this.updateCamera(dt, false);
    this.world.weather.update(dt, this.camera.position);
    UI.updateHud(this.world.player, this.world.karts, 0, dt);
  },

  updateRace(dt) {
    const world = this.world;
    world.raceTime += dt;

    // 輸入與更新
    for (const kart of world.karts) {
      let input;
      if (kart.isPlayer && !kart.finished) {
        input = this.playerInput();
        const itemPressed = input.item && !this.prevItemKey;
        this.prevItemKey = input.item;
        if (itemPressed && kart.item && kart.itemRoll <= 0) {
          world.items.useItem(kart);
          if (this.mode === 'tt' && !kart.item && this.ttMushrooms > 0) {
            this.ttMushrooms--;
            kart.item = 'mushroom';
            kart.itemUses = 1;
          }
        }
        // 火箭衝刺：自動駕駛（道具已由 useItem 的 bulletTimer 守衛鎖住）
        if (kart.bulletTimer > 0) {
          input = computeAiInput(kart, world, dt);
        }
      } else {
        input = computeAiInput(kart, world, dt);
        if (input.item && kart.item && kart.itemRoll <= 0) world.items.useItem(kart);
      }
      kart.update(dt, input, world);
    }

    // 車輛互撞
    const karts = world.karts;
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i], b = karts[j];
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 2.3 * 2.3 && d2 > 0.0001 && Math.abs(a.pos.y - b.pos.y) < 2) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const overlap = 2.3 - d;
          const total = a.weight + b.weight;
          a.pos.x += nx * overlap * (b.weight / total);
          a.pos.z += nz * overlap * (b.weight / total);
          b.pos.x -= nx * overlap * (a.weight / total);
          b.pos.z -= nz * overlap * (a.weight / total);
          const aPower = a.starTimer > 0 || a.bulletTimer > 0;
          const bPower = b.starTimer > 0 || b.bulletTimer > 0;
          if (aPower && !bPower) b.spinOut();
          else if (bPower && !aPower) a.spinOut();
          if ((a.isPlayer || b.isPlayer) && Math.abs(a.speed - b.speed) > 5) AudioSys.play('bump');
        }
      }
    }

    world.items.update(dt, world);
    world.hazards.update(dt, world);
    this.updateRanks();
    this.updateCamera(dt, false);
    world.weather.update(dt, this.camera.position);
    world.fx.update(dt, world, this.camera);

    // 引擎聲
    AudioSys.setEngine(Math.min(1, Math.abs(world.player.speed) / world.player.baseMax));

    // 完賽處理
    const player = world.player;
    if (player.finished && this.finishWait === 0) {
      this.finishWait = this.mode === 'tt' ? 0.8 : 5;
      UI.announce('完賽！第' + player.rank + '名', 2500);
      AudioSys.play(player.rank <= 3 ? 'finish' : 'lose');
      AudioSys.stopEngine();
    }
    if (this.finishWait > 0) {
      this.finishWait -= dt;
      const allDone = world.karts.every(k => k.finished);
      if (this.finishWait <= 0 || allDone) this.showResults();
    }

    UI.updateHud(player, world.karts, world.raceTime, dt);
  },

  updateRanks() {
    const sorted = [...this.world.karts].sort((a, b) => {
      const va = a.finished ? 1e9 - a.finishTime * 1000 : a.progress();
      const vb = b.finished ? 1e9 - b.finishTime * 1000 : b.progress();
      return vb - va;
    });
    sorted.forEach((k, i) => { k.rank = i + 1; });
  },

  updateCamera(dt, snap) {
    const player = this.world ? this.world.player : null;
    if (!player) return;
    const cam = this.camera;
    if (this.phase === 'countdown') {
      const a = this.countdownT * 0.7 + 2;
      const cx = player.pos.x + Math.sin(a) * 11;
      const cz = player.pos.z + Math.cos(a) * 11;
      cam.position.set(cx, player.pos.y + 4.5, cz);
      cam.lookAt(player.pos.x, player.pos.y + 1.5, player.pos.z);
      return;
    }
    const fwd = player.forward();
    const dist = 8.5 + Math.abs(player.speed) * 0.045;
    const desired = new THREE.Vector3(
      player.pos.x - fwd.x * dist,
      player.pos.y + 4.3,
      player.pos.z - fwd.z * dist
    );
    if (snap) cam.position.copy(desired);
    else cam.position.lerp(desired, 1 - Math.exp(-dt * 5.5));
    if (cam.position.y < player.pos.y + 2) cam.position.y = player.pos.y + 2;
    cam.lookAt(
      player.pos.x + fwd.x * 6,
      player.pos.y + 1.6,
      player.pos.z + fwd.z * 6
    );
    // 加速時視野變廣（速度感）
    const boosting = player.boostTimer > 0 || player.bulletTimer > 0 || player.starTimer > 0;
    if (this._fov === undefined) this._fov = 65;
    const targetFov = boosting ? 76 : 65;
    this._fov += (targetFov - this._fov) * Math.min(1, dt * 6);
    if (Math.abs(cam.fov - this._fov) > 0.05) {
      cam.fov = this._fov;
      cam.updateProjectionMatrix();
    }
  },

  render() {
    if (this.scene) this.renderer.render(this.scene, this.camera);
  },

  // ---------- 結算 ----------
  showResults() {
    this.phase = 'results';
    this.finishWait = 0;
    UI.setRacing(false);
    AudioSys.stopEngine();
    AudioSys.stopBgm();

    const world = this.world;
    const sorted = [...world.karts].sort((a, b) => a.rank - b.rank);

    if (this.mode === 'tt') {
      const t = world.player.finishTime;
      const key = 'msq-tt-' + this.currentTrackId;
      const prev = parseFloat(localStorage.getItem(key) || 'Infinity');
      const isRecord = t < prev;
      if (isRecord) localStorage.setItem(key, String(t));
      UI.showResults({
        title: '⏱️ ' + world.track.def.name + (isRecord ? '　🎉 新紀錄！' : ''),
        rows: [{
          rank: 1, name: world.player.char.name, isPlayer: true,
          time: formatTime(t) + (isRecord ? '' : '（最佳 ' + formatTime(prev) + '）'),
        }],
        buttons: [
          { label: '再挑戰', onClick: () => this.startRace(this.currentTrackId) },
          { label: '換賽道', secondary: true, onClick: () => { UI.buildTrackSelect(); UI.show('screen-track'); } },
          { label: '回主選單', secondary: true, onClick: () => this.quitToMenu() },
        ],
      });
      return;
    }

    const rows = sorted.map(k => ({
      rank: k.rank,
      name: k.char.name,
      isPlayer: k.isPlayer,
      time: k.finished ? formatTime(k.finishTime) : '—',
    }));

    if (this.mode === 'gp') {
      // 加積分
      for (const k of sorted) this.gp.totals[k.char.id] += GP_POINTS[k.rank - 1] || 0;
      for (const row of rows) {
        const kart = sorted[rows.indexOf(row)];
        row.points = GP_POINTS[kart.rank - 1] || 0;
        row.total = this.gp.totals[kart.char.id];
      }
      const cup = CUPS.find(c => c.id === this.gp.cupId);
      const isLast = this.gp.raceIdx >= 3;
      UI.showResults({
        title: cup.icon + ' ' + cup.name + '　第 ' + (this.gp.raceIdx + 1) + '/4 場　' + world.track.def.name,
        rows,
        buttons: isLast
          ? [{ label: '🏆 看總排名', onClick: () => this.showGpFinal() }]
          : [
            { label: '下一場 ▶', onClick: () => { this.gp.raceIdx++; this.startRace(cup.tracks[this.gp.raceIdx]); } },
            { label: '回主選單', secondary: true, onClick: () => this.quitToMenu() },
          ],
      });
    } else {
      UI.showResults({
        title: '🏁 ' + world.track.def.name,
        rows,
        buttons: [
          { label: '再玩一次', onClick: () => this.startRace(this.currentTrackId) },
          { label: '換賽道', secondary: true, onClick: () => { UI.buildTrackSelect(); UI.show('screen-track'); } },
          { label: '回主選單', secondary: true, onClick: () => this.quitToMenu() },
        ],
      });
    }
  },

  showGpFinal() {
    const cup = CUPS.find(c => c.id === this.gp.cupId);
    const standings = Object.entries(this.gp.totals)
      .sort((a, b) => b[1] - a[1])
      .map(([charId, total], i) => ({
        rank: i + 1,
        name: CHARACTERS.find(c => c.id === charId).name,
        isPlayer: charId === this.playerCharId,
        total,
      }));
    const playerRank = standings.find(r => r.isPlayer).rank;
    if (playerRank <= 3) AudioSys.play('finish');
    UI.showGpFinal(cup, standings, playerRank);
    this.gp = null;
  },
};

function disposeScene(scene) {
  scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.userData && m.userData.cached) continue; // 共用快取材質不銷毀（見 track.js _lam）
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

// 測試掛鉤（背景分頁測試法：手動推幀 + 狀態取樣）
window.GameTest = {
  game: Game,
  step(dt) { Game.update(dt || 1 / 60); Game.render(); },
  setInput(input) { Game.testInput = input; },
  startRace(trackId, mode, charId) {
    Game.mode = mode || 'single';
    if (Game.mode === 'gp' && !Game.gp) {
      const cup = CUPS.find(c => c.tracks.includes(trackId)) || CUPS[0];
      Game.gp = { cupId: cup.id, raceIdx: cup.tracks.indexOf(trackId), totals: {} };
      for (const ch of CHARACTERS) Game.gp.totals[ch.id] = 0;
    }
    Game.startRace(trackId, charId || 'mario');
  },
  state() {
    const w = Game.world;
    if (!w) return { phase: Game.phase };
    return {
      phase: Game.phase,
      mode: Game.mode,
      trackId: Game.currentTrackId,
      raceTime: w.raceTime,
      player: {
        lap: w.player.lap, rank: w.player.rank, speed: w.player.speed,
        coins: w.player.coins, item: w.player.item, finished: w.player.finished,
        pos: { x: w.player.pos.x, y: w.player.pos.y, z: w.player.pos.z },
        sampleIdx: w.player.sampleIdx,
      },
      karts: w.karts.map(k => ({ name: k.char.name, lap: k.lap, rank: k.rank, speed: Math.round(k.speed), finished: k.finished })),
    };
  },
};

Game.init();
