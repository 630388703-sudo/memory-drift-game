export type PhotoTrace = { id: number; at: number; version: "A" | "B" | "C"; altered: boolean };
export type PhotoSlots = Array<PhotoTrace | null>;
export const emptyPhotoSlots = (): PhotoSlots => Array.from({ length: 5 }, () => null);

// Slot positions remain fixed when a photo is lost. Age, not position, decides replacement.
export function storePhoto(slots: PhotoSlots, photo: PhotoTrace): PhotoSlots {
  const next = [...slots];
  let index = next.findIndex(value => value === null);
  if (index < 0) index = oldestPhotoIndex(next);
  if (index >= 0) next[index] = photo;
  return next;
}

function oldestPhotoIndex(slots: PhotoSlots): number {
  return slots.reduce((oldest, value, index) => !value ? oldest : oldest < 0 || value.at < slots[oldest]!.at || (value.at === slots[oldest]!.at && value.id < slots[oldest]!.id) ? index : oldest, -1);
}

export function alterPhoto(slots: PhotoSlots): PhotoSlots {
  const index = oldestPhotoIndex(slots);
  if (index < 0) return slots;
  return slots.map((photo, slot) => slot === index && photo ? { ...photo, altered: true } : photo);
}

export function losePhoto(slots: PhotoSlots): PhotoSlots {
  const index = slots.reduce((latest, value, slot) => !value ? latest : latest < 0 || value.at > slots[latest]!.at || (value.at === slots[latest]!.at && value.id > slots[latest]!.id) ? slot : latest, -1);
  if (index < 0) return slots;
  return slots.map((photo, slot) => slot === index ? null : photo);
}

export const photoCount = (slots: PhotoSlots): number => slots.filter(Boolean).length;
