// ============================================================
// 音效：WebAudio 合成（音效 + 引擎聲 + 簡單 BGM），可靜音
// ============================================================

const AudioSys = {
  ctx: null,
  master: null,
  engineOsc: null,
  engineGain: null,
  bgmTimer: null,
  bgmStep: 0,
  muted: localStorage.getItem('msq-muted') === '1',

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
  },

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('msq-muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  },

  _beep(freq, dur, type, vol, endFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(vol || 0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'coin': this._beep(988, 0.08, 'square', 0.12); setTimeout(() => this._beep(1319, 0.22, 'square', 0.12), 70); break;
      case 'box': this._beep(660, 0.1, 'triangle', 0.2, 990); break;
      case 'item': this._beep(880, 0.12, 'square', 0.15, 1175); break;
      case 'boost': this._beep(220, 0.45, 'sawtooth', 0.22, 880); break;
      case 'hop': this._beep(330, 0.1, 'square', 0.1, 494); break;
      case 'spin': this._beep(440, 0.4, 'sawtooth', 0.25, 110); break;
      case 'shell': this._beep(520, 0.15, 'square', 0.15, 260); break;
      case 'bump': this._beep(150, 0.08, 'sawtooth', 0.12); break;
      case 'fall': this._beep(660, 0.6, 'sine', 0.2, 82); break;
      case 'lap': this._beep(784, 0.12, 'square', 0.15); setTimeout(() => this._beep(1047, 0.25, 'square', 0.15), 120); break;
      case 'star':
        [660, 784, 988, 1319].forEach((f, i) => setTimeout(() => this._beep(f, 0.12, 'square', 0.14), i * 90));
        break;
      case 'lightning': this._beep(1600, 0.5, 'sawtooth', 0.2, 100); break;
      case 'bomb': this._beep(70, 0.6, 'sawtooth', 0.3, 30); this._beep(200, 0.3, 'square', 0.2, 50); break;
      case 'bomb-throw': this._beep(300, 0.2, 'triangle', 0.15, 150); break;
      case 'ink': this._beep(220, 0.35, 'sine', 0.2, 70); break;
      case 'bullet': this._beep(110, 0.9, 'sawtooth', 0.22, 620); break;
      case 'count': this._beep(440, 0.25, 'square', 0.2); break;
      case 'go': this._beep(880, 0.5, 'square', 0.25); break;
      case 'finish':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => this._beep(f, 0.18, 'square', 0.16), i * 140));
        break;
      case 'lose':
        [392, 370, 349, 330].forEach((f, i) => setTimeout(() => this._beep(f, 0.3, 'triangle', 0.16), i * 250));
        break;
    }
  },

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  },

  setEngine(speed01) {
    if (!this.engineGain) return;
    this.engineOsc.frequency.value = 42 + speed01 * 110;
    this.engineGain.gain.value = 0.028 + speed01 * 0.035;
  },

  stopEngine() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch (e) { }
      this.engineOsc = null;
      this.engineGain = null;
    }
  },

  // 簡單的循環 BGM（五聲音階小旋律 + 低音）
  startBgm(night) {
    this.stopBgm();
    if (!this.ctx) return;
    const lead = night
      ? [392, 0, 466, 392, 349, 0, 311, 349, 392, 0, 466, 523, 466, 349, 311, 0]
      : [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 784, 659, 587, 523];
    const bass = night
      ? [98, 98, 117, 117, 87, 87, 98, 98]
      : [131, 131, 147, 147, 165, 165, 147, 147];
    const stepDur = night ? 0.24 : 0.18;
    this.bgmStep = 0;
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const i = this.bgmStep;
      const f = lead[i % lead.length];
      if (f) this._beep(f, stepDur * 0.9, 'triangle', 0.05);
      if (i % 2 === 0) this._beep(bass[(i / 2) % bass.length], stepDur * 1.6, 'sine', 0.06);
      this.bgmStep++;
    }, stepDur * 1000);
  },

  stopBgm() {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
  },
};
