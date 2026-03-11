import { THE_VANQUISHER_IMAGE } from "../constants/assets";
import type {
  ConditionalGuideId,
  GuideDefinition,
  GuideStepDefinition,
  GuidedGuideId,
  GuidedWalkthroughContext,
} from "./types";

const CONDITIONAL_GUIDE_PRIORITY: ConditionalGuideId[] = [
  "hint_treasure_producer",
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
        title: "Welcome To Magic: The Battling",
        placement: "center",
        primaryActionLabel: "Show me the loop",
        content: {
          summary: "You improve your pool between battles, then play short manual games until only one player remains.",
          detail: "This guide just points out the important parts. It does not make you click through fake actions.",
        },
      },
      {
        id: "three-one",
        title: "You Start At 3-1",
        targetId: "timeline-stage-round",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "The left side of the timeline shows your current stage and round. Right now you are at 3-1.",
          detail: "The very first draft is skipped, so 3-1 starts directly in build. That should be easy to spot here because build is the live phase.",
        },
      },
      {
        id: "draft",
        title: "Draft Improves Your Pool",
        targetId: "timeline-phase-draft",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Draft is where you trade cards between the current pack and your pool.",
          detail: "You do not start there at 3-1, but after this first battle loop draft becomes the first step each round.",
        },
      },
      {
        id: "build",
        title: "Build Sets Up The Next Battle",
        targetId: "timeline-phase-build",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Build is where you choose your starting hand and battlefield setup for the next battle.",
          detail: "That is why your first real tutorial after Welcome is the build intro.",
        },
      },
      {
        id: "battle",
        title: "Battle Is The Real Game",
        targetId: "timeline-phase-battle",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Battle is not automated. You play the board state manually.",
          detail: "You move cards, tap permanents, and submit the result when the game is over.",
        },
      },
      {
        id: "reward",
        title: "Reward Resets You Into The Loop",
        targetId: "timeline-phase-reward",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Reward gives you treasure and card progression after battle.",
          detail: "That is the bridge back into the next draft-build-battle cycle.",
        },
      },
      {
        id: "three-two",
        title: "3-2 Starts The Repeating Loop",
        targetId: "timeline-next-stage-round",
        placement: "bottom",
        primaryActionLabel: "I understand",
        content: {
          summary: "When the right side shows 3-2, that means the next round begins with draft.",
          detail: "That is the full loop from here on: draft, build, battle, reward, then back around again.",
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
        id: "hand",
        title: "This Is Your Starting Hand",
        targetId: "build-hand",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Your hand here becomes the hand you start battle with.",
          detail: "Use build to decide exactly which cards you want available on turn one.",
        },
      },
      {
        id: "battlefield",
        title: "This Battlefield Row Is Your Opening Setup",
        targetId: "build-battlefield",
        placement: "bottom",
        primaryActionLabel: "Next",
        content: {
          summary: "Your basics, treasure, and poison tracker live here.",
          detail: "Those basics are part of your battle setup, not just deck construction bookkeeping.",
        },
      },
      {
        id: "sideboard",
        title: "Everything Else Waits In Sideboard",
        targetId: "build-sideboard",
        placement: "right",
        primaryActionLabel: "Ready to build",
        content: {
          summary: "Your sideboard is the rest of your pool for this round.",
          detail: "Move cards between sideboard and hand until the setup looks right, then submit.",
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
        placement: "top",
        primaryActionLabel: "Got it",
        content: {
          summary: "This choice is part of locking in your build for the battle.",
          detail: "Choose whether you want to be on the play or on the draw, then your setup is submitted.",
        },
      },
    ],
  };
}

function buildBattleGuide(ctx: GuidedWalkthroughContext): GuideDefinition {
  const steps: GuideStepDefinition[] = [
    {
      id: "hand",
      title: "Hand To Battlefield Is The Main Flow",
      targetId: "battle-hand" as const,
      placement: "top" as const,
      primaryActionLabel: "Next",
      content: {
        summary: "Drag cards from your hand onto the battlefield as you play them.",
        detail: "That is the core board interaction you will use most often in battle.",
      },
    },
    {
      id: "battlefield",
      title: "Use The Battlefield To Track Play",
      targetId: "battle-battlefield" as const,
      placement: "right" as const,
      primaryActionLabel: ctx.currentBattle?.can_manipulate_opponent ? "Next" : "Got it",
      content: {
        summary: "Double tap or double click your permanents to tap and untap them.",
        detail: "Battle is manual, so this board is where you track the game state directly.",
      },
    },
  ];

  if (ctx.currentBattle?.can_manipulate_opponent) {
    steps.push({
      id: "puppet-hand",
      title: "Puppet Battles Use Their Hand Too",
      targetId: "battle-opponent-hand",
      placement: "top",
      primaryActionLabel: "Got it",
      content: {
        summary: "Against a puppet, you can drag and drop their cards too.",
        detail: "Play out what you think would happen from both sides, then submit who would have won.",
      },
    });
  }

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
      id: "rewards",
      title: "Reward Always Gives Treasure Plus Card Progress",
      targetId: "reward-summary" as const,
      placement: "right" as const,
      primaryActionLabel: ctx.hasRewardUpgradeChoice ? "Next" : "Got it",
      content: {
        summary: "After battle you always get a treasure and a random card.",
        detail: "At the last round of a stage, when the right side of the timeline shows 4-1, 5-1, and so on, that random card is replaced by a Vanquisher.",
        media: {
          imageUrl: THE_VANQUISHER_IMAGE,
          alt: "The Vanquisher",
        },
      },
    },
  ];

  if (ctx.hasRewardUpgradeChoice) {
    steps.push({
      id: "upgrades",
      title: "This Is Also When You Pick An Upgrade",
      targetId: "reward-upgrades",
      placement: "top",
      primaryActionLabel: "Got it",
      content: {
        summary: "If upgrades are enabled, the available upgrade choices appear here when you finish a stage.",
        detail: "Pick one now before you continue into the next loop.",
      },
    });
  }

  return {
    id: "reward",
    label: "Reward",
    phase: "reward",
    steps,
  };
}

function buildDraftGuide(): GuideDefinition {
  return {
    id: "draft",
    label: "Draft",
    phase: "draft",
    steps: [
      {
        id: "pack",
        title: "This Is The Current Pack",
        targetId: "draft-pack",
        placement: "right",
        primaryActionLabel: "Next",
        content: {
          summary: "The pack is the temporary set of cards you can draft from right now.",
          detail: "Click a card here, then click a card in your pool to swap them.",
        },
      },
      {
        id: "pool",
        title: "This Is Your Pool",
        targetId: "draft-pool",
        placement: "right",
        primaryActionLabel: "Next",
        content: {
          summary: "Your pool is the collection you are improving between battles.",
          detail: "Each swap trades one pack card for one pool card.",
        },
      },
      {
        id: "roll",
        title: "Roll Spends Treasure For A Fresh Pack",
        targetId: "draft-roll",
        placement: "top",
        primaryActionLabel: "Ready to draft",
        content: {
          summary: "Use roll if you want to spend treasure on a different pack instead of drafting this one.",
          detail: "Once you understand the pack, pool, and roll, close this and draft normally.",
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
        placement: isBuild ? "right" : "top",
        primaryActionLabel: "Got it",
        content: {
          summary: "This card can make treasure, which often creates a real tempo spike later.",
          detail: isBuild
            ? "Because build chooses your exact opening setup, it is worth thinking about whether you want this effect immediately."
            : "Treasures carry real value across phases, so treasure-producing cards are often stronger than they first look.",
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
        title: "You Are At 6 Treasure",
        targetId: ctx.isMobile ? "draft-mobile-treasure" : "sidebar-current-player-treasure",
        placement: ctx.isMobile ? "right" : "left",
        primaryActionLabel: "Got it",
        content: {
          summary: "After battle you only keep 5 treasure.",
          detail: "If you can, spend one now on a roll or plan to convert the extra treasure in the next fight.",
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
    case "reward":
      return buildRewardGuide(ctx);
    case "draft":
      return buildDraftGuide();
    case "hint_treasure_producer":
      return buildTreasureProducerHint(ctx);
    case "hint_treasure_cap":
      return buildTreasureCapHint(ctx);
  }
}
