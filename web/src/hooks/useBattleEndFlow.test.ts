import { describe, expect, it } from "vitest";
import type {
  BattleResolution,
  BattleView,
  Card,
  RevealAnimation,
  Zones,
} from "../types";
import {
  createBattleEndFlowState,
  selectBattleEndView,
  transitionBattleEndFlow,
  type BattleEndServerSnapshot,
} from "./useBattleEndFlow";

function makeCard(id: string, name: string, isRevealed?: boolean): Card {
  return {
    id,
    name,
    image_url: "",
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: "Creature",
    tokens: [],
    elo: null,
    upgrade_target: null,
    is_revealed: isRevealed,
    oracle_text: null,
    colors: [],
    cmc: 2,
  };
}

function makeZones(): Zones {
  return {
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
  };
}

function makeBattle(overrides: Partial<BattleView> = {}): BattleView {
  return {
    opponent_name: "Bob",
    coin_flip_name: "Alice",
    on_the_play_name: "Alice",
    current_turn_name: "Alice",
    your_zones: makeZones(),
    opponent_zones: makeZones(),
    opponent_hand_count: 3,
    opponent_hand_revealed: false,
    your_life: 20,
    opponent_life: 20,
    your_poison: 0,
    opponent_poison: 0,
    result_submissions: {},
    is_sudden_death: false,
    opponent_full_sideboard: [],
    can_manipulate_opponent: false,
    pending_reveal_animations: [],
    ...overrides,
  };
}

function makeResolution(id: string): BattleResolution {
  return {
    resolution_id: id,
    winner_name: "Alice",
    is_draw: false,
    is_sudden_death: false,
    continue_sudden_death: false,
    your_side: {
      name: "Alice",
      starting_poison: 0,
      ending_poison: 0,
      poison_delta: 0,
      took_damage: false,
      is_lethal: false,
      show_death_animation: false,
      events: [],
    },
    opponent_side: {
      name: "Bob",
      starting_poison: 0,
      ending_poison: 1,
      poison_delta: 1,
      took_damage: true,
      is_lethal: false,
      show_death_animation: false,
      events: [{ event_type: "base_increment", source_card_id: null }],
    },
  };
}

function makeRevealAnimation(animationId: string): RevealAnimation {
  return {
    animation_id: animationId,
    upgrade: makeCard("upg-1", "Power Boost", true),
    target: makeCard("card-1", "Grizzly Bears"),
    player_name: "Alice",
  };
}

function battleSnapshot(
  overrides: Partial<BattleEndServerSnapshot> = {},
): BattleEndServerSnapshot {
  return {
    phase: "battle",
    currentBattle: makeBattle(),
    battleResolution: null,
    selfPlayerName: "Alice",
    selfUpgrades: [],
    connected: true,
    ...overrides,
  };
}

describe("transitionBattleEndFlow", () => {
  it("runs the full idle -> submitting -> revealing -> submitting -> showing_result -> transitioning -> idle lifecycle", () => {
    const hiddenUpgrade = makeCard("upg-1", "Power Boost", false);
    const revealedUpgrade = makeCard("upg-1", "Power Boost", true);
    const revealAnim = makeRevealAnimation("anim-1");
    const resolution = makeResolution("res-1");
    const battle = makeBattle();

    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot({
        currentBattle: battle,
        selfUpgrades: [hiddenUpgrade],
      }),
    });
    expect(seeded.state.stage).toEqual({ kind: "idle" });
    expect(selectBattleEndView(seeded.state).blocksHotkeys).toBe(false);

    const chosen = transitionBattleEndFlow(seeded.state, {
      type: "submit_chosen",
      result: "Alice",
      hasUnrevealedUpgrades: true,
    });
    const chosenView = selectBattleEndView(chosen.state);
    expect(chosen.state.stage).toEqual({
      kind: "submitting",
      result: "Alice",
      confirmingReveal: true,
    });
    expect(chosenView.confirmingReveal).toBe(true);
    expect(chosenView.blocksHotkeys).toBe(true);
    expect(chosenView.blocksGuides).toBe(true);
    expect(chosen.effects).toEqual([]);

    const confirming = transitionBattleEndFlow(chosen.state, {
      type: "confirm_reveal_and_submit",
      upgradeIds: ["upg-1"],
    });
    expect(confirming.state.stage).toEqual({
      kind: "revealing",
      pendingSubmitResult: "Alice",
      expectedUpgradeIds: ["upg-1"],
      activeAnimation: null,
    });
    expect(selectBattleEndView(confirming.state).submitPending).toBe(true);
    expect(confirming.effects).toEqual([
      { type: "reveal_upgrades", upgradeIds: ["upg-1"] },
      { type: "close_overlays" },
    ]);

    const animArrived = transitionBattleEndFlow(confirming.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        currentBattle: makeBattle({ pending_reveal_animations: [revealAnim] }),
        selfUpgrades: [revealedUpgrade],
      }),
    });
    const animView = selectBattleEndView(animArrived.state);
    expect(animView.activeRevealAnimation).toEqual(revealAnim);
    expect(animView.blocksHotkeys).toBe(true);

    const animDone = transitionBattleEndFlow(animArrived.state, {
      type: "reveal_animation_completed",
      pendingAnimations: [revealAnim],
    });
    expect(animDone.state.stage).toEqual({
      kind: "submitting",
      result: "Alice",
      confirmingReveal: false,
    });
    expect(selectBattleEndView(animDone.state).submitPending).toBe(true);
    expect(animDone.effects).toEqual([
      { type: "submit_result", result: "Alice" },
    ]);

    const resolved = transitionBattleEndFlow(animDone.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        phase: "reward",
        currentBattle: null,
        battleResolution: resolution,
      }),
    });
    const resolvedView = selectBattleEndView(resolved.state);
    expect(resolved.state.stage.kind).toBe("showing_result");
    expect(resolvedView.holdsBattleScreen).toBe(true);
    expect(resolvedView.blocksHotkeys).toBe(true);
    expect(resolvedView.blocksGuides).toBe(true);
    expect(resolvedView.activeResolution?.resolution).toEqual(resolution);
    expect(resolved.effects).toEqual([{ type: "close_overlays" }]);

    const transitioning = transitionBattleEndFlow(resolved.state, {
      type: "resolution_completed",
    });
    const transitioningView = selectBattleEndView(transitioning.state);
    expect(transitioning.state.stage).toEqual({
      kind: "transitioning",
      resolutionId: "res-1",
    });
    expect(transitioningView.holdsBattleScreen).toBe(false);
    expect(transitioningView.blocksHotkeys).toBe(false);
    expect(transitioningView.blocksGuides).toBe(false);

    const settled = transitionBattleEndFlow(transitioning.state, {
      type: "transition_settled",
    });
    expect(settled.state.stage).toEqual({ kind: "idle" });

    const duplicateServerPush = transitionBattleEndFlow(settled.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        phase: "reward",
        currentBattle: null,
        battleResolution: resolution,
      }),
    });
    expect(duplicateServerPush.state.stage).toEqual({ kind: "idle" });
  });

  it("keeps submit pending until server confirms result submission, then returns to idle", () => {
    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot(),
    });

    const submitted = transitionBattleEndFlow(seeded.state, {
      type: "submit_chosen",
      result: "Bob",
      hasUnrevealedUpgrades: false,
    });
    expect(submitted.state.stage).toEqual({
      kind: "submitting",
      result: "Bob",
      confirmingReveal: false,
    });
    expect(selectBattleEndView(submitted.state).submitPending).toBe(true);
    expect(submitted.effects).toEqual([
      { type: "close_overlays" },
      { type: "submit_result", result: "Bob" },
    ]);

    const unrelated = transitionBattleEndFlow(submitted.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        currentBattle: makeBattle({ opponent_life: 15 }),
      }),
    });
    expect(selectBattleEndView(unrelated.state).submitPending).toBe(true);

    const confirmed = transitionBattleEndFlow(unrelated.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        currentBattle: makeBattle({ result_submissions: { Alice: "Bob" } }),
      }),
    });
    const confirmedView = selectBattleEndView(confirmed.state);
    expect(confirmed.state.stage).toEqual({ kind: "idle" });
    expect(confirmedView.submitPending).toBe(false);
    expect(confirmedView.blocksHotkeys).toBe(false);
  });

  it("never leaves hotkeys stuck disabled when a reveal is cancelled, fails, or disconnects", () => {
    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot({
        selfUpgrades: [makeCard("upg-1", "Boost", false)],
      }),
    });
    const confirming = transitionBattleEndFlow(seeded.state, {
      type: "submit_chosen",
      result: "Alice",
      hasUnrevealedUpgrades: true,
    });

    const cancelledChoice = transitionBattleEndFlow(confirming.state, {
      type: "cancel_reveal_choice",
    });
    expect(cancelledChoice.state.stage).toEqual({ kind: "idle" });
    expect(selectBattleEndView(cancelledChoice.state).blocksHotkeys).toBe(
      false,
    );

    const revealing = transitionBattleEndFlow(confirming.state, {
      type: "confirm_reveal_and_submit",
      upgradeIds: ["upg-1"],
    });
    expect(selectBattleEndView(revealing.state).blocksHotkeys).toBe(true);

    const afterError = transitionBattleEndFlow(revealing.state, {
      type: "server_error",
    });
    expect(afterError.state.stage).toEqual({ kind: "idle" });
    expect(selectBattleEndView(afterError.state).blocksHotkeys).toBe(false);

    const afterCancel = transitionBattleEndFlow(revealing.state, {
      type: "cancel_reveal",
    });
    expect(afterCancel.state.stage).toEqual({ kind: "idle" });
    expect(selectBattleEndView(afterCancel.state).blocksHotkeys).toBe(false);

    const afterDisconnect = transitionBattleEndFlow(revealing.state, {
      type: "server_state",
      snapshot: battleSnapshot({ connected: false }),
    });
    expect(afterDisconnect.state.stage).toEqual({ kind: "idle" });
    expect(selectBattleEndView(afterDisconnect.state).blocksHotkeys).toBe(
      false,
    );
  });

  it("handles skip-and-submit and empty reveal selection without getting stuck", () => {
    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot(),
    });
    const confirming = transitionBattleEndFlow(seeded.state, {
      type: "submit_chosen",
      result: "draw",
      hasUnrevealedUpgrades: true,
    });

    const skipped = transitionBattleEndFlow(confirming.state, {
      type: "skip_reveal_and_submit",
    });
    expect(skipped.state.stage).toEqual({
      kind: "submitting",
      result: "draw",
      confirmingReveal: false,
    });
    expect(skipped.effects).toEqual([
      { type: "submit_result", result: "draw" },
      { type: "close_overlays" },
    ]);

    const emptyReveal = transitionBattleEndFlow(confirming.state, {
      type: "confirm_reveal_and_submit",
      upgradeIds: [],
    });
    expect(emptyReveal.state.stage).toEqual({
      kind: "submitting",
      result: "draw",
      confirmingReveal: false,
    });
    expect(emptyReveal.effects).toEqual([
      { type: "submit_result", result: "draw" },
      { type: "close_overlays" },
    ]);
  });

  it("proceeds to submit if expected upgrades are already revealed with no pending animation", () => {
    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot({
        selfUpgrades: [makeCard("upg-1", "Boost", false)],
      }),
    });
    const confirming = transitionBattleEndFlow(seeded.state, {
      type: "submit_chosen",
      result: "Alice",
      hasUnrevealedUpgrades: true,
    });
    const revealing = transitionBattleEndFlow(confirming.state, {
      type: "confirm_reveal_and_submit",
      upgradeIds: ["upg-1"],
    });

    const serverSkippedAnim = transitionBattleEndFlow(revealing.state, {
      type: "server_state",
      snapshot: battleSnapshot({
        selfUpgrades: [makeCard("upg-1", "Boost", true)],
        currentBattle: makeBattle({ pending_reveal_animations: [] }),
      }),
    });
    expect(serverSkippedAnim.state.stage).toEqual({
      kind: "submitting",
      result: "Alice",
      confirmingReveal: false,
    });
    expect(serverSkippedAnim.effects).toEqual([
      { type: "submit_result", result: "Alice" },
    ]);
  });

  it("plays mid-battle reveal animations and returns to idle without submitting a result", () => {
    const anim1 = makeRevealAnimation("mid-1");
    const anim2 = makeRevealAnimation("mid-2");

    const received = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot({
        currentBattle: makeBattle({
          pending_reveal_animations: [anim1, anim2],
        }),
      }),
    });
    const receivedView = selectBattleEndView(received.state);
    expect(receivedView.activeRevealAnimation).toEqual(anim1);
    expect(receivedView.submitPending).toBe(false);

    const afterFirst = transitionBattleEndFlow(received.state, {
      type: "reveal_animation_completed",
      pendingAnimations: [anim1, anim2],
    });
    expect(selectBattleEndView(afterFirst.state).activeRevealAnimation).toEqual(
      anim2,
    );
    expect(afterFirst.effects).toEqual([]);

    const afterSecond = transitionBattleEndFlow(afterFirst.state, {
      type: "reveal_animation_completed",
      pendingAnimations: [anim1, anim2],
    });
    expect(afterSecond.state.stage).toEqual({ kind: "idle" });
    expect(afterSecond.effects).toEqual([]);
  });

  it("tracks changingResult and resets it on submit or leaving battle", () => {
    const seeded = transitionBattleEndFlow(createBattleEndFlowState(), {
      type: "server_state",
      snapshot: battleSnapshot(),
    });
    const changing = transitionBattleEndFlow(seeded.state, {
      type: "start_changing_result",
    });
    expect(changing.state.changingResult).toBe(true);

    const leftBattle = transitionBattleEndFlow(changing.state, {
      type: "server_state",
      snapshot: battleSnapshot({ phase: "reward", currentBattle: null }),
    });
    expect(leftBattle.state.changingResult).toBe(false);
  });
});
