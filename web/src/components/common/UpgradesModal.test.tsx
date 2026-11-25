// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../../types";
import {
  applyUpgradeWithModalClose,
  revealUpgradeWithModalClose,
} from "./upgradeModalFlow";
import { UpgradesModal } from "./UpgradesModal";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const upgrade = {
  id: "upgrade",
  name: "Upgrade",
  upgrade_target: null,
} as Card;
const target = { id: "target", name: "Target", upgrade_target: null } as Card;

describe("upgradeModalFlow", () => {
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
    expect(events).toEqual(["flush", "close", "apply:upgrade-1:target-1"]);
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

  it("closes the modal before revealing the upgrade", () => {
    const events: string[] = [];
    const flush = vi.fn((callback: () => void) => {
      events.push("flush");
      callback();
    });

    revealUpgradeWithModalClose({
      upgradeIds: ["upgrade-1", "upgrade-2"],
      onClose: () => {
        events.push("close");
      },
      onReveal: (upgradeIds) => {
        events.push(`reveal:${upgradeIds.join(",")}`);
      },
      flush,
    });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["flush", "close", "reveal:upgrade-1,upgrade-2"]);
  });
});

describe("UpgradesModal keyboard interactions", () => {
  beforeEach(() => {
    // jsdom has no layout to observe.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("applies on a press of Enter, and never from holding it", () => {
    const onApply = vi.fn();
    render(
      <>
        <button>Upgrade Target</button>
        <UpgradesModal
          upgrades={[upgrade]}
          mode="apply"
          targets={[target]}
          initialTargetId={target.id}
          onApply={onApply}
          onClose={vi.fn()}
        />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Upgrade Target" });
    const confirm = screen.getByRole("button", { name: "Confirm" });

    fireEvent.keyDown(opener, { key: "Enter", repeat: true });
    expect(onApply).not.toHaveBeenCalled();

    confirm.focus();
    // False when the dialog took the key, so the browser won't press Confirm either.
    expect(fireEvent.keyDown(confirm, { key: "Enter", repeat: true })).toBe(
      false,
    );

    opener.focus();
    fireEvent.keyDown(opener, { key: "Enter" });
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("closes Apply Upgrade on one Escape with an upgrade and a card selected", () => {
    const onClose = vi.fn();
    const onApply = vi.fn();
    render(
      <UpgradesModal
        upgrades={[upgrade]}
        mode="apply"
        targets={[target]}
        initialTargetId={target.id}
        onApply={onApply}
        onClose={onClose}
      />,
    );
    // Confirm shows only with both selected, as the Upgrade pill opens the dialog.
    screen.getByRole("button", { name: "Confirm" });

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });
});
