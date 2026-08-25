export class MemoryAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private rain: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private muted = false;
  private stepTimer = 0;

  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.context.destination);
      this.startRain();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.context.currentTime, 0.03);
    }
  }

  isMuted() {
    return this.muted;
  }

  private startRain() {
    if (!this.context || !this.master || this.rain) return;
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, sampleRate * 3, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 1.7;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 1300;
    gain.gain.value = 0.13;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.rain = source;
    this.rainGain = gain;
  }

  tone(frequency = 620, duration = 0.12, volume = 0.12) {
    if (!this.context || !this.master || this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.03);
  }

  clock() {
    this.tone(1280, 0.045, 0.06);
  }

  collect(index: number) {
    this.tone(520 + index * 95, 0.36, 0.16);
    window.setTimeout(() => this.tone(780 + index * 70, 0.28, 0.11), 90);
  }

  footsteps(groups = 1) {
    if (!this.context || !this.master || this.muted) return;
    const now = performance.now();
    if (now - this.stepTimer < 230) return;
    this.stepTimer = now;
    this.tone(82, 0.08, 0.08);
    if (groups === 2) window.setTimeout(() => this.tone(96, 0.07, 0.055), 95);
  }

  speakWait() {
    if (this.muted) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("等我一下");
      utterance.lang = "zh-CN";
      utterance.rate = 0.76;
      utterance.pitch = 0.84;
      utterance.volume = 0.55;
      window.speechSynthesis.speak(utterance);
    } else {
      this.tone(420, 0.42, 0.08);
    }
  }

  setRainLevel(level: number) {
    if (!this.rainGain || !this.context) return;
    this.rainGain.gain.setTargetAtTime(level, this.context.currentTime, 0.4);
  }

  destroy() {
    window.speechSynthesis?.cancel();
    this.rain?.stop();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.rain = null;
  }
}
