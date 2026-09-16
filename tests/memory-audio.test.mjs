import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAudio, CUE_COOLDOWN } from '../app/memory-audio.ts';

class Param {
  value = 0;
  events = [];
  setValueAtTime(...args) { this.events.push(['set', ...args]); }
  exponentialRampToValueAtTime(...args) { this.events.push(['ramp', ...args]); }
  linearRampToValueAtTime(...args) { this.events.push(['linear', ...args]); }
  setTargetAtTime(...args) { this.events.push(['target', ...args]); }
  cancelScheduledValues(...args) { this.events.push(['cancel', ...args]); }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  connect() { return this; }
  disconnect() { this.disconnected = true; }
  start(at) { this.startedAt = at; }
  stop(at) { this.stoppedAt = at ?? 0; }
}
class Context {
  currentTime = 1; sampleRate = 48000; state = 'running'; destination = new Node();
  oscillators = []; gains = []; buffers = [];
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createOscillator() { const n = new Node(); this.oscillators.push(n); return n; }
  createBufferSource() { const n = new Node(); this.buffers.push(n); return n; }
  createBiquadFilter() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createMediaElementSource() { return new Node(); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}
function setup(t) {
  const media = [];
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Offline fallback'); });
  const oldAudio = globalThis.Audio;
  globalThis.Audio = class {
    paused = true;
    constructor() { media.push(this); }
    async play() { this.paused = false; }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  };
  const context = new Context();
  const mixer = new MemoryAudio(context, 'https://example.test/memory-drift-game/');
  t.after(() => { mixer.dispose(); globalThis.Audio = oldAudio; });
  return { context, mixer, media };
}

test('collect rises as a two-note motif; collision falls with noise even offline', t => {
  const { context, mixer } = setup(t);
  mixer.play('collect');
  assert.equal(context.oscillators.length, 2);
  assert.ok(context.oscillators[1].frequency.events[0][1] > context.oscillators[0].frequency.events[0][1]);
  assert.ok(context.oscillators[1].startedAt > context.oscillators[0].startedAt);
  mixer.play('collision');
  assert.ok(context.oscillators[2].frequency.events[0][1] > context.oscillators[2].frequency.events[1][1]);
  assert.equal(context.buffers.length, 1);
  const musicTargets = context.gains[2].gain.events.filter(e => e[0] === 'target');
  assert.ok(musicTargets[0][1] < musicTargets[1][1]);
});

test('all semantic cues schedule finite short sounds and release nodes', t => {
  const { context, mixer } = setup(t);
  for (const cue of Object.keys(CUE_COOLDOWN)) {
    context.currentTime += 2;
    const before = context.oscillators.length;
    mixer.play(cue);
    assert.ok(context.oscillators.length > before, cue);
    for (const node of [...context.oscillators, ...context.buffers]) {
      assert.ok(Number.isFinite(node.stoppedAt));
      node.onended?.();
      assert.equal(node.disconnected, true);
    }
  }
});

test('rapid repeats are limited; other event types remain distinct', t => {
  const { context, mixer } = setup(t);
  mixer.play('collect'); mixer.play('collect');
  assert.equal(context.oscillators.length, 2);
  mixer.play('bubble');
  assert.equal(context.oscillators.length, 4);
  context.currentTime += .1;
  mixer.play('collect');
  assert.equal(context.oscillators.length, 6);
});

test('mute, hidden state and disposal stop sources, with no delayed replay', async t => {
  const { context, mixer, media } = setup(t);
  mixer.play('collect'); mixer.setEnabled(false);
  assert.ok(context.oscillators.every(n => n.disconnected));
  assert.equal(media[0].paused, true);
  mixer.play('collision'); assert.equal(context.oscillators.length, 2);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  mixer.setEnabled(true); mixer.play('protect');
  assert.equal(context.oscillators.length, 5);
  mixer.setActive(false); mixer.play('bubble');
  assert.equal(context.oscillators.length, 5);
  assert.equal(media[0].paused, true);
  mixer.setActive(true); mixer.play('block');
  assert.equal(context.oscillators.length, 7);
  mixer.dispose(); mixer.play('collect');
  assert.equal(context.state, 'closed');
  assert.equal(context.oscillators.length, 7);
});
