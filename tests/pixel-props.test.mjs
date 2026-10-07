import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, dependencies = {}) {
  const source = readFileSync(new URL(`../app/${name}.ts`, import.meta.url), 'utf8');
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, Set, Math, Number, Object, require: path => {
    if (!(path in dependencies)) throw new Error(`Unexpected dependency: ${path}`);
    return dependencies[path];
  } });
  return exports;
}
const world = load('pixel-world');
const { LEVEL_PROPS, PRACTICE_PROPS, drawWorldProps } = load('pixel-props', { './pixel-world': world });

const bounds = item => ({ x: item.x, y: item.y - item.height, width: item.width, height: item.height });
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
  && a.y < b.y + b.height && a.y + a.height > b.y;
function canvas() {
  const calls = [];
  const stack = [];
  let tx = 0, ty = 0;
  return {
    calls, fillStyle: '', imageSmoothingEnabled: true,
    save() { stack.push([tx, ty]); },
    restore() { [tx, ty] = stack.pop(); },
    translate(x, y) { tx += x; ty += y; },
    fillRect(x, y, w, h) { calls.push([tx + x, ty + y, w, h, this.fillStyle]); },
    get depth() { return stack.length; },
  };
}
const visitor = (overrides = {}) => ({ x: 476, y: 315, vx: 230, time: 1.6, cameraX: 0, mode: 'game', ...overrides });
function render(state, options = {}) {
  const ctx = canvas();
  drawWorldProps(ctx, state, options);
  assert.equal(ctx.depth, 0, 'canvas saves must be balanced');
  return ctx.calls;
}

test('twelve authored placements are immutable, bounded and concentrated on the walking route', () => {
  assert.equal(LEVEL_PROPS.length, 12);
  assert.equal(new Set(LEVEL_PROPS.map(item => item.id)).size, LEVEL_PROPS.length);
  assert.equal(Object.isFrozen(LEVEL_PROPS), true);
  for (const item of LEVEL_PROPS) {
    assert.equal(Object.isFrozen(item), true);
    assert.ok(item.x >= 0 && item.x + item.width <= world.WORLD_WIDTH);
    assert.ok(item.y - item.height >= 0 && item.y <= world.GROUND_Y);
    assert.ok(item.width <= 42 && item.height <= 46);
    if (item.y !== world.GROUND_Y) {
      assert.ok(world.LEVEL_PLATFORMS.some(shelf => shelf.y === item.y
        && shelf.x <= item.x && shelf.x + shelf.width >= item.x + item.width), item.id);
    }
  }
});

test('props leave photographs, patrol envelopes, bubbles, spring and checkpoint signs clear', () => {
  const obstacles = [
    ...world.LEVEL_PHOTOS.map(p => ({ x: p.x - 18, y: p.y - 18, width: 36, height: 36 })),
    ...world.LEVEL_HAZARDS.map(h => ({ x: h.x - (h.patrol ?? 0), y: h.y,
      width: h.width + 2 * (h.patrol ?? 0), height: h.height })),
    ...world.LEVEL_BUBBLES.map(b => ({ x: b.x - 23 - b.radius, y: b.y - 25 - b.radius,
      width: 46 + b.radius * 2, height: 50 + b.radius * 2 })),
    ...world.LEVEL_SPRINGS.map(s => ({ x: s.x, y: world.GROUND_Y - 46, width: s.width, height: 46 })),
    ...[...world.CHECKPOINTS, world.GOAL_X].map(x => ({ x: x - 14, y: world.GROUND_Y - 98, width: 86, height: 98 })),
  ];
  for (const item of LEVEL_PROPS) {
    for (const obstacle of obstacles) assert.equal(overlaps(bounds(item), obstacle), false, item.id);
  }
});

test('practice reuses three props without touching the training photograph or initial player', () => {
  assert.equal(PRACTICE_PROPS.length, 3);
  for (const item of PRACTICE_PROPS) {
    assert.ok(LEVEL_PROPS.includes(item));
    assert.ok(item.x + item.width <= 900);
    for (const photo of world.PRACTICE_PHOTOS) {
      assert.equal(overlaps(bounds(item), { x: photo.x - 20, y: photo.y - 20, width: 40, height: 40 }), false);
    }
    assert.equal(overlaps(bounds(item), { x: 90, y: 390, width: 28, height: 40 }), false);
  }
});

test('drawing uses only crisp small rectangles in the restricted accent palette', () => {
  const allowed = new Set(['#17294c', '#ffcd55', '#ff655c', '#63ebcb', '#fff0cc']);
  for (const cameraX of [0, 1300, 2700]) {
    const calls = render(visitor({ cameraX }));
    assert.ok(calls.length > 10, 'each section contains at least one complete prop');
    for (const [x, y, width, height, color] of calls) {
      assert.ok([x, y, width, height].every(value => Number.isInteger(value) && value % 2 === 0));
      assert.ok(width > 0 && height > 0);
      assert.ok(allowed.has(color));
    }
  }
  assert.equal(render(visitor({ cameraX: 5000 })).length, 0);
});

test('only nearby passing visitors animate a pinwheel or radio, never idle or reduced-motion views', () => {
  const first = visitor({ time: 0 });
  const later = visitor({ time: .2 });
  assert.notDeepEqual(render(first), render(later));
  for (const options of [{ reducedMotion: true }, { idle: true }]) {
    assert.deepEqual(render(first, options), render(later, options));
  }
  assert.deepEqual(render(visitor({ x: 80, time: 0 })), render(visitor({ x: 80, time: .2 })));
  assert.deepEqual(render(visitor({ vx: 0, time: 0 })), render(visitor({ vx: 0, time: .2 })));
  assert.notDeepEqual(render(visitor({ x: 1640, cameraX: 1300, time: 0 })),
    render(visitor({ x: 1640, cameraX: 1300, time: .2 })));
});

test('rendering does not mutate the simulation or scenery and needs no browser image assets', () => {
  const state = Object.freeze(visitor());
  const before = JSON.stringify({ state, LEVEL_PROPS, PRACTICE_PROPS });
  render(state);
  render(Object.freeze(visitor({ mode: 'practice' })));
  assert.equal(JSON.stringify({ state, LEVEL_PROPS, PRACTICE_PROPS }), before);
});
