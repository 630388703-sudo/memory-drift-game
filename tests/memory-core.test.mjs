import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPhotoSlots, fragmentIndex, storePhoto, losePhoto, alterPhoto, photoCount,
} from '../app/memory-storage.ts';
import {
  COUNT_OPTIONS, moveChoiceIndex, moveCount, recallLabel, comparisonState,
} from '../app/memory-recall.ts';

const photo = (id, at = id, altered = false) => Object.freeze({ id, at, version: 'A', altered });
const freezeSlots = (...photos) => Object.freeze(photos);

test('each collection starts with five independent empty slots', () => {
  const first = emptyPhotoSlots();
  const second = emptyPhotoSlots();
  assert.deepEqual(first, [null, null, null, null, null]);
  assert.notEqual(first, second);
  assert.equal(photoCount(first), 0);
  first[0] = photo(1);
  assert.equal(second[0], null);
});

test('all fifteen pickups map to three sets of five fixed fragment positions', () => {
  for (let set = 0; set < 3; set++) {
    let slots = emptyPhotoSlots();
    for (const position of [4, 2, 0, 3, 1]) {
      const id = set * 5 + position + 1;
      assert.equal(fragmentIndex(id), position);
      slots = storePhoto(slots, photo(id));
      assert.equal(slots[position].id, id);
    }
    assert.deepEqual(slots.map(item => item.id), [1, 2, 3, 4, 5].map(id => id + set * 5));
    assert.equal(photoCount(slots), 5);
  }
});

test('fragment ids must be positive safe integers', () => {
  for (const invalid of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined]) {
    assert.throws(() => fragmentIndex(invalid), RangeError);
    assert.throws(() => storePhoto(emptyPhotoSlots(), photo(invalid)), RangeError);
  }
});

test('collection fills its matching position, not the first empty slot', () => {
  const first = photo(1);
  const third = photo(3);
  const before = freezeSlots(first, null, third, null, null);
  const incoming = photo(4);
  const after = storePhoto(before, incoming);
  assert.deepEqual(after, [first, null, third, incoming, null]);
  assert.equal(after.length, 5);
  assert.equal(photoCount(after), 3);
  assert.notEqual(after, before);
  assert.deepEqual(before, [first, null, third, null, null]);
});

test('duplicate clear fragments never occupy gaps, replace other pieces or refresh age', () => {
  const before = freezeSlots(photo(1, 50), null, photo(3, 10), photo(4, 30), photo(5, 20));
  for (const id of [3, 8, 13]) {
    const after = storePhoto(before, photo(id, 100));
    assert.equal(after, before);
    assert.equal(after[2].id, 3);
    assert.equal(after[2].at, 10);
    assert.equal(after[1], null);
    assert.equal(photoCount(after), 4);
  }
  const full = freezeSlots(photo(1), photo(2), photo(3), photo(4), photo(5));
  assert.equal(storePhoto(full, photo(6, 100)), full);
});

test('a replacement repairs only the matching damaged fragment', () => {
  const before = freezeSlots(photo(1, 10, true), photo(2, 20), photo(3, 30, true), null, null);
  const incoming = photo(8, 80);
  const after = storePhoto(before, incoming);
  assert.equal(after[2], incoming);
  assert.equal(after[2].altered, false);
  assert.equal(after[2].at, 80);
  for (const index of [0, 1, 3, 4]) assert.equal(after[index], before[index]);
  assert.equal(before[2].altered, true);
  assert.equal(photoCount(after), 3);
});

test('collision removes the newest photo and leaves its slot empty', () => {
  const before = freezeSlots(photo(1, 20), photo(2, 70), null, photo(4, 30), photo(5, 40));
  const after = losePhoto(before);
  assert.deepEqual(after, [before[0], null, null, before[3], before[4]]);
  assert.equal(photoCount(after), 3);
  assert.notEqual(after, before);
  assert.equal(before[1].id, 2);
  const refilled = storePhoto(after, photo(7, 80));
  assert.equal(refilled[1].id, 7);
  assert.equal(refilled[2], null);
});

test('interference changes only the oldest photo, preserving identity and input', () => {
  const before = freezeSlots(photo(1, 30), null, photo(3, 10), photo(4, 20), null);
  const after = alterPhoto(before);
  assert.notEqual(after, before);
  assert.notEqual(after[2], before[2]);
  assert.deepEqual(after[2], { ...before[2], altered: true });
  assert.equal(before[2].altered, false);
  for (const index of [0, 1, 3, 4]) assert.equal(after[index], before[index]);
  assert.equal(photoCount(after), photoCount(before));
});

test('equal timestamps use photo id as the age tie-breaker', () => {
  const before = freezeSlots(photo(6, 100), photo(2, 100), photo(8, 100), photo(9, 100), photo(5, 100));
  assert.equal(alterPhoto(before)[1].altered, true);
  assert.equal(losePhoto(before)[3], null);
  assert.deepEqual(before.map(item => item.id), [6, 2, 8, 9, 5]);
  assert.ok(before.every(item => !item.altered));
});

test('empty slots are safe for loss and interference and never create a photo', () => {
  const before = Object.freeze(emptyPhotoSlots());
  assert.equal(losePhoto(before), before);
  assert.equal(alterPhoto(before), before);
  assert.equal(photoCount(before), 0);
  assert.deepEqual(before, [null, null, null, null, null]);
});

test('repeated interference skips damaged fragments and obscures the next clear one', () => {
  const before = freezeSlots(photo(1, 10, true), photo(2, 20), photo(3, 30), null, null);
  const after = alterPhoto(before);
  assert.equal(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.deepEqual(after[1], { ...before[1], altered: true });
  assert.equal(after[2], before[2]);
  const allDamaged = alterPhoto(after);
  assert.deepEqual(allDamaged[2], { ...before[2], altered: true });
  assert.equal(alterPhoto(allDamaged), allDamaged);
  assert.equal(photoCount(allDamaged), 3);
  assert.equal(before[1].altered, false);
  assert.equal(before[2].altered, false);
});

test('an unanswered count remains distinct from an explicit Not sure choice', () => {
  assert.deepEqual(COUNT_OPTIONS, [3, 4, 5, 0]);
  assert.equal(moveChoiceIndex(-1, 1), 0);
  assert.equal(moveChoiceIndex(-1, -1), 3);
  assert.equal(moveCount(-1, 1), 3);
  assert.equal(moveCount(-1, -1), 0);
  assert.equal(comparisonState(undefined, 4), 'missing');
  for (const unknown of [0, 'unknown']) {
    assert.equal(comparisonState(unknown, 4), 'uncertain');
    assert.equal(recallLabel(unknown, 'zh'), '记不清了');
    assert.equal(recallLabel(unknown, 'en'), 'Not sure');
  }
  assert.equal(recallLabel(undefined, 'zh'), '—');
  assert.equal(recallLabel(undefined, 'en'), '—');
});

test('all count options cycle in both directions, including Not sure', () => {
  for (let index = 0; index < COUNT_OPTIONS.length; index++) {
    const next = (index + 1) % COUNT_OPTIONS.length;
    const previous = (index + COUNT_OPTIONS.length - 1) % COUNT_OPTIONS.length;
    assert.equal(moveChoiceIndex(index, 1), next);
    assert.equal(moveChoiceIndex(index, -1), previous);
    assert.equal(moveChoiceIndex(index, 0), index);
    assert.equal(moveCount(COUNT_OPTIONS[index], 1), COUNT_OPTIONS[next]);
    assert.equal(moveCount(COUNT_OPTIONS[index], -1), COUNT_OPTIONS[previous]);
  }
});

test('comparison records agreement, difference and detail labels without grading uncertainty', () => {
  assert.equal(comparisonState(4, 4), 'same');
  assert.equal(comparisonState(5, 4), 'different');
  assert.equal(comparisonState('right', 'right'), 'same');
  assert.equal(comparisonState('pink', 'blue'), 'different');
  assert.equal(comparisonState('unknown', 'blue'), 'uncertain');
  assert.equal(recallLabel(4, 'zh'), '4 人');
  assert.equal(recallLabel(4, 'en'), '4 people');
  assert.equal(recallLabel('right', 'zh'), '右边');
  assert.equal(recallLabel('left', 'zh'), '左边');
  assert.equal(recallLabel('center', 'zh'), '中间');
  assert.equal(recallLabel('right', 'en'), 'Right');
  assert.equal(recallLabel('blue', 'zh'), '蓝色');
  assert.equal(recallLabel('blue', 'en'), 'Blue');
});
