import { describe, expect, it } from "vitest";
import {
  initialPhaseActionState,
  reducePhaseAction,
  type PhaseActionServerState,
} from "./pendingPhaseAction";

const inBuild: PhaseActionServerState = {
  phase: "build",
  buildReady: false,
  connected: true,
};

function sentFromBuild() {
  return reducePhaseAction(initialPhaseActionState(inBuild), {
    type: "sent",
    action: "build_ready",
  });
}

describe("reducePhaseAction", () => {
  it("keeps the action pending when an update leaves this player's phase and ready flag unchanged", () => {
    const state = reducePhaseAction(sentFromBuild(), {
      type: "server_state",
      server: { ...inBuild },
    });

    expect(state.pending).toEqual({ action: "build_ready" });
  });

  it("settles the action when the server marks the player ready", () => {
    const state = reducePhaseAction(sentFromBuild(), {
      type: "server_state",
      server: { ...inBuild, buildReady: true },
    });

    expect(state.pending).toBeNull();
  });

  it("settles the action when the phase changes", () => {
    const sent = reducePhaseAction(
      initialPhaseActionState({
        phase: "reward",
        buildReady: false,
        connected: true,
      }),
      { type: "sent", action: "reward_done" },
    );
    const state = reducePhaseAction(sent, {
      type: "server_state",
      server: { phase: "draft", buildReady: false, connected: true },
    });

    expect(state.pending).toBeNull();
  });

  it("settles the action when the server refuses it", () => {
    expect(
      reducePhaseAction(sentFromBuild(), { type: "failed" }).pending,
    ).toBeNull();
  });

  it("settles the action when the connection drops, so it can be sent again", () => {
    const state = reducePhaseAction(sentFromBuild(), {
      type: "server_state",
      server: { ...inBuild, connected: false },
    });

    expect(state.pending).toBeNull();
  });

  it("ignores a second action while one is pending", () => {
    const state = reducePhaseAction(sentFromBuild(), {
      type: "sent",
      action: "draft_done",
    });

    expect(state.pending).toEqual({ action: "build_ready" });
  });
});
