import type { PhotoSlots, PhotoTrace } from "./memory-storage";

export type SlotChange = {
  kind: "collect" | "replace" | "alter" | "lose";
  previous: PhotoTrace | null;
  key: string;
};

// Describe an actual storage change; never change photos, their order, or their age.
export function photoSlotChanges(before: PhotoSlots, after: PhotoSlots, at: number): Array<SlotChange | null> {
  return after.map((photo, index) => {
    const previous = before[index];
    if (photo === previous) return null;
    const kind = !photo ? "lose" : !previous ? "collect" : photo.id !== previous.id ? "replace" : "alter";
    return { kind, previous: previous ? { ...previous } : null, key: `${at}:${index}:${photo?.id ?? previous?.id}:${kind}` };
  });
}
