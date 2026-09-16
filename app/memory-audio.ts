export type MemoryCue = "collect" | "overwrite" | "collision" | "bubble" | "protect" | "block" | "warning" | "confirm" | "transition" | "wake" | "ready" | "finish";

export const CUE_COOLDOWN: Record<MemoryCue, number> = {
  collect: .075, overwrite: .075, collision: .22, bubble: .14,
  protect: .2, block: .12, warning: .2, confirm: .06,
  transition: .3, wake: .4, ready: .3, finish: .5,
};
const db = (value: number) => 10 ** (value / 20);

/** One shared mix: music / effects -> master compressor -> output.
 * Cue identity comes from rhythm and timbre, not just volume or combo pitch.
 * All generated cues are original synthesis; the existing credited impact is retained.
 */
export class MemoryAudio {
  private context: AudioContext;
  private master: GainNode;
  private effects: GainNode;
  private music: GainNode;
  private toneFilter: BiquadFilterNode;
  private ambience: HTMLAudioElement;
  private impact: AudioBuffer | null = null;
  private noise: AudioBuffer;
  private abort = new AbortController();
  private sources = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private lastCue = new Map<MemoryCue, number>();
  private enabled = true;
  private active = true;
  private disposed = false;
  private musicLevel = db(-19);
  private musicPlaybackPending = false;

  constructor(context: AudioContext, baseURL: string) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = db(-4);
    this.effects = context.createGain();
    this.effects.gain.value = db(-3);
    this.music = context.createGain();
    this.music.gain.value = this.musicLevel;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -9;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = .003;
    compressor.release.value = .18;
    this.effects.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(context.destination);

    this.ambience = new Audio(new URL("audio/nostalgic-memories.mp3", baseURL).href);
    this.ambience.loop = true;
    this.ambience.preload = "auto";
    this.toneFilter = context.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 14000;
    context.createMediaElementSource(this.ambience).connect(this.toneFilter);
    this.toneFilter.connect(this.music);
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .25), context.sampleRate);
    const noiseData = this.noise.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    // Loading never delays visual feedback: a synthesized impact is always available.
    void fetch(new URL("audio/impact-thud.mp3", baseURL), { signal: this.abort.signal })
      .then(response => { if (!response.ok) throw new Error("Impact unavailable"); return response.arrayBuffer(); })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { if (!this.disposed) this.impact = buffer; })
      .catch(() => undefined);
  }

  unlock() {
    if (this.disposed || !this.enabled || !this.active) return;
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    if (this.ambience.paused && !this.musicPlaybackPending) {
      this.musicPlaybackPending = true;
      void this.ambience.play().then(() => {
        if (!this.enabled || !this.active || this.disposed) this.ambience.pause();
      }).catch(() => undefined).finally(() => { this.musicPlaybackPending = false; });
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(enabled ? db(-4) : 0, this.context.currentTime, .012);
    if (!enabled) { this.stopEffects(); this.ambience.pause(); }
    else this.unlock();
  }

  setActive(active: boolean) {
    this.active = active;
    if (active) this.unlock();
    else { this.stopEffects(); this.ambience.pause(); }
  }

  setScene(version: "A" | "B" | "C", paused: boolean) {
    const now = this.context.currentTime;
    this.musicLevel = db(paused ? -27 : -19);
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(this.musicLevel, now, .2);
    this.toneFilter.frequency.setTargetAtTime(version === "B" ? 1600 : version === "C" ? 5200 : 14000, now, .35);
  }

  private stopEffects() {
    for (const [source, nodes] of this.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect(); nodes.forEach(node => node.disconnect());
    }
    this.sources.clear();
    this.lastCue.clear();
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], at: number, duration: number) {
    this.sources.set(source, nodes);
    source.onended = () => {
      source.disconnect(); nodes.forEach(node => node.disconnect()); this.sources.delete(source);
    };
    source.start(at);
    source.stop(at + duration + .015);
  }

  private tone(frequency: number, end: number, delay: number, duration: number, level: number, type: OscillatorType = "sine") {
    const at = this.context.currentTime + delay;
    const source = this.context.createOscillator();
    const gain = this.context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(db(level), at + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(gain); gain.connect(this.effects);
    this.track(source, [gain], at, duration);
  }

  private burst(duration: number, level: number, frequency: number) {
    const at = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = .8;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(db(level), at + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.effects);
    this.track(source, [filter, gain], at, duration);
  }

  private duck(depth: number, duration: number) {
    const now = this.context.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(this.musicLevel * db(depth), now, .015);
    this.music.gain.setTargetAtTime(this.musicLevel, now + duration, .18);
  }

  play(cue: MemoryCue) {
    if (this.disposed || !this.enabled || !this.active) return;
    const now = this.context.currentTime;
    if (now - (this.lastCue.get(cue) ?? -Infinity) < CUE_COOLDOWN[cue]) return;
    // Bound polyphony during rapid pickups; hard impacts keep priority.
    if (this.sources.size >= 24 && cue !== "collision") return;
    if (this.sources.size >= 24) this.stopEffects();
    this.lastCue.set(cue, now);
    this.unlock();
    const variation = 1 + (Math.random() - .5) * .04;
    switch (cue) {
      case "collect":
      case "overwrite":
        this.tone(740 * variation, 740 * variation, 0, .12, -18, "triangle");
        this.tone(1110 * variation, 1110 * variation, .075, .23, -20);
        if (cue === "overwrite") this.burst(.045, -26, 1800);
        break;
      case "collision": {
        this.duck(-12, .3);
        this.tone(165, 48, 0, .34, -9, "triangle");
        this.tone(320, 80, .045, .19, -20, "sawtooth");
        this.burst(.13, -11, 1800);
        if (this.impact) {
          const source = this.context.createBufferSource();
          const gain = this.context.createGain();
          source.buffer = this.impact; source.playbackRate.value = variation;
          const duration = Math.min(.8, this.impact.duration / variation);
          gain.gain.setValueAtTime(db(-11), now);
          gain.gain.setTargetAtTime(.0001, now + duration * .65, .045);
          source.connect(gain); gain.connect(this.effects);
          this.track(source, [gain], now, duration);
        }
        break;
      }
      case "bubble":
        this.duck(-5, .16);
        this.tone(680, 115, 0, .21, -14);
        this.tone(430, 170, .09, .19, -21);
        this.burst(.07, -24, 950);
        break;
      case "protect":
        this.burst(.04, -23, 2800);
        this.tone(440, 440, 0, .16, -21, "triangle");
        this.tone(660, 660, .09, .28, -21);
        this.tone(880, 880, .16, .32, -23);
        break;
      case "block":
        this.tone(1200, 480, 0, .11, -18, "triangle");
        this.tone(600, 900, .07, .22, -22);
        break;
      case "warning":
        this.tone(220, 190, 0, .1, -25, "triangle"); break;
      case "confirm":
        this.tone(580, 650, 0, .075, -26, "triangle"); break;
      case "transition":
        this.duck(-7, .25);
        this.tone(360, 160, 0, .22, -22, "triangle");
        this.burst(.16, -27, 2200);
        this.tone(520, 780, .23, .38, -24); break;
      case "wake":
        this.tone(130, 310, 0, .55, -24, "triangle"); break;
      case "ready":
        this.tone(520, 520, 0, .18, -24);
        this.tone(780, 780, .14, .3, -26); break;
      case "finish":
        [660, 550, 440].forEach((frequency, index) => this.tone(frequency, frequency, index * .16, .48, -25)); break;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.stopEffects();
    this.ambience.pause();
    this.ambience.removeAttribute("src");
    this.ambience.load();
    void this.context.close().catch(() => undefined);
  }
}
