import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameState, PlayerView, SelfPlayerView, Zones } from "../types";
import {
  BASE_RETRY_DELAY_MS,
  DISCONNECTED_GRACE_MS,
  getVoicePeerNames,
  isVoiceMicBlocked,
  parseIceCandidate,
  parseMuteState,
  parseSessionDescription,
  peerPhaseToUiState,
  queuePendingSignal,
  retryDelayForAttempt,
} from "./voiceChat";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makePlayer(overrides: Partial<PlayerView>): PlayerView {
  return {
    name: "Player",
    treasures: 0,
    poison: 0,
    phase: "draft",
    round: 1,
    stage: 1,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 7,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: [],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 1,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  };
}

function makeSelfPlayer(overrides: Partial<SelfPlayerView>): SelfPlayerView {
  return {
    ...makePlayer({ name: "Alice" }),
    hand: [],
    hand_slots: [],
    sideboard: [],
    command_zone: [],
    current_pack: null,
    last_battle_result: null,
    ...overrides,
  };
}

function makeEmptyZones(): Zones {
  return {
    battlefield: [],
    graveyard: [],
    exile: [],
    hand: [],
    sideboard: [],
    upgrades: [],
    command_zone: [],
    library: [],
    treasures: 0,
    submitted_cards: [],
    tapped_card_ids: [],
    flipped_card_ids: [],
    face_down_card_ids: [],
    counters: {},
    attachments: {},
    spawned_tokens: [],
  };
}

function makeBattle(
  opponentName: string,
  canManipulateOpponent = false,
): NonNullable<GameState["current_battle"]> {
  return {
    opponent_name: opponentName,
    coin_flip_name: "Alice",
    on_the_play_name: "Alice",
    current_turn_name: "Alice",
    your_zones: makeEmptyZones(),
    opponent_zones: makeEmptyZones(),
    opponent_hand_count: 0,
    result_submissions: {},
    your_poison: 0,
    opponent_poison: 0,
    opponent_hand_revealed: false,
    your_life: 20,
    opponent_life: 20,
    is_sudden_death: false,
    opponent_full_sideboard: [],
    can_manipulate_opponent: canManipulateOpponent,
    pending_reveal_animations: [],
  };
}

function makeGameState(overrides: Partial<GameState>): GameState {
  return {
    game_id: "game-1",
    phase: "draft",
    starting_life: 20,
    players: [],
    self_player: makeSelfPlayer({}),
    available_upgrades: [],
    current_battle: null,
    battle_resolution: null,
    use_upgrades: true,
    voice_chat_enabled: true,
    cube_id: "cube-1",
    play_mode: "limited",
    ...overrides,
  };
}

describe("getVoicePeerNames", () => {
  it("returns no peers in a solo-human game with only puppets", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bot A", is_puppet: true }),
        makePlayer({ name: "Bot B", is_puppet: true }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "draft" }),
    });

    expect(getVoicePeerNames(gameState)).toEqual([]);
  });

  it("returns only human opponents outside battle", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bob" }),
        makePlayer({ name: "Bot A", is_puppet: true }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "build" }),
    });

    expect(getVoicePeerNames(gameState)).toEqual(["Bob"]);
  });

  it("returns only the live human opponent during battle", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bob" }),
        makePlayer({ name: "Cara" }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "battle" }),
      current_battle: makeBattle("Bob"),
    });

    expect(getVoicePeerNames(gameState)).toEqual(["Bob"]);
  });

  it("skips a puppet battle opponent", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bot A", is_puppet: true }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "battle" }),
      current_battle: makeBattle("Bot A"),
    });

    expect(getVoicePeerNames(gameState)).toEqual([]);
  });

  it("skips a ghost battle where the player manipulates the opponent", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bob", is_ghost: true }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "battle" }),
      current_battle: makeBattle("Bob", true),
    });

    expect(getVoicePeerNames(gameState)).toEqual([]);
  });
});

describe("isVoiceMicBlocked", () => {
  it("reports mic blocked only when voice is enabled, unavailable, empty, and supported", () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: () => Promise.resolve(null) },
    });

    expect(isVoiceMicBlocked(true, { isAvailable: false, peers: [] })).toBe(
      true,
    );
    expect(isVoiceMicBlocked(false, { isAvailable: false, peers: [] })).toBe(
      false,
    );
    expect(isVoiceMicBlocked(true, { isAvailable: true, peers: [] })).toBe(
      false,
    );
    expect(
      isVoiceMicBlocked(true, { isAvailable: false, peers: [{ name: "Bob" }] }),
    ).toBe(false);
  });

  it("returns false when the browser lacks getUserMedia", () => {
    vi.stubGlobal("navigator", {});
    expect(isVoiceMicBlocked(true, { isAvailable: false, peers: [] })).toBe(
      false,
    );
  });
});

describe("voice signaling parsers and state helpers", () => {
  it("parses plain and prototype-backed session descriptions and rejects invalid payloads", () => {
    class ProtoSessionDescription {
      get type(): string {
        return "offer";
      }
      get sdp(): string {
        return "v=0";
      }
    }

    expect(parseSessionDescription({ type: "answer", sdp: "v=0" })).toEqual({
      type: "answer",
      sdp: "v=0",
    });
    expect(parseSessionDescription(new ProtoSessionDescription())).toEqual({
      type: "offer",
      sdp: "v=0",
    });
    expect(parseSessionDescription({ type: "invalid" })).toBeNull();
    expect(parseSessionDescription(null)).toBeNull();
  });

  it("parses ICE candidates and mute_state payloads safely", () => {
    expect(
      parseIceCandidate({
        candidate: "candidate:1",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    ).toEqual({
      candidate: "candidate:1",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: undefined,
    });
    expect(parseIceCandidate({})).toBeNull();
    expect(parseMuteState({ muted: true })).toBe(true);
    expect(parseMuteState({ muted: "yes" })).toBeNull();
  });

  it("computes grace and exponential retry delays and maps phases to UI states", () => {
    expect(retryDelayForAttempt("disconnected", 0)).toBe(DISCONNECTED_GRACE_MS);
    expect(retryDelayForAttempt("failed", 0)).toBe(BASE_RETRY_DELAY_MS);
    expect(retryDelayForAttempt("failed", 1)).toBe(BASE_RETRY_DELAY_MS * 2);
    expect(retryDelayForAttempt("failed", 2)).toBe(BASE_RETRY_DELAY_MS * 4);

    expect(
      peerPhaseToUiState({ kind: "awaiting_offer", retryAttempt: 0 }),
    ).toBe("connecting");
    expect(
      peerPhaseToUiState({
        kind: "reconnecting",
        reason: "disconnected",
        retryAttempt: 0,
      }),
    ).toBe("disconnected");
    expect(peerPhaseToUiState({ kind: "failed" })).toBe("failed");
  });

  it("replaces older queued offers and ICE with the newest offer while preserving mute_state", () => {
    const queued = queuePendingSignal(
      [
        {
          signal_type: "mute_state",
          data: { muted: true },
          from_player: "Bob",
        },
        {
          signal_type: "offer",
          data: { type: "offer", sdp: "old" },
          from_player: "Bob",
        },
        { signal_type: "ice", data: { candidate: "c1" }, from_player: "Bob" },
      ],
      {
        signal_type: "offer",
        data: { type: "offer", sdp: "new" },
        from_player: "Bob",
      },
    );

    expect(queued).toEqual([
      { signal_type: "mute_state", data: { muted: true }, from_player: "Bob" },
      {
        signal_type: "offer",
        data: { type: "offer", sdp: "new" },
        from_player: "Bob",
      },
    ]);
  });
});
