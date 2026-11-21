export type AnimPhase =
  | "idle"
  | "entering"
  | "exit-tooltip"
  | "morph-spot"
  | "enter-tooltip"
  | "exiting";

export type RequestTransition = "exit" | "idle" | "restart" | null;

export function planRequestTransition(options: {
  animPhase: AnimPhase;
  requestActive: boolean;
  hasDisplayState: boolean;
  reducedMotion: boolean;
}): RequestTransition {
  const { animPhase, requestActive, hasDisplayState, reducedMotion } = options;

  if (requestActive) {
    // The walkthrough stays mounted across guides so one guide can morph into the
    // next, but once an exit has started only a fresh entry can bring it back.
    return animPhase === "exiting" ? "restart" : null;
  }

  if (!hasDisplayState) {
    return null;
  }

  if (reducedMotion) {
    return "idle";
  }

  return animPhase === "exiting" ? null : "exit";
}
