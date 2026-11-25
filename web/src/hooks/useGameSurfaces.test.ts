import { describe, expect, it } from "vitest";
import type {
  BattleCardMenu,
  BattleSelectedCard,
} from "../pages/phases/Battle";
import type { Card, ServerNoticeStatus } from "../types";
import {
  createGameSurfacesState,
  isServerStatusHidden,
  isZonePanelOpen,
  reduceGameSurfaces,
  selectGameSurfacesView,
  type GameSurface,
  type GameSurfacesEvent,
} from "./useGameSurfaces";

const sampleCard: Card = {
  id: "card-1",
  name: "Lightning Bolt",
  image_url: "",
  flip_image_url: null,
  png_url: null,
  flip_png_url: null,
  type_line: "Instant",
  tokens: [],
  elo: null,
  upgrade_target: null,
  oracle_text: null,
  colors: ["R"],
  cmc: 1,
};

const cardMenu: BattleCardMenu = {
  card: sampleCard,
  zone: "graveyard",
  position: { x: 100, y: 120 },
};

const graveyardSelected: BattleSelectedCard = {
  card: sampleCard,
  zone: "graveyard",
  owner: "player",
};

const battlefieldSelected: BattleSelectedCard = {
  card: sampleCard,
  zone: "battlefield",
  owner: "player",
};

const graveyard: GameSurface = {
  kind: "zone",
  zone: "graveyard",
  owner: "player",
};

const opponentGraveyard: GameSurface = {
  kind: "zone",
  zone: "graveyard",
  owner: "opponent",
};

describe("reduceGameSurfaces", () => {
  it("replaces conflicting surfaces when opening a second surface", () => {
    const events: GameSurfacesEvent[] = [
      { type: "open", surface: graveyard },
      { type: "open", surface: { kind: "actions" } },
    ];
    const state = events.reduce(
      reduceGameSurfaces,
      createGameSurfacesState("battle"),
    );

    expect(state.surfaces).toEqual([{ kind: "actions" }]);
    expect(selectGameSurfacesView(state).topSurface).toEqual({
      kind: "actions",
    });
  });

  it("toggles a surface closed only when the same surface is on top", () => {
    const opened = reduceGameSurfaces(createGameSurfacesState("battle"), {
      type: "open",
      surface: graveyard,
    });
    expect(
      reduceGameSurfaces(opened, { type: "toggle", surface: graveyard })
        .surfaces,
    ).toEqual([]);
    expect(
      reduceGameSurfaces(opened, { type: "toggle", surface: opponentGraveyard })
        .surfaces,
    ).toEqual([opponentGraveyard]);
  });

  it("ignores closing a surface kind that is not currently open", () => {
    const state = reduceGameSurfaces(createGameSurfacesState("build"), {
      type: "open",
      surface: { kind: "players" },
    });
    expect(reduceGameSurfaces(state, { type: "close", kind: "zone" })).toBe(
      state,
    );
  });

  it("restores an open Guide where it was after Players and Scouting close", () => {
    const target = { docId: "draft", tab: "faq" };
    const opened = (
      [
        { type: "open", surface: { kind: "guide", target } },
        { type: "open", surface: { kind: "players" } },
        { type: "scout", player: "Bob", tab: "seen" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("draft"));

    const openedView = selectGameSurfacesView(opened);
    expect(openedView.drawerOpen).toBe(true);
    expect(openedView.scouting).toEqual({
      player: "Bob",
      tab: "seen",
      fromDrawer: true,
    });
    expect(openedView.guideSurface).toEqual({ kind: "guide", target });
    expect(openedView.guideOnScreen).toBe(false);
    expect(openedView.blocksGuides).toBe(true);

    const afterScouting = reduceGameSurfaces(opened, {
      type: "close",
      kind: "scouting",
    });
    const afterScoutingView = selectGameSurfacesView(afterScouting);
    expect(afterScoutingView.topSurface).toEqual({ kind: "players" });
    expect(afterScoutingView.guideOnScreen).toBe(false);

    const afterPlayers = reduceGameSurfaces(afterScouting, {
      type: "close",
      kind: "players",
    });
    const afterPlayersView = selectGameSurfacesView(afterPlayers);
    expect(afterPlayers.surfaces).toEqual([{ kind: "guide", target }]);
    expect(afterPlayersView.guideOnScreen).toBe(true);
    expect(afterPlayersView.guideExpanded).toBe(true);
  });

  it("closes both Scouting and Players when closing the Players drawer directly", () => {
    const opened = (
      [
        { type: "open", surface: { kind: "guide" } },
        { type: "open", surface: { kind: "players" } },
        { type: "scout", player: "Bob", tab: "overview" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("build"));

    const closed = reduceGameSurfaces(opened, {
      type: "close",
      kind: "players",
    });
    const view = selectGameSurfacesView(closed);
    expect(closed.surfaces).toEqual([{ kind: "guide" }]);
    expect(view.drawerOpen).toBe(false);
    expect(view.scouting).toBeNull();
  });

  it("keeps a minimized Guide beside zone panels and card menus, and peels Escape one layer at a time", () => {
    const minimized = (
      [
        { type: "open", surface: { kind: "guide", target: { tab: "faq" } } },
        { type: "guideMinimized", minimized: true },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));
    const minView = selectGameSurfacesView(minimized);
    expect(minView.guideMinimized).toBe(true);
    expect(minView.guideOnScreen).toBe(true);
    expect(minView.guideExpanded).toBe(false);
    expect(minView.blocksHotkeys).toBe(false);

    const stacked = (
      [
        { type: "open", surface: graveyard },
        { type: "open", surface: { kind: "cardMenu", menu: cardMenu } },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, minimized);
    const stackedView = selectGameSurfacesView(stacked);
    expect(stackedView.guideOnScreen).toBe(true);
    expect(isZonePanelOpen(stacked, "graveyard", "player")).toBe(true);
    expect(stackedView.cardMenu).toEqual(cardMenu);
    expect(stackedView.blocksHotkeys).toBe(true);

    const afterEsc1 = reduceGameSurfaces(stacked, { type: "escape" });
    const esc1View = selectGameSurfacesView(afterEsc1);
    expect(esc1View.cardMenu).toBeNull();
    expect(esc1View.zonePanel).toEqual({ zone: "graveyard", owner: "player" });
    expect(esc1View.guideOnScreen).toBe(true);

    const afterEsc2 = reduceGameSurfaces(afterEsc1, { type: "escape" });
    const esc2View = selectGameSurfacesView(afterEsc2);
    expect(esc2View.zonePanel).toBeNull();
    expect(esc2View.topSurface).toEqual({
      kind: "guide",
      target: { tab: "faq" },
      minimized: true,
    });

    const afterEsc3 = reduceGameSurfaces(afterEsc2, { type: "escape" });
    expect(afterEsc3.surfaces).toEqual([]);
  });

  it("hides a minimized Guide behind Submit Result and restores it on Escape, but clears both on closeOverlays", () => {
    const behindSubmit = (
      [
        { type: "open", surface: { kind: "guide" } },
        { type: "guideMinimized", minimized: true },
        { type: "open", surface: { kind: "submitResult" } },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));

    const behindView = selectGameSurfacesView(behindSubmit);
    expect(behindView.guideOnScreen).toBe(false);
    expect(behindView.blocksGuides).toBe(false);

    const backedOut = reduceGameSurfaces(behindSubmit, { type: "escape" });
    const backedView = selectGameSurfacesView(backedOut);
    expect(backedView.guideOnScreen).toBe(true);
    expect(backedView.guideMinimized).toBe(true);

    const submitted = reduceGameSurfaces(behindSubmit, {
      type: "closeOverlays",
    });
    expect(submitted.surfaces).toEqual([]);
  });

  it("restores a minimized Guide to full size when reopened or unminimized, keeping its target unless given a new one", () => {
    const targetA = { docId: "draft", tab: "controls" };
    const targetB = { docId: "draft", tab: "controls" };
    const minimized = (
      [
        { type: "open", surface: { kind: "guide", target: targetA } },
        { type: "guideMinimized", minimized: true },
        { type: "open", surface: { kind: "players" } },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("draft"));

    const restoredSame = reduceGameSurfaces(minimized, {
      type: "open",
      surface: { kind: "guide" },
    });
    expect(restoredSame.surfaces).toEqual([{ kind: "guide", target: targetA }]);
    expect(selectGameSurfacesView(restoredSame).guideSurface?.target).toBe(
      targetA,
    );

    const reopenedWithLink = reduceGameSurfaces(minimized, {
      type: "open",
      surface: { kind: "guide", target: targetB },
    });
    expect(selectGameSurfacesView(reopenedWithLink).guideSurface?.target).toBe(
      targetB,
    );

    const unminimized = reduceGameSurfaces(minimized, {
      type: "guideMinimized",
      minimized: false,
    });
    expect(unminimized.surfaces).toEqual([
      { kind: "guide", target: targetA, minimized: false },
    ]);
  });

  it("closes overlays while preserving players, scouting, or an explicit exception", () => {
    const submitResult = reduceGameSurfaces(createGameSurfacesState("battle"), {
      type: "open",
      surface: { kind: "submitResult" },
    });
    expect(
      reduceGameSurfaces(submitResult, {
        type: "closeOverlays",
        except: "submitResult",
      }).surfaces,
    ).toEqual([{ kind: "submitResult" }]);

    const withZone = reduceGameSurfaces(createGameSurfacesState("battle"), {
      type: "open",
      surface: graveyard,
    });
    expect(
      reduceGameSurfaces(withZone, {
        type: "closeOverlays",
        except: "submitResult",
      }).surfaces,
    ).toEqual([]);

    const drawerWithGuide = (
      [
        { type: "open", surface: { kind: "guide" } },
        { type: "open", surface: { kind: "players" } },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("build"));
    expect(
      reduceGameSurfaces(drawerWithGuide, { type: "closeOverlays" }).surfaces,
    ).toEqual([{ kind: "players" }]);
    expect(
      reduceGameSurfaces(drawerWithGuide, {
        type: "closeOverlays",
        except: "guide",
      }).surfaces,
    ).toEqual([{ kind: "guide" }, { kind: "players" }]);
  });

  it("clears transient surfaces and selection on phase changes and fight end", () => {
    for (const surface of [
      graveyard,
      { kind: "actions" },
      { kind: "submitResult" },
      { kind: "cardMenu", menu: cardMenu },
    ] satisfies GameSurface[]) {
      const state = (
        [
          { type: "open", surface },
          { type: "selectCard", card: battlefieldSelected },
          { type: "phaseChanged", phase: "reward" },
        ] satisfies GameSurfacesEvent[]
      ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));
      expect(state.surfaces).toEqual([]);
      expect(state.selectedCard).toBeNull();
    }

    const buildSubmit = (
      [
        { type: "open", surface: { kind: "submitHand" } },
        { type: "phaseChanged", phase: "battle" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("build"));
    expect(buildSubmit.surfaces).toEqual([]);

    const playersAcrossPhase = (
      [
        { type: "open", surface: { kind: "players" } },
        { type: "scout", player: "Bob", tab: "seen" },
        { type: "phaseChanged", phase: "reward" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));
    expect(playersAcrossPhase.surfaces).toEqual([{ kind: "players" }]);

    const dockedScoutingAcrossPhase = (
      [
        { type: "scout", player: "Bob", tab: "overview" },
        { type: "phaseChanged", phase: "build" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("draft"));
    expect(dockedScoutingAcrossPhase.surfaces).toEqual([]);

    const fightEndCleared = (
      [
        { type: "open", surface: { kind: "guide" } },
        { type: "guideMinimized", minimized: true },
        { type: "open", surface: graveyard },
        { type: "open", surface: { kind: "cardMenu", menu: cardMenu } },
        { type: "selectCard", card: graveyardSelected },
        { type: "fightEnded" },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));
    expect(fightEndCleared.surfaces).toEqual([
      { kind: "guide", minimized: true },
    ]);
    expect(fightEndCleared.selectedCard).toBeNull();
  });

  it("manages panel card selection across panel, cardMenu, Actions, and cardMoved", () => {
    const inPanel = (
      [
        { type: "open", surface: graveyard },
        { type: "selectCard", card: graveyardSelected },
      ] satisfies GameSurfacesEvent[]
    ).reduce(reduceGameSurfaces, createGameSurfacesState("battle"));
    expect(inPanel.selectedCard).toEqual(graveyardSelected);

    const withMenu = reduceGameSurfaces(inPanel, {
      type: "open",
      surface: { kind: "cardMenu", menu: cardMenu },
    });
    expect(withMenu.selectedCard).toEqual(graveyardSelected);

    const withActions = reduceGameSurfaces(inPanel, {
      type: "open",
      surface: { kind: "actions" },
    });
    expect(withActions.selectedCard).toEqual(graveyardSelected);

    const toOpponentPanel = reduceGameSurfaces(withActions, {
      type: "open",
      surface: opponentGraveyard,
    });
    expect(toOpponentPanel.selectedCard).toEqual(graveyardSelected);

    const actionsDismissed = reduceGameSurfaces(withActions, {
      type: "escape",
    });
    expect(actionsDismissed.selectedCard).toBeNull();

    const moved = reduceGameSurfaces(inPanel, {
      type: "cardMoved",
      cardId: sampleCard.id,
    });
    expect(moved.selectedCard).toBeNull();
  });

  it("tracks server status window dismissal per notice timestamp", () => {
    const noticeV1: ServerNoticeStatus = {
      mode: "draining",
      message: "Updating soon",
      updated_at: "2026-11-25T10:00:00Z",
    };
    const noticeV2: ServerNoticeStatus = {
      mode: "maintenance",
      message: "Maintenance",
      updated_at: "2026-11-25T10:15:00Z",
    };

    const initial = createGameSurfacesState("draft");
    expect(isServerStatusHidden(initial, noticeV1)).toBe(false);

    const dismissed = reduceGameSurfaces(initial, {
      type: "dismissServerStatus",
      updatedAt: noticeV1.updated_at,
    });
    expect(isServerStatusHidden(dismissed, noticeV1)).toBe(true);
    expect(isServerStatusHidden(dismissed, noticeV2)).toBe(false);
  });

  it("reports consistent hotkey and Guided Mode blocking from the same surface state", () => {
    const emptyView = selectGameSurfacesView(createGameSurfacesState("battle"));
    expect(emptyView.blocksHotkeys).toBe(false);
    expect(emptyView.blocksGuides).toBe(false);

    const upgradesView = selectGameSurfacesView(
      reduceGameSurfaces(createGameSurfacesState("battle"), {
        type: "open",
        surface: { kind: "upgrades", mode: "view", revealIds: [] },
      }),
    );
    expect(upgradesView.blocksHotkeys).toBe(true);
    expect(upgradesView.blocksGuides).toBe(true);

    const shareView = selectGameSurfacesView(
      reduceGameSurfaces(createGameSurfacesState("battle"), {
        type: "open",
        surface: { kind: "share" },
      }),
    );
    expect(shareView.blocksHotkeys).toBe(true);
    expect(shareView.blocksGuides).toBe(true);

    const zoneView = selectGameSurfacesView(
      reduceGameSurfaces(createGameSurfacesState("battle"), {
        type: "open",
        surface: graveyard,
      }),
    );
    expect(zoneView.blocksHotkeys).toBe(false);
    expect(zoneView.blocksGuides).toBe(false);
  });
});
