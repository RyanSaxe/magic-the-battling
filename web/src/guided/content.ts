import type { Card as GameCard } from "../types";
import type {
  ConditionalGuideId,
  GuideDefinition,
  GuideStepDefinition,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "./types";

const TREASURE_EXCEPTION_NAMES = new Set([
  "An Offer You Can't Refuse",
]);

const CONDITIONAL_GUIDE_PRIORITY: ConditionalGuideId[] = [
  "hint_treasure_producer",
  "hint_treasure_cap",
  "hint_reward_three_three",
  "hint_build_unapplied_upgrade",
];

interface ConditionalGuideOptions {
  isFirstBuildGuide: boolean;
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function cardSelector(cardId?: string | null): string | undefined {
  if (!cardId) return undefined;
  return `[data-guide-card-id="${escapeSelectorValue(cardId)}"]`;
}

function rewardStageReached(ctx: GuidedWalkthroughContext): boolean {
  return ctx.currentPhase === "reward"
    && !!ctx.selfPlayer
    && ctx.selfPlayer.stage === 3
    && ctx.selfPlayer.round === 3;
}

function currentPack(ctx: GuidedWalkthroughContext): GameCard[] {
  return ctx.selfPlayer?.current_pack ?? [];
}

function draftPool(ctx: GuidedWalkthroughContext): GameCard[] {
  if (!ctx.selfPlayer) return [];
  return [...ctx.selfPlayer.hand, ...ctx.selfPlayer.sideboard];
}

function buildPool(ctx: GuidedWalkthroughContext): GameCard[] {
  if (!ctx.selfPlayer) return [];
  return [...ctx.selfPlayer.hand, ...ctx.selfPlayer.sideboard];
}

function cardProducesTreasure(card: GameCard): boolean {
  if (TREASURE_EXCEPTION_NAMES.has(card.name)) return false;
  return (card.tokens ?? []).some((token) => {
    const name = token.name.toLowerCase();
    const typeLine = token.type_line.toLowerCase();
    return name.includes("treasure") || typeLine.includes("treasure");
  });
}

function findTreasureProducer(cards: GameCard[]): GameCard | null {
  return cards.find(cardProducesTreasure) ?? null;
}

function ids(cards: GameCard[]): string[] {
  return cards.map((card) => card.id);
}

function differsFromSnapshot(snapshot: string | number | boolean | null | undefined, current: string): boolean {
  return String(snapshot ?? "") !== current;
}

function buildReplaySteps(): GuideStepDefinition[] {
  return [
    {
      id: "setup",
      title: "Build Sets Up The Battle",
      targetId: "build-workspace",
      placement: "right",
      content: {
        summary: "Your chosen hand is the hand you start the battle with.",
        detail: "3 basics and your treasure begin untapped on the battlefield. Battles start at 10 life with no libraries.",
      },
    },
    {
      id: "workspace",
      title: "You Are Already Locked In",
      targetId: "build-workspace",
      placement: "right",
      content: {
        summary: "Since you already submitted, this guide is explanation-only.",
        detail: "If you need to change anything, use Change first, then rebuild and resubmit.",
      },
    },
    {
      id: "ready-state",
      title: "Waiting For The Next Phase",
      targetId: "build-submit",
      placement: "top",
      content: {
        summary: "You have already submitted this build.",
        detail: "Once everyone is ready, the game moves into battle.",
      },
    },
  ];
}

function buildInteractiveSteps(): GuideStepDefinition[] {
  return [
    {
      id: "setup",
      title: "Build Decides The Battle Setup",
      targetId: "build-workspace",
      placement: "right",
      spotlightPadding: 8,
      content: {
        summary: "You are choosing the exact setup for the next battle, not building a deck in the abstract.",
        detail: "3 basics and your treasure start untapped on the battlefield, your chosen hand starts in hand, and battles begin at 10 life with no libraries.",
      },
    },
    {
      id: "build-setup",
      title: "Choose Basics And Hand Together",
      targetId: "build-workspace",
      placement: "right",
      spotlightPadding: 8,
      content: {
        summary: "Choose all 3 basics and your full starting hand. Click a slot, then click the card to place.",
        actionHint: (ctx) => {
          const basicsLeft = 3 - ctx.selectedBasicsCount;
          const handLeft = ctx.handSize - ctx.handCount;
          if (basicsLeft > 0 && handLeft > 0) return `${basicsLeft} basics and ${handLeft} hand slots remaining.`;
          if (basicsLeft > 0) return `${basicsLeft} basics remaining.`;
          if (handLeft > 0) return `${handLeft} hand slots remaining.`;
          return "Setup complete — submit when ready.";
        },
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx) =>
          ctx.selectedBasicsCount === 3 && ctx.handCount === ctx.handSize,
      },
    },
    {
      id: "submit",
      title: "Open The Build Submission",
      targetId: "build-submit",
      placement: "top",
      content: {
        summary: "Submit your build here to open the play/draw choice.",
        actionHint: "Click the submit button to continue.",
      },
      completion: { type: "target-click" },
      onEnter: (ctx) => {
        if (ctx.showBuildSubmitPopover) {
          ctx.closeGameplayOverlays();
        }
      },
    },
    {
      id: "play-draw",
      title: "Pick Play Or Draw",
      targetId: "build-submit-popover",
      placement: "top",
      content: {
        summary: "Play/draw is part of your build — this choice is submitted along with your basics and hand.",
        detail: "The player with the most poison gets their choice; ties are broken randomly.",
        actionHint: "Select play or draw to finish.",
      },
      completion: {
        type: "condition",
        isComplete: (ctx) => ctx.buildReady || ctx.buildReadyPending,
      },
    },
  ];
}

function buildDraftSteps(ctx: GuidedWalkthroughContext): GuideStepDefinition[] {
  const steps: GuideStepDefinition[] = [
    {
      id: "pack",
      title: "Draft Improves Your Pool",
      targetId: "draft-pack",
      placement: "right",
      content: {
        summary: "Draft is the between-battles improvement phase.",
        detail: "Decide whether any cards in the current pack should replace part of your pool.",
      },
    },
    {
      id: "swap",
      title: "Make One Real Swap",
      targetId: ctx.isMobile ? "phase-action-bar" : "draft-pack",
      placement: ctx.isMobile ? "top" : "right",
      content: {
        summary: "Keep both the pack and your pool in view, then swap one card between them.",
        detail: "Select a card from the pack, then a card from your pool to trade places.",
        actionHint: "Swap one pack card with one pool card to continue.",
        minimizedText: "Make one real pack-to-pool swap.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx, meta) =>
          differsFromSnapshot(meta?.packIds, ids(currentPack(ctx)).join(","))
          && differsFromSnapshot(meta?.poolIds, ids(draftPool(ctx)).join(",")),
      },
      onEnter: (ctx) => ({
        packIds: ids(currentPack(ctx)).join(","),
        poolIds: ids(draftPool(ctx)).join(","),
      }),
    },
    {
      id: "actions",
      title: "Spend Treasure Carefully",
      targetId: "phase-action-bar",
      placement: "top",
      content: {
        summary: "Spend a treasure to roll for a fresh pack — but treasures persist across phases.",
        detail: "When satisfied, continue on to build the next battle setup.",
      },
    },
  ];

  if (ctx.isMobile) {
    steps.push({
      id: "open-sidebar",
      title: "Open The Sidebar Last",
      targetId: "sidebar-toggle",
      placement: "left",
      content: {
        summary: "One last draft tool on mobile lives behind the hamburger button.",
        detail: "Use it after comparing the pack and your pool to scout opponents before locking in later decisions.",
        actionHint: "Open the sidebar to continue.",
        minimizedText: "Open the mobile sidebar.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (stepCtx) => stepCtx.sidebarOpen,
      },
    });
  }

  steps.push({
    id: "open-opponents-tab",
    title: "Scout The Table",
    targetId: "sidebar-tab-opponents",
    placement: "left",
    content: {
      summary: "One last draft input is what your opponents have already shown.",
      detail: "Switch to Opponents so you can use that information to inform future picks, rolls, and builds.",
      actionHint: "Open the Opponents tab to continue.",
      minimizedText: "Open the Opponents tab in the sidebar.",
    },
    completion: {
      type: "condition",
      allowInteraction: true,
      isComplete: (ctx) => ctx.revealedPlayerTab === "opponents",
    },
  });

  steps.push({
    id: "pick-opponent",
    title: "Inspect One Opponent",
    targetId: "sidebar-opponent-list",
    placement: "left",
    content: {
      summary: "Click any opponent row to inspect what they have revealed so far.",
      detail: "You are looking for signals about likely archetypes, resource pressure, and how much you may need to prepare for them.",
      actionHint: "Pick an opponent row to continue.",
      minimizedText: "Choose an opponent from the sidebar.",
    },
    completion: {
      type: "condition",
      allowInteraction: true,
      isComplete: (ctx) => !!ctx.revealedPlayerName,
    },
  });

  steps.push({
    id: "read-opponent-row",
    title: "Read The Row, Not Just The Name",
    targetSelector: (ctx) =>
      ctx.revealedPlayerName
        ? `[data-guide-player-row="${escapeSelectorValue(ctx.revealedPlayerName)}"]`
        : undefined,
    targetId: "sidebar-opponent-list",
    placement: "left",
    content: {
      summary: "This row tells you how likely you are to face them, how much treasure and poison they have, and where they are in the game loop.",
      detail: "Those numbers should affect how aggressively you draft and how much you respect their likely next battle.",
    },
  });

  steps.push({
    id: "revealed-cards",
    title: "Use Revealed Cards To Draft Smarter",
    targetId: "sidebar-revealed-details",
    placement: "left",
    content: {
      summary: "The revealed cards section shows what this player has exposed in recent battles.",
      detail: "That helps you infer colors, likely threats, and whether you should value interaction, mana, or speed more highly.",
    },
  });

  return steps;
}

function buildBattleSteps(includePuppetPractice: boolean): GuideStepDefinition[] {
  const steps: GuideStepDefinition[] = [
    {
      id: "battle-overview",
      title: "Battle Is A Real Game",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "This is not an auto-battler — you are playing a real mini-game of Magic on this board.",
        detail: "Battles start at 10 life with the hand and basics from build. There are no libraries. Treasures persist across phases, so spending them is a real decision.",
      },
    },
    {
      id: "move-card",
      title: "Play A Card",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "Move a card from your hand onto the battlefield.",
        actionHint: "Move one card from your hand to your battlefield.",
        minimizedText: "Play one card from hand to battlefield.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx, meta) => {
          const currentHand = new Set(ids(ctx.currentBattle?.your_zones.hand ?? []));
          const currentBattlefield = new Set(ids(ctx.currentBattle?.your_zones.battlefield ?? []));
          const initialHand = String(meta?.handIds ?? "").split(",").filter(Boolean);
          const initialBattlefield = new Set(String(meta?.battlefieldIds ?? "").split(",").filter(Boolean));
          return initialHand.some((cardId) => !currentHand.has(cardId) && currentBattlefield.has(cardId) && !initialBattlefield.has(cardId));
        },
      },
      onEnter: (ctx) => ({
        handIds: ids(ctx.currentBattle?.your_zones.hand ?? []).join(","),
        battlefieldIds: ids(ctx.currentBattle?.your_zones.battlefield ?? []).join(","),
      }),
    },
    {
      id: "tap-card",
      title: "Tap And Manage Cards",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "Double tap any permanent on your battlefield to tap or untap it.",
        detail: "For counters, tokens, and other board management, select a card and use the Actions button.",
        actionHint: "Double tap one of your permanents to continue.",
        minimizedText: "Double tap one of your permanents.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx, meta) => {
          const current = ctx.currentBattle?.your_zones.tapped_card_ids.join(",") ?? "";
          return differsFromSnapshot(meta?.tappedIds, current);
        },
      },
      onEnter: (ctx) => ({
        tappedIds: ctx.currentBattle?.your_zones.tapped_card_ids.join(",") ?? "",
      }),
    },
  ];

  if (includePuppetPractice) {
    steps.push({
      id: "puppet-practice",
      title: "Puppets Are Frozen Real Games",
      targetId: "battle-opponent-hand",
      placement: "top",
      content: {
        summary: "A puppet battle is a historical game state you goldfish from both sides, then adjudicate.",
        detail: "You are expected to move the opponent’s cards too when you are resolving what should happen.",
        actionHint: "Move one card from the puppet's hand to the battlefield.",
        minimizedText: "Move one puppet card from hand to battlefield.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx, meta) => {
          const currentHand = new Set(ids(ctx.currentBattle?.opponent_zones.hand ?? []));
          const currentBattlefield = new Set(ids(ctx.currentBattle?.opponent_zones.battlefield ?? []));
          const initialHand = String(meta?.handIds ?? "").split(",").filter(Boolean);
          const initialBattlefield = new Set(String(meta?.battlefieldIds ?? "").split(",").filter(Boolean));
          return initialHand.some((cardId) => !currentHand.has(cardId) && currentBattlefield.has(cardId) && !initialBattlefield.has(cardId));
        },
      },
      onEnter: (ctx) => ({
        handIds: ids(ctx.currentBattle?.opponent_zones.hand ?? []).join(","),
        battlefieldIds: ids(ctx.currentBattle?.opponent_zones.battlefield ?? []).join(","),
      }),
    });
  }

  steps.push({
    id: "submit-result",
    title: "Submit The Result",
    targetId: "battle-submit",
    placement: "top",
    content: {
      summary: "When the battle ends, submit win, draw, or loss here.",
      detail: "You can change your report if needed, and conflicts between players are shown in the UI.",
    },
  });

  return steps;
}

function buildRewardSteps(ctx: GuidedWalkthroughContext): GuideStepDefinition[] {
  const progressionDetail = ctx.hasRewardUpgradeChoice
    ? "If upgrades are enabled and you just finished the stage, choose one before moving on."
    : undefined;

  return [
    {
      id: "result",
      title: "Read The Result Rail First",
      targetId: "reward-result",
      placement: "bottom",
      content: {
        summary: "This rail shows whether the battle was a victory, defeat, or draw, who it was against, and how much poison was dealt or taken.",
        detail: "Losing battles gives you poison. At 10 poison you are eliminated, so this is the right place to check how dangerous the last result really was.",
      },
    },
    {
      id: "rewards",
      title: "This Is What You Gained",
      targetId: "reward-summary",
      placement: "right",
      content: {
        summary: "Rewards can include treasure, bonus cards, and progression rewards.",
        detail: "This is the payoff phase before you loop back into improving your pool.",
      },
    },
    {
      id: "progression",
      title: "Watch For Stage Changes",
      targetId: "reward-progression",
      placement: "top",
      content: {
        summary: "Every third reward step advances the stage and increases your starting hand size by 1.",
        detail: progressionDetail,
      },
    },
  ];
}

function buildTreasureProducerHint(ctx: GuidedWalkthroughContext): GuideDefinition {
  const inBuild = ctx.currentPhase === "build";
  const sourceCard = inBuild ? findTreasureProducer(buildPool(ctx)) : findTreasureProducer(currentPack(ctx));

  return {
    id: "hint_treasure_producer",
    label: inBuild ? "Build Tip" : "Draft Tip",
    phase: inBuild ? "build" : "draft",
    steps: [
      {
        id: "treasure-producer",
        title: inBuild ? "You Already Have Treasure Acceleration" : "Treasure Producers Matter",
        targetSelector: cardSelector(sourceCard?.id),
        targetId: inBuild ? "build-workspace" : "draft-pack",
        placement: inBuild ? "right" : "top",
        content: {
          summary: inBuild
            ? "This card can produce treasure, which can turn into a real tempo spike in battle."
            : "This pack contains a card that can produce treasure, which often means faster or more flexible battle turns later.",
          detail: inBuild
            ? "Because this is your first build, consider whether you want that extra burst of mana in your opening hand."
            : "Treasure production is worth extra attention because unused treasure can carry across phases and influence future turns.",
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
        title: "Use Treasure Before You Lose One",
        targetId: ctx.isMobile ? "draft-mobile-treasure" : "sidebar-current-player-treasure",
        placement: ctx.isMobile ? "right" : "left",
        content: {
          summary: "You have reached 6 treasures.",
          detail: "After battle you only keep 5, so either roll now or build a hand that will actually spend the surplus.",
          minimizedText: "You only keep 5 treasures after battle.",
        },
      },
    ],
  };
}

function buildRewardThreeThreeHint(ctx: GuidedWalkthroughContext): GuideDefinition {
  const steps: GuideStepDefinition[] = [
    {
      id: "three-three-progress",
      title: "3-3 Means A Bigger Starting Hand",
      targetSelector: cardSelector("reward:vanquisher"),
      targetId: "reward-progression",
      placement: "top",
      content: {
        summary: "This reward pushes your starting hand size up by 1.",
        detail: "That changes how you should value curve, mana smoothing, and payoff cards going into the next loop.",
      },
    },
  ];

  if (ctx.hasRewardUpgradeChoice) {
    steps.push({
      id: "three-three-upgrades",
      title: "Read The Upgrades As Real Build Decisions",
      targetId: "reward-upgrades",
      placement: "top",
      content: {
        summary: "Upgrades can make your next battle stronger immediately, but they are also long-term positioning decisions.",
        detail: "Compare immediate power to whether the effect is worth saving for a better target later.",
      },
    });
  }

  return {
    id: "hint_reward_three_three",
    label: "Reward Tip",
    phase: "reward",
    steps,
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
        title: "You Can Apply An Upgrade Right Now",
        targetId: "build-workspace",
        placement: "right",
        content: {
          summary: "During build, upgrades let you sharpen this specific battle setup instead of improving your pool in the abstract.",
          detail: "Applying now can make the next fight stronger, but waiting can be better if you expect a more valuable target later.",
        },
      },
      {
        id: "how-to-apply",
        title: "Applying Is Card-Centric",
        targetId: "build-workspace",
        placement: "right",
        content: {
          summary: "Select a card in your hand or sideboard and use the purple Upgrade button that appears on it.",
          detail: "You do not have to spend the upgrade immediately, but build is where you decide whether this battle is the right moment.",
        },
      },
    ],
  };
}

export function isConditionalGuideId(guideId: GuidedGuideId): guideId is ConditionalGuideId {
  return CONDITIONAL_GUIDE_PRIORITY.includes(guideId as ConditionalGuideId);
}

export function isConditionalGuideEligible(
  guideId: ConditionalGuideId,
  ctx: GuidedWalkthroughContext,
  options: ConditionalGuideOptions,
): boolean {
  switch (guideId) {
    case "hint_treasure_producer":
      if (ctx.currentPhase === "build" && options.isFirstBuildGuide) {
        return !!findTreasureProducer(buildPool(ctx));
      }
      if (ctx.currentPhase === "draft") {
        return !!findTreasureProducer(currentPack(ctx));
      }
      return false;
    case "hint_treasure_cap":
      return ctx.currentPhase === "draft" && (ctx.selfPlayer?.treasures ?? 0) >= 6;
    case "hint_reward_three_three":
      return rewardStageReached(ctx);
    case "hint_build_unapplied_upgrade":
      return ctx.currentPhase === "build" && !!ctx.selfPlayer?.upgrades.some((upgrade) => !upgrade.upgrade_target);
  }
}

export function getEligibleConditionalGuides(
  ctx: GuidedWalkthroughContext,
  options: ConditionalGuideOptions,
): ConditionalGuideId[] {
  return CONDITIONAL_GUIDE_PRIORITY.filter((guideId) =>
    isConditionalGuideEligible(guideId, ctx, options),
  );
}

export function buildGuideDefinition(
  guideId: GuidedGuideId,
  ctx: GuidedWalkthroughContext,
  isReplay: boolean,
): GuideDefinition {
  switch (guideId) {
    case "welcome":
      return {
        id: "welcome",
        label: "Welcome",
        steps: [
          {
            id: "intro",
            title: "Welcome To Magic: The Battling",
            placement: "center",
            content: {
              summary: "The game alternates between improving your pool and playing short battles until only one player remains.",
              detail: "The battle itself is a real game you play manually, not an auto-battler.",
            },
          },
          {
            id: "start-state",
            title: "You Start In Build",
            targetId: "timeline-current-phase",
            placement: "bottom",
            content: {
              summary: "You are starting in build right now.",
              detail: "Draft normally comes first, but the game skips it at the very start so everyone builds a first battle setup.",
            },
          },
          {
            id: "loop",
            title: "Track The Game Loop Here",
            targetId: "timeline-stage-round",
            placement: "bottom",
            content: {
              summary: "This header shows your current stage and round. Your stage matches your starting hand size.",
              detail: "The main loop is draft → build → battle → reward. Build picks your setup, battle is the real game, and reward resets you for the next cycle.",
            },
          },
          {
            id: "handoff",
            title: "You Can Reopen Guides Later",
            targetId: "timeline-current-phase",
            placement: "bottom",
            content: {
              summary: "Open the phase popup from the timeline to relaunch any walkthrough.",
              detail: "The build guide is next because that is the phase you are actually in.",
              actionHint: "Click the current phase in the timeline.",
            },
            completion: { type: "target-click" },
          },
        ],
      };
    case "build":
      return {
        id: "build",
        label: "Build",
        phase: "build",
        steps: isReplay && ctx.buildReady ? buildReplaySteps() : buildInteractiveSteps(),
      };
    case "battle":
      return {
        id: "battle",
        label: "Battle",
        phase: "battle",
        steps: buildBattleSteps(ctx.canManipulateOpponent),
      };
    case "reward":
      return {
        id: "reward",
        label: "Reward",
        phase: "reward",
        steps: buildRewardSteps(ctx),
      };
    case "draft":
      return {
        id: "draft",
        label: "Draft",
        phase: "draft",
        steps: buildDraftSteps(ctx),
      };
    case "hint_treasure_producer":
      return buildTreasureProducerHint(ctx);
    case "hint_treasure_cap":
      return buildTreasureCapHint(ctx);
    case "hint_reward_three_three":
      return buildRewardThreeThreeHint(ctx);
    case "hint_build_unapplied_upgrade":
      return buildUnappliedUpgradeHint();
  }
}
