import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto } from '../app/memory-storage.ts';
import { snapshotPhotos, summarizePhotos, firstCarriedSlot } from '../app/photo-evidence.ts';

const photo = (id, at = id, version = 'A', altered = false) => ({ id, at, version, altered });

test('empty collections have no evidence and no selected photo', () => {
  const slots = emptyPhotoSlots();
  assert.deepEqual(summarizePhotos(slots), { retained: 0, clear: 0, damaged: 0 });
  assert.equal(firstCarriedSlot(slots), -1);
  assert.deepEqual(snapshotPhotos(slots), [null, null, null, null, null]);
  assert.notEqual(snapshotPhotos(slots), slots);
});

test('collecting a photo makes one clear copy available', () => {
  const slots = storePhoto(emptyPhotoSlots(), photo(1));
  assert.deepEqual(summarizePhotos(slots), { retained: 1, clear: 1, damaged: 0 });
  assert.equal(firstCarriedSlot(slots), 0);
  assert.deepEqual(snapshotPhotos(slots), [photo(1), null, null, null, null]);
});

test('losing a photo reduces evidence without filling or reordering empty slots', () => {
  const slots = [photo(1, 30), null, photo(2, 10), photo(3, 20), null];
  const after = losePhoto(slots);
  assert.deepEqual(summarizePhotos(after), { retained: 2, clear: 2, damaged: 0 });
  assert.equal(firstCarriedSlot(after), 2);
  assert.deepEqual(snapshotPhotos(after), [null, null, photo(2, 10), photo(3, 20), null]);
});

test('interference marks an existing copy unreadable without changing its source or identity', () => {
  const slots = [photo(1, 10, 'A'), null, photo(2, 20, 'C'), null, null];
  const after = alterPhoto(slots);
  assert.deepEqual(summarizePhotos(after), { retained: 2, clear: 1, damaged: 1 });
  assert.deepEqual(snapshotPhotos(after)[0], { ...slots[0], altered: true });
  assert.equal(firstCarriedSlot(after), 0);
  assert.deepEqual(summarizePhotos(alterPhoto(after)), { retained: 2, clear: 1, damaged: 1 });
  assert.deepEqual(summarizePhotos(slots), { retained: 2, clear: 2, damaged: 0 });
});

test('full storage replaces the oldest copy and summaries reflect the new state', () => {
  const slots = [photo(1, 50), photo(2, 40), photo(99, 10, 'A', true), photo(4, 30), photo(5, 20)];
  const before = snapshotPhotos(slots);
  const after = storePhoto(slots, photo(100, 60, 'C'));
  assert.deepEqual(summarizePhotos(before), { retained: 5, clear: 4, damaged: 1 });
  assert.deepEqual(summarizePhotos(after), { retained: 5, clear: 5, damaged: 0 });
  assert.equal(after[2].id, 100);
  assert.equal(before[2].id, 99);
  assert.equal(firstCarriedSlot(after), 0);
});

test('all pickup stages have the same evidence meaning and preserve only existing photo fields', () => {
  const slots = [photo(1, 1, 'A'), photo(2, 2, 'B'), photo(3, 3, 'C'), null, null];
  const snapshot = snapshotPhotos(slots);
  assert.deepEqual(summarizePhotos(snapshot), { retained: 3, clear: 3, damaged: 0 });
  assert.deepEqual(snapshot, slots);
  for (const copy of snapshot.filter(Boolean)) {
    assert.deepEqual(Object.keys(copy).sort(), ['altered', 'at', 'id', 'version']);
    assert.equal('recall' in copy, false);
    assert.equal('count' in copy, false);
  }
});

test('snapshots isolate every photo from later gameplay operations and direct mutation', () => {
  const slots = [photo(1), null, photo(2, 2, 'B'), null, null];
  const snapshot = snapshotPhotos(slots);
  assert.notEqual(snapshot, slots);
  assert.notEqual(snapshot[0], slots[0]);
  assert.notEqual(snapshot[2], slots[2]);
  const later = storePhoto(losePhoto(alterPhoto(slots)), photo(3, 3, 'C'));
  assert.deepEqual(snapshot, [photo(1), null, photo(2, 2, 'B'), null, null]);
  slots[0].altered = true;
  slots[2].version = 'C';
  slots[2] = null;
  assert.deepEqual(snapshot, [photo(1), null, photo(2, 2, 'B'), null, null]);
  snapshot[0].id = 999;
  assert.equal(slots[0].id, 1);
  assert.deepEqual(summarizePhotos(later), { retained: 2, clear: 1, damaged: 1 });
});

test('summaries and selection read frozen slots without mutating them', () => {
  const slots = Object.freeze([null, Object.freeze(photo(7, 10, 'B', true)), null, null, null]);
  assert.deepEqual(summarizePhotos(slots), { retained: 1, clear: 0, damaged: 1 });
  assert.equal(firstCarriedSlot(slots), 1);
  const snapshot = snapshotPhotos(slots);
  assert.deepEqual(snapshot, slots);
  assert.notEqual(snapshot[1], slots[1]);
});
