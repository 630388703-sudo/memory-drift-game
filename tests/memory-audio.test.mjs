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
  connections = [];
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
  start(at, offset = 0) { this.startedAt = at; this.offset = offset; }
  stop(at) { this.stoppedAt = at ?? 0; }
}
class Context {
  currentTime = 1; sampleRate = 48000; state = 'running'; destination = new Node();
  oscillators = []; gains = []; buffers = []; filters = []; compressors = [];
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createOscillator() { const n = new Node(); this.oscillators.push(n); return n; }
  createBufferSource() { const n = new Node(); this.buffers.push(n); return n; }
  createBiquadFilter() { const n = new Node(); this.filters.push(n); return n; }
  createDynamicsCompressor() { const n = new Node(); this.compressors.push(n); return n; }
  createMediaElementSource() { return new Node(); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  async decodeAudioData() { return { duration: 2 }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}
function setup(t, { impact = false, music = false } = {}) {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    requested.push(String(url));
    if (String(url).includes('pynchon') ? music : impact) return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    throw Error('Offline fallback');
  });
  const context = new Context();
  const mixer = new MemoryAudio(context, 'https://example.test/memory-drift-game/');
  t.after(() => mixer.dispose());
  return { context, mixer, requested };
}

test('experimental loop uses a fresh URL and separate play/question levels', t => {
  const { context, mixer, requested } = setup(t);
  assert.equal(requested[0], 'https://example.test/memory-drift-game/audio/pynchon-loop.mp3');
  assert.equal(context.gains[2].gain.value, 10 ** (-12 / 20));
  mixer.setScene('B', true);
  assert.equal(context.gains[2].gain.events.at(-1)[1], 10 ** (-22 / 20));
  mixer.setScene('C', false);
  assert.equal(context.gains[2].gain.events.at(-1)[1], 10 ** (-12 / 20));
});

test('decoded music loops once, preserves its position through mute/blur, and releases on disposal', async t => {
  const { context, mixer } = setup(t, { music: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.buffers.length, 0, 'loading cannot autoplay before user unlock');
  mixer.unlock(); mixer.unlock();
  assert.equal(context.buffers.length, 1, 'unlock cannot create duplicate loops');
  assert.equal(context.buffers[0].loop, true);
  assert.equal(context.buffers[0].offset, 0);
  context.currentTime = 4.5;
  mixer.setEnabled(false);
  assert.equal(context.buffers[0].disconnected, true);
  context.currentTime = 8;
  mixer.setEnabled(true);
  assert.equal(context.buffers[1].offset, 1.5, 'resume within the two-second test buffer');
  context.currentTime = 9;
  mixer.setActive(false);
  mixer.setEnabled(true);
  assert.equal(context.buffers.length, 2, 'inactive must stay silent');
  context.currentTime = 12;
  mixer.setActive(true);
  assert.equal(context.buffers[2].offset, .5);
  mixer.dispose();
  assert.ok(context.buffers.every(node => node.disconnected));
});

test('late music decoding cannot restart a muted or disposed mixer', async t => {
  const { context, mixer } = setup(t, { music: true });
  mixer.unlock();
  mixer.setEnabled(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.buffers.length, 0);
  mixer.dispose(); mixer.unlock();
  assert.equal(context.buffers.length, 0);
});

test('collect rises as a two-note motif; collision falls with two dry noise layers even offline', t => {
  const { context, mixer } = setup(t);
  mixer.play('collect');
  assert.equal(context.oscillators.length, 2);
  assert.ok(context.oscillators[1].frequency.events[0][1] > context.oscillators[0].frequency.events[0][1]);
  assert.ok(context.oscillators[1].startedAt > context.oscillators[0].startedAt);
  mixer.play('collision');
  assert.ok(context.oscillators[2].frequency.events[0][1] > context.oscillators[2].frequency.events[1][1]);
  assert.equal(context.buffers.length, 2);
  const duckRamps = context.gains[3].gain.events.filter(e => e[0] === 'ramp');
  assert.ok(duckRamps[0][1] < duckRamps[1][1]);
});

test('collision has an 11 dB stronger lead envelope than collect, with a short crack and no long tail', t => {
  const { context, mixer } = setup(t);
  const peak = node => node.connections[0].gain.events.find(event => event[0] === 'linear')[1];
  mixer.play('collect');
  const collectPeak = peak(context.oscillators[0]);
  mixer.play('collision');
  const collisionLead = context.oscillators[2];
  assert.ok(Math.abs(20 * Math.log10(peak(collisionLead) / collectPeak) - 11) < .00001);
  assert.ok(collisionLead.stoppedAt - collisionLead.startedAt < .23);
  assert.ok(context.buffers[0].stoppedAt - context.buffers[0].startedAt < .05);
  assert.ok(context.filters[1].frequency.value > 3000, 'bright crack');
  assert.ok(context.filters[2].frequency.value < 1000, 'low dry texture');
  mixer.play('block');
  assert.ok(peak(context.oscillators[4]) < peak(collisionLead));
  assert.ok(context.oscillators[5].frequency.events[1][1] > context.oscillators[5].frequency.events[0][1], 'successful block ends upwards');
});

test('music duck is independent of scene volume, holds through weaker cues, and recovers over 420 ms', t => {
  const { context, mixer } = setup(t);
  const music = context.gains[2];
  const duck = context.gains[3];
  assert.equal(music.connections[0], duck);
  assert.equal(duck.connections[0], context.gains[0]);
  mixer.play('collision');
  const firstEvents = [...duck.gain.events];
  assert.equal(firstEvents.at(-1)[1], 1);
  assert.ok(Math.abs(firstEvents.at(-1)[2] - 1.65) < .00001);
  mixer.setScene('B', true);
  assert.deepEqual(duck.gain.events, firstEvents, 'pausing/filter changes cannot cancel ducking');
  context.currentTime += .001; // still within the hard impact attack
  mixer.play('bubble');
  assert.equal(duck.gain.events.at(-3)[1], 10 ** (-14 / 20));
  assert.ok(Math.abs(duck.gain.events.at(-1)[2] - duck.gain.events.at(-2)[2] - .42) < .00001);
  context.currentTime = 2;
  mixer.play('bubble');
  assert.equal(duck.gain.events.at(-4)[1], 1, 'next duck starts from recovered unity');
  assert.equal(duck.gain.events.at(-3)[1], 10 ** (-6 / 20));
});

test('new impact during recovery starts from the current duck level rather than snapping music upwards', t => {
  const { context, mixer } = setup(t);
  mixer.play('collision');
  context.currentTime = 1.44;
  mixer.play('bubble');
  const events = context.gains[3].gain.events;
  const from = events.at(-4)[1];
  assert.ok(Math.abs(from - 10 ** (-7 / 20)) < .00001);
  assert.equal(events.at(-3)[1], from, 'weaker bubble preserves remaining impact duck');
});

test('impact variation remains within two percent and hard hits obey their cooldown', t => {
  const { context, mixer } = setup(t);
  t.mock.method(Math, 'random', () => 0);
  mixer.play('collision');
  assert.equal(context.oscillators[0].frequency.events[0][1], 182 * .98);
  mixer.play('collision');
  assert.equal(context.oscillators.length, 2);
  context.currentTime += .23;
  t.mock.method(Math, 'random', () => 1);
  mixer.play('collision');
  assert.equal(context.oscillators[2].frequency.events[0][1], 182 * 1.02);
});

test('downloaded metal impact is distinct, faded out, and capped at 280 ms', async t => {
  const { context, mixer } = setup(t, { impact: true });
  await new Promise(resolve => setImmediate(resolve));
  mixer.play('collision');
  const sample = context.buffers[2];
  assert.equal(sample.buffer.duration, 2);
  assert.ok(sample.playbackRate.value >= .98 && sample.playbackRate.value <= 1.02);
  assert.ok(Math.abs(sample.stoppedAt - sample.startedAt - .295) < .00001);
  const envelope = sample.connections[0].gain.events;
  assert.equal(envelope[1][1], 10 ** (-7 / 20));
  assert.equal(envelope.at(-1)[1], .0001);
  // An envelope ceiling, not a substitute for measuring/listening to the real mix.
  const sumOfPeakGains = [-7, -15, -11, -17, -7].reduce((sum, level) => sum + 10 ** (level / 20), 0);
  assert.ok(sumOfPeakGains * context.gains[0].gain.value * context.gains[1].gain.value < .75);
  assert.equal(context.compressors[0].threshold.value, -9);
});

test('successive collisions alternate the two downloaded metal takes', async t => {
  const { context, mixer } = setup(t, { impact: true });
  await new Promise(resolve => setImmediate(resolve));
  mixer.play('collision');
  context.currentTime += .3;
  mixer.play('collision');
  context.currentTime += .3;
  mixer.play('collision');
  assert.notEqual(context.buffers[2].buffer, context.buffers[5].buffer);
  assert.equal(context.buffers[2].buffer, context.buffers[8].buffer);
});

test('memory interference has a digital double break, sample, and independent gate', async t => {
  const { context, mixer } = setup(t, { impact: true });
  await new Promise(resolve => setImmediate(resolve));
  mixer.play('bubble');
  assert.equal(context.oscillators[0].type, 'square');
  assert.equal(context.buffers.length, 2, 'noise plus downloaded static');
  const gate = context.gains[4];
  assert.equal(gate.connections[0], context.gains[2]);
  assert.deepEqual(gate.gain.events.filter(e => e[0] === 'target').map(e => e[1]), [.16, 1, .08, 1]);
  assert.ok(context.buffers[1].startedAt > context.currentTime);
  assert.ok(context.buffers[1].stoppedAt - context.buffers[1].startedAt < .26);
  const events = [...gate.gain.events];
  mixer.setScene('C', false);
  assert.deepEqual(gate.gain.events, events, 'scene changes preserve transient break');
  mixer.setActive(false);
  assert.deepEqual(gate.gain.events.at(-1), ['set', 1, context.currentTime]);
});

test('all three scene filters retain a usable rhythmic band', t => {
  const { context, mixer } = setup(t);
  for (const [stage, frequency] of [['A', 9500], ['B', 2600], ['C', 6500]]) {
    mixer.setScene(stage, false);
    assert.equal(context.filters[0].frequency.events.at(-1)[1], frequency);
  }
});

test('voice budget reserves complete cues and a hard impact preempts crowded pickups', t => {
  const { context, mixer } = setup(t);
  for (let i = 0; i < 20; i++) { context.currentTime += .1; mixer.play('collect'); }
  assert.equal(context.oscillators.length, 24);
  mixer.play('collision');
  const allSources = [...context.oscillators, ...context.buffers];
  assert.equal(allSources.filter(source => !source.disconnected).length, 4);
  assert.ok(context.oscillators.slice(0, 24).every(source => source.disconnected));
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
  const { context, mixer } = setup(t);
  mixer.play('collect'); mixer.setEnabled(false);
  assert.ok(context.oscillators.every(n => n.disconnected));
  mixer.play('collision'); assert.equal(context.oscillators.length, 2);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  mixer.setEnabled(true); mixer.play('protect');
  assert.equal(context.oscillators.length, 5);
  mixer.setActive(false); mixer.play('bubble');
  assert.equal(context.oscillators.length, 5);
  mixer.setActive(true); mixer.play('block');
  assert.equal(context.oscillators.length, 7);
  mixer.dispose(); mixer.play('collect');
  assert.equal(context.state, 'closed');
  assert.equal(context.oscillators.length, 7);
});

test('mute, hidden state and disposal clear scheduled ducking and disposed controls stay inert', t => {
  const { context, mixer } = setup(t);
  const duck = context.gains[3].gain;
  mixer.play('collision');
  mixer.setEnabled(false);
  assert.deepEqual(duck.events.at(-1), ['set', 1, context.currentTime]);
  mixer.setEnabled(true);
  mixer.play('collision');
  mixer.setActive(false);
  assert.deepEqual(duck.events.at(-1), ['set', 1, context.currentTime]);
  mixer.setActive(true);
  mixer.play('collision');
  mixer.dispose();
  assert.deepEqual(duck.events.at(-1), ['set', 1, context.currentTime]);
  const events = context.gains.map(node => node.gain.events.length);
  mixer.setEnabled(true); mixer.setActive(true); mixer.setScene('A', false); mixer.play('collision');
  assert.deepEqual(context.gains.map(node => node.gain.events.length), events);
});
