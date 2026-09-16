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

test('retired mechanic instructions cannot return to the active copy', () => {
  for (const phrase of ['旧磁带','停摆时钟','褪色票根','残影替你','装置正在把一次触碰转换','记忆能力已生效']) assert.ok(!source.includes(phrase), phrase);
});
