import { describe, expect, it } from "vitest";

import {
  getAppErrorMessage,
  responseToAppError,
  unknownToAppError,
  wsPayloadToAppError,
} from "./appError";

describe("appError", () => {
  it("maps spectate target failures separately from missing games", () => {
    const error = wsPayloadToAppError(
      { code: "SPECTATE_TARGET_NOT_FOUND", detail: "Target player not found" },
      "default",
      "Fallback message",
    );

    expect(
      getAppErrorMessage(error, "game-connection", "Fallback message"),
    ).toBe("That player is no longer available to spectate.");
  });

  it("tells share viewers when a game is still being played", async () => {
    const response = new Response(
      JSON.stringify({
        detail: "This game is still being played",
        code: "GAME_IN_PROGRESS",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    const error = await responseToAppError(
      response,
      "share-game",
      "Failed to load shared game",
    );

    expect(error.message).toBe(
      "This game is still being played. Its review opens when the game ends.",
    );
  });

  it("uses create-game specific copy for server updates", () => {
    const error = wsPayloadToAppError(
      {
        code: "SERVER_UPDATING",
        detail: "Server is updating. New games are temporarily blocked.",
      },
      "default",
      "Fallback message",
    );

    expect(
      getAppErrorMessage(error, "create-game", "Fallback message"),
    ).toContain("New games are temporarily paused");
  });

  it("says a join code was not found instead of blaming a server restart", () => {
    const error = wsPayloadToAppError(
      { code: "GAME_NOT_FOUND", detail: "Game not found" },
      "default",
      "Fallback message",
    );

    expect(getAppErrorMessage(error, "join-game", "Fallback message")).toBe(
      "No game found with that join code. Check the code and try again.",
    );
  });

  it("preserves user-facing details for user-message errors", () => {
    const error = unknownToAppError(
      new Error("Battler is still loading"),
      "lobby-action",
      "Fallback message",
    );

    expect(error.message).toBe("Battler is still loading");
  });
});
