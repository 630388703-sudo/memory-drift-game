import type { PhotoSlots } from "./memory-storage";

// Each fixed slot holds one left-to-right fragment of the opening image.
// A/B/C record the pickup stage, not a different source. Interference obscures
// that fragment; it never changes the opening image or the player's answers.
export function snapshotPhotos(slots: PhotoSlots): PhotoSlots {
  return slots.map(photo => photo ? { ...photo } : null);
}

export function summarizePhotos(slots: PhotoSlots): { retained: number; clear: number; damaged: number } {
  return slots.reduce((summary, photo) => {
    if (photo) {
      summary.retained += 1;
      if (photo.altered) summary.damaged += 1;
      else summary.clear += 1;
    }
    return summary;
  }, { retained: 0, clear: 0, damaged: 0 });
}

export function firstCarriedSlot(slots: PhotoSlots): number {
  return slots.findIndex(photo => photo !== null);
}
