import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/MemoryRushGame.tsx', import.meta.url), 'utf8');
const gestureSource = readFileSync(new URL('../app/memory-feedback.ts', import.meta.url), 'utf8');
const gestureCode = ts.transpileModule(gestureSource.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const gestures = vm.runInNewContext(`${gestureCode};({gestureProgress,addMemoryGesture,drawMemoryGestures,GESTURE_DURATION})`);

test('drawing gestures expire and never accumulate beyond eight events', () => {
  const events = [];
  for (let index=0; index<100; index++) gestures.addMemoryGesture(events,{kind:'collect',x:100,y:200,at:index,seed:index});
  assert.equal(events.length,8);
  assert.equal(events[0].seed,92);
  assert.equal(gestures.gestureProgress(99,100),0);
  assert.equal(gestures.gestureProgress(480,100),.5);
  assert.equal(gestures.gestureProgress(860,100),1);
});

test('all six drawing gestures balance canvas state and leave game coordinates untouched', () => {
  for (const kind of ['collect','replace','bubble','hit','block','protect']) {
    const calls=[];
    const ctx=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
    const event=Object.freeze({kind,x:100,y:200,at:0,seed:2});
    gestures.drawMemoryGestures(ctx,{naturalWidth:400,naturalHeight:600},[event],240,false);
    assert.equal(calls.filter(c=>c[0]==='save').length,calls.filter(c=>c[0]==='restore').length);
    assert.ok(calls.flat().filter(v=>typeof v==='number').every(Number.isFinite));
    assert.equal(event.x,100);assert.equal(event.y,200);
  }
});

test('soft mode uses only a stationary fading mark; expired gestures do not draw', () => {
  const calls=[];
  const ctx=new Proxy({}, {get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true});
  const event={kind:'hit',x:100,y:200,at:0,seed:2};
  gestures.drawMemoryGestures(ctx,{naturalWidth:400,naturalHeight:600},[event],240,true);
  assert.deepEqual(calls.map(c=>c[0]),['save','translate','strokeRect','restore']);
  calls.length=0;
  gestures.drawMemoryGestures(ctx,{naturalWidth:400,naturalHeight:600},[event],760,false);
  assert.equal(calls.length,0);
});
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
  assert.ok(!source.includes('Caught in a row'));
  assert.ok(!source.includes('连续接住'));
  assert.ok(!source.includes('navigator.share'));
  assert.ok(!source.includes('SHARE RESULT'));
});

test('fault styling matches the new plain-language feedback, not protection feedback', () => {
  const expression = source.match(/data-fault=\{([^}]+)\}/)?.[1];
  assert.ok(expression);
  const fault = text => vm.runInNewContext(expression, {feedback:text});
  for (const text of ['撞到了，少了一张照片。','撞到了，画面晃了一下。','碰到泡泡，混进了一段假记忆。','存满了，最早的一张被换掉了。']) assert.equal(fault(text), true, text);
  for (const text of ['挡住泡泡了，照片没变。','挡住了，照片还在。','接住一张照片。']) assert.equal(fault(text), false, text);
});

test('both languages explain the block action without a vague photo-protection label', () => {
  for (const text of ['挡一次碰撞', 'BLOCK ONE HIT', '0.7 seconds', 'within 4 seconds', '接到照片后']) assert.ok(source.includes(text), text);
  for (const text of ['护住照片', 'PROTECT PHOTOS', '护好了']) assert.ok(!source.includes(text), text);
});

test('every visit starts in English without reading a stale language preference', () => {
  assert.match(source, /const \[language, setLanguage\] = useState<"zh" \| "en">\("en"\)/);
  assert.ok(!source.includes('localStorage.getItem("memory-rush-language")'));
  assert.ok(!source.includes('localStorage.setItem("memory-rush-language"'));
});

test('retired mechanic instructions cannot return to the active copy', () => {
  for (const phrase of ['旧磁带','停摆时钟','褪色票根','残影替你','装置正在把一次触碰转换','记忆能力已生效','记不清的，就先放一放']) assert.ok(!source.includes(phrase), phrase);
});

test('copy stays direct while preserving the core question and fictional labels', () => {
  for (const phrase of ['边走边回想', '你是从哪一次开始这样记的', 'Were those comments right?', 'Sometimes they help.', 'MIGHT FORGET']) {
    assert.ok(!source.includes(phrase), phrase);
  }
  assert.ok(source.includes('遗忘是一种缺陷，还是一种自我保护？'));
  assert.ok(source.includes('Is forgetting a flaw, or a way to protect yourself?'));
  assert.ok(source.includes('游戏虚构'));
  assert.ok(source.includes('not posted by real players'));
  assert.ok(source.includes('回答问题时暂停计时'));
});

const recallSource = readFileSync(new URL('../app/memory-recall.ts', import.meta.url), 'utf8');
const recallCode = ts.transpileModule(recallSource.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const recall = vm.runInNewContext(`${recallCode};({COUNT_OPTIONS, moveCount, moveChoiceIndex, recallLabel, comparisonState})`);

test('an unanswered question starts without a selected count', () => {
  assert.equal(recall.moveChoiceIndex(-1, 1), 0);
  assert.equal(recall.moveChoiceIndex(-1, -1), 3);
  assert.equal(recall.moveCount(-1, 1), 3);
  assert.equal(recall.moveCount(-1, -1), 0);
  assert.ok(source.includes('[recallAnswer, setRecallAnswer] = useState(-1)'));
  assert.ok(!source.includes('setRecallAnswer(4)'));
  assert.ok(!source.includes('setChoiceIndex(1)'));
});
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

const storageSource = readFileSync(new URL('../app/memory-storage.ts', import.meta.url), 'utf8');
const storageCode = ts.transpileModule(storageSource.replaceAll('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const storage = vm.runInNewContext(`${storageCode};({emptyPhotoSlots,storePhoto,alterPhoto,losePhoto,photoCount})`);
const photo = (id, at=id) => Object.freeze({id,at,version:'A',altered:false});

test('photo slots retain positions and replace the oldest photo, not a fixed square', () => {
  let slots=storage.emptyPhotoSlots();
  for (let id=1;id<=5;id++) slots=storage.storePhoto(slots,photo(id));
  assert.equal(storage.photoCount(slots),5);
  const before=slots;
  slots=storage.storePhoto(slots,photo(6));
  assert.equal(slots[0].id,6);
  assert.equal(before[0].id,1);
  slots=storage.losePhoto(slots);
  assert.equal(slots[0],null);
  assert.equal(slots[1].id,2);
  slots=storage.storePhoto(slots,photo(7));
  slots=storage.storePhoto(slots,photo(8));
  assert.equal(slots[0].id,7);
  assert.equal(slots[1].id,8);
  assert.equal(storage.photoCount(slots),5);
});

test('bubble alteration changes an existing photo only and never fills an empty collection', () => {
  const empty=storage.emptyPhotoSlots();
  assert.equal(storage.alterPhoto(empty),empty);
  assert.equal(storage.losePhoto(empty),empty);
  let slots=storage.storePhoto(empty,photo(1));
  slots=storage.storePhoto(slots,photo(2));
  const before=slots;
  slots=storage.alterPhoto(slots);
  assert.equal(slots[0].altered,true);
  assert.equal(before[0].altered,false);
  assert.equal(slots[1].altered,false);
  assert.equal(storage.photoCount(slots),2);
});

test('equal collection times use item order and preserve the input array', () => {
  let slots=storage.emptyPhotoSlots();
  for(let id=1;id<=5;id++) slots=storage.storePhoto(slots,photo(id,100));
  Object.freeze(slots);
  assert.equal(storage.storePhoto(slots,photo(6,101))[0].id,6);
  assert.equal(storage.losePhoto(slots)[4],null);
  assert.equal(slots[4].id,5);
});

test('comparison reveals the original without changing stored answers or restarting', () => {
  assert.ok(source.includes('else if (record) compareOriginal(true)'));
  assert.ok(source.includes('onPointerCancel={() => compareOriginal(false)}'));
  assert.ok(source.includes('window.addEventListener("blur", resetComparison)'));
  assert.ok(source.includes('showOriginal ? 4 : Math.max(0, record.recalls?.[2] ?? 0)'));
  assert.ok(source.includes('if (comparingRef.current) renew(); else sleep();'));
});

test('playing captions do not repeat the photo count or a second stage badge', () => {
  const journey=source.slice(source.indexOf('<div className="rush-journey">'),source.indexOf('<div className="bottom-console">'));
  assert.ok(!journey.includes('hud.memories'));
  assert.ok(!journey.includes('A / STORE'));
  assert.ok(journey.includes('Round progress'));
  assert.ok(source.includes('Photos · catch to keep'));
  assert.ok(source.includes('Bubbles · alter photos'));
  assert.ok(source.includes('Obstacles · lose a photo'));
  assert.ok(!source.includes('createPrintSurfaces'));
});

const slotFeedbackSource=readFileSync(new URL('../app/photo-slot-feedback.ts',import.meta.url),'utf8');
const slotFeedbackCode=ts.transpileModule(slotFeedbackSource.replace(/^import type[^\n]+\n/,'').replaceAll('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {photoSlotChanges}=vm.runInNewContext(`${slotFeedbackCode};({photoSlotChanges})`);

test('slot feedback identifies collection, replacement, alteration and loss without changing photos', () => {
  const first=Object.freeze({id:1,at:10,version:'A',altered:false});
  const second=Object.freeze({id:2,at:20,version:'B',altered:false});
  const before=Object.freeze([first,null,null,null,null]);
  assert.equal(photoSlotChanges(before,[first,second,null,null,null],100)[1].kind,'collect');
  assert.equal(photoSlotChanges(before,[second,null,null,null,null],100)[0].kind,'replace');
  const changed=photoSlotChanges(before,[{...first,altered:true},null,null,null,null],100)[0];
  assert.equal(changed.kind,'alter');
  assert.equal(changed.previous.altered,false);
  assert.notEqual(changed.previous,first);
  assert.equal(photoSlotChanges(before,[null,null,null,null,null],100)[0].kind,'lose');
  assert.equal(first.altered,false);
  assert.ok(photoSlotChanges(before,before,100).every(x=>x===null));
});

test('repeated interference gets a fresh visual event but keeps the same photo identity', () => {
  const original={id:1,at:10,version:'A',altered:true};
  const before=[original,null,null,null,null];
  const after=[{...original},null,null,null,null];
  const a=photoSlotChanges(before,after,100)[0];
  const b=photoSlotChanges(before,after,200)[0];
  assert.equal(a.kind,'alter');
  assert.notEqual(a.key,b.key);
  assert.equal(a.previous.id,original.id);
  assert.equal(after[0].at,original.at);
});

test('slot feedback expires without affecting game timing and respects reduced motion', () => {
  const css=readFileSync(new URL('../app/presentation.css',import.meta.url),'utf8');
  assert.ok(source.includes('setSlotChanges(Array(5).fill(null)), 600)'));
  assert.ok(source.includes('const RUN_DURATION_MS = 24000'));
  assert.ok(source.includes('}, 2200)'));
  assert.ok(css.includes('.photo-slot .slot-current { animation:none!important; }'));
  assert.ok(css.includes('.photo-slot .slot-previous { display:none; }'));
  assert.ok(source.includes('className="title-phrase"'));
});
