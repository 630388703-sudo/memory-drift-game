export type DirectionAction = "left" | "right" | "up" | "down";
export type InputAction = DirectionAction | "action-start" | "action-end" | "reset" | "hard-reset" | "fullscreen" | "mute" | "language" | "help" | "visual-assist" | "any-direction";
export type InputEvent = { action: InputAction; source: "keyboard" | "touch" | "hardware"; heldMs?: number };
type Listener = (event: InputEvent) => void;

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  KeyF: "fullscreen", KeyM: "mute", KeyL: "language", KeyH: "help", KeyV: "visual-assist",
};

/** One semantic input boundary for keyboard, touch, USB HID and future Arduino adapters. */
export class GameInput {
  private listeners = new Set<Listener>();
  private keysDown = new Set<string>();
  private directions = new Set<DirectionAction>();
  private touchDirections = new Set<DirectionAction>();
  private actionStartedAt = 0;

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat || this.keysDown.has(event.code)) return;
      this.keysDown.add(event.code);
      this.actionStartedAt = performance.now();
      this.emit({ action: "action-start", source: "keyboard" });
      return;
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      if (!event.repeat) this.emit({ action: event.shiftKey ? "hard-reset" : "reset", source: "keyboard" });
      return;
    }
    const action = KEY_MAP[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat && !["left", "right", "up", "down"].includes(action)) return;
    this.keysDown.add(event.code);
    if (["left", "right", "up", "down"].includes(action)) {
      this.directions.add(action as DirectionAction);
      if (!event.repeat) this.emit({ action: "any-direction", source: "keyboard" });
    }
    if (!event.repeat) this.emit({ action, source: "keyboard" });
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keysDown.delete(event.code);
    const action = KEY_MAP[event.code];
    if (action && ["left", "right", "up", "down"].includes(action)) this.directions.delete(action as DirectionAction);
    if (event.code !== "Space") return;
    event.preventDefault();
    this.emit({ action: "action-end", source: "keyboard", heldMs: Math.max(0, performance.now() - this.actionStartedAt) });
  };

  attach() {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });
  }
  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keysDown.clear(); this.directions.clear(); this.touchDirections.clear();
  }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  axis() {
    const all = new Set([...this.directions, ...this.touchDirections]);
    return { x: (all.has("right") ? 1 : 0) - (all.has("left") ? 1 : 0), y: (all.has("down") ? 1 : 0) - (all.has("up") ? 1 : 0) };
  }
  setTouchDirection(direction: DirectionAction, active: boolean) {
    if (active) { this.touchDirections.add(direction); this.emit({ action: direction, source: "touch" }); this.emit({ action: "any-direction", source: "touch" }); }
    else this.touchDirections.delete(direction);
  }
  emitTouch(action: InputAction, heldMs?: number) { this.emit({ action, source: "touch", heldMs }); }
  emitHardware(action: InputAction, heldMs?: number) { this.emit({ action, source: "hardware", heldMs }); }
  private emit(event: InputEvent) { this.listeners.forEach((listener) => listener(event)); }
}
