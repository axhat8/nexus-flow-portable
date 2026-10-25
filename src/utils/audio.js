/**
 * Latency-free synthesized Web Audio API sound alerts.
 * Uses native OscillatorNode and GainNode - zero disk I/O, zero network lag.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /**
   * Lazy-init AudioContext on first user gesture to comply with browser autoplay policies.
   */
  initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Silenced incoming order / match cue.
   * Strictly NO sound plays when a payout is received.
   */
  cueForMatch() {
    // Intentionally no-op: Zero sound on payout received.
  }

  /**
   * Crisp harmonic chime, 220ms duration for successful order claim/payout accepted.
   * Plays ONLY when payout is accepted.
   */
  cueForClaimed() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Arpeggiated crystal chord: C6 (1046.5Hz) -> E6 (1318.5Hz) -> G6 (1567.98Hz)
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.setValueAtTime(1318.51, now + 0.06);
      osc.frequency.setValueAtTime(1567.98, now + 0.12);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // AudioContext safeguard
    }
  }

  /**
   * Helper to manually test the Payout Accepted sound alert
   */
  testClaimSound() {
    const prev = this.enabled;
    this.enabled = true;
    this.cueForClaimed();
    this.enabled = prev;
  }

  /**
   * Silenced error cue - disabled to prevent annoying clicking sounds during faults or errors.
   */
  cueForError() {
    // Intentionally no-op to eliminate clicking audio noise.
  }
}

export const audio = new SoundEngine();
