export type PixelAction = 'jump' | 'protect' | 'confirm' | 'pause' | 'compare' | 'help';
export type PixelBindings = Record<PixelAction, number>;
export type PixelDevice = 'keyboard' | 'gamepad' | 'touch';
export type PixelTouchAction = PixelAction | 'left' | 'right';

export const DEFAULT_BUTTONS: Readonly<PixelBindings> = Object.freeze({
  jump: 0, protect: 1, confirm: 2, pause: 3, compare: 4, help: 5,
});
export const PIXEL_BINDINGS_KEY = 'memory-drift.pixel-buttons.v1';
const ACTIONS = Object.keys(DEFAULT_BUTTONS) as PixelAction[];
const DEADZONE = 0.2;
const KEY_ACTIONS: Record<string, PixelAction> = {
  KeyZ: 'jump', Space: 'jump', KeyX: 'protect', Enter: 'confirm',
  NumpadEnter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyC: 'compare', KeyH: 'help',
};
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

function validBindings(value: unknown): value is PixelBindings {
  if (!value || typeof value !== 'object') return false;
  const indices = ACTIONS.map(action => (value as PixelBindings)[action]);
  return indices.every(index => Number.isInteger(index) && index >= 0 && index < 64)
    && new Set(indices).size === ACTIONS.length;
}

function browserStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function loadPixelBindings(storage: Pick<Storage, 'getItem'> | null = browserStorage()): PixelBindings {
  try {
    const value: unknown = JSON.parse(storage?.getItem(PIXEL_BINDINGS_KEY) || 'null');
    if (validBindings(value)) return Object.fromEntries(ACTIONS.map(action => [action, value[action]])) as PixelBindings;
  } catch { /* Private browsing and damaged preferences must not prevent play. */ }
  return { ...DEFAULT_BUTTONS };
}

export function savePixelBindings(bindings: PixelBindings, storage: Pick<Storage, 'setItem'> | null = browserStorage()): boolean {
  if (!validBindings(bindings) || !storage) return false;
  try {
    storage.setItem(PIXEL_BINDINGS_KEY, JSON.stringify(bindings));
    return true;
  } catch { return false; }
}

export interface PixelInputOptions {
  onAction?: (action: PixelAction, pressed: boolean) => void;
  onNavigate?: (direction: -1 | 1) => void;
  onDevice?: (device: PixelDevice) => void;
  onRebind?: (action: PixelAction, index: number, bindings: PixelBindings) => void;
  onDisconnect?: () => void;
}

/** Poll read() once each animation frame, including while a menu is open. */
export function createPixelInput(options: PixelInputOptions = {}) {
  let bindings = loadPixelBindings();
  const keys = new Set<string>();
  const touches = new Set<PixelTouchAction>();
  const padActions = new Set<PixelAction>();
  const held = new Set<PixelAction>();
  let previousButtons = new Set<number>();
  const blockedButtons = new Set<number>();
  let padAxis = 0;
  let previousRawAxis = 0;
  let blockAxis = false;
  let navDirection = 0;
  let jumpPressed = false;
  let padIndex: number | null = null;
  let capturedAction: PixelAction | null = null;
  let device: PixelDevice | null = null;
  let focused = true;
  let disposed = false;
  const host = typeof window === 'undefined' ? null : window;

  function useDevice(next: PixelDevice) {
    if (next === device) return;
    device = next;
    options.onDevice?.(next);
  }

  function actionActive(action: PixelAction) {
    return touches.has(action) || padActions.has(action)
      || [...keys].some(code => KEY_ACTIONS[code] === action);
  }

  function syncActions() {
    for (const action of ACTIONS) {
      const pressed = actionActive(action);
      if (held.has(action) === pressed) continue;
      if (pressed) held.add(action); else held.delete(action);
      if (action === 'jump' && pressed) jumpPressed = true;
      options.onAction?.(action, pressed);
    }
  }

  function axis() {
    const left = touches.has('left') || [...keys].some(code => LEFT.has(code));
    const right = touches.has('right') || [...keys].some(code => RIGHT.has(code));
    return left || right ? Number(right) - Number(left) : padAxis;
  }

  function syncNavigation() {
    const direction = Math.sign(axis());
    const before = navDirection;
    navDirection = direction;
    // A held stick cannot scroll repeatedly through a recall answer.
    if (!before && direction) options.onNavigate?.(direction as -1 | 1);
  }

  function clear() {
    keys.clear();
    touches.clear();
    padActions.clear();
    for (const index of previousButtons) blockedButtons.add(index);
    blockAxis = Boolean(previousRawAxis);
    padAxis = 0;
    navDirection = 0;
    jumpPressed = false;
    syncActions();
  }

  function forgetPad(notify: boolean) {
    const wasConnected = padIndex !== null;
    padIndex = null;
    padActions.clear();
    previousButtons.clear();
    blockedButtons.clear();
    padAxis = previousRawAxis = 0;
    blockAxis = false;
    syncActions();
    syncNavigation();
    if (notify && wasConnected) options.onDisconnect?.();
  }

  function pollGamepad() {
    if (!focused || disposed) return;
    let pads: (Gamepad | null)[];
    try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; }
    catch { forgetPad(true); return; }
    const available = pads.filter((pad): pad is Gamepad => Boolean(pad?.connected));
    const pad = available.find(item => item.index === padIndex) || available[0];
    if (!pad) { forgetPad(true); return; }
    if (padIndex !== null && padIndex !== pad.index) forgetPad(true);
    padIndex = pad.index;
    const pressed = new Set<number>();
    pad.buttons.forEach((button, index) => {
      if (button.pressed || button.value > 0.5) pressed.add(index);
    });
    const newlyPressed = [...pressed].filter(index => index < 64 && !previousButtons.has(index));
    const released = [...previousButtons].some(index => !pressed.has(index));
    previousButtons = pressed;
    for (const index of blockedButtons) if (!pressed.has(index)) blockedButtons.delete(index);
    const raw = Number.isFinite(pad.axes[0]) ? Math.max(-1, Math.min(1, pad.axes[0])) : 0;
    const stick = Math.abs(raw) <= DEADZONE ? 0 : Math.sign(raw) * (Math.abs(raw) - DEADZONE) / (1 - DEADZONE);
    const dpad = Number(pressed.has(15)) - Number(pressed.has(14));
    const nextAxis = pressed.has(14) || pressed.has(15) ? dpad : stick;
    if (newlyPressed.length || released || Math.abs(nextAxis - previousRawAxis) > 0.05) useDevice('gamepad');
    previousRawAxis = nextAxis;
    if (!nextAxis) blockAxis = false;
    padAxis = blockAxis || capturedAction ? 0 : nextAxis;

    if (capturedAction) {
      padActions.clear();
      if (newlyPressed.length) {
        const action = capturedAction;
        const index = newlyPressed[0];
        const oldIndex = bindings[action];
        const other = ACTIONS.find(name => name !== action && bindings[name] === index);
        bindings = { ...bindings, [action]: index };
        if (other) bindings[other] = oldIndex;
        capturedAction = null;
        for (const heldIndex of pressed) blockedButtons.add(heldIndex);
        savePixelBindings(bindings);
        options.onRebind?.(action, index, { ...bindings });
      }
    } else {
      padActions.clear();
      for (const action of ACTIONS) {
        const index = bindings[action];
        if (pressed.has(index) && !blockedButtons.has(index)) padActions.add(action);
      }
    }
    syncActions();
    syncNavigation();
  }

  function eventCode(event: KeyboardEvent) {
    if (event.code) return event.code;
    if (event.key === ' ') return 'Space';
    return event.key.length === 1 ? `Key${event.key.toUpperCase()}` : event.key;
  }

  function isEditing(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    return Boolean(target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || ''));
  }

  function keyDown(event: KeyboardEvent) {
    const code = eventCode(event);
    if (disposed || !focused || isEditing(event) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!KEY_ACTIONS[code] && !LEFT.has(code) && !RIGHT.has(code)) return;
    event.preventDefault();
    if (event.repeat || keys.has(code)) return;
    useDevice('keyboard');
    keys.add(code);
    syncActions();
    syncNavigation();
  }

  function keyUp(event: KeyboardEvent) {
    const code = eventCode(event);
    if (!keys.delete(code)) return;
    event.preventDefault();
    syncActions();
    syncNavigation();
  }

  function blur() { focused = false; clear(); }
  function focus() { focused = true; }
  function disconnected(event: GamepadEvent) {
    if (event.gamepad.index === padIndex) forgetPad(true);
  }
  host?.addEventListener('keydown', keyDown);
  host?.addEventListener('keyup', keyUp);
  host?.addEventListener('blur', blur);
  host?.addEventListener('focus', focus);
  host?.addEventListener('gamepaddisconnected', disconnected);

  return {
    read() {
      pollGamepad();
      const state = { axis: axis(), jump: held.has('jump'), jumpPressed, protect: held.has('protect') };
      jumpPressed = false;
      return state;
    },
    clear,
    setTouch(action: PixelTouchAction, pressed: boolean) {
      if (disposed || !focused || (!ACTIONS.includes(action as PixelAction) && action !== 'left' && action !== 'right')) return;
      if (touches.has(action) === pressed) return;
      useDevice('touch');
      if (pressed) touches.add(action); else touches.delete(action);
      syncActions();
      syncNavigation();
    },
    setBindings(next: PixelBindings) {
      if (!validBindings(next)) return;
      clear();
      bindings = { ...next };
      savePixelBindings(bindings);
    },
    getBindings(): PixelBindings { return { ...bindings }; },
    capture(action: PixelAction | null) {
      clear();
      capturedAction = action;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      host?.removeEventListener('keydown', keyDown);
      host?.removeEventListener('keyup', keyUp);
      host?.removeEventListener('blur', blur);
      host?.removeEventListener('focus', focus);
      host?.removeEventListener('gamepaddisconnected', disconnected);
    },
  };
}
