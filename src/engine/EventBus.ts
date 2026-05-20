/**
 * Typed publish/subscribe bus. The single `sim → outside` channel: simulation
 * systems emit discrete events here; `render/` and `ui/` subscribe. Push-only —
 * the sim never reads from subscribers.
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Listener<Events[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Iterate a copy so handlers may unsubscribe during dispatch.
    for (const fn of [...set]) (fn as Listener<Events[K]>)(payload);
  }

  /** Drop every subscription — call on teardown to avoid leaks. */
  clear(): void {
    this.listeners.clear();
  }
}
