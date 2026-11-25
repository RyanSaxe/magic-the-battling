// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { GameSummary } from "../../types";
import { GameTile, RecapCard } from "./GameTile";

const GAME: GameSummary = {
  game_id: "game-1",
  created_at: "2026-01-02T00:00:00Z",
  player_count: 4,
  human_count: 1,
  best_human_name: "Alice",
  best_human_placement: 2,
  cube_id: "vintage-cube",
  cube_name: "Vintage Cube",
  hand_scryfall_ids: ["a1", "b2", "c3", "d4", "e5"],
};

function Recap() {
  const { gameId, playerName } = useParams();
  return (
    <p>
      Recap of {gameId} for {playerName}
    </p>
  );
}

describe("a game card", () => {
  afterEach(cleanup);

  it.each([
    ["the dashboard", GameTile],
    ["a cube's history", RecapCard],
  ])(
    "on %s opens its recap from anywhere on the card, such as its hand",
    (_, Card) => {
      render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<Card game={GAME} />} />
            <Route path="/game/:gameId/share/:playerName" element={<Recap />} />
          </Routes>
        </MemoryRouter>,
      );

      const hand = document.querySelectorAll("article img");
      fireEvent.click(hand[Math.floor(hand.length / 2)]);

      expect(screen.getByText("Recap of game-1 for Alice")).toBeTruthy();
    },
  );
});
