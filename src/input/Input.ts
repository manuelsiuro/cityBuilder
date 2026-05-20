import { EventBus } from "../engine/EventBus";
import { angleDelta, pairAngle, pairDistance, type PointerPair } from "./gestures";

/** Semantic input events. Pixel coords are relative to the page. */
export type InputEventMap = {
  /** Primary pointer pressed down. */
  press: { x: number; y: number };
  /** Primary pointer released (fires for every press, drag or tap). */
  release: { x: number; y: number };
  /** Screen-space drag delta plus the current pointer position, in pixels. */
  drag: { dx: number; dy: number; x: number; y: number };
  /** Multiply camera zoom by `factor` (>1 zooms out). */
  zoom: { factor: number };
  /** Quarter-turn rotation; `dir` is +1 or −1. */
  rotate: { dir: number };
  /** A click/tap that did not drag — used for selection and single-tile build. */
  tap: { x: number; y: number };
  /** Pointer moved without dragging — used for hover highlight. */
  hover: { x: number; y: number };
};

/** Total pointer travel (px) below which a press counts as a tap, not a drag. */
const TAP_SLOP = 7;
/** Twist accumulated past this angle emits one discrete rotate step. */
const TWIST_STEP = Math.PI / 7;

interface ActivePointer {
  x: number;
  y: number;
}

/**
 * Single owner of raw keyboard / pointer / touch input. Translates them into
 * the semantic `InputEventMap` events that the camera and tools consume.
 * Pointer Events unify mouse and touch; two pointers drive pinch + twist.
 */
export class Input {
  readonly events = new EventBus<InputEventMap>();

  private readonly pointers = new Map<number, ActivePointer>();
  private readonly keys = new Set<string>();

  private dragMoved = 0;
  private gestureDist = 0;
  private gestureAngle = 0;
  private twistAccum = 0;

  constructor(private readonly target: HTMLElement) {
    target.style.touchAction = "none";
    target.addEventListener("pointerdown", this.onPointerDown);
    target.addEventListener("pointermove", this.onPointerMove);
    target.addEventListener("pointerup", this.onPointerUp);
    target.addEventListener("pointercancel", this.onPointerUp);
    target.addEventListener("wheel", this.onWheel, { passive: false });
    target.addEventListener("contextmenu", this.preventDefault);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Keyboard pan axis from WASD / arrow keys, each component −1..1. */
  panAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) x -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) x += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) y -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) y += 1;
    return { x, y };
  }

  dispose(): void {
    const t = this.target;
    t.removeEventListener("pointerdown", this.onPointerDown);
    t.removeEventListener("pointermove", this.onPointerMove);
    t.removeEventListener("pointerup", this.onPointerUp);
    t.removeEventListener("pointercancel", this.onPointerUp);
    t.removeEventListener("wheel", this.onWheel);
    t.removeEventListener("contextmenu", this.preventDefault);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.events.clear();
  }

  private preventDefault = (e: Event): void => e.preventDefault();

  private onPointerDown = (e: PointerEvent): void => {
    // Capture can fail for synthetic events or already-released pointers.
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      /* non-fatal */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragMoved = 0;

    if (this.pointers.size === 1) {
      this.events.emit("press", { x: e.clientX, y: e.clientY });
    } else if (this.pointers.size === 2) {
      const pair = this.pointerPair();
      this.gestureDist = pairDistance(pair);
      this.gestureAngle = pairAngle(pair);
      this.twistAccum = 0;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      this.events.emit("hover", { x: e.clientX, y: e.clientY });
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.pointers.size >= 2) {
      this.updateGesture();
      return;
    }

    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    this.events.emit("drag", { dx, dy, x: e.clientX, y: e.clientY });
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasSingle) {
      this.events.emit("release", { x: e.clientX, y: e.clientY });
      if (this.dragMoved < TAP_SLOP) {
        this.events.emit("tap", { x: e.clientX, y: e.clientY });
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.events.emit("zoom", { factor: e.deltaY > 0 ? 1.12 : 1 / 1.12 });
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === "KeyQ") this.events.emit("rotate", { dir: -1 });
    if (e.code === "KeyE") this.events.emit("rotate", { dir: 1 });
    if (e.code === "Equal") this.events.emit("zoom", { factor: 1 / 1.2 });
    if (e.code === "Minus") this.events.emit("zoom", { factor: 1.2 });
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private pointerPair(): PointerPair {
    const [a, b] = [...this.pointers.values()];
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  }

  /** Two-pointer pinch (zoom) + twist (discrete rotate). */
  private updateGesture(): void {
    const pair = this.pointerPair();
    const dist = pairDistance(pair);
    const angle = pairAngle(pair);

    if (this.gestureDist > 0 && dist > 0) {
      this.events.emit("zoom", { factor: this.gestureDist / dist });
    }
    this.gestureDist = dist;

    this.twistAccum += angleDelta(this.gestureAngle, angle);
    this.gestureAngle = angle;
    if (Math.abs(this.twistAccum) >= TWIST_STEP) {
      this.events.emit("rotate", { dir: this.twistAccum > 0 ? 1 : -1 });
      this.twistAccum = 0;
    }
  }
}
