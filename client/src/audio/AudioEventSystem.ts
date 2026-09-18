/**
 * AudioEventSystem — synthetic Web Audio API sounds.
 * No audio files required. All sounds are generated with oscillators.
 */
export class AudioEventSystem {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private masterGain: GainNode | null = null;

  constructor() {
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (Ctx) {
        this.ctx = new Ctx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.15;
        this.masterGain.connect(this.ctx.destination);
      }
    } catch {
      // Silently handle environments without AudioContext
    }
  }

  // ── Core synth ─────────────────────────────────────────────────────────────

  private play(
    freq:      number,
    type:      OscillatorType = 'sine',
    duration:  number = 0.12,
    startVol:  number = 1.0,
    freqSweep?: number  // optional end frequency (sweep)
  ) {
    if (this.muted || !this.ctx || !this.masterGain) return;

    // Resume suspended context (required after user gesture)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const t   = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqSweep !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(freqSweep, t + duration);
    }

    env.gain.setValueAtTime(startVol, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(env);
    env.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playChord(freqs: number[], type: OscillatorType = 'sine', duration: number = 0.2) {
    freqs.forEach(f => this.play(f, type, duration));
  }

  // ── Public events ──────────────────────────────────────────────────────────

  /** Single pinch start click */
  public playPinchStart() {
    this.play(880, 'sine', 0.08, 0.9, 440);
  }

  /** Card selected (richer tone) */
  public playCardSelect() {
    this.play(660, 'triangle', 0.15, 0.7);
    setTimeout(() => this.play(880, 'sine', 0.10, 0.5), 80);
  }

  /** Grab gesture started */
  public playGrabStart() {
    this.play(200, 'sawtooth', 0.06, 0.4);
  }

  /** Calibration complete — ascending arpeggio */
  public playCalibrationComplete() {
    [0, 80, 160, 240].forEach((delay, i) => {
      setTimeout(() => this.play([440, 554, 659, 880][i], 'sine', 0.25, 0.5), delay);
    });
  }

  /** Tracking lost — descending sweep */
  public playTrackingLost() {
    this.play(400, 'sawtooth', 0.18, 0.3, 120);
  }

  /** Tracking restored — ascending ping */
  public playTrackingRestored() {
    this.play(300, 'sine', 0.10, 0.3, 600);
  }

  /** Swipe whoosh */
  public playSwipe() {
    this.play(180, 'sawtooth', 0.07, 0.2, 80);
  }

  /** Zoom expand/contract */
  public playZoom(expanding: boolean) {
    this.play(expanding ? 200 : 400, 'sine', 0.06, 0.15, expanding ? 400 : 150);
  }

  /** Generic UI hover ping */
  public playHover() {
    this.play(1200, 'sine', 0.06, 0.08);
  }

  // ── Mute control ───────────────────────────────────────────────────────────

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.15, this.ctx.currentTime);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }
}
