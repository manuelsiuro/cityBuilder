import { describe, it, expect } from "vitest";
import { CommandQueue } from "../src/engine/CommandQueue";

describe("CommandQueue", () => {
  it("drains commands in FIFO order", () => {
    const q = new CommandQueue<number>();
    q.push(1);
    q.push(2);
    q.push(3);
    expect(q.drain()).toEqual([1, 2, 3]);
  });

  it("empties the queue after a drain", () => {
    const q = new CommandQueue<number>();
    q.push(1);
    q.drain();
    expect(q.size).toBe(0);
    expect(q.drain()).toEqual([]);
  });

  it("reports its size", () => {
    const q = new CommandQueue<string>();
    expect(q.size).toBe(0);
    q.push("a");
    q.push("b");
    expect(q.size).toBe(2);
  });

  it("clear() discards pending commands", () => {
    const q = new CommandQueue<number>();
    q.push(1);
    q.clear();
    expect(q.size).toBe(0);
  });
});
