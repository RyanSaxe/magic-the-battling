export type Phase = "draft" | "build" | "battle" | "reward";

export const PHASE_HINTS: Record<Phase, string> = {
  draft: "Click on two cards to swap them",
  build: "Click on two cards to swap them",
  battle: "Right-click Cards on the Battlefield for actions",
  reward: "Enjoy your rewards and continue to draft.",
};

export const PHASE_RULES: Record<Phase, { title: string; rules: string[] }> = {
  draft: {
    title: "Draft Phase",
    rules: [
      "You are dealt a pack of 5 cards to draft from.",
      "Click a card in the pack and a card in your pool to swap them. You can do this any number of times.",
      "Spend 1 treasure to reroll the pack. You can do this any number of times.",
    ],
  },
  build: {
    title: "Build Phase",
    rules: [
      "Click a card in your hand and pool to swap them.",
      "Select exactly 3 basic lands to start on the battlefield untapped.",
      "Your hand size is always equal to your stage.",
      "Click ready when satisfied with your hand configuration.",
      "Your opponent will be randomly chosed from three other players at your table. If you faced one of them in the previous battle, your odds of facing versus that player is only 10%.",
    ],
  },
  battle: {
    title: "Battle Phase",
    rules: [
      "Each player starts with 10 life",
      "All basic lands start on the battlefield untapped",
      "The player with the most poison counters is on the play. If players are tied, choose randomly.",
      "There is no library - you cannot draw cards or mill.",
      "Any treasures a player has at the beginning of the battle will start on the battlefield.",
      "Conceding is not allowed because Treasure tokens created during a battle persist afterwards.",
      "A draw is considered a loss for both players.",
      "Losing player(s) get N poison counters, where N is 1 + the number of upgrades their opponent has applied.",
      "Poison counters persist between battles. You are eliminated when you reach 10 poison counters.",
      "After the battle, you keep up to 5 treasures that are still on your battlefield, which can be used for rolling in the draft or for mana in the next battle.",
    ],
  },
  reward: {
    title: "Reward Phase",
    rules: [
      "+1 treasure.",
      "+1 random card.",
      "Every third battle, the random card is replaced with an upgrade.",
      "Every third battle, you receive a Vanquisher card (increases your hand size by 1).",
    ],
  },
};
