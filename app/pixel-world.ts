/** Small, renderer-independent platforming world. All distances are logical pixels. */
export const VIEW_WIDTH = 960;
export const VIEW_HEIGHT = 540;
export const WORLD_WIDTH = 3900;
export const GROUND_Y = 430;
export const PLAYER_WIDTH = 28;
export const PLAYER_HEIGHT = 40;
export const RUN_SPEED = 230;
export const JUMP_HEIGHT = 104;
export const JUMP_APEX_TIME = 0.35;
export const GRAVITY = 2 * JUMP_HEIGHT / (JUMP_APEX_TIME * JUMP_APEX_TIME);
export const JUMP_SPEED = -2 * JUMP_HEIGHT / JUMP_APEX_TIME;
export const GOAL_X = 3780;
export const CHECKPOINTS = [1250, 2500] as const;
export const AREA_STARTS = [90, 1290, 2540] as const;

export type Platform = { id: string; x: number; y: number; width: number };
export type Photo = { id: string; x: number; y: number; area: number };
export type Hazard = { id: string; x: number; y: number; width: number; height: number };
export type Bubble = { id: string; x: number; y: number; radius: number; phase: number };

// Elevated paths are optional: the ground remains continuous from entrance to exit.
export const LEVEL_PLATFORMS: readonly Platform[] = [
  { id: 'shelf-a', x: 360, y: 355, width: 150 },
  { id: 'shelf-b', x: 830, y: 355, width: 170 },
  { id: 'shelf-c', x: 1530, y: 355, width: 160 },
  { id: 'shelf-d', x: 2040, y: 345, width: 175 },
  { id: 'shelf-e', x: 2790, y: 355, width: 165 },
  { id: 'shelf-f', x: 3300, y: 345, width: 180 },
];

export const LEVEL_PHOTOS: readonly Photo[] = [
  { id: 'photo-01', x: 240, y: 396, area: 0 },
  { id: 'photo-02', x: 425, y: 321, area: 0 },
  { id: 'photo-03', x: 735, y: 396, area: 0 },
  { id: 'photo-04', x: 915, y: 321, area: 0 },
  { id: 'photo-05', x: 1160, y: 396, area: 0 },
  { id: 'photo-06', x: 1400, y: 396, area: 1 },
  { id: 'photo-07', x: 1610, y: 321, area: 1 },
  { id: 'photo-08', x: 1900, y: 396, area: 1 },
  { id: 'photo-09', x: 2120, y: 311, area: 1 },
  { id: 'photo-10', x: 2380, y: 396, area: 1 },
  { id: 'photo-11', x: 2660, y: 396, area: 2 },
  { id: 'photo-12', x: 2870, y: 321, area: 2 },
  { id: 'photo-13', x: 3150, y: 396, area: 2 },
  { id: 'photo-14', x: 3390, y: 311, area: 2 },
  { id: 'photo-15', x: 3670, y: 396, area: 2 },
];

export const LEVEL_HAZARDS: readonly Hazard[] = [
  { id: 'noise-a', x: 605, y: 402, width: 28, height: 28 },
  { id: 'noise-b', x: 1070, y: 398, width: 32, height: 32 },
  { id: 'noise-c', x: 1770, y: 402, width: 32, height: 28 },
  { id: 'noise-d', x: 2290, y: 398, width: 34, height: 32 },
  { id: 'noise-e', x: 3040, y: 402, width: 32, height: 28 },
  { id: 'noise-f', x: 3555, y: 398, width: 36, height: 32 },
];

export const LEVEL_BUBBLES: readonly Bubble[] = [
  { id: 'echo-a', x: 790, y: 365, radius: 17, phase: 0 },
  { id: 'echo-b', x: 1470, y: 363, radius: 19, phase: 1.7 },
  { id: 'echo-c', x: 1990, y: 371, radius: 18, phase: 3.2 },
  { id: 'echo-d', x: 2725, y: 364, radius: 18, phase: 4.6 },
  { id: 'echo-e', x: 3220, y: 373, radius: 20, phase: 2.5 },
];

export function bubblePosition(bubble: Bubble, time: number) {
  return {
    x: bubble.x + Math.sin(time * 0.83 + bubble.phase) * 23,
    y: bubble.y + Math.sin(time * 1.4 + bubble.phase) * 25,
  };
}

export type WorldInput = {
  axis: number;
  jump: boolean;
  jumpPressed: boolean;
  protect: boolean;
};

type LocatedEvent = { x: number; y: number };
export type WorldEvent = LocatedEvent & (
  | { type: 'photo'; id: string }
  | { type: 'collision'; source: 'hazard' | 'fall'; id?: string }
  | { type: 'bubble'; id: string }
  | { type: 'checkpoint'; index: number }
  | { type: 'finish' }
  | { type: 'protect' }
  | { type: 'block'; source: 'hazard' | 'bubble'; id: string }
);

export type WorldState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  grounded: boolean;
  time: number;
  cameraX: number;
  checkpoint: number;
  shieldUntil: number;
  invulnerableUntil: number;
  protectCharge: number;
  collected: Set<string>;
  stats: { collisions: number; bubbles: number; blocks: number; jumps: number; distance: number };
  finished: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpWasHeld: boolean;
  protectLatched: boolean;
  protectReadyAt: number;
};

export function createWorld(): WorldState {
  return {
    x: AREA_STARTS[0], y: GROUND_Y - PLAYER_HEIGHT, vx: 0, vy: 0,
    facing: 1, grounded: true, time: 0, cameraX: 0, checkpoint: 0,
    shieldUntil: 0, invulnerableUntil: 0, protectCharge: 0,
    collected: new Set(),
    stats: { collisions: 0, bubbles: 0, blocks: 0, jumps: 0, distance: 0 },
    finished: false, coyote: 0.1, jumpBuffer: 0, jumpWasHeld: false,
    protectLatched: false, protectReadyAt: 0,
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

function overlaps(state: WorldState, x: number, y: number, width: number, height: number) {
  return state.x + PLAYER_WIDTH > x && state.x < x + width
    && state.y + PLAYER_HEIGHT > y && state.y < y + height;
}

/** Call at a fixed 1/60 or 1/120 step. Menus/recall should not call this function. */
export function stepWorld(state: WorldState, input: WorldInput, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  if (state.finished || !Number.isFinite(seconds) || seconds <= 0) return events;
  const dt = Math.min(seconds, 1 / 30);
  state.time += dt;
  const location = () => ({ x: state.x + PLAYER_WIDTH / 2, y: state.y + PLAYER_HEIGHT / 2 });

  if (!input.protect) {
    state.protectCharge = 0;
    state.protectLatched = false;
  } else if (!state.protectLatched && state.time >= state.protectReadyAt) {
    state.protectCharge = Math.min(0.7, state.protectCharge + dt);
    if (state.protectCharge >= 0.7 - 1e-8) {
      state.shieldUntil = state.time + 4.2;
      state.protectReadyAt = state.shieldUntil;
      state.protectLatched = true;
      events.push({ type: 'protect', ...location() });
    }
  }

  state.coyote = state.grounded ? 0.1 : Math.max(0, state.coyote - dt);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
  if (input.jumpPressed) state.jumpBuffer = 0.13;
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.vy = JUMP_SPEED * (input.jump ? 1 : 0.45);
    state.grounded = false;
    state.coyote = 0;
    state.jumpBuffer = 0;
    state.stats.jumps++;
  } else if (!input.jump && state.jumpWasHeld && state.vy < 0) {
    state.vy *= 0.45;
  }
  state.jumpWasHeld = input.jump;

  const rawAxis = Number.isFinite(input.axis) ? clamp(input.axis, -1, 1) : 0;
  const axis = Math.abs(rawAxis) < 0.16 ? 0 : rawAxis;
  const acceleration = axis === 0 ? 2900 : state.grounded ? 2600 : 1800;
  state.vx = approach(state.vx, axis * RUN_SPEED, acceleration * dt);
  if (axis !== 0) state.facing = axis < 0 ? -1 : 1;
  const oldX = state.x;
  const oldBottom = state.y + PLAYER_HEIGHT;
  state.x = clamp(state.x + state.vx * dt, 0, WORLD_WIDTH - PLAYER_WIDTH);
  state.stats.distance += Math.abs(state.x - oldX);
  const gravity = GRAVITY * (state.vy > 0 ? 1.7 : 1);
  state.y += state.vy * dt + 0.5 * gravity * dt * dt;
  state.vy += gravity * dt;
  state.grounded = false;

  if (state.vy >= 0) {
    let surface = Number.POSITIVE_INFINITY;
    if (oldBottom <= GROUND_Y + 1 && state.y + PLAYER_HEIGHT >= GROUND_Y) surface = GROUND_Y;
    for (const platform of LEVEL_PLATFORMS) {
      if (state.x + PLAYER_WIDTH > platform.x && state.x < platform.x + platform.width
        && oldBottom <= platform.y + 1 && state.y + PLAYER_HEIGHT >= platform.y) {
        surface = Math.min(surface, platform.y);
      }
    }
    if (Number.isFinite(surface)) {
      state.y = surface - PLAYER_HEIGHT;
      state.vy = 0;
      state.grounded = true;
    }
  }

  if (state.y > VIEW_HEIGHT + 80) {
    state.stats.collisions++;
    events.push({ type: 'collision', source: 'fall', ...location() });
    state.x = AREA_STARTS[clamp(state.checkpoint, 0, 2)];
    state.y = GROUND_Y - PLAYER_HEIGHT;
    state.vx = 0;
    state.vy = 0;
    state.grounded = true;
    state.coyote = 0.1;
    state.jumpBuffer = 0;
    state.invulnerableUntil = state.time + 1.2;
  }

  for (const photo of LEVEL_PHOTOS) {
    if (!state.collected.has(photo.id) && overlaps(state, photo.x - 12, photo.y - 12, 24, 24)) {
      state.collected.add(photo.id);
      events.push({ type: 'photo', id: photo.id, x: photo.x, y: photo.y });
    }
  }

  const contact = (source: 'hazard' | 'bubble', id: string) => {
    if (state.time < state.invulnerableUntil) return;
    state.invulnerableUntil = state.time + 1.1;
    if (state.shieldUntil > state.time) {
      state.shieldUntil = 0;
      state.stats.blocks++;
      events.push({ type: 'block', source, id, ...location() });
      return;
    }
    if (source === 'hazard') {
      state.stats.collisions++;
      state.vx = -state.facing * 100;
      events.push({ type: 'collision', source, id, ...location() });
    } else {
      state.stats.bubbles++;
      events.push({ type: 'bubble', id, ...location() });
    }
  };
  for (const hazard of LEVEL_HAZARDS) {
    if (overlaps(state, hazard.x + 3, hazard.y + 3, hazard.width - 6, hazard.height - 3)) {
      contact('hazard', hazard.id);
    }
  }
  for (const bubble of LEVEL_BUBBLES) {
    const point = bubblePosition(bubble, state.time);
    const nearestX = clamp(point.x, state.x, state.x + PLAYER_WIDTH);
    const nearestY = clamp(point.y, state.y, state.y + PLAYER_HEIGHT);
    if (Math.hypot(point.x - nearestX, point.y - nearestY) < bubble.radius * 0.83) {
      contact('bubble', bubble.id);
    }
  }

  if (state.checkpoint < CHECKPOINTS.length && state.x >= CHECKPOINTS[state.checkpoint]) {
    state.checkpoint++;
    events.push({ type: 'checkpoint', index: state.checkpoint, ...location() });
  }
  if (state.x >= GOAL_X) {
    state.finished = true;
    state.vx = 0;
    events.push({ type: 'finish', ...location() });
  }

  // A broad deadzone prevents tiny corrections or jumping from shaking the camera.
  const screenX = state.x - state.cameraX;
  let target = state.cameraX;
  if (screenX > VIEW_WIDTH * 0.43) target = state.x - VIEW_WIDTH * 0.43;
  else if (screenX < VIEW_WIDTH * 0.24) target = state.x - VIEW_WIDTH * 0.24;
  target = clamp(target, 0, WORLD_WIDTH - VIEW_WIDTH);
  state.cameraX += (target - state.cameraX) * (1 - Math.exp(-9 * dt));
  state.cameraX = clamp(state.cameraX, 0, WORLD_WIDTH - VIEW_WIDTH);
  return events;
}
