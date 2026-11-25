import { useState, type ReactNode } from "react";
import { bestFit, type ZoneDims } from "../../hooks/cardSizeUtils";
import { useObservedElement } from "../../hooks/pages/useObservedElement";
import type { Card as CardType } from "../../types";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";

interface ZoneDisplayProps {
  title: string;
  cards: CardType[];
  maxThumbnails?: number;
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
}

const DEFAULT_MODAL_DIMS: ZoneDims = {
  width: 80,
  height: 112,
  rows: 1,
  columns: 1,
};

export function ZoneModal({
  title,
  cards,
  showUpgradeTargets,
  companionIds,
  upgradedCardIds,
  appliedUpgradesByCardId,
  onClose,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
  onClose: () => void;
}): ReactNode {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_MODAL_DIMS);

  const bodyRef = useObservedElement<HTMLDivElement>(
    (node) => {
      const cs = getComputedStyle(node);
      const width =
        node.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const height =
        node.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);

      const next = bestFit({
        count: cards.length,
        availWidth: Math.max(width, 0),
        availHeight: Math.max(height, 0),
        gap: 8,
        maxWidth: 220,
        minWidth: 64,
      });

      setDims((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.rows === next.rows &&
        prev.columns === next.columns
          ? prev
          : next,
      );
    },
    { deps: [cards.length] },
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 bg-black/60 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 modal-chrome border gold-border rounded-lg w-full max-w-6xl h-[85vh] max-h-[860px] flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b gold-divider flex justify-between items-center shrink-0">
          <h3 className="text-white font-medium">
            {title} ({cards.length})
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--ivory-muted)] hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 min-h-0 p-3 overflow-auto">
          {cards.length === 0 ? (
            <div className="text-[var(--ivory-muted)] text-center py-4">
              No cards
            </div>
          ) : (
            <div
              className="grid gap-2 justify-center content-start"
              style={{
                gridTemplateColumns: `repeat(${Math.max(
                  1,
                  dims.columns,
                )}, ${dims.width}px)`,
              }}
            >
              {cards.map((card) =>
                showUpgradeTargets ? (
                  <UpgradeStack
                    key={card.id}
                    upgrade={card}
                    dimensions={{ width: dims.width, height: dims.height }}
                  />
                ) : (
                  <Card
                    key={card.id}
                    card={card}
                    dimensions={{ width: dims.width, height: dims.height }}
                    isCompanion={companionIds?.has(card.id)}
                    upgraded={upgradedCardIds?.has(card.id)}
                    appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ZoneDisplay({
  title,
  cards,
  maxThumbnails = 6,
  showUpgradeTargets = false,
  companionIds,
  upgradedCardIds,
  appliedUpgradesByCardId,
}: ZoneDisplayProps): ReactNode {
  const [showModal, setShowModal] = useState(false);

  const displayedCards = cards.slice(0, maxThumbnails);
  const remainingCount = cards.length - displayedCards.length;

  return (
    <>
      <button
        onClick={() => cards.length > 0 && setShowModal(true)}
        className={`flex flex-col items-center pt-2 rounded ${
          cards.length > 0 ? "hover:cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="text-[10px] text-[var(--ivory-muted)] uppercase mb-1">
          {title}
        </div>
        {cards.length === 0 ? (
          <span className="text-[var(--ivory-muted)] text-xs">
            No Cards Seen
          </span>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <div className="grid gap-1 grid-cols-3">
              {displayedCards.map((card) =>
                showUpgradeTargets ? (
                  <UpgradeStack
                    key={card.id}
                    upgrade={card}
                    dimensions={{ width: 66, height: 92 }}
                  />
                ) : (
                  <Card
                    key={card.id}
                    card={card}
                    size="sm"
                    isCompanion={companionIds?.has(card.id)}
                    upgraded={upgradedCardIds?.has(card.id)}
                    appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
                  />
                ),
              )}
            </div>
            {remainingCount > 0 && (
              <div className="text-[10px] text-[var(--ivory-muted)]">
                +{remainingCount} more
              </div>
            )}
          </div>
        )}
      </button>

      {showModal && (
        <ZoneModal
          title={title}
          cards={cards}
          showUpgradeTargets={showUpgradeTargets}
          companionIds={companionIds}
          upgradedCardIds={upgradedCardIds}
          appliedUpgradesByCardId={appliedUpgradesByCardId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
