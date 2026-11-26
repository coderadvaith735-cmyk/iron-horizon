import { WeaponId } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientNodes: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private volume = 0.7;
  private isAmbientRunning = false;

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.65, this.ctx.currentTime, 0.03);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume * 0.65;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 2.0);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public unlock() {
    this.ensureContext();
  }

  public startAmbient() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer || this.isAmbientRunning) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;

    const gain = ctx.createGain();
    gain.gain.value = 0.08;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start();

    this.ambientNodes = { source: src, gain };
    this.isAmbientRunning = true;
  }

  public stopAmbient() {
    if (this.ambientNodes) {
      try {
        this.ambientNodes.source.stop();
      } catch {
        // ignore
      }
      this.ambientNodes = null;
    }
    this.isAmbientRunning = false;
  }

  public playGunshot(weapon: WeaponId, distanceAttenuation = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const atten = Math.max(0.06, Math.min(1.0, distanceAttenuation));

    // Noise burst for propellant blast
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';

    const noiseGain = ctx.createGain();

    // Low-end punch oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    if (weapon === 'sniper') {
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.36);
      filter.Q.value = 0.9;
      noiseGain.gain.setValueAtTime(0.9 * atten, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.24);
      oscGain.gain.setValueAtTime(0.75 * atten, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    } else if (weapon === 'shotgun') {
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.3);
      filter.Q.value = 0.7;
      noiseGain.gain.setValueAtTime(1.0 * atten, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);
      oscGain.gain.setValueAtTime(0.8 * atten, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    } else if (weapon === 'assault') {
      filter.frequency.setValueAtTime(2100, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.14);
      filter.Q.value = 1.1;
      noiseGain.gain.setValueAtTime(0.65 * atten, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.09);
      oscGain.gain.setValueAtTime(0.45 * atten, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    } else if (weapon === 'smg') {
      filter.frequency.setValueAtTime(2600, now);
      filter.frequency.exponentialRampToValueAtTime(500, now + 0.09);
      filter.Q.value = 1.2;
      noiseGain.gain.setValueAtTime(0.45 * atten, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(230, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.06);
      oscGain.gain.setValueAtTime(0.32 * atten, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else {
      // pistol
      filter.frequency.setValueAtTime(2400, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.12);
      filter.Q.value = 1.0;
      noiseGain.gain.setValueAtTime(0.55 * atten, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      oscGain.gain.setValueAtTime(0.42 * atten, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    }

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + 0.45);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playEmptyClick() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playReload(durationSeconds: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const triggerClick = (offset: number, freqStart: number, freqEnd: number, vol: number) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqStart, t);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t + 0.06);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.08);
    };

    // Mag release -> insert -> bolt rack
    triggerClick(0.08, 420, 180, 0.22);
    triggerClick(durationSeconds * 0.52, 260, 520, 0.25);
    triggerClick(durationSeconds * 0.85, 680, 320, 0.28);
  }

  public playFootstep(sprinting: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = sprinting ? 650 : 480;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(sprinting ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now, Math.random() * 0.5, 0.1);
  }

  public playHitMarker(headshot: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = headshot ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(headshot ? 1680 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 2300 : 620, now + 0.06);
    gain.gain.setValueAtTime(headshot ? 0.34 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playPlayerHurt() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.15);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playExplosion(distanceAttenuation = 1.0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const atten = Math.max(0.1, Math.min(1.0, distanceAttenuation));

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 1.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.1 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.65);
    subGain.gain.setValueAtTime(0.85 * atten, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    sub.connect(subGain);
    subGain.connect(this.masterGain);

    src.start(now);
    src.stop(now + 1.3);
    sub.start(now);
    sub.stop(now + 0.75);
  }

  public playPickup() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.06);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playWaveHorn() {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.25);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.8);
  }
}

export const soundEngine = new SoundEngine();
