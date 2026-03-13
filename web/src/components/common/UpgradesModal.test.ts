import { describe, expect, it, vi } from "vitest";
import { applyUpgradeWithModalClose } from "./upgradeModalFlow";

describe("applyUpgradeWithModalClose", () => {
  it("closes the modal before applying the upgrade", () => {
    const events: string[] = [];
    const flush = vi.fn((callback: () => void) => {
      events.push("flush");
      callback();
    });

    applyUpgradeWithModalClose({
      upgradeId: "upgrade-1",
      targetId: "target-1",
      onClose: () => {
        events.push("close");
      },
      onApply: (upgradeId, targetId) => {
        events.push(`apply:${upgradeId}:${targetId}`);
      },
      flush,
    });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "flush",
      "close",
      "apply:upgrade-1:target-1",
    ]);
  });

  it("does nothing when there is no apply handler", () => {
    const flush = vi.fn();
    const onClose = vi.fn();

    applyUpgradeWithModalClose({
      upgradeId: "upgrade-1",
      targetId: "target-1",
      onClose,
      flush,
    });

    expect(flush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
