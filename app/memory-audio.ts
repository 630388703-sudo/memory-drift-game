export type MemoryCue = "collect" | "overwrite" | "collision" | "bubble" | "protect" | "block" | "warning" | "confirm" | "transition" | "wake" | "ready" | "finish";

export const CUE_COOLDOWN: Record<MemoryCue, number> = {
  collect: .075, overwrite: .075, collision: .22, bubble: .14,
  protect: .2, block: .12, warning: .2, confirm: .06,
  transition: .3, wake: .4, ready: .3, finish: .5,
};
const db = (value: number) => 10 ** (value / 20);
const CUE_VOICES: Record<MemoryCue, number> = {
  collect: 2, overwrite: 4, collision: 5, bubble: 4,
  protect: 4, block: 2, warning: 1, confirm: 1,
  transition: 3, wake: 1, ready: 2, finish: 3,
};
type DuckEnvelope = {
  start: number; from: number; depth: number;
  attackEnd: number; holdUntil: number; releaseUntil: number;
};

/** One shared mix: music / effects -> master compressor -> output.
 * Cue identity comes from rhythm and timbre, not just volume or combo pitch.
 * Short CC0 metal/static samples sit under the synthesized action signatures.
 */
export class MemoryAudio {
  private context: AudioContext;
  private master: GainNode;
  private effects: GainNode;
  private music: GainNode;
  private musicDuck: GainNode;
  private musicGate: GainNode;
  private duckEnvelope: DuckEnvelope | null = null;
  private toneFilter: BiquadFilterNode;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private unlocked = false;
  private impacts: (AudioBuffer | null)[] = [null, null];
  private nextImpact = 0;
  private memoryStatic: AudioBuffer | null = null;
  private noise: AudioBuffer;
  private abort = new AbortController();
  private sources = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private lastCue = new Map<MemoryCue, number>();
  private enabled = true;
  private active = true;
  private disposed = false;
  // The prepared loop measures -18.3 LUFS. Keep it present, below action cues.
  private musicLevel = db(-12);

  constructor(context: AudioContext, baseURL: string) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = db(-4);
    this.effects = context.createGain();
    this.effects.gain.value = db(-3);
    this.music = context.createGain();
    this.music.gain.value = this.musicLevel;
    // Keep impact ducking separate from scene volume and tone changes.
    this.musicDuck = context.createGain();
    this.musicDuck.gain.value = 1;
    this.musicGate = context.createGain();
    this.musicGate.gain.value = 1;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -9;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = .003;
    compressor.release.value = .18;
    this.effects.connect(this.master);
    this.music.connect(this.musicDuck);
    this.musicDuck.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(context.destination);

    this.toneFilter = context.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 9500;
    this.toneFilter.connect(this.musicGate);
    this.musicGate.connect(this.music);
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .25), context.sampleRate);
    const noiseData = this.noise.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    // Each sample loads independently; offline/slow loading keeps immediate synth feedback.
    const loadSample = (file: string, accept: (buffer: AudioBuffer) => void) => {
      void fetch(new URL(`audio/${file}`, baseURL), { signal: this.abort.signal })
        .then(response => { if (!response.ok) throw new Error("Sample unavailable"); return response.arrayBuffer(); })
        .then(data => context.decodeAudioData(data))
        .then(buffer => { if (!this.disposed) accept(buffer); })
        .catch(() => undefined);
    };
    // A decoded 33-second loop avoids the HTMLAudio restart gap at each wrap.
    loadSample("pynchon-loop.mp3", buffer => { this.musicBuffer = buffer; this.startMusic(); });
    loadSample("metal-hit-a.mp3", buffer => { this.impacts[0] = buffer; });
    loadSample("metal-hit-b.mp3", buffer => { this.impacts[1] = buffer; });
    loadSample("memory-static.mp3", buffer => { this.memoryStatic = buffer; });
  }

  unlock() {
    if (this.disposed || !this.enabled || !this.active) return;
    this.unlocked = true;
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    this.startMusic();
  }

  private startMusic() {
    if (!this.musicBuffer || this.musicSource || !this.unlocked || !this.active || !this.enabled || this.disposed) return;
    const source = this.context.createBufferSource();
    source.buffer = this.musicBuffer;
    source.loop = true;
    source.connect(this.toneFilter);
    this.musicStartedAt = this.context.currentTime;
    source.start(this.musicStartedAt, this.musicOffset);
    this.musicSource = source;
  }

  private stopMusic() {
    if (!this.musicSource || !this.musicBuffer) return;
    this.musicOffset = (this.musicOffset + Math.max(0, this.context.currentTime - this.musicStartedAt)) % this.musicBuffer.duration;
    this.musicSource.stop();
    this.musicSource.disconnect();
    this.musicSource = null;
  }

  setEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(enabled ? db(-4) : 0, this.context.currentTime, .012);
    if (!enabled) { this.stopEffects(); this.resetDuck(); this.stopMusic(); }
    else this.unlock();
  }

  setActive(active: boolean) {
    if (this.disposed) return;
    this.active = active;
    if (active) this.unlock();
    else { this.stopEffects(); this.resetDuck(); this.stopMusic(); }
  }

  setScene(version: "A" | "B" | "C", paused: boolean) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    this.musicLevel = db(paused ? -22 : -12);
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(this.musicLevel, now, .2);
    this.toneFilter.frequency.setTargetAtTime(version === "B" ? 2600 : version === "C" ? 6500 : 9500, now, .35);
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

  private sample(buffer: AudioBuffer | null, level: number, duration: number, rate = 1, delay = 0) {
    if (!buffer) return;
    const at = this.context.currentTime + delay;
    duration = Math.min(duration, buffer.duration / rate);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(db(level), at + Math.min(.003, duration / 2));
    gain.gain.setValueAtTime(db(level), at + Math.min(.025, duration / 2));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(gain); gain.connect(this.effects);
    this.track(source, [gain], at, duration);
  }

  private breakSignal() {
    // A pair of missing instants, not a horror sting or a persistent noisy layer.
    // Separate from impact ducking so a memory cue cannot erase a stronger hit.
    const now = this.context.currentTime;
    const gate = this.musicGate.gain;
    gate.cancelScheduledValues(now);
    gate.setTargetAtTime(.16, now, .004);
    gate.setTargetAtTime(1, now + .035, .006);
    gate.setTargetAtTime(.08, now + .080, .004);
    gate.setTargetAtTime(1, now + .115, .018);
  }

  private duckDepthAt(now: number) {
    const envelope = this.duckEnvelope;
    if (!envelope || now >= envelope.releaseUntil) return 0;
    if (now < envelope.attackEnd) {
      const progress = Math.max(0, (now - envelope.start) / (envelope.attackEnd - envelope.start));
      return envelope.from + (envelope.depth - envelope.from) * progress;
    }
    if (now <= envelope.holdUntil) return envelope.depth;
    return envelope.depth * (1 - (now - envelope.holdUntil) / (envelope.releaseUntil - envelope.holdUntil));
  }

  private resetDuck() {
    const now = this.context.currentTime;
    this.duckEnvelope = null;
    this.musicDuck.gain.cancelScheduledValues(now);
    this.musicDuck.gain.setValueAtTime(1, now);
    this.musicGate.gain.cancelScheduledValues(now);
    this.musicGate.gain.setValueAtTime(1, now);
  }

  private duck(depth: number, duration: number) {
    const now = this.context.currentTime;
    const from = this.duckDepthAt(now);
    const heldDepth = this.duckEnvelope && now < this.duckEnvelope.holdUntil ? this.duckEnvelope.depth : 0;
    // A bubble arriving just after a hard hit must not lift its stronger duck.
    depth = Math.min(depth, from, heldDepth);
    const holdUntil = Math.max(now + duration, this.duckEnvelope?.holdUntil ?? now);
    this.duckEnvelope = { start: now, from, depth, attackEnd: now + .008, holdUntil, releaseUntil: holdUntil + .42 };
    const gain = this.musicDuck.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(db(from), now);
    gain.exponentialRampToValueAtTime(db(depth), now + .008);
    gain.setValueAtTime(db(depth), holdUntil);
    gain.exponentialRampToValueAtTime(1, holdUntil + .42);
  }

  play(cue: MemoryCue) {
    if (this.disposed || !this.enabled || !this.active) return;
    const now = this.context.currentTime;
    if (now - (this.lastCue.get(cue) ?? -Infinity) < CUE_COOLDOWN[cue]) return;
    // Bound polyphony during rapid pickups; hard impacts keep priority.
    if (this.sources.size + CUE_VOICES[cue] > 24 && cue !== "collision") return;
    if (this.sources.size + CUE_VOICES[cue] > 24) this.stopEffects();
    this.lastCue.set(cue, now);
    this.unlock();
    const variation = 1 + (Math.random() - .5) * .04;
    switch (cue) {
      case "collect":
      case "overwrite":
        this.tone(740 * variation, 740 * variation, 0, .12, -18, "triangle");
        this.tone(1110 * variation, 1110 * variation, .075, .23, -20);
        if (cue === "overwrite") {
          this.burst(.045, -26, 1800);
          this.sample(this.memoryStatic, -24, .13, 1.1);
        }
        break;
      case "collision": {
        this.duck(-14, .23);
        // Dry, low knock + a brief bright crack, unlike the rising pickup chime.
        this.tone(182 * variation, 52 * variation, 0, .21, -7, "triangle");
        this.tone(88 * variation, 43 * variation, .009, .18, -15);
        this.burst(.032, -11, 3300 * variation);
        this.burst(.10, -17, 920 * variation);
        const impact = this.impacts[this.nextImpact++ % 2] ?? this.impacts.find(Boolean) ?? null;
        this.sample(impact, -7, .28, variation);
        break;
      }
      case "bubble":
        this.duck(-6, .12);
        this.breakSignal();
        this.tone(880 * variation, 260 * variation, 0, .055, -18, "square");
        this.tone(370 * variation, 195 * variation, .08, .08, -23, "triangle");
        this.burst(.045, -22, 2400);
        this.sample(this.memoryStatic, -16, .24, variation, .025);
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
        this.breakSignal();
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
    this.resetDuck();
    this.stopMusic();
    this.musicBuffer = null;
    void this.context.close().catch(() => undefined);
  }
}
