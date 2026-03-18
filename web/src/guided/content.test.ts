import { describe, expect, it } from "vitest";
import { buildGuideDefinition } from "./content";
import type { GuidedWalkthroughContext } from "./types";

const baseContext: GuidedWalkthroughContext = {
  currentPhase: "draft",
  selfPlayer: null,
  currentBattle: null,
  isMobile: true,
  sidebarOpen: false,
  revealedPlayerName: null,
  useUpgrades: true,
  hasRewardUpgradeChoice: false,
  showBuildSubmitPopover: false,
  showBattleSubmitPopover: false,
  hasBattleRevealUpgrade: false,
  availableRewardUpgrades: [],
  draftGuideOpponentName: "Rival",
  draftGuideOpponentRevealedCount: 3,
  isStageEnd: false,
};

describe("buildGuideDefinition", () => {
  it("keeps the draft row step focused on the player list", () => {
    const guide = buildGuideDefinition("draft", baseContext);
    const step = guide.steps.find((candidate) => candidate.id === "opponent-row");

    expect(step?.targetId).toBe("sidebar-opponent-list");
    expect(step?.sidebarState?.openOnMobile).toBe(true);
    expect(step?.sidebarState?.playerName).toBeNull();
  });

  it("opens the detail panel on the seen-in-battle tab for the reveal step", () => {
    const guide = buildGuideDefinition("draft", baseContext);
    const step = guide.steps.find((candidate) => candidate.id === "revealed-cards");

    expect(step?.targetId).toBe("sidebar-seen-in-battle");
    expect(step?.sidebarState?.playerName).toBeTypeOf("function");
    expect(step?.sidebarState?.detailTab).toBe("seen");
    expect(step?.waitForLayoutTargetId).toBeTypeOf("function");
  });

  it("keeps the reward continue step clickable while the guide is open", () => {
    const guide = buildGuideDefinition("reward", baseContext);
    const step = guide.steps.find((candidate) => candidate.id === "continue");

    expect(step?.targetId).toBe("reward-continue");
    expect(step?.allowTargetInteraction).toBe(true);
  });

  it("targets the battle reveal-upgrade button for the reveal hint", () => {
    const guide = buildGuideDefinition("hint_battle_unrevealed_upgrade", {
      ...baseContext,
      currentPhase: "battle",
      hasBattleRevealUpgrade: true,
    });
    const step = guide.steps.find((candidate) => candidate.id === "reveal-upgrade");

    expect(step?.targetId).toBe("battle-reveal-upgrade");
    expect(step?.allowTargetInteraction).toBe(true);
  });
});
