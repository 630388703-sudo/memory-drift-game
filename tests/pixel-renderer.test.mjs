import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  if (name.endsWith('.png')) return { default: name };
  const exports = {};
  const source = readFileSync(new URL(`../app/${name.replace('./', '')}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: load, Math, Number, Set });
  modules.set(name, exports);
  return exports;
}
const { drawPixelWorld, drawMemoryPhoto, drawPhotoFragments, drawGameObject } = load('./pixel-renderer');
const { createWorld, GROUND_Y, VIEW_WIDTH, VIEW_HEIGHT, LEVEL_PHOTOS, PRACTICE_PHOTOS } = load('./pixel-world');
const art = {
  background: { naturalWidth: 1600, naturalHeight: 900 }, atlas: {},
  frames: Array.from({length:8}, (_, i) => ({x:i * 50,y:0,width:28,height:44})), heroWidth:28,heroHeight:44,
};
function context() {
  const calls = [];
  const ctx = { canvas: { width:480,height:270 }, calls, fillStyle:'',globalAlpha:1 };
  for (const method of ['save','restore','translate','scale','rotate','setTransform','clearRect','beginPath','rect','clip','fillRect','drawImage','fillText']) {
    ctx[method] = (...args) => {
      assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), `${method} received invalid coordinates`);
      calls.push({ method, args, color: ctx.fillStyle, alpha: ctx.globalAlpha });
    };
  }
  return ctx;
}

test('action objects have distinct high-contrast accents and non-color shape cues', () => {
  for (const [index, color] of [[4,'#ffcd55'],[7,'#ff655c'],[5,'#ed7de1']]) {
    const ctx = context();
    drawGameObject(ctx, art, index, 10, 10, 32, 32);
    assert.ok(ctx.calls.some(c => c.color === '#17294c' && c.method === 'fillRect'));
    assert.ok(ctx.calls.some(c => c.color === color && c.method === 'fillRect'));
    assert.ok(ctx.calls.filter(c => c.method === 'fillRect').length >= 4);
    assert.equal(ctx.calls.filter(c => c.method === 'drawImage').length, 1);
  }
});

test('recalled prints occur along the route, not in practice or the original photograph', () => {
  const state = createWorld(); state.cameraX = 600;
  const ctx = context(); drawPixelWorld(ctx, state, art);
  assert.equal(ctx.calls.filter(c => c.method === 'fillText' && c.args[0] === 'RECALLED').length, 1);
  const practice = context(); drawPixelWorld(practice, createWorld('practice'), art);
  assert.equal(practice.calls.filter(c => c.method === 'fillText' && c.args[0] === 'RECALLED').length, 0);
  const original = context(); drawMemoryPhoto(original, art, { count:4 });
  assert.equal(original.calls.filter(c => c.method === 'fillText' && c.args[0] === 'RECALLED').length, 0);
  const people = original.calls.filter(c => c.method === 'drawImage' && c.args[0] === art.atlas && c.args[1] === 0);
  assert.equal(people.length, 4, 'world retellings must not alter the original four-person record');
});

test('both roadside retellings show five people against the same blue-sky baseline', () => {
  for (const cameraX of [600, 1800]) {
    const world = createWorld(); world.cameraX = cameraX;
    const ctx = context(); drawPixelWorld(ctx, world, art);
    const start = ctx.calls.findIndex(call => call.method === 'fillText' && call.args[0] === 'RECALLED');
    assert.ok(start >= 0);
    const remaining = ctx.calls.slice(start + 1);
    const print = remaining.slice(0, remaining.findIndex(call => call.method === 'restore'));
    const sky = print.filter(call => call.method === 'fillRect' && call.args.join(',') === '8,23,86,39');
    assert.equal(sky.length, 1);
    assert.equal(sky[0].color, '#89b7ef', 'a second account must not introduce a different sky answer');
    const heads = print.filter(call => call.method === 'fillRect' && call.args[1] === 30
      && call.args[2] === 6 && call.args[3] === 6 && call.color === '#17294c');
    assert.equal(heads.length, 5);
  }
});

test('all stages and short feedback draw safely in normal and reduced-motion modes', () => {
  for (const version of [0,1,2]) for (const reducedMotion of [false,true]) {
    const world = createWorld(); world.checkpoint = version; world.cameraX = version * 1200;
    world.x = world.cameraX + 400; world.time = 2;
    world.feedback = ['photo','collision','bubble','block','spring'].map((type,i) => ({ type, x:world.x + i * 30, y:GROUND_Y - 30,at:1.8 }));
    const ctx = context(); drawPixelWorld(ctx, world, art, {version,reducedMotion});
    assert.equal(ctx.calls.filter(c => c.method === 'save').length, ctx.calls.filter(c => c.method === 'restore').length);
    assert.ok(ctx.calls.some(c => c.color === '#ff655c'));
    assert.ok(ctx.calls.some(c => c.color === '#63ebcb'));
  }
});

const clearSlots = () => Array.from({ length: 5 }, (_, index) => ({ id: index + 1, at: index, version:'A', altered:false }));
const fullStripFills = ctx => ctx.calls.filter(call => call.method === 'fillRect'
  && call.args[1] === 0 && call.args[2] === VIEW_WIDTH / 5 && call.args[3] === VIEW_HEIGHT);

test('five intact fragments join into the exact original four-person scene with only thin seams', () => {
  const original = context(); drawMemoryPhoto(original, art, { count:4 });
  const fragments = context(); drawPhotoFragments(fragments, art, clearSlots());
  assert.deepEqual(fragments.calls.slice(0, original.calls.length), original.calls,
    'all original drawing commands must be unchanged, not redrawn as separate miniatures');
  assert.deepEqual(fullStripFills(fragments), [], 'intact strips must not be obscured');
  const extraImages = fragments.calls.slice(original.calls.length).filter(call => call.method === 'drawImage');
  assert.deepEqual(extraImages, [], 'fragment composition cannot invent a fifth person');
  const seams = fragments.calls.slice(original.calls.length).filter(call => call.method === 'fillRect');
  assert.deepEqual(seams.map(call => call.args), [1,2,3,4].map(i => [i * VIEW_WIDTH / 5, 0, 2, VIEW_HEIGHT]));
});

test('each absent fragment is completely covered by opaque paper, not a glimpse of the original', () => {
  for (let index = 0; index < 5; index++) {
    const slots = clearSlots(); slots[index] = null;
    const ctx = context(); drawPhotoFragments(ctx, art, slots);
    const masks = fullStripFills(ctx);
    assert.equal(masks.length, 1);
    assert.deepEqual(masks[0].args, [index * VIEW_WIDTH / 5, 0, VIEW_WIDTH / 5, VIEW_HEIGHT]);
    assert.equal(masks[0].color, '#fff6d8');
    assert.equal(masks[0].alpha, 1);
    assert.ok(ctx.calls.some(call => call.method === 'fillText' && call.args[0] === String(index + 1)));
    const afterMask = ctx.calls.slice(ctx.calls.indexOf(masks[0]) + 1);
    assert.equal(afterMask.some(call => call.method === 'drawImage'), false,
      'nothing may draw original pixels back over a missing strip');
  }
});

test('each damaged fragment is fully opaque; signal lines remain inside its own fixed strip', () => {
  for (let index = 0; index < 5; index++) {
    const slots = clearSlots(); slots[index].altered = true;
    const ctx = context(); drawPhotoFragments(ctx, art, slots);
    const masks = fullStripFills(ctx);
    assert.equal(masks.length, 1);
    assert.deepEqual(masks[0].args, [index * VIEW_WIDTH / 5, 0, VIEW_WIDTH / 5, VIEW_HEIGHT]);
    assert.equal(masks[0].color, '#8196b5');
    assert.equal(masks[0].alpha, 1);
    const signals = ctx.calls.filter(call => call.method === 'fillRect' && ['#df96b8','#70c9de'].includes(call.color));
    assert.equal(signals.length, 18);
    for (const signal of signals) {
      const [x,y,w,h] = signal.args;
      assert.ok(x >= index * VIEW_WIDTH / 5 && x + w <= (index + 1) * VIEW_WIDTH / 5);
      assert.ok(y >= 0 && y + h <= VIEW_HEIGHT);
    }
    assert.equal(ctx.calls.slice(ctx.calls.indexOf(masks[0]) + 1).some(call => call.method === 'drawImage'), false);
  }
});

test('all-missing, all-damaged and mixed inventories preserve five fixed regions', () => {
  for (const slots of [Array(5).fill(null), clearSlots().map(photo => ({ ...photo, altered:true })),
    clearSlots().map((photo, i) => i % 2 ? { ...photo, altered:true } : null)]) {
    const ctx = context(); drawPhotoFragments(ctx, art, slots);
    const masks = fullStripFills(ctx);
    assert.equal(masks.length, 5);
    assert.deepEqual(masks.map(call => call.args[0]), [0,192,384,576,768]);
    assert.equal(ctx.calls.filter(call => call.method === 'drawImage' && call.args[0] === art.atlas && call.args[1] === 0).length, 4);
    assert.equal(ctx.calls.filter(call => call.method === 'fillText' && call.args[0] === 'RECALLED').length, 0);
    assert.equal(ctx.calls.filter(call => call.method === 'save').length, ctx.calls.filter(call => call.method === 'restore').length);
  }
});

test('all 15 route pickups identify their fixed fragment 1–5; practice defaults to fragment 1', () => {
  for (const photo of LEVEL_PHOTOS) {
    const world = createWorld(); world.cameraX = Math.max(0, photo.x - 450);
    // Isolate this pickup so wayfinding text cannot conceal a numbering mismatch.
    world.collected = new Set(LEVEL_PHOTOS.filter(other => other.id !== photo.id).map(other => other.id));
    const ctx = context(); drawPixelWorld(ctx, world, art, { reducedMotion:true });
    const labels = ctx.calls.filter(call => call.method === 'fillText' && /^[1-5]$/.test(call.args[0]));
    const part = (Number(photo.id.match(/(\d+)$/)[1]) - 1) % 5;
    assert.equal(labels.length, 1);
    assert.equal(labels[0].args[0], String(part + 1));
    assert.ok(ctx.calls.some(call => call.method === 'fillRect' && call.color === '#63ebcb'
      && call.args.join(',') === `${2 + part * 6},34,4,6`));
  }
  assert.equal(PRACTICE_PHOTOS[0].id, 'practice-photo');
  const practice = context(); drawPixelWorld(practice, createWorld('practice'), art, { reducedMotion:true });
  assert.deepEqual(practice.calls.filter(call => call.method === 'fillText' && /^[1-5]$/.test(call.args[0])).map(call => call.args[0]), ['1']);
});
