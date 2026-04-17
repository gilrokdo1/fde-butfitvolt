/** WebAudio 오실레이터/노이즈 기반 효과음 관리자. */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this._ready = false;
  }

  /** 사용자 제스처 이후 호출해야 함 (브라우저 오토플레이 정책) */
  ensureReady() {
    if (this._ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.ctx.resume?.();
    this._ready = true;
  }

  _tone({ type = 'square', freqStart, freqEnd, durMs, gain = 0.1 }) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g);
    g.connect(this.ctx.destination);
    o.type = type;
    const now = this.ctx.currentTime;
    const dur = durMs / 1000;
    o.frequency.setValueAtTime(freqStart, now);
    if (freqEnd != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(0.01, freqEnd), now + dur);
    }
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start();
    o.stop(now + dur);
  }

  playShoot() {
    this._tone({ type: 'square', freqStart: 800, freqEnd: 100, durMs: 100, gain: 0.1 });
  }

  playRocket() {
    this._tone({ type: 'sawtooth', freqStart: 200, freqEnd: 50, durMs: 300, gain: 0.15 });
  }

  playHeal() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g);
    g.connect(this.ctx.destination);
    o.type = 'sine';
    const now = this.ctx.currentTime;
    o.frequency.setValueAtTime(400, now);
    o.frequency.linearRampToValueAtTime(800, now + 0.3);
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    o.start();
    o.stop(now + 0.4);
  }

  playHit() {
    this._tone({ type: 'triangle', freqStart: 1200, freqEnd: 1200, durMs: 80, gain: 0.08 });
  }

  playEnemyShoot() {
    this._tone({ type: 'sawtooth', freqStart: 300, freqEnd: 300, durMs: 100, gain: 0.05 });
  }

  playExplosion() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.3;
    source.connect(g);
    g.connect(this.ctx.destination);
    source.start();
  }
}
