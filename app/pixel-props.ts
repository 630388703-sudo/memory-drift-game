import { VIEW_WIDTH } from './pixel-world';

type PropKind = 'ticket' | 'pinwheel' | 'radio' | 'mailbox' | 'boat';
export type WorldProp = Readonly<{
  id: string; kind: PropKind; x: number; y: number;
  width: number; height: number; variant: 0 | 1;
}>;
export type PropWorld = Readonly<{
  x: number; y: number; vx: number; time: number; cameraX: number;
  mode: 'game' | 'practice';
}>;
export type PropOptions = Readonly<{ reducedMotion?: boolean; idle?: boolean }>;

const INK = '#17294c';
const AMBER = '#ffcd55';
const CORAL = '#ff655c';
const MINT = '#63ebcb';
const PAPER = '#fff0cc';

function prop(id: string, kind: PropKind, x: number, y: number, width: number,
  height: number, variant: 0 | 1 = 0): WorldProp {
  return Object.freeze({ id, kind, x, y, width, height, variant });
}

// Bottom-anchored, deliberately spaced keepsakes: tickets at the entrance,
// recorded sounds in the middle, letters and folded paper towards the sea.
// They are scenery, never additional pickups, hazards or memory-test evidence.
export const LEVEL_PROPS: readonly WorldProp[] = Object.freeze([
  prop('ticket-entrance', 'ticket', 170, 430, 28, 10),
  prop('pinwheel-first-shelf', 'pinwheel', 476, 355, 24, 46),
  prop('ticket-below-shelf', 'ticket', 536, 430, 28, 10, 1),
  prop('ticket-after-noise', 'ticket', 676, 430, 28, 10),
  prop('pinwheel-second-shelf', 'pinwheel', 968, 355, 24, 46, 1),
  prop('ticket-last-stub', 'ticket', 1192, 430, 28, 10, 1),
  prop('radio-shelf', 'radio', 1648, 355, 38, 26),
  prop('radio-last-recording', 'radio', 2430, 430, 38, 26, 1),
  prop('mailbox-first-letter', 'mailbox', 2814, 355, 28, 40),
  prop('boat-first-fold', 'boat', 2964, 430, 42, 18),
  prop('boat-second-fold', 'boat', 3276, 430, 42, 18, 1),
  prop('mailbox-last-letter', 'mailbox', 3440, 345, 28, 40, 1),
]);

export const PRACTICE_PROPS: readonly WorldProp[] = Object.freeze([
  LEVEL_PROPS[0], LEVEL_PROPS[1], LEVEL_PROPS[2],
]);

/** Draw in world coordinates, after surfaces and before interactive objects. */
export function drawWorldProps(
  ctx: CanvasRenderingContext2D, world: PropWorld, options: PropOptions = {},
): void {
  const visible = world.mode === 'practice' ? PRACTICE_PROPS : LEVEL_PROPS;
  const motion = !options.reducedMotion && !options.idle;
  for (const item of visible) {
    if (item.x + item.width < world.cameraX || item.x > world.cameraX + VIEW_WIDTH) continue;
    const near = Math.abs(world.x + 14 - item.x - item.width / 2) < 104
      && Math.abs(world.y + 40 - item.y) < 80;
    // Only a passing visitor turns a pinwheel or wakes a radio display.
    const active = motion && near && Math.abs(world.vx) > 18;
    const phase = active ? Math.floor(world.time * 7) % 4 : 0;
    ctx.save();
    ctx.translate(Math.round(item.x / 2) * 2, Math.round((item.y - item.height) / 2) * 2);
    ctx.imageSmoothingEnabled = false;
    const rect = (x: number, y: number, width: number, height: number, color = INK) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width, height);
    };

    if (item.kind === 'ticket') {
      // A narrow, torn stub rather than the square frame used for photo pickups.
      rect(2, 0, 24, 10); rect(0, 2, 28, 6);
      rect(2, 2, 24, 6, AMBER);
      rect(item.variant ? 6 : 18, 2, 2, 6, CORAL);
      rect(10, 2, 2, 2); rect(10, 6, 2, 2);
      rect(2, 4, 2, 2); rect(24, 4, 2, 2);
    } else if (item.kind === 'pinwheel') {
      rect(10, 20, 4, 26); rect(12, 24, 2, 20, PAPER);
      // Four orthogonal pixel-cut blades; no smooth spinning or particle trail.
      const blades = [[2, 2, 10, 8], [14, 2, 8, 10], [12, 14, 10, 8], [2, 12, 8, 10]];
      const colors = item.variant ? [PAPER, CORAL, AMBER, CORAL] : [CORAL, PAPER, CORAL, AMBER];
      for (let i = 0; i < blades.length; i++) {
        const [x, y, width, height] = blades[i];
        rect(x, y, width, height);
        rect(x + 2, y + 2, width - 4, height - 4, colors[(i + phase) % 4]);
      }
      rect(8, 8, 8, 8); rect(10, 10, 4, 4, MINT);
    } else if (item.kind === 'radio') {
      rect(8, 0, 22, 4); rect(10, 2, 18, 2, PAPER);
      rect(0, 4, 38, 22); rect(2, 6, 34, 16, CORAL);
      rect(4, 8, 12, 12); rect(6, 10, 8, 8, PAPER);
      rect(8, 10, 2, 8); rect(12, 10, 2, 8);
      rect(20, 8, 14, 8); rect(22, 10, 10, 2, MINT);
      if (active) rect(22 + (phase % 3) * 4, 12, 2, 2, MINT);
      rect(20, 18, 4, 2, PAPER); rect(28, 18, 4, 2, item.variant ? AMBER : PAPER);
      rect(4, 24, 6, 2); rect(28, 24, 6, 2);
    } else if (item.kind === 'mailbox') {
      rect(12, 22, 4, 18); rect(14, 24, 2, 16, PAPER);
      rect(4, 0, 20, 2); rect(2, 2, 24, 22); rect(0, 6, 28, 14);
      rect(4, 4, 20, 18, CORAL); rect(2, 8, 24, 10, CORAL);
      rect(6, 8, 16, 4); rect(8, 10, 12, 2, PAPER);
      // One mailbox contains an uncollected letter, not a new interaction prompt.
      if (item.variant) { rect(8, 6, 12, 4, PAPER); rect(16, 6, 2, 2, MINT); }
      rect(6, 18, 6, 2, PAPER);
    } else {
      // Horizontal folded silhouette with a clear crease, not a floating reward.
      rect(16, 0, 4, 2); rect(12, 2, 12, 2); rect(8, 4, 20, 2);
      rect(6, 6, 26, 2); rect(0, 8, 42, 4); rect(4, 12, 34, 2); rect(8, 14, 26, 4);
      rect(16, 2, 4, 6, PAPER); rect(12, 4, 4, 4, PAPER); rect(8, 6, 4, 2, PAPER);
      rect(20, 4, 4, 4, item.variant ? MINT : AMBER); rect(24, 6, 4, 2, PAPER);
      rect(4, 10, 34, 2, PAPER); rect(8, 12, 26, 2, PAPER);
      rect(12, 14, 18, 2, item.variant ? MINT : CORAL);
      rect(20, 10, 2, 4);
    }
    ctx.restore();
  }
}
