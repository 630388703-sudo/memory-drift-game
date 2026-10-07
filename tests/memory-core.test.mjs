import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPhotoSlots, storePhoto, losePhoto, alterPhoto, photoCount,
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

test('collection fills the first empty slot without moving existing photos', () => {
  const first = photo(1);
  const third = photo(3);
  const before = freezeSlots(first, null, third, null, null);
  const incoming = photo(4);
  const after = storePhoto(before, incoming);
  assert.deepEqual(after, [first, incoming, third, null, null]);
  assert.equal(after.length, 5);
  assert.equal(photoCount(after), 3);
  assert.notEqual(after, before);
  assert.deepEqual(before, [first, null, third, null, null]);
});

test('a sixth photo replaces the oldest timestamp, not a fixed slot or lowest id', () => {
  const before = freezeSlots(photo(1, 50), photo(2, 40), photo(99, 10), photo(4, 30), photo(5, 20));
  const incoming = photo(100, 60);
  const after = storePhoto(before, incoming);
  assert.equal(after[2], incoming);
  for (const index of [0, 1, 3, 4]) assert.equal(after[index], before[index]);
  assert.equal(photoCount(after), 5);
  assert.equal(before[2].id, 99);
});

test('collision removes the newest photo and leaves its slot empty', () => {
  const before = freezeSlots(photo(5, 20), photo(2, 70), null, photo(3, 30), photo(4, 40));
  const after = losePhoto(before);
  assert.deepEqual(after, [before[0], null, null, before[3], before[4]]);
  assert.equal(photoCount(after), 3);
  assert.notEqual(after, before);
  assert.equal(before[1].id, 2);
  const refilled = storePhoto(after, photo(6, 80));
  assert.equal(refilled[1].id, 6);
  assert.equal(refilled[2], null);
});

test('interference changes only the oldest photo, preserving identity and input', () => {
  const before = freezeSlots(photo(1, 30), null, photo(2, 10), photo(3, 20), null);
  const after = alterPhoto(before);
  assert.notEqual(after, before);
  assert.notEqual(after[2], before[2]);
  assert.deepEqual(after[2], { ...before[2], altered: true });
  assert.equal(before[2].altered, false);
  for (const index of [0, 1, 3, 4]) assert.equal(after[index], before[index]);
  assert.equal(photoCount(after), photoCount(before));
});

test('equal timestamps use photo id as the age tie-breaker', () => {
  const before = freezeSlots(photo(8, 100), photo(2, 100), photo(5, 100), photo(9, 100), photo(3, 100));
  assert.equal(storePhoto(before, photo(10, 101))[1].id, 10);
  assert.equal(alterPhoto(before)[1].altered, true);
  assert.equal(losePhoto(before)[3], null);
  assert.deepEqual(before.map(item => item.id), [8, 2, 5, 9, 3]);
  assert.ok(before.every(item => !item.altered));
});

test('empty slots are safe for loss and interference and never create a photo', () => {
  const before = Object.freeze(emptyPhotoSlots());
  assert.equal(losePhoto(before), before);
  assert.equal(alterPhoto(before), before);
  assert.equal(photoCount(before), 0);
  assert.deepEqual(before, [null, null, null, null, null]);
});

test('repeated interference never changes the oldest photo identity or age', () => {
  const before = freezeSlots(photo(1, 10, true), photo(2, 20), null, null, null);
  const after = alterPhoto(before);
  assert.deepEqual(after[0], before[0]);
  assert.notEqual(after[0], before[0]);
  assert.equal(after[1], before[1]);
  assert.equal(after[1].altered, false);
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
