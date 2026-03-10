import type { GuideDefinition, GuideStepDefinition, GuidedGuideId, GuidedWalkthroughContext } from "./types";

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

function buildBattleSteps(includePuppetPractice: boolean): GuideStepDefinition[] {
  const steps: GuideStepDefinition[] = [
    {
      id: "manual-not-auto",
      title: "Battle Is A Real Game",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "This is not an auto-battle — you are playing a real mini-game of Magic on this board.",
        detail: "New players get tripped up here most often, so keep that mental model front and center.",
      },
    },
    {
      id: "battle-setup",
      title: "The Special Battle Rules",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "Battles start at 10 life with the hand and basics you chose in build already set up.",
        detail: "Treasures persist across phases, so using them now is a real strategic decision.",
      },
    },
    {
      id: "battle-ui",
      title: "Use The Board And Controls Together",
      targetId: "battle-actions",
      placement: "left",
      content: {
        summary: "Play on the battlefield and use Actions for common battle utilities.",
        detail: "The board is the main surface; the bottom controls give you quick access to tools.",
      },
    },
  ];

  if (includePuppetPractice) {
    steps.push({
      id: "puppet-practice",
      title: "Practice On The Puppet Board",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      content: {
        summary: "This opponent is a puppet — move cards around to learn the board safely.",
        actionHint: "Try moving a card to continue.",
      },
      completion: {
        type: "condition",
        allowInteraction: true,
        isComplete: (ctx, meta) =>
          !!meta && ctx.battleStateHash !== String(meta.initialBattleHash ?? ""),
      },
      onEnter: (ctx) => ({
        initialBattleHash: ctx.battleStateHash,
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
      title: "Read The Last Battle First",
      targetId: "reward-summary",
      placement: "right",
      content: {
        summary: "Reward starts by summarizing what happened in the battle.",
        detail: "Use this to confirm the result before thinking about what you gained.",
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

function buildDraftSteps(): GuideStepDefinition[] {
  return [
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
      id: "pool",
      title: "Swap Into Your Pool",
      targetId: "draft-pool",
      placement: "top",
      content: {
        summary: "Swap cards between the pack and your pool to strengthen future builds.",
        detail: "This is where you shape later hands and future battles.",
      },
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
            },
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
        steps: buildDraftSteps(),
      };
  }
}
