import type { GuideDefinition, GuideStepDefinition, GuidedGuideId, GuidedWalkthroughContext } from "./types";

function hasUpgradeChoice(ctx: GuidedWalkthroughContext): boolean {
  return ctx.hasRewardUpgradeChoice;
}

function rewardProgressBody(ctx: GuidedWalkthroughContext): string[] {
  const base = [
    "Every third reward step advances the stage and increases your starting hand size by 1.",
  ];
  if (hasUpgradeChoice(ctx)) {
    base.push("If upgrades are enabled and you just finished the stage, choose one before moving on.");
  }
  return base;
}

function buildReplaySteps(): GuideStepDefinition[] {
  return [
    {
      id: "setup",
      title: "Build Sets Up The Battle",
      targetId: "build-battlefield",
      placement: "right",
      body: [
        "Your chosen hand is the hand you will actually start the battle with.",
        "Your 3 chosen basics and your treasure begin untapped on the battlefield, the battle starts at 10 life, and there are no libraries.",
      ],
    },
    {
      id: "hand-and-basics",
      title: "You Are Already Locked In",
      targetId: "build-hand",
      placement: "right",
      body: [
        "When replaying the build guide after readying up, this becomes explanation-only so you are not forced through the build flow again.",
        "If you need to change anything, use Change first, then rebuild and resubmit.",
      ],
    },
    {
      id: "ready-state",
      title: "Waiting For The Next Phase",
      targetId: "build-submit",
      placement: "top",
      body: [
        "You have already submitted this build.",
        "Once everyone is ready, the game moves into battle.",
      ],
    },
  ];
}

function buildInteractiveSteps(): GuideStepDefinition[] {
  return [
    {
      id: "setup",
      title: "Build Decides The Battle Setup",
      targetId: "build-battlefield",
      placement: "right",
      spotlightPadding: 14,
      body: [
        "This phase is not deck construction in the abstract. You are choosing the exact setup for the next battle.",
        "Your 3 basics and your treasure start untapped on the battlefield, your chosen hand starts in hand, battles begin at 10 life, and there are no libraries.",
      ],
    },
    {
      id: "basics",
      title: "Choose Your Basics",
      targetId: "build-battlefield",
      placement: "right",
      spotlightPadding: 14,
      body: [
        "Choose all 3 basic lands you want to start with on the battlefield.",
        "Because they begin untapped, these choices are part of the actual battle plan, not filler setup.",
      ],
      completion: {
        type: "condition",
        isComplete: (ctx) => ctx.selectedBasicsCount === 3,
      },
    },
    {
      id: "hand",
      title: "Build Your Starting Hand",
      targetId: "build-hand",
      placement: "bottom",
      spotlightPadding: 14,
      body: [
        "Now choose the exact starting hand for the next game from your pool.",
        "Use the hand slots and your sideboard pool together: click a card or empty slot, then click the card you want to move or swap in.",
      ],
      completion: {
        type: "condition",
        isComplete: (ctx) => ctx.handCount === ctx.handSize,
      },
    },
    {
      id: "submit",
      title: "Open The Build Submission",
      targetId: "build-submit",
      placement: "top",
      body: [
        "When your basics and hand are ready, submit the build here.",
        "Clicking this opens the final play/draw choice, which is part of the build itself.",
      ],
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
      body: [
        "Choose whether you want to play or draw as part of submitting the build.",
        "If you have the most poison, you get your choice of play or draw here.",
      ],
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
      body: [
        "This is not an auto-battle. You are now playing a real mini-game of Magic on this board.",
        "New players get tripped up here most often, so keep that mental model front and center.",
      ],
    },
    {
      id: "battle-setup",
      title: "The Special Battle Rules",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      body: [
        "Battles start at 10 life, with no libraries, and with the hand and basics you chose in build already set up for play.",
        "Treasures persist across phases, so using them now is a real strategic decision that affects later rounds.",
      ],
    },
    {
      id: "battle-ui",
      title: "Use The Board And Controls Together",
      targetId: "battle-actions",
      placement: "left",
      body: [
        "Play on the battlefield, use your zones on the sides, and use Actions for common battle utilities.",
        "The board is the main surface, but the bottom controls are how you access common battle tools quickly.",
      ],
    },
  ];

  if (includePuppetPractice) {
    steps.push({
      id: "puppet-practice",
      title: "Practice On The Puppet Board",
      targetId: "battle-board",
      placement: "right",
      spotlightPadding: 12,
      body: [
        "Because this opponent is a puppet, you can move cards around on the visible board to play the battle out yourself.",
        "Try moving cards around now. This is a safe place to learn how the board behaves before worrying about a live human opponent.",
      ],
      completion: {
        type: "condition",
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
    title: "Submit The Result When The Game Ends",
    targetId: "battle-submit",
    placement: "top",
    body: [
      "When the battle is over, submit win, draw, or loss here.",
      "If you need to correct your report, you can change it, and if players disagree the UI will show that conflict.",
    ],
  });

  return steps;
}

function buildRewardSteps(): GuideStepDefinition[] {
  return [
    {
      id: "result",
      title: "Read The Last Battle First",
      targetId: "reward-summary",
      placement: "right",
      body: [
        "Reward starts by summarizing what just happened in the battle.",
        "Use this to confirm the result before thinking about what you gained.",
      ],
    },
    {
      id: "rewards",
      title: "This Is What You Gained",
      targetId: "reward-summary",
      placement: "right",
      body: [
        "Rewards can include treasure, bonus cards, and sometimes other progression rewards.",
        "This is the payoff phase before you loop back into improving your pool again.",
      ],
    },
    {
      id: "progression",
      title: "Watch For Stage Changes",
      targetId: "reward-progression",
      placement: "top",
      body: rewardProgressBody,
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
      body: [
        "Draft is the between-battles improvement phase.",
        "Look at the current pack here and decide whether any of these cards should replace part of your pool before the next build.",
      ],
    },
    {
      id: "pool",
      title: "Swap Into Your Pool",
      targetId: "draft-pool",
      placement: "top",
      body: [
        "Your current pool is here. Drafting means swapping cards between the pack and this pool to make your next build stronger.",
        "This is where you shape later hands and future battles.",
      ],
    },
    {
      id: "actions",
      title: "Spend Treasure Carefully",
      targetId: "phase-action-bar",
      placement: "top",
      body: [
        "You can spend a treasure to roll for a fresh pack, but treasures persist across phases, so deciding when to use them is core strategy.",
        "When you are satisfied with the pack, continue on to build the next battle setup.",
      ],
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
            body: [
              "The game alternates between improving your pool and playing short battles until only one player remains.",
              "Even though the format is inspired by autobattlers, the battle itself is a real game you play manually.",
            ],
          },
          {
            id: "start-state",
            title: "You Start In Build",
            targetId: "timeline-current-phase",
            placement: "bottom",
            body: [
              "You are starting in build right now.",
              "Draft normally comes first in the loop, but the game intentionally skips draft only at the very beginning so everyone starts by building a first battle setup.",
            ],
          },
          {
            id: "loop",
            title: "Track The Game Loop Here",
            targetId: "timeline-stage-round",
            placement: "bottom",
            body: [
              "This header shows your current stage and round. Your stage matches your starting hand size.",
              "The main loop is draft, build, battle, reward. Build picks your battle setup, battle is the real game, and reward resets you for the next cycle.",
            ],
          },
          {
            id: "handoff",
            title: "You Can Reopen Guides Later",
            targetId: "timeline-current-phase",
            placement: "bottom",
            body: [
              "If you want help again later, open the phase popup from the timeline and launch the walkthrough for that phase.",
              "For now, the build guide is next because that is the phase you are actually in.",
            ],
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
        steps: buildRewardSteps(),
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
