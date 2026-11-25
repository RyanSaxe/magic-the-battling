// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it } from "vitest";
import type { Card } from "../types";
import { ActionMenu } from "./ActionMenu";
import { CardActionMenu } from "./card/CardActionMenu";

afterEach(cleanup);

const noop = (): void => {};
const card: Card = {
  id: "card",
  name: "Wurmcoil Engine",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Artifact Creature",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: [],
  cmc: 6,
};
const zones = {
  battlefield: [card],
  library: [],
  tapped_card_ids: [],
  face_down_card_ids: [],
  counters: {},
  attachments: {},
};

function openActions(): void {
  const props: ComponentProps<typeof ActionMenu> = {
    selectedCard: { card, zone: "battlefield", owner: "player" },
    battle: {
      your_zones: zones,
      opponent_zones: zones,
      current_turn_name: "Alice",
      can_manipulate_opponent: false,
    },
    playerName: "Alice",
    sideboardCount: 0,
    opponentSideboardCount: 0,
    onAction: noop,
    onMove: noop,
    onUntapAll: noop,
    onUntapOpponentAll: noop,
    onShowSideboard: noop,
    onShowOpponentSideboard: noop,
    onCreateTreasure: noop,
    onDrawLibrary: noop,
    onShuffleLibrary: noop,
    onDrawOpponentLibrary: noop,
    onShuffleOpponentLibrary: noop,
    onPassTurn: noop,
    onRollDie: noop,
    onClose: noop,
  };
  render(<ActionMenu {...props} />);
}

function openCardMenu(): void {
  render(
    <CardActionMenu
      card={card}
      position={{ x: 0, y: 0 }}
      zone="battlefield"
      isTapped={false}
      isFlipped={false}
      counters={{}}
      isAttached={false}
      battlefieldCards={[card]}
      onAction={noop}
      onMove={noop}
      onClose={noop}
    />,
  );
}

// A submenu that closed as another opened moved the row just clicked out from under the pointer.
it.each([
  ["Actions", openActions],
  ["a card's", openCardMenu],
])("keeps a submenu open in %s menu until it is tapped again", (_, open) => {
  open();
  const moveTo = screen.getByRole("button", { name: /Move To/ });
  const addCounter = screen.getByRole("button", { name: /Add Counter/ });

  fireEvent.click(moveTo);
  fireEvent.click(addCounter);
  expect(moveTo.getAttribute("aria-expanded")).toBe("true");
  expect(addCounter.getAttribute("aria-expanded")).toBe("true");

  fireEvent.click(moveTo);
  expect(moveTo.getAttribute("aria-expanded")).toBe("false");
  expect(addCounter.getAttribute("aria-expanded")).toBe("true");
});
