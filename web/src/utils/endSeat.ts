import { closeSeat } from "../api/client";
import { AppError, unknownToAppError } from "./appError";
import { forgetSeatForGame } from "./deviceIdentity";

const RETRY_MS = 1000;
const RETRIES = 30;

/** Ends a seat for good, then forgets it. A game or seat that's already gone is as ended as this could make it. */
export async function endSeat(
  gameId: string,
  playerName: string,
  seatToken: string,
): Promise<void> {
  try {
    await closeSeat(gameId, playerName, seatToken);
  } catch (error) {
    const appError = unknownToAppError(
      error,
      "default",
      "Couldn't close it. Try again.",
    );
    if (
      appError.code !== "GAME_NOT_FOUND" &&
      appError.code !== "PLAYER_NOT_IN_GAME"
    ) {
      throw appError;
    }
  }
  forgetSeatForGame(gameId);
}

interface SeatCredentials {
  gameId: string;
  playerName: string;
  seatToken: string;
}

async function abandonSeatAttempt(
  seat: SeatCredentials,
  retry: number,
): Promise<void> {
  try {
    await endSeat(seat.gameId, seat.playerName, seat.seatToken);
    return;
  } catch (error) {
    // The server refuses with 409 while the lobby starts, and takes the close once it has started or failed.
    if (
      !(error instanceof AppError && error.status === 409) ||
      retry === RETRIES
    ) {
      return;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  return abandonSeatAttempt(seat, retry + 1);
}

/** Ends the seat of a start the player gave up. One that can't end stays remembered, so Resume can still close it. */
export async function abandonSeat(
  gameId: string,
  playerName: string,
  seatToken: string,
): Promise<void> {
  return abandonSeatAttempt({ gameId, playerName, seatToken }, 0);
}
