// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GuidedGuideId, GuidedWalkthroughContext } from "./types";
import { GuidedWalkthrough } from "./GuidedWalkthrough";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none. Reduced motion shows a step at once.
vi.hoisted(() => {
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
});

const context = { currentPhase: "build" } as GuidedWalkthroughContext;

function Board({
  guideId,
  stepIndex,
  showGuide = stepIndex !== undefined,
}: {
  guideId: GuidedGuideId;
  stepIndex?: number;
  showGuide?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} data-testid="root">
      <button>Home</button>
      <i data-testid="animation" />
      <span data-guide-target="timeline-stage-round" data-testid="target" />
      <footer>
        <div data-guide-target="build-submit-popover">
          <button>Play</button>
        </div>
        <button>Submit Hand</button>
      </footer>
      {showGuide && (
        <GuidedWalkthrough
          rootRef={rootRef}
          request={{ guideId, nonce: 1, stepIndex: stepIndex ?? 0 }}
          context={context}
          stepIndex={stepIndex ?? 0}
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

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("takes keys only to its own controls and the target its step lets players use, until it closes", async () => {
  const { rerender } = render(<Board guideId="build_play_draw" showGuide={false} />);
  const home = screen.getByText("Home");
  const play = screen.getByText("Play");
  const submit = screen.getByText("Submit Hand");

  rerender(<Board guideId="build_play_draw" stepIndex={0} showGuide />);
  // jsdom doesn't act on inert, so this reads where it's set.
  expect(home.closest("[inert]")).not.toBeNull();
  await waitFor(() => expect(screen.getByRole("dialog").closest("[inert]")).toBeNull());
  await waitFor(() => expect(play.closest("[inert]")).toBeNull());
  expect(submit.closest("[inert]")).not.toBeNull();

  rerender(<Board guideId="build_play_draw" showGuide={false} />);
  expect(home.closest("[inert]")).toBeNull();
  expect(submit.closest("[inert]")).toBeNull();
});

it("shows each step and follows its target while an animation changes the page every frame", async () => {
  let nextId = 0;
  const queued = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queued.delete(id));

  const { rerender } = render(<Board guideId="welcome" />);
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

  rerender(<Board guideId="welcome" stepIndex={0} />);
  await drawFrames(10);
  expect(screen.queryByRole("dialog")?.textContent ?? "no card").toContain("Playing Pitfight");

  rerender(<Board guideId="welcome" stepIndex={1} />);
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
