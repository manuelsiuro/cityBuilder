/**
 * Ordered intent queue. The single `outside → sim` channel: `input/` and `ui/`
 * push commands here; `World` drains them at the start of each tick so all
 * simulation mutation happens at one deterministic point.
 *
 * Generic over the command type — the concrete `Command` union is introduced in
 * Phase 2 when the first real build/erase commands exist.
 */
export class CommandQueue<T> {
  private queue: T[] = [];

  push(command: T): void {
    this.queue.push(command);
  }

  /** Return all queued commands in order and empty the queue. */
  drain(): T[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }

  get size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
