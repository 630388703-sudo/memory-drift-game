import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/pixel-world.ts', import.meta.url), 'utf8');
const exports = {};
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, { exports, Set, Math, Number });
const { createWorld, stepWorld, PLAYER_HEIGHT, GROUND_Y, LEVEL_PHOTOS, LEVEL_HAZARDS,
  LEVEL_PLATFORMS, LEVEL_BUBBLES, LEVEL_SPRINGS, PRACTICE_PLATFORMS, PRACTICE_PHOTOS,
  CHECKPOINTS, GOAL_X, AREA_STARTS, WORLD_WIDTH, VIEW_WIDTH, bubblePosition, hazardPosition } = exports;
const idle = { axis: 0, jump: false, jumpPressed: false, protect: false };
const dt = 1 / 120;
function frames(state, count, input = idle) {
  const events = [];
  for (let i = 0; i < count; i++) events.push(...stepWorld(state, input, dt));
  return events;
}

test('the ground is stable, input deadzone stops drift, and acceleration caps movement', () => {
  const state = createWorld();
  frames(state, 240, { ...idle, axis: 0.1 });
  assert.equal(state.x, 90);
  assert.equal(state.y, GROUND_Y - PLAYER_HEIGHT);
  assert.equal(state.grounded, true);
  frames(state, 120, { ...idle, axis: 1 });
  assert.equal(state.vx, 230);
  assert.ok(state.x > 305 && state.x < 330);
  frames(state, 20);
  assert.equal(state.vx, 0);
});

test('held jump reaches roughly 104px; releasing early creates a shorter hop', () => {
  function height(releaseAfter) {
    const state = createWorld();
    let minY = state.y;
    for (let i = 0; i < 120; i++) {
      stepWorld(state, { ...idle, jump: i < releaseAfter, jumpPressed: i === 0 }, dt);
      minY = Math.min(minY, state.y);
    }
    assert.equal(state.grounded, true);
    assert.equal(state.stats.jumps, 1);
    return GROUND_Y - PLAYER_HEIGHT - minY;
  }
  const held = height(100);
  const tap = height(5);
  assert.ok(held > 100 && held < 108, `held jump ${held}`);
  assert.ok(tap > 20 && tap < held * 0.65, `tap jump ${tap}`);
});

test('a coyote jump is allowed just after an edge, but no airborne double jump', () => {
  const state = createWorld();
  state.grounded = false;
  state.y = 290;
  state.coyote = 0.1;
  frames(state, 6);
  stepWorld(state, { ...idle, jump: true, jumpPressed: true }, dt);
  assert.ok(state.vy < -500);
  assert.equal(state.stats.jumps, 1);
  stepWorld(state, { ...idle, jump: true, jumpPressed: true }, dt);
  assert.equal(state.stats.jumps, 1);
});

test('jump pressed shortly before landing is buffered and fires on the ground', () => {
  const state = createWorld();
  state.y = GROUND_Y - PLAYER_HEIGHT - 5;
  state.vy = 100;
  state.grounded = false;
  state.coyote = 0;
  stepWorld(state, { ...idle, jump: true, jumpPressed: true }, dt);
  frames(state, 8, { ...idle, jump: true });
  assert.equal(state.stats.jumps, 1);
  assert.ok(state.vy < 0);
});

test('platforms can be passed from below and landed on from above', () => {
  const state = createWorld();
  const shelf = LEVEL_PLATFORMS[0];
  state.x = shelf.x + 50;
  const first = stepWorld(state, { ...idle, jump: true, jumpPressed: true }, dt);
  assert.ok(Array.isArray(first));
  let passedAbove = false;
  for (let i = 0; i < 100; i++) {
    stepWorld(state, { ...idle, jump: true }, dt);
    if (state.y + PLAYER_HEIGHT < shelf.y) passedAbove = true;
  }
  assert.equal(passedAbove, true);
  assert.equal(state.y, shelf.y - PLAYER_HEIGHT);
  assert.equal(state.grounded, true);
});

test('each photo can be collected only once even after backtracking', () => {
  const state = createWorld();
  const photo = LEVEL_PHOTOS[0];
  state.x = photo.x - 14;
  const first = frames(state, 5).filter(e => e.type === 'photo');
  assert.equal(first.length, 1);
  assert.equal(first[0].id, photo.id);
  state.x = 90;
  frames(state, 5);
  state.x = photo.x - 14;
  assert.equal(frames(state, 5).filter(e => e.type === 'photo').length, 0);
  assert.equal(state.collected.size, 1);
});

test('hazards emit a collision once during invulnerability without ending the run', () => {
  const state = createWorld();
  state.x = LEVEL_HAZARDS[0].x;
  const events = frames(state, 90);
  assert.equal(events.filter(e => e.type === 'collision').length, 1);
  assert.equal(state.stats.collisions, 1);
  assert.equal(state.finished, false);
});

test('a 0.7s hold grants one shield, and sustained holding never recharges it', () => {
  const state = createWorld();
  assert.equal(frames(state, 83, { ...idle, protect: true }).filter(e => e.type === 'protect').length, 0);
  const granted = frames(state, 2, { ...idle, protect: true });
  assert.equal(granted.filter(e => e.type === 'protect').length, 1);
  assert.ok(state.shieldUntil > state.time + 4.1);
  state.x = LEVEL_HAZARDS[0].x;
  const hit = frames(state, 1, { ...idle, protect: true });
  assert.equal(hit.filter(e => e.type === 'block').length, 1);
  assert.equal(state.shieldUntil, 0);
  assert.equal(state.stats.collisions, 0);
  state.x = 90;
  assert.equal(frames(state, 800, { ...idle, protect: true }).filter(e => e.type === 'protect').length, 0);
  frames(state, 1);
  assert.equal(frames(state, 84, { ...idle, protect: true }).filter(e => e.type === 'protect').length, 1);
});

test('bubbles emit their distinct event and can also consume a shield', () => {
  for (const shield of [false, true]) {
    const state = createWorld();
    const bubble = LEVEL_BUBBLES[0];
    const point = bubblePosition(bubble, dt);
    state.x = point.x - 14;
    state.y = point.y - 20;
    state.grounded = false;
    if (shield) state.shieldUntil = 4;
    const events = frames(state, 1);
    assert.equal(events.filter(e => e.type === (shield ? 'block' : 'bubble')).length, 1);
    assert.equal(state.stats.bubbles, shield ? 0 : 1);
  }
});

test('checkpoints and finish are one-shot events; recovery uses the current area', () => {
  const state = createWorld();
  for (let index = 0; index < CHECKPOINTS.length; index++) {
    state.x = CHECKPOINTS[index];
    const events = frames(state, 2);
    assert.equal(events.filter(e => e.type === 'checkpoint').length, 1);
    assert.equal(state.checkpoint, index + 1);
  }
  state.y = 700;
  state.grounded = false;
  assert.equal(frames(state, 1).filter(e => e.type === 'collision' && e.source === 'fall').length, 1);
  assert.equal(state.x, AREA_STARTS[2]);
  assert.equal(state.grounded, true);
  state.x = GOAL_X;
  assert.equal(frames(state, 2).filter(e => e.type === 'finish').length, 1);
  assert.equal(state.finished, true);
  assert.equal(frames(state, 20).length, 0);
});

test('a novice can reach all checkpoints and the exit without perfect jumps', () => {
  const state = createWorld();
  const events = frames(state, 2600, { ...idle, axis: 1 });
  assert.equal(state.finished, true);
  assert.equal(events.filter(e => e.type === 'checkpoint').length, 2);
  assert.equal(events.filter(e => e.type === 'finish').length, 1);
  assert.ok(events.filter(e => e.type === 'photo').length >= 8);
  assert.ok(state.stats.collisions > 0);
  assert.ok(state.cameraX >= 0 && state.cameraX <= WORLD_WIDTH - VIEW_WIDTH);
});

test('hazard dimensions and elevated routes fit the reachable jump envelope', () => {
  for (const hazard of LEVEL_HAZARDS) {
    assert.ok(hazard.width <= 36);
    assert.ok(hazard.height <= 32);
  }
  for (const platform of LEVEL_PLATFORMS) {
    assert.ok(GROUND_Y - platform.y <= 85);
    assert.ok(platform.width >= 150);
  }
  assert.equal(new Set(LEVEL_PHOTOS.map(p => p.id)).size, LEVEL_PHOTOS.length);
});

test('invalid frame time and input cannot corrupt the world', () => {
  const state = createWorld();
  assert.equal(stepWorld(state, idle, Number.NaN).length, 0);
  assert.equal(stepWorld(state, idle, -1).length, 0);
  stepWorld(state, { ...idle, axis: Number.NaN }, 1000);
  assert.ok(state.time <= 1 / 30);
  assert.ok(Number.isFinite(state.x));
  assert.ok(Number.isFinite(state.y));
});

test('practice is an isolated, safe single-screen world with no route progress events', () => {
  const state = createWorld('practice');
  const events = frames(state, 1800, { ...idle, axis: 1 });
  assert.equal(state.mode, 'practice');
  assert.equal(state.x, 900);
  assert.equal(state.cameraX, 0);
  assert.equal(state.checkpoint, 0);
  assert.equal(state.finished, false);
  assert.equal(state.practiceSignal, null);
  assert.equal(events.filter(e => ['collision', 'bubble', 'checkpoint', 'finish'].includes(e.type)).length, 0);
  assert.equal(state.collected.size, 0, 'walking underneath cannot collect the tutorial photo');
  assert.equal(createWorld().mode, 'game');
});

test('the practice photo is reachable with a held jump, not a short tap', () => {
  for (const holdFrames of [5, 100]) {
    const state = createWorld('practice');
    state.x = PRACTICE_PHOTOS[0].x - 14;
    const events = [];
    for (let i = 0; i < 120; i++) {
      events.push(...stepWorld(state, { ...idle, jump: i < holdFrames, jumpPressed: i === 0 }, dt));
    }
    assert.equal(state.collected.size, holdFrames === 100 ? 1 : 0);
    assert.equal(events.filter(e => e.type === 'photo').length, holdFrames === 100 ? 1 : 0);
    if (holdFrames === 100) {
      assert.equal(state.y + PLAYER_HEIGHT, PRACTICE_PLATFORMS[0].y);
      assert.equal(state.practiceSignal, null, 'the orb waits until the player returns to the floor');
    }
  }
});

test('practice can be completed using only movement, a held jump, and protection', () => {
  const state = createWorld('practice');
  let jumped = false;
  let collected = false;
  const events = [];
  for (let i = 0; i < 2000 && state.stats.blocks === 0; i++) {
    const jumpPressed = !jumped && state.x >= 325;
    if (jumpPressed) jumped = true;
    collected ||= state.collected.size > 0;
    events.push(...stepWorld(state, {
      axis: state.x < (collected ? 560 : 412) ? 1 : 0,
      jump: jumped && !collected,
      jumpPressed,
      protect: state.practiceSignal !== null,
    }, dt));
  }
  assert.ok(state.stats.distance >= 85);
  assert.equal(state.stats.jumps, 1);
  assert.equal(state.collected.size, 1);
  assert.equal(state.stats.blocks, 1);
  assert.equal(state.stats.bubbles, 0);
  assert.equal(state.practiceSignal, null);
  assert.equal(events.filter(e => e.type === 'checkpoint' || e.type === 'finish').length, 0);
});

test('missing the practice orb does not remove the photo and another attempt arrives', () => {
  const state = createWorld('practice');
  state.x = 570;
  state.collected.add(PRACTICE_PHOTOS[0].id);
  let firstHit = false;
  let seenRetry = false;
  for (let i = 0; i < 1600 && state.stats.blocks === 0; i++) {
    const events = stepWorld(state, { ...idle, protect: firstHit && state.practiceSignal !== null }, dt);
    if (events.some(e => e.type === 'bubble')) firstHit = true;
    if (firstHit && state.practiceSignal) seenRetry = true;
  }
  assert.equal(firstHit, true);
  assert.equal(seenRetry, true);
  assert.equal(state.collected.size, 1);
  assert.equal(state.stats.blocks, 1);
  frames(state, 1200);
  assert.equal(state.practiceSignal, null, 'successful practice stays complete');
});

test('patrolling hazards remain bounded and use their current position for collision', () => {
  const movers = LEVEL_HAZARDS.filter(hazard => hazard.patrol);
  assert.equal(movers.length, 3);
  for (const hazard of movers) {
    assert.ok(hazard.patrol >= 45 && hazard.patrol <= 60);
    for (let time = 0; time < 30; time += .13) {
      const point = hazardPosition(hazard, time);
      assert.ok(Math.abs(point.x - hazard.x) <= hazard.patrol);
      assert.equal(point.y, hazard.y);
    }
    const state = createWorld();
    state.time = 3;
    state.x = hazardPosition(hazard, state.time + dt).x;
    assert.equal(frames(state, 1).filter(e => e.type === 'collision' && e.id === hazard.id).length, 1);
  }
});

test('the optional spring gives a readable shortcut to a photo without changing jump counts', () => {
  const state = createWorld();
  state.x = LEVEL_SPRINGS[0].x - 30;
  const events = [];
  let landedOnShelf = false;
  for (let i = 0; i < 150; i++) {
    events.push(...stepWorld(state, { ...idle, axis: state.x < 2140 ? 1 : 0 }, dt));
    if (state.grounded && state.y + PLAYER_HEIGHT === LEVEL_PLATFORMS[3].y) landedOnShelf = true;
  }
  assert.equal(events.filter(e => e.type === 'spring').length, 1);
  assert.equal(state.stats.jumps, 0);
  assert.equal(landedOnShelf, true);
  assert.ok(events.some(e => e.type === 'photo' && e.id === 'photo-09'));
});
