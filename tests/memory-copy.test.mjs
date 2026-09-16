import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/MemoryRushGame.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('MemoryRushGame.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const feedbackSource = source.slice(source.indexOf('const feedbackEn ='), source.indexOf('const checkpointOptions'));
const translated = ts.transpileModule(feedbackSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const feedbackEn = vm.runInNewContext(`${translated};feedbackEn`);

test('every live feedback sentence has an English translation', () => {
  const sentences = new Set();
  function collect(node) {
    if (ts.isStringLiteral(node) && /[\u3400-\u9fff]/.test(node.text)) sentences.add(node.text);
    ts.forEachChild(node, collect);
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'setFeedback') node.arguments.forEach(collect);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(sentences.size >= 12);
  for (const sentence of sentences) {
    assert.notEqual(feedbackEn(sentence), sentence, sentence);
    assert.ok(!/[\u3400-\u9fff]/.test(feedbackEn(sentence)), sentence);
  }
  assert.equal(feedbackEn('连续接住 ×4'), 'Caught in a row ×4');
});

test('fault styling matches the new plain-language feedback, not protection feedback', () => {
  const expression = source.match(/data-fault=\{([^}]+)\}/)?.[1];
  assert.ok(expression);
  const fault = text => vm.runInNewContext(expression, {feedback:text});
  for (const text of ['撞到了，少了一张照片。','撞到了，画面晃了一下。','碰到泡泡，混进了一段假记忆。','存满了，最早的一张被换掉了。']) assert.equal(fault(text), true, text);
  for (const text of ['挡住泡泡了，照片没变。','挡住了，照片还在。','接住一张照片。']) assert.equal(fault(text), false, text);
});

test('every visit starts in English without reading a stale language preference', () => {
  assert.match(source, /const \[language, setLanguage\] = useState<"zh" \| "en">\("en"\)/);
  assert.ok(!source.includes('localStorage.getItem("memory-rush-language")'));
  assert.ok(!source.includes('localStorage.setItem("memory-rush-language"'));
});

test('retired mechanic instructions cannot return to the active copy', () => {
  for (const phrase of ['旧磁带','停摆时钟','褪色票根','残影替你','装置正在把一次触碰转换','记忆能力已生效','记不清的，就先放一放']) assert.ok(!source.includes(phrase), phrase);
});

const recallSource = readFileSync(new URL('../app/memory-recall.ts', import.meta.url), 'utf8');
const recallCode = ts.transpileModule(recallSource.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const recall = vm.runInNewContext(`${recallCode};({COUNT_OPTIONS, moveCount, recallLabel, comparisonState})`);
test('uncertainty is reachable and never displayed as zero people', () => {
  assert.equal(recall.moveCount(5, 1), 0);
  assert.equal(recall.moveCount(3, -1), 0);
  assert.equal(recall.moveCount(0, 1), 3);
  for (const value of [0, 'unknown']) {
    assert.equal(recall.recallLabel(value, 'zh'), '记不清了');
    assert.equal(recall.recallLabel(value, 'en'), 'Not sure');
    assert.equal(recall.comparisonState(value, 4), 'uncertain');
  }
  assert.equal(recall.comparisonState(4, 4), 'same');
  assert.equal(recall.comparisonState(5, 4), 'different');
  assert.equal(recall.comparisonState(undefined, 4), 'missing');
  assert.equal(recall.recallLabel(undefined, 'en'), '—');
});

test('the intro has one photo entry and comments identify their source', () => {
  assert.ok(!source.includes('className="rush-skip"'));
  assert.ok(source.includes('开始看照片'));
  assert.ok(source.includes('OTHER PEOPLE’S COMMENTS'));
  assert.ok(source.includes('游戏虚构'));
  assert.ok(source.includes('Comments: '));
  assert.ok(!source.includes('This game alone cannot tell'));
  assert.ok(!source.includes('一次答错或改答案'));
});

const faultSource = readFileSync(new URL('../app/photo-fault.ts', import.meta.url), 'utf8');
const faultCode = ts.transpileModule(faultSource.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const photoFault = vm.runInNewContext(`${faultCode};({photoFaultStrength, drawPhotoFault})`);

test('photo faults are brief, stop when reduced or paused, and leave the original clean', () => {
  const strength = photoFault.photoFaultStrength;
  assert.equal(strength(210, 0, 'A', 0, false), 0);
  assert.ok(strength(210, 0, 'B', 0, false) > .7);
  assert.equal(strength(500, 0, 'B', 0, false), 0);
  assert.equal(strength(210, 0, 'C', 1050, true), 0);
  assert.equal(strength(1051, 0, 'A', 1050, false), 0);
  for (let time = 0; time < 24000; time += 37) {
    const value = strength(time, 2, 'C', 840, false);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});

test('photo faults stay clipped to the image and restore canvas state', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, key) => (...args) => calls.push([key, ...args]),
    set: (_, key, value) => {calls.push([key, value]); return true;},
  });
  const image = {naturalWidth:400, naturalHeight:600};
  photoFault.drawPhotoFault(ctx, image, 200, 300, 100, 150, 0);
  assert.equal(calls.length, 0);
  photoFault.drawPhotoFault(ctx, image, 200, 300, 100, 150, .7);
  assert.equal(calls[0][0], 'save');
  assert.equal(calls.at(-1)[0], 'restore');
  assert.equal(calls.filter(c=>c[0]==='drawImage').length, 5);
  assert.ok(calls.findIndex(c=>c[0]==='clip') < calls.findIndex(c=>c[0]==='drawImage'));
  const clip = calls.find(c=>c[0]==='rect');
  assert.deepEqual(clip, ['rect',166,255,68,87]);
});
