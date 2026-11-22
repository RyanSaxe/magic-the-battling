// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const request = { guideId: "build_play_draw", nonce: 1, stepIndex: 0 } as const;
const context = { currentPhase: "build" } as GuidedWalkthroughContext;

function Board({ guideShowing = true }) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef}>
      <button>Home</button>
      <footer>
        <div data-guide-target="build-submit-popover">
          <button>Play</button>
        </div>
        <button>Submit Hand</button>
      </footer>
      {guideShowing && (
        <GuidedWalkthrough
          rootRef={rootRef}
          request={request}
          context={context}
          stepIndex={0}
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

it("takes keys only to its own controls and the target its step lets players use, until it closes", async () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView ??= () => {};
  const { rerender } = render(<Board guideShowing={false} />);
  const home = screen.getByText("Home");
  const play = screen.getByText("Play");
  const submit = screen.getByText("Submit Hand");

  rerender(<Board />);
  // jsdom doesn't act on inert, so this reads where it's set.
  expect(home.closest("[inert]")).not.toBeNull();
  await waitFor(() => expect(screen.getByRole("dialog").closest("[inert]")).toBeNull());
  await waitFor(() => expect(play.closest("[inert]")).toBeNull());
  expect(submit.closest("[inert]")).not.toBeNull();

  rerender(<Board guideShowing={false} />);
  expect(home.closest("[inert]")).toBeNull();
  expect(submit.closest("[inert]")).toBeNull();
});
