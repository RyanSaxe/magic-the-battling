import { describe, expect, it } from "vitest";
import type { LobbyState } from "../types";
import { createAppError } from "../utils/appError";
import {
  IDLE_START_FLOW,
  transitionStartFlow,
  type StartFlowState,
} from "./useStartFlow";

function makeLobby(overrides: Partial<LobbyState> = {}): LobbyState {
  return {
    game_id: "game-1",
    join_code: "ABC123",
    cube_id: "auto",
    players: [],
    can_start: false,
    is_started: false,
    start_status: "open",
    start_error: null,
    target_player_count: 4,
    puppet_count: 3,
    cube_loading_status: "loading",
    cube_loading_error: null,
    available_puppet_count: 3,
    play_mode: "limited",
    use_upgrades: true,
    voice_chat_enabled: false,
    guided_mode_default: false,
    auto_approve_spectators: false,
    previous_host_id: null,
    ...overrides,
  };
}

describe("transitionStartFlow", () => {
  it("runs the full solo Goldfish lifecycle: idle -> creating -> waiting_for_start -> idle (navigate)", () => {
    const creating = transitionStartFlow(IDLE_START_FLOW, {
      type: "begin_create",
      mode: "solo",
      playMode: "limited",
      attempt: 1,
      opponents: 3,
    });
    expect(creating.state).toEqual({
      kind: "creating",
      mode: "solo",
      playMode: "limited",
      attempt: 1,
      opponents: 3,
    });

    const waiting = transitionStartFlow(creating.state, {
      type: "created",
      attempt: 1,
      gameId: "game-1",
      sessionId: "sess-1",
    });
    expect(waiting.state).toEqual({
      kind: "waiting_for_start",
      mode: "solo",
      playMode: "limited",
      gameId: "game-1",
      sessionId: "sess-1",
      opponents: 3,
      step: "loading_cube",
    });

    const readying = transitionStartFlow(waiting.state, {
      type: "lobby_updated",
      lobby: makeLobby({
        cube_loading_status: "ready",
        available_puppet_count: 3,
      }),
    });
    expect(readying.state).toMatchObject({
      kind: "waiting_for_start",
      step: "readying",
    });
    expect(readying.effects).toEqual([{ type: "set_ready", ready: true }]);

    const starting = transitionStartFlow(readying.state, {
      type: "lobby_updated",
      lobby: makeLobby({ cube_loading_status: "ready", can_start: true }),
    });
    expect(starting.state).toMatchObject({
      kind: "waiting_for_start",
      step: "starting",
    });
    expect(starting.effects).toEqual([{ type: "start_game" }]);

    const navigated = transitionStartFlow(starting.state, {
      type: "game_started",
      gameId: "game-1",
    });
    expect(navigated.state).toEqual(IDLE_START_FLOW);
    expect(navigated.effects).toEqual([
      expect.objectContaining({ type: "navigate", path: "/game/game-1/play" }),
    ]);
  });

  it("navigates to lobby immediately once cube is ready in friends mode", () => {
    const waiting: StartFlowState = {
      kind: "waiting_for_start",
      mode: "friends",
      playMode: "constructed",
      gameId: "game-2",
      sessionId: "sess-2",
      opponents: 3,
      step: "loading_cube",
    };

    const ready = transitionStartFlow(waiting, {
      type: "lobby_updated",
      lobby: makeLobby({ game_id: "game-2", cube_loading_status: "ready" }),
    });
    expect(ready.state).toEqual(IDLE_START_FLOW);
    expect(ready.effects).toEqual([
      expect.objectContaining({ type: "navigate", path: "/game/game-2/lobby" }),
    ]);
  });

  it("transitions to failed(not_enough_puppets) and abandons previous game when retrying with fewer opponents", () => {
    const waiting: StartFlowState = {
      kind: "waiting_for_start",
      mode: "solo",
      playMode: "limited",
      gameId: "game-1",
      sessionId: "sess-1",
      opponents: 3,
      step: "loading_cube",
    };

    const notEnough = transitionStartFlow(waiting, {
      type: "lobby_updated",
      lobby: makeLobby({
        cube_loading_status: "ready",
        puppet_count: 3,
        available_puppet_count: 1,
      }),
    });
    expect(notEnough.state).toEqual({
      kind: "failed",
      reason: "not_enough_puppets",
      mode: "solo",
      message: "Not enough puppet data",
      gameId: "game-1",
      availablePuppets: 1,
    });

    const retried = transitionStartFlow(notEnough.state, {
      type: "begin_create",
      mode: "solo",
      playMode: "limited",
      attempt: 2,
      opponents: 1,
    });
    expect(retried.state.kind).toBe("creating");
    expect(retried.effects).toEqual([{ type: "abandon", gameId: "game-1" }]);
  });

  it("recovers cleanly from cube error, server start refusal, connection error, and cancel", () => {
    const waiting: StartFlowState = {
      kind: "waiting_for_start",
      mode: "solo",
      playMode: "limited",
      gameId: "game-1",
      sessionId: "sess-1",
      opponents: 3,
      step: "starting",
    };

    const serverRefused = transitionStartFlow(waiting, {
      type: "server_error",
      error: createAppError({
        code: "SERVER_UPDATING",
        detail: "Server is updating.",
        context: "play-connection",
        fallbackMessage: "Error",
      }),
    });
    expect(serverRefused.state).toEqual(IDLE_START_FLOW);
    expect(serverRefused.effects).toEqual([
      { type: "toast", message: expect.any(String) },
      { type: "abandon", gameId: "game-1" },
    ]);

    const seatMoved = transitionStartFlow(waiting, {
      type: "connection_failed",
      error: createAppError({
        code: "SEAT_MOVED",
        context: "play-connection",
        fallbackMessage: "Moved",
      }),
    });
    expect(seatMoved.state).toEqual(IDLE_START_FLOW);
    expect(seatMoved.effects).toEqual([
      { type: "toast", message: expect.any(String) },
    ]);

    const cubeFailed = transitionStartFlow(waiting, {
      type: "lobby_updated",
      lobby: makeLobby({
        cube_loading_status: "error",
        cube_loading_error: "Bad cube",
      }),
    });
    expect(cubeFailed.state).toEqual(IDLE_START_FLOW);
    expect(cubeFailed.effects).toEqual([
      { type: "toast", message: "Bad cube" },
      { type: "abandon", gameId: "game-1" },
    ]);

    const cancelled = transitionStartFlow(waiting, { type: "cancel" });
    expect(cancelled.state).toEqual(IDLE_START_FLOW);
    expect(cancelled.effects).toEqual([{ type: "abandon", gameId: "game-1" }]);
  });

  it("ignores stale create responses from a superseded attempt", () => {
    const creating = transitionStartFlow(IDLE_START_FLOW, {
      type: "begin_create",
      mode: "friends",
      playMode: "limited",
      attempt: 2,
      opponents: 3,
    }).state;

    const stale = transitionStartFlow(creating, {
      type: "created",
      attempt: 1,
      gameId: "old",
      sessionId: "s",
    });
    expect(stale.state).toBe(creating);
  });
});
