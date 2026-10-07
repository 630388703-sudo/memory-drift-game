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
const { drawPixelWorld, drawMemoryPhoto, drawGameObject } = load('./pixel-renderer');
const { createWorld, GROUND_Y } = load('./pixel-world');
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
