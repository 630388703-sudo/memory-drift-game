export type InputAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "pressure-start"
  | "pressure-end"
  | "export-report"
  | "reset"
  | "fullscreen"
  | "any-direction";

export type InputEvent = {
  action: InputAction;
  source: "keyboard" | "touch" | "hardware";
  heldMs?: number;
};

type Listener = (event: InputEvent) => void;

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  KeyR: "reset",
  KeyF: "fullscreen",
  KeyE: "export-report",
};

/**
 * One input boundary for keyboard, touch and future Arduino/USB HID adapters.
 * Hardware code only needs to call `emitHardware` with the same actions.
 */
export class GameInput {
  private listeners = new Set<Listener>();
  private pressureStartedAt = 0;
  private keysDown = new Set<string>();

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat || this.keysDown.has(event.code)) return;
      this.keysDown.add(event.code);
      this.pressureStartedAt = performance.now();
      this.emit({ action: "pressure-start", source: "keyboard" });
      return;
    }

    const action = KEY_MAP[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat && action !== "up" && action !== "down") return;
    this.keysDown.add(event.code);
    this.emit({ action, source: "keyboard" });
    if (["left", "right", "up", "down"].includes(action)) {
      this.emit({ action: "any-direction", source: "keyboard" });
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keysDown.delete(event.code);
    if (event.code !== "Space") return;
    event.preventDefault();
    const heldMs = Math.max(0, performance.now() - this.pressureStartedAt);
    this.emit({ action: "pressure-end", source: "keyboard", heldMs });
  };

  attach() {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keysDown.clear();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitTouch(action: InputAction, heldMs?: number) {
    this.emit({ action, source: "touch", heldMs });
  }

  emitHardware(action: InputAction, heldMs?: number) {
    this.emit({ action, source: "hardware", heldMs });
  }

  private emit(event: InputEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}
