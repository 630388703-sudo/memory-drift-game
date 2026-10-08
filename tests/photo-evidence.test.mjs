import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPhotoSlots, storePhoto, losePhoto, alterPhoto } from '../app/memory-storage.ts';
import { snapshotPhotos, summarizePhotos, firstCarriedSlot } from '../app/photo-evidence.ts';

const photo = (id, at = id, version = 'A', altered = false) => ({ id, at, version, altered });

test('empty collections have no evidence and no selected fragment', () => {
  const slots = emptyPhotoSlots();
  assert.deepEqual(summarizePhotos(slots), { retained: 0, clear: 0, damaged: 0 });
  assert.equal(firstCarriedSlot(slots), -1);
  assert.deepEqual(snapshotPhotos(slots), [null, null, null, null, null]);
  assert.notEqual(snapshotPhotos(slots), slots);
});

test('collecting a fragment makes only its matching image strip available', () => {
  const slots = storePhoto(emptyPhotoSlots(), photo(4));
  assert.deepEqual(summarizePhotos(slots), { retained: 1, clear: 1, damaged: 0 });
  assert.equal(firstCarriedSlot(slots), 3);
  assert.deepEqual(snapshotPhotos(slots), [null, null, null, photo(4), null]);
});

test('losing a photo reduces evidence without filling or reordering empty slots', () => {
  const slots = [photo(1, 30), null, photo(3, 10), photo(4, 20), null];
  const after = losePhoto(slots);
  assert.deepEqual(summarizePhotos(after), { retained: 2, clear: 2, damaged: 0 });
  assert.equal(firstCarriedSlot(after), 2);
  assert.deepEqual(snapshotPhotos(after), [null, null, photo(3, 10), photo(4, 20), null]);
});

test('interference progressively obscures clear fragments without changing source or identity', () => {
  const slots = [photo(1, 10, 'A'), null, photo(13, 20, 'C'), null, null];
  const after = alterPhoto(slots);
  assert.deepEqual(summarizePhotos(after), { retained: 2, clear: 1, damaged: 1 });
  assert.deepEqual(snapshotPhotos(after)[0], { ...slots[0], altered: true });
  assert.equal(firstCarriedSlot(after), 0);
  const allDamaged = alterPhoto(after);
  assert.deepEqual(summarizePhotos(allDamaged), { retained: 2, clear: 0, damaged: 2 });
  assert.deepEqual(allDamaged[2], { ...slots[2], altered: true });
  assert.equal(alterPhoto(allDamaged), allDamaged);
  assert.deepEqual(summarizePhotos(slots), { retained: 2, clear: 2, damaged: 0 });
});

test('later pickup repairs its damaged strip while a duplicate clear strip does nothing', () => {
  const slots = [photo(1, 50), photo(2, 40), photo(3, 10, 'A', true), photo(4, 30), photo(5, 20)];
  const before = snapshotPhotos(slots);
  assert.equal(storePhoto(slots, photo(11, 55, 'C')), slots);
  const after = storePhoto(slots, photo(13, 60, 'C'));
  assert.deepEqual(summarizePhotos(before), { retained: 5, clear: 4, damaged: 1 });
  assert.deepEqual(summarizePhotos(after), { retained: 5, clear: 5, damaged: 0 });
  assert.equal(after[2].id, 13);
  assert.equal(before[2].id, 3);
  assert.equal(before[2].altered, true);
  assert.equal(firstCarriedSlot(after), 0);
});

test('pickup stages describe when a fragment was collected rather than different image sources', () => {
  const slots = [photo(1, 1, 'A'), photo(7, 2, 'B'), photo(13, 3, 'C'), null, null];
  const snapshot = snapshotPhotos(slots);
  assert.deepEqual(summarizePhotos(snapshot), { retained: 3, clear: 3, damaged: 0 });
  assert.deepEqual(snapshot, slots);
  for (const fragment of snapshot.filter(Boolean)) {
    assert.deepEqual(Object.keys(fragment).sort(), ['altered', 'at', 'id', 'version']);
    assert.equal('recall' in fragment, false);
    assert.equal('count' in fragment, false);
  }
});

test('snapshots isolate every fragment from later gameplay operations and direct mutation', () => {
  const slots = [photo(1), null, photo(8, 2, 'B'), null, null];
  const snapshot = snapshotPhotos(slots);
  assert.notEqual(snapshot, slots);
  assert.notEqual(snapshot[0], slots[0]);
  assert.notEqual(snapshot[2], slots[2]);
  const later = storePhoto(losePhoto(alterPhoto(slots)), photo(13, 3, 'C'));
  assert.deepEqual(snapshot, [photo(1), null, photo(8, 2, 'B'), null, null]);
  slots[0].altered = true;
  slots[2].version = 'C';
  slots[2] = null;
  assert.deepEqual(snapshot, [photo(1), null, photo(8, 2, 'B'), null, null]);
  snapshot[0].id = 999;
  assert.equal(slots[0].id, 1);
  assert.deepEqual(summarizePhotos(later), { retained: 2, clear: 1, damaged: 1 });
});

test('a replay reset leaves the previous evidence snapshot intact without carrying pieces over', () => {
  const previous = snapshotPhotos([photo(6, 10, 'B'), null, photo(13, 20, 'C', true), null, null]);
  const nextRun = emptyPhotoSlots();
  assert.deepEqual(summarizePhotos(nextRun), { retained: 0, clear: 0, damaged: 0 });
  assert.deepEqual(summarizePhotos(previous), { retained: 2, clear: 1, damaged: 1 });
  const collected = storePhoto(nextRun, photo(3, 1));
  assert.equal(collected[2].altered, false);
  assert.equal(previous[2].altered, true);
  assert.equal(previous[2].id, 13);
  assert.equal(nextRun[2], null);
});

test('summaries and selection read frozen slots without mutating them', () => {
  const slots = Object.freeze([null, Object.freeze(photo(7, 10, 'B', true)), null, null, null]);
  assert.deepEqual(summarizePhotos(slots), { retained: 1, clear: 0, damaged: 1 });
  assert.equal(firstCarriedSlot(slots), 1);
  const snapshot = snapshotPhotos(slots);
  assert.deepEqual(snapshot, slots);
  assert.notEqual(snapshot[1], slots[1]);
});
