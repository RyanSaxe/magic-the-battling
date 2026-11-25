import { useCallback, useRef, useState, type ReactElement } from "react";
import { useWindowEvent } from "../../hooks/useDomEffects";
import type { Card as CardType } from "../../types";
import { UpgradeStack } from "../sidebar/UpgradeStack";
import { CardGrid } from "./CardGrid";
import { CloseButton } from "./CloseButton";
import { DIALOG_BACKDROP } from "./styles";
import { useCardLayout } from "../../hooks/useCardLayout";
import { upgradeListLayoutConfig } from "./upgradeModalLayouts";
import { enterMayAdvance, enterPressesControl } from "../../utils/enterKey";

interface RevealBeforeSubmitModalProps {
  upgrades: CardType[];
  onRevealAndSubmit: (upgradeIds: string[]) => void;
  onSkip: () => void;
  onClose: () => void;
}

export function RevealBeforeSubmitModal({
  upgrades,
  onRevealAndSubmit,
  onSkip,
  onClose,
}: RevealBeforeSubmitModalProps): ReactElement {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    upgrades.map((u) => u.id),
  );

  const toggleUpgrade = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);
  useWindowEvent("keydown", (e) => {
    if (enterPressesControl(e, dialogRef.current)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter" && selectedIds.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (enterMayAdvance(e)) onRevealAndSubmit(selectedIds);
    }
  });

  const [ref, dims] = useCardLayout(upgradeListLayoutConfig(upgrades.length));

  const upgradeDims = {
    width: dims.upgrades.width,
    height: dims.upgrades.height,
  };

  return (
    <div
      role="presentation"
      className={`fixed inset-0 ${DIALOG_BACKDROP} flex items-center justify-center z-50 p-4 sm:p-8`}
      onClick={onClose}
    >
      <div
        role="presentation"
        ref={dialogRef}
        className="modal-chrome border gold-border rounded-lg flex flex-col w-full max-w-xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 shrink-0 border-b gold-divider flex justify-between items-center">
          <h2 className="text-white font-semibold text-lg">
            Unrevealed Upgrades
          </h2>
          <CloseButton
            onClick={onClose}
            label="Close Unrevealed Upgrades"
            className="shrink-0 ml-4 my-[3px]"
          />
        </div>

        <div className="px-4 pt-3 pb-1">
          <p className="text-amber-400 text-sm">
            You have unrevealed upgrades that won&apos;t count toward poison
            damage.
          </p>
        </div>

        <div ref={ref} className="flex-1 min-h-0 p-2">
          <CardGrid
            columns={dims.upgrades.columns}
            cardWidth={upgradeDims.width}
          >
            {upgrades.map((upgrade) => (
              <UpgradeStack
                key={upgrade.id}
                upgrade={upgrade}
                dimensions={upgradeDims}
                onClick={() => toggleUpgrade(upgrade.id)}
                selected={selectedIds.includes(upgrade.id)}
              />
            ))}
          </CardGrid>
        </div>

        <div className="px-4 py-3 border-t gold-divider flex justify-end gap-3">
          <button
            onClick={onSkip}
            data-ends-phase
            className="btn btn-secondary text-sm"
          >
            Submit Without Revealing
          </button>
          <button
            onClick={() => onRevealAndSubmit(selectedIds)}
            data-ends-phase
            disabled={selectedIds.length === 0}
            className="btn btn-primary text-sm font-semibold"
          >
            Reveal & Submit
          </button>
        </div>
      </div>
    </div>
  );
}
