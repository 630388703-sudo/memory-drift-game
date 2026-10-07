import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueLines, dialogueSummary } from '../app/memory-dialogue.ts';

const answers = [3, 4, 5, 0, undefined];
const languages = ['zh', 'en'];

test('the opening exchange is tentative, with the second character responding to the first', () => {
  const zh = dialogueLines(1, undefined, 'zh');
  const en = dialogueLines(1, undefined, 'en');
  assert.deepEqual(zh.map(line => line.speaker), ['小林', '阿禾']);
  assert.deepEqual(en.map(line => line.speaker), ['Lin', 'Rowan']);
  assert.match(zh[0].text, /好像.*五个人/);
  assert.match(zh[1].text, /听你这么一说/);
  assert.match(en[0].text, /Was it five\?/);
  assert.match(en[1].text, /Now that you mention it/);
});

test('the opening script does not use an answer that has not happened yet', () => {
  for (const language of languages) {
    const first = dialogueLines(1, undefined, language);
    for (const answer of answers) assert.deepEqual(dialogueLines(1, answer, language), first);
  }
});

test('each branch has two distinct stable ids and a valid in-pair reply relationship', () => {
  for (const zone of [1, 2]) {
    for (const answer of answers) {
      const zh = dialogueLines(zone, answer, 'zh');
      const en = dialogueLines(zone, answer, 'en');
      assert.equal(zh.length, 2);
      assert.equal(en.length, 2);
      assert.notEqual(zh[0].id, zh[1].id);
      assert.equal(zh[0].replyTo, undefined);
      assert.equal(zh[1].replyTo, zh[0].id);
      assert.equal(en[1].replyTo, en[0].id);
      assert.deepEqual(zh.map(line => line.id), en.map(line => line.id));
      assert.ok([...zh, ...en].every(line => line.text.trim() && line.speaker.trim()));
    }
  }
});

test('three is quoted as disagreement, not silently rewritten to five', () => {
  const zh = dialogueLines(2, 3, 'zh');
  const en = dialogueLines(2, 3, 'en');
  assert.match(zh[0].text, /选了三个/);
  assert.match(zh[1].text, /没那么确定/);
  assert.match(en[0].text, /picked three/);
  assert.match(en[1].text, /less sure/);
  assert.match(dialogueSummary(3, 'zh'), /第二次选了三人/);
  assert.match(dialogueSummary(3, 'en'), /second answer was three/);
});

test('four preserves the player answer and questions the alleged fifth person', () => {
  const zh = dialogueLines(2, 4, 'zh');
  const en = dialogueLines(2, 4, 'en');
  assert.match(zh[0].text, /选了四个/);
  assert.match(zh[1].text, /第五个人.*在哪儿/);
  assert.match(en[0].text, /picked four, not five/);
  assert.match(en[1].text, /where was that fifth person/);
  assert.match(dialogueSummary(4, 'zh'), /第二次选了四人/);
  assert.match(dialogueSummary(4, 'en'), /second answer was four/);
});

test('only five strengthens the characters agreement', () => {
  for (const language of languages) {
    const endorsement = language === 'zh' ? /更确定/ : /settles it/;
    assert.match(dialogueLines(2, 5, language)[1].text, endorsement);
    for (const answer of [3, 4, 0, undefined]) {
      assert.doesNotMatch(dialogueLines(2, answer, language)[1].text, endorsement);
    }
  }
  assert.match(dialogueLines(2, 5, 'zh')[0].text, /也选了五个/);
  assert.match(dialogueLines(2, 5, 'en')[0].text, /picked five too/);
  assert.match(dialogueSummary(5, 'zh'), /第二次也选了五人/);
  assert.match(dialogueSummary(5, 'en'), /second answer was five/);
});

test('zero remains explicit uncertainty and never becomes a zero-person answer or assent', () => {
  const zh = dialogueLines(2, 0, 'zh');
  const en = dialogueLines(2, 0, 'en');
  assert.match(zh[0].text, /记不清了/);
  assert.match(zh[1].text, /不能算.*同意/);
  assert.match(en[0].text, /Not sure/);
  assert.match(en[1].text, /not another vote/);
  assert.doesNotMatch(zh.map(line => line.text).join(' '), /零人|0 人|选了五个/);
  assert.doesNotMatch(en.map(line => line.text).join(' '), /zero people|0 people|picked five/);
  assert.match(dialogueSummary(0, 'zh'), /没有被算作.*认同/);
  assert.match(dialogueSummary(0, 'en'), /not counted as agreement/);
});

test('missing and unsupported input cannot invent a submitted answer', () => {
  for (const language of languages) {
    const missing = dialogueLines(2, undefined, language);
    const uncertain = dialogueLines(2, 0, language);
    assert.notDeepEqual(missing, uncertain);
    assert.notEqual(dialogueSummary(undefined, language), dialogueSummary(0, language));
    for (const value of [-1, 1, 6, 4.5, NaN, Infinity]) {
      assert.deepEqual(dialogueLines(2, value, language), missing);
      assert.equal(dialogueSummary(value, language), dialogueSummary(undefined, language));
    }
  }
  assert.match(dialogueLines(2, undefined, 'zh')[0].text, /还没有.*回答/);
  assert.match(dialogueLines(2, undefined, 'en')[0].text, /no answer/);
  assert.match(dialogueSummary(undefined, 'zh'), /没有引用你的选择/);
  assert.match(dialogueSummary(undefined, 'en'), /do not quote a choice/);
});

test('summaries stay brief and describe the exchange without diagnosing the player', () => {
  for (const answer of answers) {
    assert.ok(dialogueSummary(answer, 'zh').length <= 40);
    assert.ok(dialogueSummary(answer, 'en').length <= 110);
    assert.doesNotMatch(dialogueSummary(answer, 'zh'), /你被骗|你被操纵|你记错|其他真实玩家|在线人数/);
    assert.doesNotMatch(dialogueSummary(answer, 'en'), /you were manipulated|you were fooled|you remembered wrong|real players|players online/i);
  }
});

test('returned lines are independent so previous views and runs cannot alter future dialogue', () => {
  const original = dialogueLines(2, 4, 'zh');
  const changed = dialogueLines(2, 4, 'zh');
  changed[0].text = 'changed';
  changed[1].replyTo = 'missing';
  changed.push({ id: 'extra', speaker: 'extra', text: 'extra' });
  assert.deepEqual(dialogueLines(2, 4, 'zh'), original);
  assert.equal(dialogueLines(1, undefined, 'zh').length, 2);
});
