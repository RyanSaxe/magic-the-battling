// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { GuidedWalkthroughContext } from "./types";
import { GuidedWalkthrough } from "./GuidedWalkthrough";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none. Reduced motion shows a step at once.
vi.hoisted(() => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const request = { guideId: "welcome", nonce: 1, stepIndex: 0 } as const;
const context = { currentPhase: "build" } as GuidedWalkthroughContext;

function Board({ stepIndex }: { stepIndex?: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} data-testid="root">
      <i data-testid="animation" />
      <span data-guide-target="timeline-stage-round" data-testid="target" />
      {stepIndex !== undefined && (
        <GuidedWalkthrough
          rootRef={rootRef}
          request={request}
          context={context}
          stepIndex={stepIndex}
          requestActive
          onClose={() => {}}
          onSkipAll={() => {}}
          onAdvanceStep={() => {}}
          onBackStep={() => {}}
        />
      )}
    </div>
  );
}

it("shows each step and follows its target while an animation changes the page every frame", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  let nextId = 0;
  const queued = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queued.delete(id));

  const { rerender } = render(<Board />);
  // jsdom lays nothing out, so the board and the step's target get places of their own.
  Object.defineProperties(screen.getByTestId("root"), { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
  const target = screen.getByTestId("target");
  let left = 100;
  target.getBoundingClientRect = () => ({ left, top: 50, width: 60, height: 20 }) as DOMRect;

  let animating = true;
  let level = 0;
  const drawFrames = async (count: number) => {
    for (let frame = 0; frame < count; frame++) {
      if (animating) screen.getByTestId("animation").style.setProperty("--level", `${++level}`);
      // The observer hears of a change before the next frame's callbacks run.
      await act(async () => {});
      await act(async () => {
        const due = [...queued.values()];
        queued.clear();
        due.forEach((callback) => callback(0));
      });
    }
  };
  const spotlightLeft = () => document.querySelector<HTMLElement>(".border-amber-300\\/80")?.style.left;

  rerender(<Board stepIndex={0} />);
  await drawFrames(10);
  expect(screen.queryByRole("dialog")?.textContent ?? "no card").toContain("Playing Pitfight");

  rerender(<Board stepIndex={1} />);
  await drawFrames(10);
  expect(spotlightLeft()).toBe("88px");

  left = 300;
  target.setAttribute("class", "moved");
  await drawFrames(10);
  expect(spotlightLeft()).toBe("288px");

  animating = false;
  await drawFrames(5);
  // A transition's first frame is still where it started.
  target.setAttribute("class", "sliding");
  await drawFrames(1);
  left = 500;
  await drawFrames(10);
  expect(spotlightLeft()).toBe("488px");
});
