import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/engine/EventBus";

interface TestEvents {
  ping: { value: number };
  pong: void;
}

describe("EventBus", () => {
  it("delivers an emitted payload to subscribers", () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on("ping", fn);
    bus.emit("ping", { value: 7 });
    expect(fn).toHaveBeenCalledWith({ value: 7 });
  });

  it("stops delivery after unsubscribe", () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    const off = bus.on("ping", fn);
    off();
    bus.emit("ping", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("isolates events by type", () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on("ping", fn);
    bus.emit("pong", undefined);
    expect(fn).not.toHaveBeenCalled();
  });

  it("lets a handler unsubscribe during dispatch without skipping others", () => {
    const bus = new EventBus<TestEvents>();
    const order: string[] = [];
    const off = bus.on("ping", () => {
      order.push("a");
      off();
    });
    bus.on("ping", () => order.push("b"));
    bus.emit("ping", { value: 0 });
    expect(order).toEqual(["a", "b"]);
  });

  it("clear() removes every subscription", () => {
    const bus = new EventBus<TestEvents>();
    const fn = vi.fn();
    bus.on("ping", fn);
    bus.clear();
    bus.emit("ping", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
