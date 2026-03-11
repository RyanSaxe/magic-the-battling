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
  });
});
