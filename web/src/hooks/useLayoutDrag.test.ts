// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ZoneConstraints } from "./computeConstrainedLayout";
import { useLayoutDrag } from "./useLayoutDrag";
import { useSavedLayout, type BoardSize } from "./useSavedLayout";

const SEED: ZoneConstraints = { topFraction: 0.4, bottomLeftSplit: 0.5 };

describe("useLayoutDrag", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws the draft while a divider is held and saves it once, on release", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useLayoutDrag(null, save));

    act(() => result.current.drag.start(SEED));
    act(() => result.current.drag.move("topFraction", 0.45));
    act(() => result.current.drag.move("topFraction", 0.5));
    expect(result.current.constraints).toEqual({
      topFraction: 0.5,
      bottomLeftSplit: 0.5,
    });
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.drag.end());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      topFraction: 0.5,
      bottomLeftSplit: 0.5,
    });
  });

  it("saves nothing when a divider is pressed and released without moving", () => {
    const save = vi.fn();
    const saved = { topFraction: 0.3 };
    const { result } = renderHook(() => useLayoutDrag(saved, save));

    act(() => result.current.drag.start(SEED));
    act(() => result.current.drag.end());
    expect(save).not.toHaveBeenCalled();
    expect(result.current.constraints).toBe(saved);
  });

  it("saves to the layout the drag started on when the board changes size mid-drag", () => {
    const saveOnLaptop = vi.fn();
    const saveOnDesktop = vi.fn();
    const { result, rerender } = renderHook(
      ({ save }) => useLayoutDrag(null, save),
      {
        initialProps: { save: saveOnLaptop },
      },
    );

    act(() => result.current.drag.start(SEED));
    rerender({ save: saveOnDesktop });
    act(() => result.current.drag.move("topFraction", 0.5));
    act(() => result.current.drag.end());
    expect(saveOnLaptop).toHaveBeenCalledTimes(1);
    expect(saveOnDesktop).not.toHaveBeenCalled();
  });

  it("writes a saved layout to storage once per drag", () => {
    const store = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => {
      store.set(key, value);
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem,
    });
    const board: BoardSize = { width: 952, height: 712 };
    const { result } = renderHook(() => {
      const saved = useSavedLayout(
        { scopeKey: "phase:build", stage: 4, round: 2 },
        board,
      );
      return {
        saved,
        ...useLayoutDrag(saved.constraints, saved.setConstraints),
      };
    });

    act(() => result.current.drag.start(SEED));
    for (const fraction of [0.41, 0.42, 0.43, 0.44])
      act(() => result.current.drag.move("topFraction", fraction));
    expect(setItem).not.toHaveBeenCalled();

    act(() => result.current.drag.end());
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current.saved.constraints).toEqual({
      topFraction: 0.44,
      bottomLeftSplit: 0.5,
    });
  });
});
