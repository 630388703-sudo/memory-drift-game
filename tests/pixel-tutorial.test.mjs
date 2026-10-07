import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld, AREA_STARTS, GROUND_Y, PLAYER_HEIGHT } from '../app/pixel-world.ts';
import { practiceStep, PRACTICE_STEPS } from '../app/pixel-tutorial.ts';

const idle = { axis: 0, jump: false, jumpPressed: false, protect: false };
const dt = 1 / 120;

/** The same input sequence a player can perform; no teleports or seeded progress. */
function playPractice({ missFirst = false, timestep = dt } = {}) {
  const world = createWorld('practice');
  const transitions = [practiceStep(world)];
  const events = [];
  let jumped = false;
  let missed = false;
  let retryWasVisible = false;
  for (let frame = 0; frame < Math.ceil(25 / timestep) && practiceStep(world) !== 'done'; frame++) {
    const collected = world.collected.size > 0;
    const jumpPressed = !jumped && world.x >= 325;
    if (jumpPressed) jumped = true;
    if (missed && world.practiceSignal) retryWasVisible = true;
    const freshEvents = stepWorld(world, {
      axis: world.x < (collected ? 560 : 412) ? 1 : 0,
      jump: jumped && !collected,
      jumpPressed,
      protect: world.practiceSignal !== null && (!missFirst || missed),
    }, timestep);
    events.push(...freshEvents);
    if (freshEvents.some(event => event.type === 'bubble' && event.id === 'practice-signal')) missed = true;
    const nextStep = practiceStep(world);
    if (transitions.at(-1) !== nextStep) transitions.push(nextStep);
  }
  return { world, events, transitions, missed, retryWasVisible };
}

test('actual fixed-step play advances move → jump → collect → protect → done', () => {
  for (const timestep of [1 / 120, 1 / 60]) {
    const { world, events, transitions } = playPractice({ timestep });
    assert.deepEqual(transitions, [...PRACTICE_STEPS, 'done']);
    assert.equal(practiceStep(world), 'done');
    assert.ok(world.stats.distance >= 85);
    assert.equal(world.stats.jumps, 1);
    assert.equal(world.collected.size, 1);
    assert.equal(world.stats.blocks, 1);
    assert.equal(events.filter(event => event.type === 'photo').length, 1);
    assert.equal(events.filter(event => event.type === 'protect').length, 1);
    assert.equal(events.filter(event => event.type === 'block').length, 1);
  }
});

test('missing an orb leaves the protection step retryable until a real block', () => {
  const { world, events, transitions, missed, retryWasVisible } = playPractice({ missFirst: true });
  assert.equal(missed, true);
  assert.equal(retryWasVisible, true);
  assert.equal(world.stats.bubbles, 1);
  assert.equal(world.collected.size, 1);
  assert.equal(world.stats.blocks, 1);
  assert.equal(practiceStep(world), 'done');
  assert.deepEqual(transitions, [...PRACTICE_STEPS, 'done']);
  const missIndex = events.findIndex(event => event.type === 'bubble');
  const blockIndex = events.findIndex(event => event.type === 'block');
  assert.ok(missIndex >= 0 && blockIndex > missIndex);
});

test('entering the official game creates fresh progress and input timers', () => {
  const { world: practice } = playPractice({ missFirst: true });
  assert.equal(practiceStep(practice), 'done');
  const game = createWorld();
  assert.equal(game.mode, 'game');
  assert.equal(game.x, AREA_STARTS[0]);
  assert.equal(game.y, GROUND_Y - PLAYER_HEIGHT);
  assert.equal(game.time, 0);
  assert.equal(game.checkpoint, 0);
  assert.equal(game.finished, false);
  assert.equal(game.collected.size, 0);
  assert.notEqual(game.collected, practice.collected);
  assert.notEqual(game.stats, practice.stats);
  assert.deepEqual(game.stats, { collisions: 0, bubbles: 0, blocks: 0, jumps: 0, distance: 0 });
  assert.equal(game.shieldUntil, 0);
  assert.equal(game.invulnerableUntil, 0);
  assert.equal(game.protectCharge, 0);
  assert.equal(game.protectReadyAt, 0);
  assert.equal(game.practiceSignal, null);
  assert.equal(game.jumpWasHeld, false);
  assert.equal(game.protectLatched, false);
});

test('practice never advances route checkpoints or finishes the actual game', () => {
  const { world, events } = playPractice();
  for (let frame = 0; frame < 1200; frame++) {
    events.push(...stepWorld(world, { ...idle, axis: 1 }, dt));
  }
  assert.equal(world.x, 900);
  assert.equal(world.cameraX, 0);
  assert.equal(world.checkpoint, 0);
  assert.equal(world.finished, false);
  assert.equal(world.practiceSignal, null);
  assert.equal(events.filter(event => event.type === 'checkpoint' || event.type === 'finish').length, 0);
  assert.equal(practiceStep(world), 'done');
});

test('waiting alone cannot dismiss the move instruction or complete any lesson', () => {
  const world = createWorld('practice');
  for (let frame = 0; frame < 3600; frame++) stepWorld(world, idle, dt);
  assert.equal(practiceStep(world), 'move');
  assert.equal(world.stats.distance, 0);
  assert.equal(world.stats.jumps, 0);
  assert.equal(world.collected.size, 0);
  assert.equal(world.stats.blocks, 0);
});
