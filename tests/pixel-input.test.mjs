import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/pixel-input.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function fixture() {
  const listeners = new Map();
  const saved = new Map();
  let pads = [];
  let denied = false;
  const exports = {};
  const window = {
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  vm.runInNewContext(code, { exports, window, navigator: { getGamepads() { if (denied) throw new Error('Policy denied'); return pads; } } });
  const actions = [], navigation = [], devices = [], rebinds = [];
  let disconnects = 0;
  const input = exports.createPixelInput({
    onAction: (...args) => actions.push(args), onNavigate: dir => navigation.push(dir),
    onDevice: name => devices.push(name), onRebind: (...args) => rebinds.push(args),
    onDisconnect: () => disconnects++,
  });
  const fire = (type, data = {}) => {
    const event = { code: '', key: '', repeat: false, preventDefault() {}, ...data };
    for (const listener of listeners.get(type) || []) listener(event);
  };
  const pad = { index: 0, connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  return { input, exports, actions, navigation, devices, rebinds, saved, listeners, fire, pad,
    connect: () => { pads = [pad]; }, disconnect: () => { pads = []; }, deny: () => { denied = true; },
    disconnects: () => disconnects,
  };
}

test('keyboard actions have single edges; quick jump remains latched until read', () => {
  const f = fixture();
  f.fire('keydown', { code: 'Enter' }); f.fire('keydown', { code: 'Enter', repeat: true });
  f.fire('keyup', { code: 'Enter' });
  assert.deepEqual(f.actions, [['confirm', true], ['confirm', false]]);
  f.fire('keydown', { code: 'KeyZ' }); f.fire('keyup', { code: 'KeyZ' });
  const quickJump = f.input.read();
  assert.equal(quickJump.jump, false); assert.equal(quickJump.jumpPressed, true);
  f.fire('keydown', { code: 'Space' });
  assert.equal(f.input.read().jumpPressed, true);
  assert.equal(f.input.read().jumpPressed, false);
  assert.deepEqual(f.devices, ['keyboard']);
});

test('multiple keys and touch sharing an action cannot release another held source', () => {
  const f = fixture();
  f.fire('keydown', { code: 'KeyZ' }); f.fire('keydown', { code: 'Space' });
  f.fire('keyup', { code: 'KeyZ' });
  assert.equal(f.input.read().jump, true);
  f.input.setTouch('jump', true); f.fire('keyup', { code: 'Space' });
  assert.equal(f.input.read().jump, true);
  f.input.setTouch('jump', false);
  assert.equal(f.input.read().jump, false);
  assert.deepEqual(f.actions, [['jump', true], ['jump', false]]);
});

test('movement and menu navigation require recentering, not held-axis repeat', () => {
  const f = fixture(); f.connect();
  f.pad.axes[0] = 0.15; assert.equal(f.input.read().axis, 0);
  f.pad.axes[0] = 0.6; assert.ok(Math.abs(f.input.read().axis - 0.5) < 0.001);
  f.input.read(); f.pad.axes[0] = -1; f.input.read();
  assert.deepEqual(f.navigation, [1]);
  f.pad.axes[0] = 0; f.input.read(); f.pad.buttons[14].pressed = true;
  assert.equal(f.input.read().axis, -1);
  assert.deepEqual(f.navigation, [1, -1]);
});

test('all six gamepad bindings emit press and release; jump pressed is consumed', () => {
  const f = fixture(); f.connect(); f.input.read();
  for (const button of f.pad.buttons.slice(0, 6)) button.pressed = true;
  assert.equal(f.input.read().jumpPressed, true);
  assert.equal(f.input.read().jumpPressed, false);
  assert.equal(f.input.read().protect, true);
  for (const button of f.pad.buttons) button.pressed = false;
  f.input.read();
  assert.deepEqual(f.actions, ['jump', 'protect', 'confirm', 'pause', 'compare', 'help'].map(action => [action, true])
    .concat(['jump', 'protect', 'confirm', 'pause', 'compare', 'help'].map(action => [action, false])));
});

test('clear blocks already-held pad buttons and axis until release/recenter', () => {
  const f = fixture(); f.connect(); f.pad.buttons[0].pressed = true; f.pad.axes[0] = 1;
  f.input.read(); f.input.clear();
  assert.equal(f.input.read().jump, false); assert.equal(f.input.read().axis, 0);
  f.pad.buttons[0].pressed = false; f.pad.axes[0] = 0; f.input.read();
  f.pad.buttons[0].pressed = true; f.pad.axes[0] = -1;
  assert.equal(f.input.read().jumpPressed, true); assert.equal(f.input.read().axis, -1);
});

test('blur and a denied gamepad API release held inputs without stale movement', () => {
  const f = fixture(); f.connect(); f.pad.axes[0] = 1; f.pad.buttons[1].pressed = true;
  f.fire('keydown', { code: 'KeyD' }); f.input.read(); f.fire('blur');
  assert.equal(f.input.read().axis, 0); assert.equal(f.input.read().protect, false);
  f.fire('focus'); assert.equal(f.input.read().axis, 0);
  f.deny(); f.input.read(); f.input.read();
  assert.equal(f.disconnects(), 1);
  assert.equal(f.input.read().protect, false);
});

test('disconnect resets gamepad but preserves a separately held keyboard action', () => {
  const f = fixture(); f.connect(); f.pad.axes[0] = 1; f.pad.buttons[1].pressed = true;
  f.input.read(); f.fire('keydown', { code: 'KeyX' }); f.disconnect();
  assert.equal(f.input.read().axis, 0); assert.equal(f.input.read().protect, true);
  assert.equal(f.disconnects(), 1);
  f.fire('keyup', { code: 'KeyX' }); assert.equal(f.input.read().protect, false);
});

test('capture ignores an already-held button, swaps duplicates, and suppresses gameplay', () => {
  const f = fixture(); f.connect(); f.pad.buttons[2].pressed = true; f.input.read();
  f.input.capture('jump'); f.input.read(); assert.equal(f.rebinds.length, 0);
  f.pad.buttons[2].pressed = false; f.input.read(); f.pad.buttons[2].pressed = true; f.input.read();
  assert.equal(f.rebinds.length, 1); assert.equal(f.input.getBindings().jump, 2);
  assert.equal(f.input.getBindings().confirm, 0); assert.equal(f.input.read().jump, false);
  f.pad.buttons[2].pressed = false; f.input.read(); f.pad.buttons[2].pressed = true;
  assert.equal(f.input.read().jumpPressed, true);
  assert.equal(f.exports.loadPixelBindings().jump, 2);
});

test('storage validation tolerates unavailable, malformed, duplicate and hostile values', () => {
  const f = fixture();
  const defaults = JSON.stringify(f.exports.DEFAULT_BUTTONS);
  for (const value of ['null', 'broken', '{}', '{"jump":-1}', JSON.stringify({ ...f.exports.DEFAULT_BUTTONS, help: 0 })]) {
    f.saved.set(f.exports.PIXEL_BINDINGS_KEY, value);
    assert.equal(JSON.stringify(f.exports.loadPixelBindings()), defaults);
  }
  assert.equal(JSON.stringify(f.exports.loadPixelBindings({ getItem() { throw Error('blocked'); } })), defaults);
  assert.equal(f.exports.savePixelBindings(f.exports.DEFAULT_BUTTONS, { setItem() { throw Error('full'); } }), false);
  assert.equal(f.exports.savePixelBindings({ ...f.exports.DEFAULT_BUTTONS, jump: NaN }), false);
  const original = f.input.getBindings(); original.jump = 40; assert.equal(f.input.getBindings().jump, 0);
});

test('editable fields and shortcuts remain usable; dispose removes listeners', () => {
  const f = fixture();
  f.fire('keydown', { code: 'KeyX', target: { tagName: 'INPUT' } });
  f.fire('keydown', { code: 'KeyX', target: { isContentEditable: true } });
  f.fire('keydown', { code: 'KeyH', ctrlKey: true });
  assert.equal(f.actions.length, 0);
  f.input.dispose(); f.fire('keydown', { code: 'Space' }); f.input.setTouch('jump', true);
  assert.equal(f.input.read().jump, false);
  assert.ok([...f.listeners.values()].every(set => set.size === 0));
});
