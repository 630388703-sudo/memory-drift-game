export class CreatureAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private ambienceTimer = 0;

  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.24;
      this.master.connect(this.context.destination);
      this.scheduleAmbience();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.24, this.context.currentTime, 0.04);
  }
  isMuted() { return this.muted; }

  private tone(frequency: number, duration = 0.12, volume = 0.1, type: OscillatorType = "sine", when = 0) {
    if (!this.context || !this.master || this.muted) return;
    const start = this.context.currentTime + when;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master); osc.start(start); osc.stop(start + duration + 0.03);
  }

  private scheduleAmbience() {
    window.clearInterval(this.ambienceTimer);
    let tick = 0;
    const notes = [196, 247, 294, 330, 294, 247];
    this.ambienceTimer = window.setInterval(() => {
      if (!this.muted && document.visibilityState === "visible") {
        this.tone(notes[tick % notes.length], 0.7, 0.025, "sine");
        if (tick % 3 === 0) this.tone(notes[(tick + 2) % notes.length] / 2, 1.05, 0.015, "triangle", 0.08);
      }
      tick += 1;
    }, 1250);
  }

  pop(pitch = 620) { this.tone(pitch, 0.11, 0.13, "sine"); this.tone(pitch * 1.45, 0.08, 0.07, "triangle", 0.045); }
  click() { this.tone(920, 0.045, 0.055, "triangle"); }
  correct() { [440, 554, 659].forEach((n, i) => this.tone(n, 0.18, 0.1, "sine", i * 0.07)); }
  wrong() { this.tone(190, 0.14, 0.09, "square"); this.tone(164, 0.18, 0.06, "triangle", 0.09); }
  jump() { this.tone(300, 0.16, 0.075, "triangle"); }
  land() { this.tone(120, 0.07, 0.07, "sine"); }
  transform() { [260, 340, 460, 610].forEach((n, i) => this.tone(n, 0.24, 0.07, "sine", i * 0.055)); }

  playSequence(notes: readonly number[], wrongIndex = -1, variant: "original" | "copy" = "original") {
    notes.forEach((note, index) => {
      const wrong = variant === "copy" && index === wrongIndex;
      const frequency = wrong ? note * 1.22 : note;
      this.tone(frequency, wrong ? 0.24 : 0.16, wrong ? 0.12 : 0.085, wrong ? "triangle" : "sine", index * 0.24);
    });
  }

  destroy() {
    window.clearInterval(this.ambienceTimer);
    void this.context?.close(); this.context = null; this.master = null;
  }
}
