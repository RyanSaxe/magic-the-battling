import type { InputText } from "../utils/inputMode";

/** Play is the setup page before a game exists; the lobby and the game itself are in a game. */
export type HintPlace = "play" | "game";

interface Hint extends InputText {
  gameOnly?: boolean;
}

export const GAME_HINTS: Hint[] = [
  { text: "Press ? to get help for the current phase", touch: "Tap ? at the top right for help with this phase", gameOnly: true },
  { text: "A draw is treated as a loss for both players" },
  { text: "In Draft, press R to reroll your pack", touch: "In Draft, tap Roll at the bottom left for a new pack" },
  { text: "You can upgrade a card every 3 rounds" },
  { text: "Hover a card and press Z to zoom in", touch: "Tap a card, then its magnifier to zoom in" },
  { text: "Higher poison gets to choose play or draw" },
  { text: "In Build, hover a card and press U to upgrade", touch: "In Build, tap a card, then Upgrade on it" },
  { text: "Press Enter to advance to the next phase", touch: "Tap the bottom-right button to go to the next phase", gameOnly: true },
  { text: "In Fight, double click on a card to tap it", touch: "In Fight, double-tap a card to tap it" },
  { text: "Managing treasures well is key to victory" },
  { text: "Check the sidebar to see other players' cards", touch: "Tap ☰ to see other players' cards" },
  { text: "Upgrading can't be undone. Choose wisely!" },
];

export function hintsFor(place: HintPlace): InputText[] {
  return place === "game" ? GAME_HINTS : GAME_HINTS.filter((hint) => !hint.gameOnly);
}
