import { describe, expect, it } from "vitest";

import type { GameState, PlayerView, SelfPlayerView } from "../types";
import { getVoicePeerNames } from "./voiceChat";

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
    sideboard: [],
    command_zone: [],
    current_pack: null,
    last_battle_result: null,
    ...overrides,
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

  it("skips a puppet battle opponent", () => {
    const gameState = makeGameState({
      players: [
        makePlayer({ name: "Alice" }),
        makePlayer({ name: "Bot A", is_puppet: true }),
      ],
      self_player: makeSelfPlayer({ name: "Alice", phase: "battle" }),
      current_battle: {
        opponent_name: "Bot A",
        coin_flip_name: "Alice",
        on_the_play_name: "Alice",
        current_turn_name: "Alice",
        your_zones: {
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
        },
        opponent_zones: {
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
        },
        opponent_hand_count: 0,
        result_submissions: {},
        your_poison: 0,
        opponent_poison: 0,
        opponent_hand_revealed: false,
        your_life: 20,
        opponent_life: 20,
        is_sudden_death: false,
        opponent_full_sideboard: [],
        can_manipulate_opponent: false,
        pending_reveal_animations: [],
      },
    });

    expect(getVoicePeerNames(gameState)).toEqual([]);
  });
});
