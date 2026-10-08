export type PhotoTrace = { id: number; at: number; version: "A" | "B" | "C"; altered: boolean };
export type PhotoSlots = Array<PhotoTrace | null>;
export const emptyPhotoSlots = (): PhotoSlots => Array.from({ length: 5 }, () => null);

// The five slots are fixed left-to-right strips of the opening photograph.
// Pickups 1-5, 6-10 and 11-15 offer the same five strips at different points.
export function fragmentIndex(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError("Fragment id must be a positive safe integer");
  return (id - 1) % 5;
}

export function storePhoto(slots: PhotoSlots, photo: PhotoTrace): PhotoSlots {
  const index = fragmentIndex(photo.id);
  if (slots[index] && !slots[index]!.altered) return slots;
  const next = [...slots];
  next[index] = photo;
  return next;
}

function oldestClearFragmentIndex(slots: PhotoSlots): number {
  return slots.reduce((oldest, value, index) => !value || value.altered ? oldest : oldest < 0 || value.at < slots[oldest]!.at || (value.at === slots[oldest]!.at && value.id < slots[oldest]!.id) ? index : oldest, -1);
}

export function alterPhoto(slots: PhotoSlots): PhotoSlots {
  const index = oldestClearFragmentIndex(slots);
  if (index < 0) return slots;
  return slots.map((photo, slot) => slot === index && photo ? { ...photo, altered: true } : photo);
}

export function losePhoto(slots: PhotoSlots): PhotoSlots {
  const index = slots.reduce((latest, value, slot) => !value ? latest : latest < 0 || value.at > slots[latest]!.at || (value.at === slots[latest]!.at && value.id > slots[latest]!.id) ? slot : latest, -1);
  if (index < 0) return slots;
  return slots.map((photo, slot) => slot === index ? null : photo);
}

export const photoCount = (slots: PhotoSlots): number => slots.filter(Boolean).length;
