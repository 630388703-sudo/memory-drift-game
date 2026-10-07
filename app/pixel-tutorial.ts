import type { WorldState } from './pixel-world';

export type PracticeStep = 'move' | 'jump' | 'collect' | 'protect' | 'done';
export const PRACTICE_STEPS = ['move', 'jump', 'collect', 'protect'] as const;

/** Completion comes from actual play, never from a timer or dismissing instructions. */
export function practiceStep(world: WorldState): PracticeStep {
  if (world.stats.distance < 85) return 'move';
  if (world.stats.jumps < 1) return 'jump';
  if (world.collected.size < 1) return 'collect';
  if (world.stats.blocks < 1) return 'protect';
  return 'done';
}
