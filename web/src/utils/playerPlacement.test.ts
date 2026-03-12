import { describe, expect, it } from "vitest";
import type { PlayerView } from "../types";
import {
  comparePlayersForSidebar,
  getSidebarPlacementRank,
  getSidebarPlayerOrder,
} from "./playerPlacement";

function makePlayer(
  overrides: Partial<PlayerView>,
): PlayerView {
  return {
    name: "player",
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
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  };
}

describe("player placement ordering", () => {
  it("breaks equal final placements by name and assigns unique display ranks", () => {
    const players = [
      makePlayer({ name: "Zulu", placement: 2 }),
      makePlayer({ name: "Alpha", placement: 2 }),
      makePlayer({ name: "Bravo", placement: 4 }),
    ];

    expect(getSidebarPlayerOrder(players).map((player) => player.name)).toEqual([
      "Alpha",
      "Zulu",
      "Bravo",
    ]);
    expect(getSidebarPlacementRank(players[1], players)).toBe(1);
    expect(getSidebarPlacementRank(players[0], players)).toBe(2);
    expect(getSidebarPlacementRank(players[2], players)).toBe(3);
  });

  it("keeps alive players ahead of eliminated players and breaks alive ties by name", () => {
    const players = [
      makePlayer({ name: "Charlie", placement: 0, poison: 3 }),
      makePlayer({ name: "Alpha", placement: 0, poison: 3 }),
      makePlayer({ name: "Bravo", placement: 4 }),
    ];

    expect([...players].sort(comparePlayersForSidebar).map((player) => player.name)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
    ]);
  });
});
