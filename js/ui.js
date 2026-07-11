// ============================================================
// UI：畫面切換、選單生成、HUD、小地圖、觸控
// ============================================================

const UI = {
  handlers: {},
  selection: { charId: 'mario', cupId: null, trackId: null, mode: null },
  touchState: { steer: 0, accel: false, brake: false, drift: false, item: false },
  _announceTimer: null,
  _itemRollTimer: 0,

  $(id) { return document.getElementById(id); },

  init(handlers) {
    this.handlers = handlers;
    const $ = this.$.bind(this);

    $('btn-start').onclick = () => { AudioSys.init(); this.show('screen-mode'); };
    $('btn-help').onclick = () => this.show('screen-help');
    $('btn-help-back').onclick = () => this.show('screen-mode');

    $('btn-mode-gp').onclick = () => { this.selection.mode = 'gp'; this.show('screen-char'); };
    $('btn-mode-single').onclick = () => { this.selection.mode = 'single'; this.show('screen-char'); };
    $('btn-mode-tt').onclick = () => { this.selection.mode = 'tt'; this.show('screen-char'); };

    $('btn-char-back').onclick = () => this.show('screen-mode');
    $('btn-char-ok').onclick = () => {
      if (this.selection.mode === 'gp') { this.buildCupSelect(); this.show('screen-cup'); }
      else { this.buildTrackSelect(); this.show('screen-track'); }
    };
    $('btn-cup-back').onclick = () => this.show('screen-char');
    $('btn-track-back').onclick = () => this.show('screen-char');

    $('btn-resume').onclick = () => handlers.onResume();
    $('btn-restart').onclick = () => handlers.onRestart();
    $('btn-quit').onclick = () => handlers.onQuit();
    $('btn-gp-done').onclick = () => handlers.onQuit();
    $('pause-btn').onclick = () => handlers.onPause();

    $('mute-btn').onclick = () => {
      AudioSys.init();
      const muted = AudioSys.toggleMute();
      $('mute-btn').textContent = muted ? '🔇' : '🔊';
    };
    if (AudioSys.muted) $('mute-btn').textContent = '🔇';

    this.buildCharSelect();
    this._initTouch();
  },

  show(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    if (screenId) this.$(screenId).classList.remove('hidden');
  },

  setRacing(on) {
    this.$('hud').classList.toggle('hidden', !on);
    document.body.classList.toggle('racing', on);
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.$('touch-controls').classList.toggle('hidden', !(on && isTouch));
    if (!on) {
      this.$('ink-overlay').classList.remove('show'); // 退賽清掉殘留墨漬
      this.$('speedlines').classList.remove('show');
      this._inkShown = false; this._fastShown = false;
    }
  },

  // ---------- 選單生成 ----------
  // 用小型 3D 渲染器幫每位角色拍一張縮圖
  _charThumb(ch) {
    if (!this._thumbCache) this._thumbCache = {};
    if (this._thumbCache[ch.id]) return this._thumbCache[ch.id];
    if (!this._thumbRenderer) {
      this._thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this._thumbRenderer.setSize(150, 120);
    }
    const r = this._thumbRenderer;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x887a66, 1.15));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7);
    dl.position.set(2, 4, 3);
    scene.add(dl);
    const kart = buildKartMesh(ch);
    kart.rotation.y = 0.55;
    scene.add(kart);
    const cam = new THREE.PerspectiveCamera(36, 150 / 120, 0.1, 50);
    cam.position.set(2.4, 2.2, 4.0);
    cam.lookAt(0, 1.15, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL(); // 同一個 task 內同步取圖才拿得到
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    this._thumbCache[ch.id] = url;
    return url;
  },

  buildCharSelect() {
    const grid = this.$('char-grid');
    grid.innerHTML = '';
    const statNames = [['speed', '速度'], ['accel', '加速'], ['handling', '操控'], ['weight', '重量']];
    for (const ch of CHARACTERS) {
      const card = document.createElement('div');
      card.className = 'card' + (ch.id === this.selection.charId ? ' selected' : '');
      const bars = statNames.map(([key, label]) =>
        `<div class="row"><span class="label">${label}</span><span class="bar"><span class="fill" style="width:${ch.stats[key] * 20}%"></span></span></div>`
      ).join('');
      card.innerHTML = `<img class="thumb" src="${this._charThumb(ch)}" alt="${ch.name}">
        <div class="name">${ch.name}</div><div class="stat-bars">${bars}</div>`;
      card.onclick = () => {
        this.selection.charId = ch.id;
        grid.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      };
      grid.appendChild(card);
    }
  },

  buildCupSelect() {
    const grid = this.$('cup-grid');
    grid.innerHTML = '';
    for (const cup of CUPS) {
      const card = document.createElement('div');
      card.className = 'card';
      const names = cup.tracks.map(id => getTrack(id).name).join('・');
      card.innerHTML = `<div class="icon">${cup.icon}</div><div class="name">${cup.name}</div><div class="desc">${names}</div>`;
      card.onclick = () => {
        this.selection.cupId = cup.id;
        this.handlers.onStartGp(cup.id, this.selection.charId);
      };
      grid.appendChild(card);
    }
  },

  buildTrackSelect() {
    const grid = this.$('track-grid');
    grid.innerHTML = '';
    const isTT = this.selection.mode === 'tt';
    for (const tr of TRACKS) {
      const cup = CUPS.find(c => c.tracks.includes(tr.id));
      const card = document.createElement('div');
      card.className = 'card';
      const canvas = document.createElement('canvas');
      canvas.width = 140; canvas.height = 80;
      this._drawTrackPreview(canvas, tr);
      let desc = `${cup.icon} ${THEMES[tr.theme].voidFall ? '⚠️會掉落' : ''}`;
      if (isTT) {
        const best = localStorage.getItem('msq-tt-' + tr.id);
        desc = best ? `⏱️ ${formatTime(parseFloat(best))}` : '尚無紀錄';
      }
      card.appendChild(canvas);
      const info = document.createElement('div');
      info.innerHTML = `<div class="name">${tr.name}</div><div class="desc">${desc}</div>`;
      card.appendChild(info);
      card.onclick = () => {
        this.selection.trackId = tr.id;
        if (isTT) this.handlers.onStartTt(tr.id, this.selection.charId);
        else this.handlers.onStartSingle(tr.id, this.selection.charId);
      };
      grid.appendChild(card);
    }
  },

  _drawTrackPreview(canvas, trackDef) {
    const ctx = canvas.getContext('2d');
    const pts = trackDef.points;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
    }
    const pad = 10;
    const scale = Math.min((canvas.width - pad * 2) / (maxX - minX), (canvas.height - pad * 2) / (maxZ - minZ));
    const ox = (canvas.width - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (canvas.height - (maxZ - minZ) * scale) / 2 - minZ * scale;
    const P = i => {
      const p = pts[((i % pts.length) + pts.length) % pts.length];
      return [p[0] * scale + ox, p[1] * scale + oy];
    };
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    // 用中點平滑畫出閉合曲線
    const [mx, my] = [(P(0)[0] + P(1)[0]) / 2, (P(0)[1] + P(1)[1]) / 2];
    ctx.moveTo(mx, my);
    for (let i = 1; i <= pts.length; i++) {
      const [cx, cy] = P(i);
      const [nx, ny] = P(i + 1);
      ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    }
    ctx.closePath();
    ctx.stroke();
  },

  // ---------- HUD ----------
  setTrackMinimap(track) {
    this._mapTrack = track;
    this._mapStatic = track.minimapCanvas;
  },

  // 只有內容變了才動 DOM（避免每幀觸發重排）
  _setText(id, text) {
    if (!this._hudCache) this._hudCache = {};
    if (this._hudCache[id] === text) return;
    this._hudCache[id] = text;
    this.$(id).textContent = text;
  },

  _setHtml(id, html) {
    if (!this._hudCache) this._hudCache = {};
    if (this._hudCache[id] === html) return;
    this._hudCache[id] = html;
    this.$(id).innerHTML = html;
  },

  updateHud(player, karts, raceTime, dt) {
    const $ = this.$.bind(this);
    this._setText('hud-rank', '第' + player.rank + '名');
    this._setText('hud-lap', '圈 ' + Math.min(Math.max(player.lap, 1), player.track.laps) + '/' + player.track.laps);
    this._setText('hud-time', formatTime(raceTime));
    this._setText('hud-coins', '🪙 ×' + player.coins);
    this._setText('hud-speed', Math.round(Math.abs(player.speed) * 3.4) + ' km/h');

    if (player.itemRoll > 0) {
      this._itemRollTimer += dt;
      const keys = Object.keys(ITEM_INFO);
      this._setHtml('hud-item', ITEM_INFO[keys[Math.floor(this._itemRollTimer * 12) % keys.length]].icon);
    } else if (player.item) {
      const uses = player.itemUses > 1 ? `<span class="uses">×${player.itemUses}</span>` : '';
      this._setHtml('hud-item', ITEM_INFO[player.item].icon + uses);
    } else {
      this._setHtml('hud-item', '');
    }
    // 觸控道具鍵同步顯示目前道具
    this._setText('tb-item', player.item && player.itemRoll <= 0 ? ITEM_INFO[player.item].icon : '🎁');

    // 墨漬跟著模擬時間走（暫停凍結、恢復繼續）；inkTimer 歸零就淡掉
    if (this._inkShown !== (player.inkTimer > 0)) {
      this._inkShown = player.inkTimer > 0;
      this.$('ink-overlay').classList.toggle('show', this._inkShown);
    }

    // 加速速度線（噴射/火箭/星星時）
    const fast = player.boostTimer > 0 || player.bulletTimer > 0 || player.starTimer > 0;
    if (this._fastShown !== fast) {
      this._fastShown = fast;
      this.$('speedlines').classList.toggle('show', fast);
    }

    // 小地圖
    if (this._mapStatic) {
      const canvas = $('minimap');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(this._mapStatic, 0, 0);
      for (const kart of karts) {
        const [x, y] = this._mapTrack.mapTransform(kart.pos);
        ctx.beginPath();
        ctx.arc(x, y, kart.isPlayer ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = kart.isPlayer ? '#ffd54f' : '#' + kart.char.body.toString(16).padStart(6, '0');
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  },

  // 被墨魚噴到：畫面糊一片墨漬。只負責畫墨漬 blob，顯示/隱藏由 updateHud 依模擬時間 inkTimer 驅動
  // （不用牆鐘 setTimeout：暫停時凍結、退選單時 setRacing(false) 會清掉；音效由 items.js 播）
  showInk() {
    const overlay = this.$('ink-overlay');
    overlay.innerHTML = '';
    for (let k = 0; k < 7; k++) {
      const blob = document.createElement('div');
      blob.className = 'ink-blob';
      const size = 120 + Math.random() * 220;
      blob.style.width = blob.style.height = size + 'px';
      blob.style.left = Math.random() * 85 + '%';
      blob.style.top = Math.random() * 75 + '%';
      blob.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.5})`;
      overlay.appendChild(blob);
    }
    overlay.classList.add('show');
  },

  // 全螢幕閃白（雷暴閃電 / 閃電道具）
  flashScreen(intensity, color) {
    const el = this.$('flash-overlay');
    el.style.background = color || '#ffffff';
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(0.9, intensity));
    void el.offsetWidth; // 強制 reflow
    el.style.transition = 'opacity 0.4s ease-out';
    el.style.opacity = '0';
  },

  countdown(text) {
    const el = this.$('countdown');
    if (text === null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = text;
  },

  announce(text, dur) {
    const el = this.$('announce');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('show'), dur || 1800);
  },

  // ---------- 結算 ----------
  showResults({ title, rows, buttons }) {
    this.$('results-title').textContent = title;
    const table = this.$('results-table');
    const hasPoints = rows.some(r => r.points !== undefined);
    table.innerHTML = `<tr><th>名次</th><th>車手</th><th>時間</th>${hasPoints ? '<th>積分</th><th>總分</th>' : ''}</tr>` +
      rows.map(r =>
        `<tr class="${r.isPlayer ? 'player-row' : ''}"><td>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>` +
        `<td>${r.name}${r.isPlayer ? '（你）' : ''}</td><td>${r.time}</td>` +
        (hasPoints ? `<td>+${r.points}</td><td>${r.total}</td>` : '') + '</tr>'
      ).join('');
    const btnRow = this.$('results-buttons');
    btnRow.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.secondary ? ' secondary' : '');
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      btnRow.appendChild(btn);
    }
    this.show('screen-results');
  },

  showGpFinal(cup, rows, playerRank) {
    this.$('gp-trophy').textContent = playerRank === 1 ? '🏆' : playerRank === 2 ? '🥈' : playerRank === 3 ? '🥉' : '🏁';
    this.$('gp-final-title').textContent = cup.icon + ' ' + cup.name + ' 總排名';
    this.$('gp-final-table').innerHTML =
      '<tr><th>名次</th><th>車手</th><th>總分</th></tr>' +
      rows.map(r =>
        `<tr class="${r.isPlayer ? 'player-row' : ''}"><td>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>` +
        `<td>${r.name}${r.isPlayer ? '（你）' : ''}</td><td>${r.total}</td></tr>`
      ).join('');
    this.show('screen-gp-final');
  },

  // ---------- 觸控 ----------
  _initTouch() {
    const bind = (id, key) => {
      const el = this.$(id);
      const on = (e) => { e.preventDefault(); this.touchState[key] = true; el.classList.add('pressed'); };
      const off = (e) => { e.preventDefault(); this.touchState[key] = false; el.classList.remove('pressed'); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
    };
    bind('tb-drift', 'drift');
    bind('tb-item', 'item');
    this._initJoystick();
  },

  // 左手圓形搖桿：推上=前進、拉下=煞車、左右=類比轉向（heading 增加=左轉 → 推左 steer 為正）
  _initJoystick() {
    const base = this.$('joy-base');
    const knob = this.$('joy-knob');
    const st = this.touchState;
    let touchId = null; // 鎖定啟動搖桿的那根手指，右手按鍵不干擾

    const apply = (clientX, clientY) => {
      const rect = base.getBoundingClientRect();
      const maxR = rect.width / 2 - 12; // 蘑菇頭可推到的半徑
      let dx = clientX - (rect.left + rect.width / 2);
      let dy = clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > maxR) { dx *= maxR / len; dy *= maxR / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / maxR, ny = dy / maxR;
      // 轉向：10% 死區，推到 85% 即滿舵
      st.steer = Math.abs(nx) < 0.1 ? 0 : Math.max(-1, Math.min(1, -nx / 0.85));
      st.accel = ny < -0.22;  // 推上前進
      st.brake = ny > 0.5;    // 明顯拉下才煞車（斜推轉向不誤觸）
    };
    const reset = () => {
      touchId = null;
      base.classList.remove('active');
      knob.style.transform = '';
      st.steer = 0; st.accel = false; st.brake = false;
    };

    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      base.classList.add('active');
      apply(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (touchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) { e.preventDefault(); apply(t.clientX, t.clientY); }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      if (touchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) reset();
      }
    };
    window.addEventListener('touchend', touchEnd);
    window.addEventListener('touchcancel', touchEnd);

    // 滑鼠/觸控筆備援（桌機測試用）
    base.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || touchId !== null) return;
      touchId = 'mouse';
      base.classList.add('active');
      base.setPointerCapture(e.pointerId);
      apply(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (touchId === 'mouse') apply(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', () => { if (touchId === 'mouse') reset(); });
    base.addEventListener('pointercancel', () => { if (touchId === 'mouse') reset(); });
  },
};

function formatTime(sec) {
  if (!isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
