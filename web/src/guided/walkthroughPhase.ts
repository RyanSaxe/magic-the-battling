export type AnimPhase =
  | "idle"
  | "entering"
  | "exit-tooltip"
  | "morph-spot"
  | "enter-tooltip"
  | "exiting";

export type RequestTransition = "exit" | "idle" | null;

export function planRequestTransition(options: {
  animPhase: AnimPhase;
  requestActive: boolean;
  hasDisplayState: boolean;
  reducedMotion: boolean;
}): RequestTransition {
  const { animPhase, requestActive, hasDisplayState, reducedMotion } = options;

  if (requestActive || !hasDisplayState) {
    return null;
  }

  if (reducedMotion) {
    return "idle";
  }

  return animPhase === "exiting" ? null : "exit";
}
