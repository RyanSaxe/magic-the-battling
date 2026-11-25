import {
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { useWindowEvent } from "../../hooks/useDomEffects";
import type { Card as CardType } from "../../types";
import { Card, CardPreviewContext } from "../card";
import { UpgradeStack } from "../sidebar/UpgradeStack";
import { CardGrid } from "./CardGrid";
import { CloseButton } from "./CloseButton";
import { DIALOG_BACKDROP } from "./styles";
import { useCardLayout } from "../../hooks/useCardLayout";
import {
  upgradeApplyLayoutConfig,
  upgradeListLayoutConfig,
} from "./upgradeModalLayouts";
import { useElementHeight } from "../../hooks/useElementHeight";
import {
  applyUpgradeWithModalClose,
  revealUpgradeWithModalClose,
} from "./upgradeModalFlow";
import {
  getAppliedUpgrades,
  getUnappliedUpgrades,
  getUnrevealedAppliedUpgrades,
} from "../../utils/upgrades";
import { enterPressesControl } from "../../utils/enterKey";

const EMPTY_CARDS: CardType[] = [];
const EMPTY_STRING_ARRAY: string[] = [];

type UpgradesModalMode = "view" | "apply" | "reveal";

interface UpgradesModalProps {
  upgrades: CardType[];
  mode: UpgradesModalMode;
  targets?: CardType[];
  onApply?: (upgradeId: string, targetId: string) => void;
  onReveal?: (upgradeIds: string[]) => void;
  onClose: () => void;
  initialTargetId?: string;
  initialUpgradeId?: string;
  initialRevealUpgradeIds?: string[];
}

function resolveInitialUpgradeId(options: {
  canApply: boolean;
  unapplied: CardType[];
  initialUpgradeId?: string;
}): string | null {
  if (!options.canApply) return null;
  if (
    options.initialUpgradeId &&
    options.unapplied.some((u) => u.id === options.initialUpgradeId)
  ) {
    return options.initialUpgradeId;
  }
  return options.unapplied.length === 1 ? options.unapplied[0].id : null;
}

function resolveInitialRevealIds(options: {
  mode: UpgradesModalMode;
  hiddenApplied: CardType[];
  initialRevealUpgradeIds: string[];
}): string[] {
  if (options.mode !== "reveal") return [];
  const hiddenUpgradeIds = new Set(options.hiddenApplied.map((u) => u.id));
  const initialSelection = options.initialRevealUpgradeIds.filter((id) =>
    hiddenUpgradeIds.has(id),
  );
  if (initialSelection.length > 0) return initialSelection;
  return options.hiddenApplied.length === 1
    ? [options.hiddenApplied[0].id]
    : [];
}

function blurActiveElement(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

interface UpgradesModalKeyOptions {
  dialogEl: HTMLDivElement | null;
  mode: UpgradesModalMode;
  selectedUpgradeId: string | null;
  selectedTargetId: string | null;
  selectedRevealUpgradeIds: string[];
  canApply: boolean;
  canReveal: boolean;
  onClearReveal: () => void;
  onClose: () => void;
  onConfirmApply: (upgradeId: string, targetId: string) => void;
  onConfirmReveal: (upgradeIds: string[]) => void;
}

function handleUpgradesModalEnter(
  e: KeyboardEvent,
  options: UpgradesModalKeyOptions,
): void {
  if (
    options.canApply &&
    options.selectedUpgradeId &&
    options.selectedTargetId
  ) {
    e.preventDefault();
    e.stopPropagation();
    blurActiveElement();
    options.onConfirmApply(options.selectedUpgradeId, options.selectedTargetId);
    return;
  }
  if (options.canReveal && options.selectedRevealUpgradeIds.length > 0) {
    e.preventDefault();
    e.stopPropagation();
    blurActiveElement();
    options.onConfirmReveal(options.selectedRevealUpgradeIds);
  }
}

function handleUpgradesModalKeyDown(
  e: KeyboardEvent,
  options: UpgradesModalKeyOptions,
): void {
  // The Enter that opened this can still be held down, and neither applying nor revealing can be undone.
  if (e.key === "Enter" && e.repeat) {
    e.preventDefault();
    return;
  }
  if (enterPressesControl(e, options.dialogEl)) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (
      options.mode === "reveal" &&
      options.selectedRevealUpgradeIds.length > 0
    ) {
      options.onClearReveal();
    } else {
      options.onClose();
    }
    return;
  }
  if (e.key === "Enter") handleUpgradesModalEnter(e, options);
}

function UpgradesModalHeading({
  mode,
}: {
  mode: UpgradesModalMode;
}): ReactElement {
  if (mode === "apply") {
    return (
      <>
        Apply Upgrade{" "}
        <span className="text-red-400 font-bold">Permanently</span>
      </>
    );
  }
  return <>{mode === "reveal" ? "Reveal Upgrade" : "Upgrades"}</>;
}

interface UpgradesApplyBodyProps {
  applyRef: React.RefCallback<HTMLElement>;
  separatorRef: React.RefCallback<HTMLElement>;
  separatorHeight: number;
  upgradesDims: { width: number; height: number; columns: number };
  targetsDims: { width: number; height: number; columns: number };
  applied: CardType[];
  unapplied: CardType[];
  targets: CardType[];
  canApply: boolean;
  selectedUpgradeId: string | null;
  selectedTargetId: string | null;
  onSelectUpgrade: (id: string | null) => void;
  onTargetClick: (target: CardType) => void;
  onPreviewCard: (card: CardType, appliedUpgrades?: CardType[]) => void;
}

function UpgradesApplyBody({
  applyRef,
  separatorRef,
  separatorHeight,
  upgradesDims,
  targetsDims,
  applied,
  unapplied,
  targets,
  canApply,
  selectedUpgradeId,
  selectedTargetId,
  onSelectUpgrade,
  onTargetClick,
  onPreviewCard,
}: UpgradesApplyBodyProps): ReactElement {
  const upgradeDims = {
    width: upgradesDims.width,
    height: upgradesDims.height,
  };
  const targetDims = {
    width: targetsDims.width,
    height: targetsDims.height,
  };

  return (
    <div ref={applyRef} className="flex-1 min-h-0 flex flex-col p-2">
      {separatorHeight > 0 && (
        <div className="shrink-0 flex justify-center">
          <CardGrid
            columns={upgradesDims.columns}
            cardWidth={upgradeDims.width}
          >
            {applied.map((upgrade) => (
              <UpgradeStack
                key={upgrade.id}
                upgrade={upgrade}
                dimensions={upgradeDims}
                onClick={
                  canApply
                    ? undefined
                    : (): void => {
                        if (upgrade.upgrade_target) {
                          onPreviewCard(upgrade.upgrade_target, [upgrade]);
                        } else {
                          onPreviewCard(upgrade);
                        }
                      }
                }
              />
            ))}
            {unapplied.map((upgrade) => (
              <Card
                key={upgrade.id}
                card={upgrade}
                dimensions={upgradeDims}
                onClick={() => {
                  if (!canApply) {
                    onPreviewCard(upgrade);
                    return;
                  }
                  onSelectUpgrade(
                    selectedUpgradeId === upgrade.id ? null : upgrade.id,
                  );
                }}
                selected={canApply && selectedUpgradeId === upgrade.id}
              />
            ))}
          </CardGrid>
        </div>
      )}
      <div ref={separatorRef} className="py-2 shrink-0">
        <hr className="gold-divider" />
      </div>
      {separatorHeight > 0 && (
        <div className="flex-1 min-h-0 flex justify-center">
          <CardGrid columns={targetsDims.columns} cardWidth={targetDims.width}>
            {targets.map((card) => (
              <Card
                key={card.id}
                card={card}
                dimensions={targetDims}
                onClick={() => onTargetClick(card)}
                selected={canApply && selectedTargetId === card.id}
              />
            ))}
          </CardGrid>
        </div>
      )}
    </div>
  );
}

interface UpgradesListBodyProps {
  viewRef: React.RefCallback<HTMLElement>;
  isRevealMode: boolean;
  upgrades: CardType[];
  revealedApplied: CardType[];
  hiddenApplied: CardType[];
  columns: number;
  upgradeDims: { width: number; height: number };
  selectedRevealUpgradeIds: string[];
  onRevealUpgradeClick: (upgradeId: string) => void;
}

function UpgradesListBody({
  viewRef,
  isRevealMode,
  upgrades,
  revealedApplied,
  hiddenApplied,
  columns,
  upgradeDims,
  selectedRevealUpgradeIds,
  onRevealUpgradeClick,
}: UpgradesListBodyProps): ReactElement {
  const visibleUpgrades = isRevealMode ? revealedApplied : upgrades;
  const totalCount = isRevealMode
    ? revealedApplied.length + hiddenApplied.length
    : upgrades.length;

  return (
    <div ref={viewRef} className="flex-1 min-h-0 p-2">
      <div className="h-full">
        {totalCount > 0 ? (
          <CardGrid columns={columns} cardWidth={upgradeDims.width}>
            {visibleUpgrades.map((upgrade) =>
              upgrade.upgrade_target ? (
                <UpgradeStack
                  key={upgrade.id}
                  upgrade={upgrade}
                  dimensions={upgradeDims}
                />
              ) : (
                <Card
                  key={upgrade.id}
                  card={upgrade}
                  dimensions={upgradeDims}
                />
              ),
            )}
            {isRevealMode &&
              hiddenApplied.map((upgrade) => (
                <UpgradeStack
                  key={upgrade.id}
                  upgrade={upgrade}
                  dimensions={upgradeDims}
                  onClick={() => onRevealUpgradeClick(upgrade.id)}
                  selected={selectedRevealUpgradeIds.includes(upgrade.id)}
                />
              ))}
          </CardGrid>
        ) : (
          <p className="text-[var(--ivory-muted)]">
            {isRevealMode ? "No hidden upgrades to reveal" : "No upgrades yet"}
          </p>
        )}
      </div>
    </div>
  );
}

function computeViewCardCount(options: {
  mode: UpgradesModalMode;
  totalUpgrades: number;
  revealCount: number;
}): number {
  if (options.mode === "apply") return 0;
  return options.mode === "reveal"
    ? options.revealCount
    : options.totalUpgrades;
}

function useUpgradesModalSelection(options: {
  mode: UpgradesModalMode;
  canApply: boolean;
  unapplied: CardType[];
  hiddenApplied: CardType[];
  targets: CardType[];
  initialUpgradeId?: string;
  initialTargetId?: string;
  initialRevealUpgradeIds: string[];
}): {
  selectedUpgradeId: string | null;
  setSelectedUpgradeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedTargetId: string | null;
  setSelectedTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedRevealUpgradeIds: string[];
  setSelectedRevealUpgradeIds: React.Dispatch<React.SetStateAction<string[]>>;
  readyToConfirm: boolean;
} {
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(
    () =>
      resolveInitialUpgradeId({
        canApply: options.canApply,
        unapplied: options.unapplied,
        initialUpgradeId: options.initialUpgradeId,
      }),
  );
  const [selectedRevealUpgradeIds, setSelectedRevealUpgradeIds] = useState<
    string[]
  >(() =>
    resolveInitialRevealIds({
      mode: options.mode,
      hiddenApplied: options.hiddenApplied,
      initialRevealUpgradeIds: options.initialRevealUpgradeIds,
    }),
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(
    options.canApply ? (options.initialTargetId ?? null) : null,
  );

  const hasApplySelection =
    options.canApply &&
    options.unapplied.some((u) => u.id === selectedUpgradeId) &&
    options.targets.some((t) => t.id === selectedTargetId);
  const hasRevealSelection =
    options.mode === "reveal" && selectedRevealUpgradeIds.length > 0;

  return {
    selectedUpgradeId,
    setSelectedUpgradeId,
    selectedTargetId,
    setSelectedTargetId,
    selectedRevealUpgradeIds,
    setSelectedRevealUpgradeIds,
    readyToConfirm: hasApplySelection || hasRevealSelection,
  };
}

export function UpgradesModal(props: UpgradesModalProps): ReactElement {
  const { upgrades, mode, onApply, onReveal, onClose } = props;
  const targets = props.targets ?? EMPTY_CARDS;
  const previewContext = useContext(CardPreviewContext);
  const isApplyMode = mode === "apply";
  const isRevealMode = mode === "reveal";
  const canApply = isApplyMode && Boolean(onApply);
  const canReveal = isRevealMode && Boolean(onReveal);
  const applied = getAppliedUpgrades(upgrades);
  const unapplied = getUnappliedUpgrades(upgrades);
  const hiddenApplied = getUnrevealedAppliedUpgrades(upgrades);
  const revealedApplied = applied.filter(
    (upgrade) => upgrade.is_revealed !== false,
  );

  const selection = useUpgradesModalSelection({
    mode,
    canApply,
    unapplied,
    hiddenApplied,
    targets,
    initialUpgradeId: props.initialUpgradeId,
    initialTargetId: props.initialTargetId,
    initialRevealUpgradeIds:
      props.initialRevealUpgradeIds ?? EMPTY_STRING_ARRAY,
  });

  const applyUpgrade = useCallback(
    (upgradeId: string, targetId: string) => {
      applyUpgradeWithModalClose({ upgradeId, targetId, onApply, onClose });
    },
    [onApply, onClose],
  );

  const revealUpgrade = useCallback(
    (upgradeIds: string[]) => {
      revealUpgradeWithModalClose({ upgradeIds, onReveal, onClose });
    },
    [onClose, onReveal],
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  useWindowEvent("keydown", (e) => {
    handleUpgradesModalKeyDown(e, {
      dialogEl: dialogRef.current,
      mode,
      selectedUpgradeId: selection.selectedUpgradeId,
      selectedTargetId: selection.selectedTargetId,
      selectedRevealUpgradeIds: selection.selectedRevealUpgradeIds,
      canApply,
      canReveal,
      onClearReveal: () => selection.setSelectedRevealUpgradeIds([]),
      onClose,
      onConfirmApply: applyUpgrade,
      onConfirmReveal: revealUpgrade,
    });
  });

  const [separatorRef, separatorHeight] = useElementHeight();
  const [applyRef, applyDims] = useCardLayout(
    upgradeApplyLayoutConfig({
      upgradeCount: isApplyMode ? upgrades.length : 0,
      targetCount: isApplyMode ? targets.length : 0,
      separatorHeight,
    }),
  );
  const [viewRef, viewDims] = useCardLayout(
    upgradeListLayoutConfig(
      computeViewCardCount({
        mode,
        totalUpgrades: upgrades.length,
        revealCount: revealedApplied.length + hiddenApplied.length,
      }),
    ),
  );

  const handleConfirm = (): void => {
    if (canApply && selection.selectedUpgradeId && selection.selectedTargetId) {
      applyUpgrade(selection.selectedUpgradeId, selection.selectedTargetId);
      return;
    }
    if (canReveal) revealUpgrade(selection.selectedRevealUpgradeIds);
  };

  const handleTargetClick = (target: CardType): void => {
    if (!canApply) {
      previewContext?.setPreviewCard(target);
      return;
    }
    selection.setSelectedTargetId((curr) =>
      curr === target.id ? null : target.id,
    );
  };

  const handleRevealUpgradeClick = (upgradeId: string): void => {
    selection.setSelectedRevealUpgradeIds((current) =>
      current.includes(upgradeId)
        ? current.filter((id) => id !== upgradeId)
        : [...current, upgradeId],
    );
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
        className="modal-chrome border gold-border rounded-lg flex flex-col w-full h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 shrink-0 border-b gold-divider flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-lg truncate">
              <UpgradesModalHeading mode={mode} />
            </h2>
          </div>
          <CloseButton
            onClick={onClose}
            label="Close Upgrades"
            className="shrink-0 ml-4 my-[3px]"
          />
        </div>

        {isApplyMode ? (
          <UpgradesApplyBody
            applyRef={applyRef}
            separatorRef={separatorRef}
            separatorHeight={separatorHeight}
            upgradesDims={applyDims.upgrades}
            targetsDims={applyDims.targets}
            applied={applied}
            unapplied={unapplied}
            targets={targets}
            canApply={canApply}
            selectedUpgradeId={selection.selectedUpgradeId}
            selectedTargetId={selection.selectedTargetId}
            onSelectUpgrade={selection.setSelectedUpgradeId}
            onTargetClick={handleTargetClick}
            onPreviewCard={(card, cardUpgrades) =>
              previewContext?.setPreviewCard(card, cardUpgrades)
            }
          />
        ) : (
          <UpgradesListBody
            viewRef={viewRef}
            isRevealMode={isRevealMode}
            upgrades={upgrades}
            revealedApplied={revealedApplied}
            hiddenApplied={hiddenApplied}
            columns={viewDims.upgrades.columns}
            upgradeDims={{
              width: viewDims.upgrades.width,
              height: viewDims.upgrades.height,
            }}
            selectedRevealUpgradeIds={selection.selectedRevealUpgradeIds}
            onRevealUpgradeClick={handleRevealUpgradeClick}
          />
        )}
        {selection.readyToConfirm && (
          <button
            onClick={handleConfirm}
            className="btn btn-primary absolute bottom-4 right-4 text-sm font-semibold"
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}
