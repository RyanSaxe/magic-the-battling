export type PhaseAction = "build_ready" | "reward_done" | "draft_done";

export type PendingPhaseAction = { action: PhaseAction } | null;

/** The parts of the server's state that confirm or settle a phase action. */
export interface PhaseActionServerState {
  phase: string | null;
  buildReady: boolean;
  connected: boolean;
}

export interface PhaseActionState {
  pending: PendingPhaseAction;
  server: PhaseActionServerState;
}

export type PhaseActionEvent =
  | { type: "sent"; action: PhaseAction }
  | { type: "failed" }
  | { type: "server_state"; server: PhaseActionServerState };

export function initialPhaseActionState(
  server: PhaseActionServerState,
): PhaseActionState {
  return { pending: null, server };
}

function serverStateChanged(
  previous: PhaseActionServerState,
  next: PhaseActionServerState,
): boolean {
  return (
    previous.phase !== next.phase ||
    previous.buildReady !== next.buildReady ||
    previous.connected !== next.connected
  );
}

export function reducePhaseAction(
  state: PhaseActionState,
  event: PhaseActionEvent,
): PhaseActionState {
  if (event.type === "sent") {
    return state.pending
      ? state
      : { ...state, pending: { action: event.action } };
  }
  if (event.type === "failed") {
    return state.pending ? { ...state, pending: null } : state;
  }
  // Other players' updates arrive with this player's state unchanged, so only a change here answers the action.
  return serverStateChanged(state.server, event.server)
    ? { pending: null, server: event.server }
    : state;
}

export function isPhaseActionPending(
  pending: PendingPhaseAction,
  action: PhaseAction,
): boolean {
  return pending?.action === action;
}
