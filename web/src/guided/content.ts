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
  "hint_battle_unrevealed_upgrade",
  "hint_treasure_cap",
];

const ALWAYS_ON_CONDITIONAL_GUIDES = new Set<ConditionalGuideId>([
  "hint_battle_unrevealed_upgrade",
  "hint_treasure_cap",
]);

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
        title: "Stages of the Game",
        targetId: "timeline-stage-round",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "The game is played in stages of three rounds. Your stage number matches your starting hand size, so the game begins at Stage 3, Round 1.",
        },
      },
      {
        id: "draft",
        title: "The Draft Phase",
        targetId: "timeline-phase-draft",
        placement: "bottom",
        cardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "You are dealt a pack of 5 cards and may swap any number of cards between that pack and your pool.",
          detail: "The game starts in Build on Stage 3, Round 1 so you can learn Build and Battle before making draft picks.",
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
          summary: "Choose your exact starting hand and 3 basic lands to battle with.",
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
          summary: "Play a quick game of Magic with a small hand, 10 life, and empty libraries.",
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
          summary: "After each battle, get a Treasure token, some extra loot, and then advance to the next round.",
          detail: "After the last battle of a stage, the extra loot is very special and powerful.",
        },
      },
      {
        id: "guide",
        title: "Comprehensive Guide",
        targetId: "guide-button",
        positionTargetId: "guide-button",
        placement: "left",
        cardPlacement: "top-right",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Begin Game",
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
        title: "The Build Phase",
        placement: "center",
        cardPlacement: "center",
        positionTargetId: "game-content",
        primaryActionLabel: "Next",
        content: {
          summary: "Build the best starting hand you can from your pool. You begin battle with 3 basic lands of your choice already untapped on the battlefield.",
        },
      },
      {
        id: "sideboard",
        title: "Your Pool of Cards",
        targetId: "build-sideboard",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-battlefield" : "build-sideboard"),
        placement: "right",
        cardPlacement: "top-right",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "At the start of the game, you're dealt 7 cards. This is the pool you build from.",
          detail: "Cards you don't put into your hand stay in your sideboard.",
        },
      },
      {
        id: "battlefield",
        title: "Choose Your Lands",
        targetId: "build-battlefield",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-hand" : "build-battlefield"),
        placement: "bottom",
        cardPlacement: "top-right",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "The 3 basic lands you choose will start on the battlefield untapped.",
          detail: "Treasures and poison carry over from round to round, so they can change which cards are strongest later.",
        },
      },
      {
        id: "hand",
        title: "Choose Your Cards",
        targetId: "build-hand",
        positionTargetId: (ctx) => (ctx.isMobile ? "build-battlefield" : "build-hand"),
        placement: "bottom",
        cardPlacement: "bottom-right",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Your hand must be filled to the current hand size, and this exact hand becomes your opening hand in battle.",
          detail: "The game starts with 3 cards in hand, and your hand size increases by 1 after every 3 rounds.",
        },
      },
      {
        id: "submit",
        title: "Lock In Your Build",
        targetId: "build-submit",
        positionTargetId: "phase-action-bar",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Ready to Build",
        content: {
          summary: "Whenever you're ready, click this button to lock in your build.",
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
        title: "Play Or Draw",
        targetId: "build-submit-popover",
        positionTargetId: "build-battlefield",
        placement: "top",
        cardPlacement: "top-center",
        primaryActionLabel: "Got it",
        allowTargetInteraction: true,
        content: {
          summary: "Play or draw is submitted as part of your build.",
          detail: "The player with the most poison gets their submitted choice of play or draw. If there's a tie, a coin flip decides.",
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
      primaryActionLabel: "Next",
      content: {
        summary: "Battle is a short game of Magic with 10 life and empty libraries.",
        detail: "You play it out manually against your opponent. You keep any treasures still on your battlefield after battle, up to five.",
      },
    },
    {
      id: "hand",
      title: "Your Hand",
      targetId: "battle-hand" as const,
      positionTargetId: (ctx) => (ctx.isMobile ? "battle-battlefield" : "battle-hand"),
      placement: "top" as const,
      cardPlacement: "top-right",
      mobileCardPlacement: "top-center",
      primaryActionLabel: "Next",
      content: {
        summary: "Your opponent cannot see your hand. To play a card, move it from your hand onto the battlefield.",
      },
    },
    {
      id: "battlefield",
      title: "The Battlefield",
      targetId: "battle-battlefield" as const,
      positionTargetId: (ctx) => (ctx.isMobile ? "battle-hand" : "battle-battlefield"),
      placement: "right" as const,
      cardPlacement: "bottom-right",
      mobileCardPlacement: "bottom-center",
      primaryActionLabel: "Next",
      content: {
        summary: "Double click permanents to tap/untap them. Right click for a full option menu.",
      },
    },
    {
      id: "actions",
      title: "Game Actions",
      targetId: "battle-actions",
      positionTargetId: "battle-battlefield",
      placement: "top",
      cardPlacement: "top-center",
      primaryActionLabel: "Next",
      content: {
        summary: "This button opens the full actions menu.",
        detail: "If a card is selected, its specific actions also appear in the menu.",
      },
    },
  ];

  if (ctx.currentBattle?.can_manipulate_opponent) {
    steps.push({
      id: "puppet-hand",
      title: "Your Opponent is a Puppet",
      targetId: "battle-opponent-hand",
      positionTargetId: "battle-battlefield",
      placement: "top",
      cardPlacement: "bottom-right",
      mobileCardPlacement: "bottom-center",
      primaryActionLabel: "Got it",
      content: {
        summary: "A puppet is an opponent created from a historical game to enable goldfishing. Their hand is visible and you can move their cards too.",
        detail: "Use both hands and battlefields to play out the likely game, then submit the player who would have won.",
      },
    });
  }

  steps.push({
    id: "submit",
    title: "Submit The Result",
    targetId: "battle-submit",
    positionTargetId: "phase-action-bar",
    placement: "top",
    cardPlacement: "top-center",
    mobileCardPlacement: "top-center",
    primaryActionLabel: "Ready to Battle",
    content: {
      summary: "Whenever the battle is over, click this button to submit the result.",
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
      title: "Round Complete",
      placement: "center",
      cardPlacement: "center",
      positionTargetId: "game-content",
      primaryActionLabel: "Next",
      content: {
        summary: "After each battle, everyone gets +1 treasure and a random card as loot.",
        detail: "At the end of a stage, the loot is different and more powerful.",
      },
    },
    {
      id: "reward-basics",
      title: "Your Loot",
      targetId: "reward-summary",
      placement: "right",
      cardPlacement: "bottom-center",
      primaryActionLabel: ctx.isStageEnd ? "Got it" : "Next",
      content: {
        summary: "This card is now in your pool!",
      },
    },
  ];

  if (!ctx.isStageEnd) {
    steps.push({
      id: "continue",
      title: "Start The Next Round",
      targetId: "reward-continue",
      positionTargetId: "phase-action-bar",
      placement: "top",
      cardPlacement: "top-center",
      mobileCardPlacement: "top-center",
      primaryActionLabel: "Ready to Draft",
      allowTargetInteraction: true,
      content: {
        summary: "Whenever you're ready, click this button to start the draft phase of the next round.",
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
      title: "The Vanquisher",
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
      title: "Take an Upgrade",
      targetId: "reward-upgrades",
      placement: "left",
      cardPlacement: "top-center",
      primaryActionLabel: "Got it",
      content: {
        summary: "You can apply this upgrade during the build phase to make one of your cards better. This cannot be undone, so choose carefully!",
        detail: "You deal extra poison to your opponent for each upgrade applied to cards in your hand.",
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
        primaryActionLabel: "Next",
        content: {
          summary: "Draft improves your pool by swapping weaker cards for stronger ones from a pack.",
          detail: "Sometimes a card isn't strong now, but could be later. You have to decide if it's worth holding onto.",
        },
      },
      {
        id: "pack",
        title: "Current Pack",
        targetId: "draft-pack",
        positionTargetId: (ctx) => (ctx.isMobile ? "draft-pool" : "draft-pack"),
        placement: "right",
        cardPlacement: "bottom-center",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Next",
        content: {
          summary: "Each draft starts with a pack of 5 cards.",
        },
      },
      {
        id: "pool",
        title: "Your Pool",
        targetId: "draft-pool",
        positionTargetId: (ctx) => (ctx.isMobile ? "draft-pack" : "draft-pool"),
        placement: "right",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Next",
        content: {
          summary: "To make a pick, click a card in the pack and a card in your pool to swap them.",
          detail: "You can do this as many times as you want.",
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
          summary: "This sidebar shows key info about each opponent, including how likely you are to face them.",
          detail: "Click a player to inspect their revealed cards and other details.",
        },
      },
      {
        id: "revealed-cards",
        title: "Draft Signals",
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
        title: "Open a New Pack",
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
        title: "Done Drafting?",
        targetId: "draft-continue",
        positionTargetId: "phase-action-bar",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Ready to Draft",
        content: {
          summary: "Whenever you're ready, click this button to start the build phase.",
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
        title: "Treasure Matters Here",
        targetSelector: cardSelector(source?.cardId),
        targetId: isBuild ? "build-sideboard" : "draft-pack",
        positionTargetId: isBuild ? "build-battlefield" : "draft-pool",
        placement: isBuild ? "right" : "top",
        cardPlacement: isBuild ? "top-right" : "bottom-center",
        mobileCardPlacement: isBuild ? "top-center" : "bottom-center",
        primaryActionLabel: "Got it",
        content: {
          summary: "Treasure-producing cards are worth extra attention because they help both in battle and in future drafts.",
          detail: isBuild
            ? "If you can start this card early, it may be something you can turn into an advantage."
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
        title: `You Have ${ctx.selfPlayer?.treasures ?? 6} Treasures`,
        targetId: "draft-mobile-treasure",
        positionTargetId: "draft-pool",
        placement: "right",
        cardPlacement: "bottom-center",
        mobileCardPlacement: "bottom-center",
        primaryActionLabel: "Got it",
        content: {
          summary: "After battle, you keep at most 5 treasure that remain on your battlefield.",
          detail: "You're already above the amount you can carry out of battle. Spending one on a roll now is often better than letting that value go to waste later.",
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
            ? "Since this is a puppet battle, the result is applied immediately."
            : "Both players must agree on the result before the game moves on — if results conflict, you will both be asked to resubmit.",
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
          detail: "Applying an upgrade is permanent and cannot be undone. Choose wisely!",
        },
      },
    ],
  };
}

function buildBattleRevealUpgradeHint(): GuideDefinition {
  return {
    id: "hint_battle_unrevealed_upgrade",
    label: "Battle Tip",
    phase: "battle",
    steps: [
      {
        id: "reveal-upgrade",
        title: "Reveal Your Hidden Upgrade",
        targetId: "battle-reveal-upgrade",
        positionTargetId: "battle-battlefield",
        placement: "top",
        cardPlacement: "top-center",
        mobileCardPlacement: "top-center",
        primaryActionLabel: "Got it",
        allowTargetInteraction: true,
        content: {
          summary: "This card has an upgrade applied, but that upgrade stays hidden until you choose to reveal it.",
          detail: "Revealing it makes the upgrade public for the rest of the game, including damage scaling, card zoom, borders, and scouting details.",
        },
      },
    ],
  };
}

export function isAlwaysOnConditionalGuide(
  guideId: ConditionalGuideId,
): boolean {
  return ALWAYS_ON_CONDITIONAL_GUIDES.has(guideId);
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
    case "hint_battle_unrevealed_upgrade":
      return ctx.currentPhase === "battle" && ctx.hasBattleRevealUpgrade;
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
    case "hint_battle_unrevealed_upgrade":
      return buildBattleRevealUpgradeHint();
    case "hint_treasure_cap":
      return buildTreasureCapHint(ctx);
  }
}
