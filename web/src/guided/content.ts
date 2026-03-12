import type {
  ConditionalGuideId,
  GuideDefinition,
  GuideStepDefinition,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "./types";

const CONDITIONAL_GUIDE_PRIORITY: ConditionalGuideId[] = [
  "hint_treasure_producer",
  "hint_build_unapplied_upgrade",
  "hint_treasure_cap",
];

const TREASURE_EXCEPTION_NAMES = new Set(["An Offer You Can't Refuse"]);

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cardSelector(cardId?: string | null): string | undefined {
  if (!cardId) return undefined;
  return `[data-guide-card-id="${escapeSelectorValue(cardId)}"]`;
}

function draftGuideOpponentSelector(
  ctx: GuidedWalkthroughContext,
): string | undefined {
  if (!ctx.draftGuideOpponentName) return undefined;
  return `[data-guide-player-row="${escapeSelectorValue(ctx.draftGuideOpponentName)}"]`;
}

function currentPack(ctx: GuidedWalkthroughContext) {
  return ctx.selfPlayer?.current_pack ?? [];
}

function buildPool(ctx: GuidedWalkthroughContext) {
  if (!ctx.selfPlayer) return [];
  return [...ctx.selfPlayer.hand, ...ctx.selfPlayer.sideboard];
}

function cardProducesTreasure(card: { name: string; tokens?: { name: string; type_line: string }[] }): boolean {
  if (TREASURE_EXCEPTION_NAMES.has(card.name)) return false;
  return (card.tokens ?? []).some((token) => {
    const name = token.name.toLowerCase();
    const typeLine = token.type_line.toLowerCase();
    return name.includes("treasure") || typeLine.includes("treasure");
  });
}

function findTreasureProducer(
  ctx: GuidedWalkthroughContext,
): { cardId: string; phase: "build" | "draft" } | null {
  if (ctx.currentPhase === "build") {
    const source = buildPool(ctx).find(cardProducesTreasure);
    return source ? { cardId: source.id, phase: "build" } : null;
  }

  if (ctx.currentPhase === "draft") {
    const source = currentPack(ctx).find(cardProducesTreasure);
    return source ? { cardId: source.id, phase: "draft" } : null;
  }

  return null;
}

function buildWelcomeGuide(): GuideDefinition {
  return {
    id: "welcome",
    label: "Welcome",
    showSkipAll: true,
    steps: [
      {
        id: "intro",
        title: "Playing Magic: The Battling",
        placement: "center",
        cardPlacement: "center",
        positionTargetId: "game-content",
        primaryActionLabel: "Game Phases",
        content: {
          summary: "Like an autobattler, players alternate between drafting cards and battling with them until only one player remains.",
          detail: "Unlike an autobattler, battles are mini-games of Magic you play out manually vs. your opponent.",
        },
      },
      {
        id: "three-one",
        title: "You Start At 3-1",
        targetId: "timeline-stage-round",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "The left side of the timeline shows your current stage and round. The game begins at stage 3, round 1. There are 3 rounds in each stage.",
          detail: "The stage number will always be your hand size.",
        },
      },
      {
        id: "draft",
        title: "From Trash to Treasure",
        targetId: "timeline-phase-draft",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "During draft, you are dealt a pack of 5 cards and may swap any number of cards between that pack and your pool. You can spend 1 treasure to see a new pack.",
          detail: "We skip the first draft phase, as the game starts directly in the build phase of stage 3, round 1.",
        },
      },
      {
        id: "build",
        title: "Build Your Best Hand",
        targetId: "timeline-phase-build",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Choose your exact starting hand and 3 untapped basics you will begin the next battle with untapped on the battlefield.",
        },
      },
      {
        id: "battle",
        title: "Battle your Opponent in Magic",
        targetId: "timeline-phase-battle",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Battle is a quick game of Magic with 10 life and no libraries.",
          detail: "Reminder: yes, you play out the game of magic manually. This game is inspired by autobattlers, but it is not an autobattler itself.",
        },
      },
      {
        id: "wrap-up-loop",
        title: "Go to the Next Round",
        targetId: "timeline-next-stage-round",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "After each battle, get some loot and then advances you to the next stage-round shown on the right.",
          detail: "After the last battle of a stage, you'll get some special loot",
        },
      },
      {
        id: "guide",
        title: "Guide Has The Full Reference",
        targetId: "guide-button",
        positionTargetId: "guide-button",
        placement: "left",
        cardPlacement: "top-right",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Begin game",
        content: {
          summary: "Open the Guide any time you want a reference while you play.",
          detail: "The guide includes comprehensive rules, hotkeys, tips, a searchable card list, and more.",
        },
      },
    ],
  };
}

function buildBuildGuide(): GuideDefinition {
  return {
    id: "build",
    label: "Build",
    phase: "build",
    steps: [
      {
        id: "intro",
        title: "Build Phase",
        placement: "center",
        cardPlacement: "center",
        positionTargetId: "game-content",
        primaryActionLabel: "Show me the zones",
        content: {
          summary: "Build chooses the exact starting hand and the 3 untapped basics you begin the next battle with.",
          detail: "Whatever you lock in here is your actual opening position. Your sideboard holds the pool of cards available for this round.",
        },
      },
      {
        id: "sideboard",
        title: "Start With The Pool In Your Sideboard",
        targetId: "build-sideboard",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-battlefield" : "build-sideboard"),
        placement: "right",
        cardPlacement: "top-right",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Your sideboard is the pool of cards available for this round's build.",
          detail: "Move cards between sideboard and hand to decide what you want to start with. If you use upgrades, this is also one of the places where you can apply them.",
        },
      },
      {
        id: "battlefield",
        title: "Choose Your Battlefield Setup",
        targetId: "build-battlefield",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-hand" : "build-battlefield"),
        placement: "bottom",
        cardPlacement: "top-right",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "In build, you choose the 3 basic lands that will start untapped on the battlefield in the next battle.",
          detail: "Your treasure tokens and poison counters also carry into battle, so this row is part of your actual opening position.",
        },
      },
      {
        id: "hand",
        title: "Lock In Your Starting Hand",
        targetId: "build-hand",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-battlefield" : "build-hand"),
        placement: "bottom",
        cardPlacement: "bottom-right",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Your hand must be filled to the current hand size, and this exact hand becomes your opening hand in battle.",
          detail: "Once your hand and basics are correct, submit the build to choose play or draw.",
        },
      },
      {
        id: "submit",
        title: "This Moves You Into Battle",
        targetId: "build-submit",
        positionTargetId: "phase-action-bar",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Ready to build",
        content: {
          summary: "Whenever you're ready, click this button to lock in build and move toward battle.",
          detail: "Submitting opens the play-or-draw choice, then the next battle starts from exactly the hand and basics you built here.",
        },
      },
    ],
  };
}

function buildPlayDrawGuide(): GuideDefinition {
  return {
    id: "build_play_draw",
    label: "Build",
    phase: "build",
    steps: [
      {
        id: "play-draw",
        title: "Submit Includes Play Or Draw",
        targetId: "build-submit-popover",
        positionTargetId: "build-battlefield",
        placement: "top",
        cardPlacement: "top-center",
        primaryActionLabel: "Got it",
        allowTargetInteraction: true,
        content: {
          summary: "Play or draw is submitted as part of your build.",
          detail: "Outside the finals, the player with the most poison chooses play or draw here; if poison is tied, that choice is random. In the finals after game one, the loser of the previous game chooses instead.",
        },
      },
    ],
  };
}

function buildBattleGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  const steps: GuideStepDefinition[] = [
    {
      id: "intro",
      title: "Battle Phase",
      placement: "center",
      cardPlacement: "center",
      positionTargetId: "game-content",
      primaryActionLabel: "Show me the zones",
      content: {
        summary: "Battle is a short manual game of Magic with 10 life and no libraries.",
        detail: "Drag cards between zones to play out the game, then submit the result when one player wins. Up to 5 treasure on the battlefield carry forward.",
      },
    },
    {
      id: "hand",
      title: "Hand To Battlefield Is The Main Flow",
      targetId: "battle-hand" as const,
      positionTargetId: (ctx) => (ctx.isMobile ? "battle-battlefield" : "battle-hand"),
      placement: "top" as const,
      cardPlacement: "top-right",
      mobileCardPlacement: "top-center",
      primaryActionLabel: "Next",
      content: {
        summary: "Battle is manual. Drag cards from your hand to the battlefield when you cast or play them.",
        detail: "The starting hand and battlefield were chosen in build, so use this zone to play out the game state exactly as it happens.",
      },
    },
    {
      id: "battlefield",
      title: "Use The Battlefield To Track Play",
      targetId: "battle-battlefield" as const,
      positionTargetId: (ctx) => (ctx.isMobile ? "battle-hand" : "battle-battlefield"),
      placement: "right" as const,
      cardPlacement: "bottom-right",
      mobileCardPlacement: "bottom-center",
      primaryActionLabel: "Next",
      content: {
        summary: "Double click or double tap permanents to tap and untap them while you play.",
        detail: "Right-click a card for more options like counters, tokens, and zone moves. Those same options appear in the Actions menu when a card is selected.",
      },
    },
    {
      id: "actions",
      title: "Actions Menu For Everything Else",
      targetId: "battle-actions",
      positionTargetId: "battle-battlefield",
      placement: "top",
      cardPlacement: "top-center",
      primaryActionLabel: ctx.currentBattle?.can_manipulate_opponent ? "Next" : "Got it",
      content: {
        summary: "This button opens the full actions menu with general utilities and card-specific options.",
        detail: "Standard actions like untapping all permanents, creating treasure tokens, and passing the turn live here. If a card is selected, its specific actions also appear at the top of the menu.",
      },
    },
  ];

  if (ctx.currentBattle?.can_manipulate_opponent) {
    steps.push({
      id: "puppet-hand",
      title: "Puppet Battles Use Their Hand Too",
      targetId: "battle-opponent-hand",
      positionTargetId: "battle-battlefield",
      placement: "top",
      cardPlacement: "bottom-right",
      mobileCardPlacement: "bottom-center",
      primaryActionLabel: "Got it",
      content: {
        summary: "Against a puppet, their hand is visible and you can move their cards too.",
        detail: "Use both hands and battlefields to play out the likely game, then submit the player who would have won.",
      },
    });
  }

  steps.push({
    id: "submit",
    title: "This Opens Result Submission",
    targetId: "battle-submit",
    positionTargetId: "phase-action-bar",
    placement: "top",
    cardPlacement: "top-center",
    mobileCardPlacement: "top-center",
    primaryActionLabel: "Ready to battle",
    content: {
      summary: "Whenever the battle is over, click this button to submit the result.",
      detail: "That opens the result chooser. Once the result is submitted, round wrap-up handles the next part of the loop.",
    },
  });

  return {
    id: "battle",
    label: "Battle",
    phase: "battle",
    steps,
  };
}

function buildRewardGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  const steps: GuideStepDefinition[] = [
    {
      id: "intro",
      title: "Round Wrap-Up",
      placement: "center",
      cardPlacement: "center",
      positionTargetId: "game-content",
      primaryActionLabel: "Show me the loot",
      content: {
        summary: "Round wrap-up adds loot and other progression before the next round starts.",
        detail: "Every wrap-up gives +1 treasure. On rounds 1 and 2, you also get a random card. The final round of each stage is special — you earn The Vanquisher, your hand size grows, and you advance to the next stage.",
      },
    },
    {
      id: "reward-basics",
      title: "Every Wrap-Up Adds Loot",
      targetId: "reward-summary",
      placement: "right",
      cardPlacement: "bottom-center",
      primaryActionLabel: ctx.isStageEnd ? "Got it" : "Next",
      content: {
        summary: "Every wrap-up gives you +1 treasure.",
        detail: "On the first and second round of a stage, you also get +1 random card from the Battler.",
      },
    },
  ];

  if (!ctx.isStageEnd) {
    steps.push({
      id: "continue",
      title: "This Starts The Next Round",
      targetId: "reward-continue",
      positionTargetId: "phase-action-bar",
      placement: "top",
      cardPlacement: "top-center",
      mobileCardPlacement: "top-center",
      primaryActionLabel: "Ready to continue",
      content: {
        summary: "Whenever you're ready, click this button to start the draft phase of the next round.",
        detail: "Round wrap-up is the handoff back into the main loop, so this is how you move from loot into the next draft.",
      },
    });
  }

  return {
    id: "reward",
    label: "Round Wrap-Up",
    phase: "reward",
    steps,
  };
}

function buildRewardStageEndGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  const steps: GuideStepDefinition[] = [
    {
      id: "vanquisher",
      title: "The Vanquisher Increases Hand Size",
      targetSelector: '[data-guide-card-id="reward:vanquisher"]',
      targetId: "reward-summary",
      positionTargetId: "reward-summary",
      placement: "right",
      cardPlacement: "bottom-center",
      primaryActionLabel:
        ctx.useUpgrades && ctx.hasRewardUpgradeChoice ? "Next" : "Got it",
      content: {
        summary: "On the final round of a stage, you earn The Vanquisher instead of a random card.",
        detail: "This advances your stage and permanently increases your starting hand size by 1, making future builds stronger.",
      },
    },
  ];

  if (ctx.useUpgrades && ctx.hasRewardUpgradeChoice) {
    steps.push({
      id: "upgrades",
      title: "Stage-End Wrap-Up Can Also Offer Upgrades",
      targetId: "reward-upgrades",
      placement: "left",
      cardPlacement: "top-center",
      primaryActionLabel: "Got it",
      content: {
        summary: "If upgrades are enabled, a stage-end wrap-up also requires you to choose one upgrade before you continue.",
        detail: "Upgrades are permanent hidden-agenda effects. Choose one here, then apply it later during build to a card in your pool.",
      },
    });
  }

  return {
    id: "reward_stage_end",
    label: "Round Wrap-Up",
    phase: "reward",
    steps,
  };
}

function buildDraftGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  return {
    id: "draft",
    label: "Draft",
    phase: "draft",
    steps: [
      {
        id: "intro",
        title: "Draft Phase",
        placement: "center",
        cardPlacement: "center",
        positionTargetId: "game-content",
        primaryActionLabel: "Show me the zones",
        content: {
          summary: "Draft improves your pool by swapping weaker cards for stronger ones from a pack.",
          detail: "You receive a pack of 5 cards and may swap cards between the pack and your pool. Spending 1 treasure rolls a new pack.",
        },
      },
      {
        id: "pack",
        title: "This Is The Current Pack",
        targetId: "draft-pack",
        positionTargetId: (ctx) => (ctx.isMobile ? "draft-pool" : "draft-pack"),
        placement: "right",
        cardPlacement: "bottom-center",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Each draft starts with a pack of 5 cards.",
          detail: "Draft improves your pool between battles by replacing weaker cards with stronger ones from this pack.",
        },
      },
      {
        id: "pool",
        title: "This Is Your Pool",
        targetId: "draft-pool",
        positionTargetId: (ctx) => (ctx.isMobile ? "draft-pack" : "draft-pool"),
        placement: "right",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Your pool is the set of cards you can use in future builds.",
          detail: "To make a pick, click a card in the pack and a card in your pool to swap them.",
        },
      },
      {
        id: "opponent-row",
        title: "Scout A Likely Opponent",
        targetSelector: draftGuideOpponentSelector,
        targetId: "sidebar-opponent-list",
        placement: "left",
        cardPlacement: "middle-left",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        sidebarState: {
          openOnMobile: true,
          playerName: null,
        },
        content: {
          summary: "This row shows pairing likelihood, current treasure, current poison, and where that opponent is in the loop.",
          detail: "Monitoring this information can change the value of cards and help you set yourself up for positive matchups.",
        },
      },
      {
        id: "revealed-cards",
        title: "Use Revealed Cards As Draft Signals",
        targetId: "sidebar-seen-in-battle",
        waitForLayoutTargetId: (ctx) => (
          ctx.isMobile ? undefined : "sidebar-detail-drawer"
        ),
        placement: "left",
        cardPlacement: "middle-left",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        sidebarState: {
          openOnMobile: true,
          playerName: (ctx) => ctx.draftGuideOpponentName,
          detailTab: "seen",
        },
        content: {
          summary: ctx.draftGuideOpponentRevealedCount > 0
            ? "This panel shows the most recent cards that opponent has revealed in battle."
            : "This panel is where revealed cards will appear after an opponent has shown cards in battle.",
          detail: ctx.draftGuideOpponentRevealedCount > 0
            ? "Use those cards to infer what they are building, then adjust your picks, rolls, and later build decisions."
            : "When this area is populated, use it as scouting information. What opponents have shown can change the value of cards and help you set up positive matchups.",
        },
      },
      {
        id: "roll",
        title: "Roll Spends Treasure For A Fresh Pack",
        targetId: "draft-roll",
        positionTargetId: (ctx) => (ctx.isMobile ? "draft-pool" : "draft-roll"),
        placement: "top",
        cardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Rolling spends 1 treasure to exile the current pack and replace it with a new pack of 5 cards.",
          detail: "Treasures matter across phases, so rolling is a real resource decision, not a free redraw.",
        },
      },
      {
        id: "continue",
        title: "This Starts Build",
        targetId: "draft-continue",
        positionTargetId: "phase-action-bar",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Ready to draft",
        content: {
          summary: "Whenever you're ready, click this button to start the build phase.",
          detail: "That ends draft for this round and moves you into choosing the exact hand and basics for the next battle.",
        },
      },
    ],
  };
}

function buildTreasureProducerHint(ctx: GuidedWalkthroughContext): GuideDefinition {
  const source = findTreasureProducer(ctx);
  const isBuild = source?.phase === "build";

  return {
    id: "hint_treasure_producer",
    label: isBuild ? "Build Tip" : "Draft Tip",
    phase: isBuild ? "build" : "draft",
    steps: [
      {
        id: "treasure-producer",
        title: "Treasure Production Is Worth Extra Attention",
        targetSelector: cardSelector(source?.cardId),
        targetId: isBuild ? "build-sideboard" : "draft-pack",
        positionTargetId: isBuild ? "build-battlefield" : "draft-pool",
        placement: isBuild ? "right" : "top",
        cardPlacement: isBuild ? "top-right" : "bottom-center",
        mobileCardPlacement: isBuild ? "top-center" : "bottom-center",
        primaryActionLabel: "Got it",
        content: {
          summary: "Cards that make treasure have extra value because treasure can win battles now or be converted into future draft rolls.",
          detail: isBuild
            ? "If you can start this effect early, it may change both the next battle and the next draft that follows it."
            : "Even a modest treasure producer can be worth prioritizing because economy carries across phases.",
        },
      },
    ],
  };
}

function buildTreasureCapHint(ctx: GuidedWalkthroughContext): GuideDefinition {
  return {
    id: "hint_treasure_cap",
    label: "Draft Tip",
    phase: "draft",
    steps: [
      {
        id: "treasure-cap",
        title: `You Have ${ctx.selfPlayer?.treasures ?? 6} Treasure`,
        targetId: "draft-mobile-treasure",
        positionTargetId: "draft-pool",
        placement: "right",
        cardPlacement: "bottom-center",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Got it",
        content: {
          summary: "After battle, you keep at most 5 treasure that remain on your battlefield.",
          detail: "With this much treasure, some value is at risk of being wasted. Spending one now on a roll can be correct even if the current pack is acceptable.",
        },
      },
    ],
  };
}

function buildBattleResultSubmitGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  const isPuppet = !!ctx.currentBattle?.can_manipulate_opponent;
  return {
    id: "battle_result_submit",
    label: "Battle",
    phase: "battle",
    steps: [
      {
        id: "result-submit",
        title: "Submit The Battle Result",
        targetId: "battle-submit-popover",
        positionTargetId: "battle-battlefield",
        placement: "top",
        cardPlacement: "top-center",
        primaryActionLabel: "Got it",
        allowTargetInteraction: true,
        content: {
          summary: isPuppet
            ? "Choose who won this puppet battle based on how you think it would play out."
            : "Choose who won, then wait for your opponent to submit their result too.",
          detail: isPuppet
            ? "A draw counts as a loss for both players. Since this is a puppet battle, the result is applied immediately."
            : "A draw counts as a loss for both players. Both players must agree on the result before the game moves on — if results conflict, you will both be asked to resubmit.",
        },
      },
    ],
  };
}

function buildUnappliedUpgradeHint(): GuideDefinition {
  return {
    id: "hint_build_unapplied_upgrade",
    label: "Build Tip",
    phase: "build",
    steps: [
      {
        id: "unapplied-upgrade",
        title: "You Have An Upgrade Ready To Apply",
        targetId: "build-apply-upgrade",
        positionTargetId: "build-battlefield",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Got it",
        content: {
          summary: "You have at least one upgrade that has not been applied to a card yet.",
          detail: "Tap this button to open the upgrade panel, choose an upgrade, and apply it to a card in your pool.",
        },
      },
    ],
  };
}

export function isConditionalGuideId(
  guideId: GuidedGuideId,
): guideId is ConditionalGuideId {
  return CONDITIONAL_GUIDE_PRIORITY.includes(guideId as ConditionalGuideId);
}

export function isConditionalGuideEligible(
  guideId: ConditionalGuideId,
  ctx: GuidedWalkthroughContext,
): boolean {
  switch (guideId) {
    case "hint_treasure_producer":
      return !!findTreasureProducer(ctx);
    case "hint_build_unapplied_upgrade":
      return ctx.currentPhase === "build"
        && !!ctx.selfPlayer?.upgrades.some((upgrade) => !upgrade.upgrade_target);
    case "hint_treasure_cap":
      return ctx.currentPhase === "draft" && (ctx.selfPlayer?.treasures ?? 0) >= 6;
  }
}

export function getEligibleConditionalGuides(
  ctx: GuidedWalkthroughContext,
): ConditionalGuideId[] {
  return CONDITIONAL_GUIDE_PRIORITY.filter((guideId) =>
    isConditionalGuideEligible(guideId, ctx),
  );
}

export function buildGuideDefinition(
  guideId: GuidedGuideId,
  ctx: GuidedWalkthroughContext,
): GuideDefinition {
  switch (guideId) {
    case "welcome":
      return buildWelcomeGuide();
    case "build":
      return buildBuildGuide();
    case "build_play_draw":
      return buildPlayDrawGuide();
    case "battle":
      return buildBattleGuide(ctx);
    case "battle_result_submit":
      return buildBattleResultSubmitGuide(ctx);
    case "reward":
      return buildRewardGuide(ctx);
    case "reward_stage_end":
      return buildRewardStageEndGuide(ctx);
    case "draft":
      return buildDraftGuide(ctx);
    case "hint_treasure_producer":
      return buildTreasureProducerHint(ctx);
    case "hint_build_unapplied_upgrade":
      return buildUnappliedUpgradeHint();
    case "hint_treasure_cap":
      return buildTreasureCapHint(ctx);
  }
}
