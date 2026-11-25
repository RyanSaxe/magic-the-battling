// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ZoneOwner } from "../dnd/types";
import type { Card, Zones } from "../types";
import { ActionMenu } from "./ActionMenu";

afterEach(cleanup);

const noop = (): void => {};

const card: Card = {
  id: "card-1",
  name: "Mantis Rider",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Creature",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 3,
};

function zones(faceDown: string[] = []): Zones {
  return {
    battlefield: faceDown.length ? [card] : [],
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
    face_down_card_ids: faceDown,
    counters: {},
    attachments: {},
    spawned_tokens: [],
  };
}

type ActionMenuProps = ComponentProps<typeof ActionMenu>;

function renderMenu(
  overrides: Partial<ActionMenuProps> &
    Pick<ActionMenuProps, "selectedCard" | "battle" | "playerName">,
): void {
  render(
    <ActionMenu
      sideboardCount={0}
      opponentSideboardCount={0}
      onAction={noop}
      onMove={noop}
      onUntapAll={noop}
      onUntapOpponentAll={noop}
      onShowSideboard={noop}
      onShowOpponentSideboard={noop}
      onCreateTreasure={noop}
      onDrawLibrary={noop}
      onShuffleLibrary={noop}
      onDrawOpponentLibrary={noop}
      onShuffleOpponentLibrary={noop}
      onPassTurn={noop}
      onRollDie={noop}
      onClose={noop}
      {...overrides}
    />,
  );
}

describe("ActionMenu", () => {
  it.each<ZoneOwner>(["player", "opponent"])(
    "offers to turn the %s's face-down card face up",
    (owner: ZoneOwner) => {
      renderMenu({
        selectedCard: { card, zone: "battlefield", owner },
        battle: {
          your_zones: zones(owner === "player" ? ["card-1"] : []),
          opponent_zones: zones(owner === "opponent" ? ["card-1"] : []),
          current_turn_name: "Alice",
          can_manipulate_opponent: true,
        },
        playerName: "Alice",
      });

      expect(screen.getByRole("button", { name: "Turn Face Up" })).toBeTruthy();
    },
  );

  it.each([
    ["Puppet", true, false],
    ["Bob", false, true],
  ])(
    "sets Pass Turn disabled=%s when turn is %s (can_manipulate_opponent=%s)",
    (turn, againstPuppet, expectedDisabled) => {
      renderMenu({
        selectedCard: null,
        battle: {
          your_zones: zones(),
          opponent_zones: zones(),
          current_turn_name: turn,
          can_manipulate_opponent: againstPuppet,
        },
        playerName: "Alice",
        sideboardCount: 0,
        opponentSideboardCount: 0,
      });

      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Pass Turn" })
          .disabled,
      ).toBe(expectedDisabled);
    },
  );
});
