import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAfterCurrentTask } from "./useWebSocket";

describe("connectAfterCurrentTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects once the current task ends", () => {
    const connect = vi.fn();
    connectAfterCurrentTask(connect);

    expect(connect).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(connect).toHaveBeenCalledOnce();
  });

  it("opens only the remounted connection when StrictMode cleans up the first mount", () => {
    const firstMount = vi.fn();
    const secondMount = vi.fn();

    const cleanupFirstMount = connectAfterCurrentTask(firstMount);
    cleanupFirstMount();
    connectAfterCurrentTask(secondMount);
    vi.runAllTimers();

    expect(firstMount).not.toHaveBeenCalled();
    expect(secondMount).toHaveBeenCalledOnce();
  });
});
