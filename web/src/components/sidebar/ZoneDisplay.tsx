import { useCallback, useEffect, useRef, useState } from "react";
import { bestFit, type ZoneDims } from "../../hooks/cardSizeUtils";
import type { Card as CardType } from "../../types";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";

interface ZoneDisplayProps {
  title: string;
  cards: CardType[];
  maxThumbnails?: number;
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
}

const DEFAULT_MODAL_DIMS: ZoneDims = {
  width: 80,
  height: 112,
  rows: 1,
  columns: 1,
};

function ZoneModal({
  title,
  cards,
  showUpgradeTargets,
  companionIds,
  onClose,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  onClose: () => void;
}) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_MODAL_DIMS);
  const observerRef = useRef<ResizeObserver | null>(null);

  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      const measure = () => {
        const cs = getComputedStyle(node);
        const width =
          node.clientWidth -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight);
        const height =
          node.clientHeight -
          parseFloat(cs.paddingTop) -
          parseFloat(cs.paddingBottom);

        const next = bestFit(
          cards.length,
          Math.max(width, 0),
          Math.max(height, 0),
          8,
          220,
          64,
        );

        setDims((prev) =>
          prev.width === next.width &&
          prev.height === next.height &&
          prev.rows === next.rows &&
          prev.columns === next.columns
            ? prev
            : next,
        );
      };

      measure();

      const observer = new ResizeObserver(() => {
        measure();
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [cards.length],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="modal-chrome border gold-border rounded-lg w-full max-w-6xl h-[85vh] max-h-[860px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 border-b gold-divider flex justify-between items-center shrink-0">
          <h3 className="text-white font-medium">
            {title} ({cards.length})
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div ref={bodyRef} className="flex-1 min-h-0 p-3 overflow-auto">
          {cards.length === 0 ? (
            <div className="text-gray-500 text-center py-4">No cards</div>
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
}: ZoneDisplayProps) {
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
        <div className="text-[10px] text-gray-400 uppercase mb-1">{title}</div>
        {cards.length === 0 ? (
          <span className="text-gray-500 text-xs">No Cards Seen</span>
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
                  />
                ),
              )}
            </div>
            {remainingCount > 0 && (
              <div className="text-[10px] text-gray-400">
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
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
