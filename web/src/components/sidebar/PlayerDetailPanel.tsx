import { useEffect, useRef, useState } from "react";
import type { PlayerView, Card as CardType } from "../../types";
import { PlacementBadge } from "./PlacementBadge";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";
import { ZoneModal } from "./ZoneDisplay";
import {
  POISON_COUNTER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../../constants/assets";

interface PlayerDetailPanelProps {
  player: PlayerView;
  currentPlayer: PlayerView;
  players: PlayerView[];
  useUpgrades: boolean;
  isMobile: boolean;
  onClose: () => void;
}

const DETAIL_CARD_DIMS = { width: 108, height: 151 };

function DetailSection({
  title,
  cards,
  showUpgradeTargets,
  companionIds,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 uppercase">{title}</span>
          {cards.length > 4 && (
            <button
              onClick={() => setShowModal(true)}
              className="text-[10px] text-amber-400/80 hover:text-amber-300"
            >
              View all ({cards.length})
            </button>
          )}
        </div>
        <div className="border-t gold-divider mb-2" />
        {cards.length === 0 ? (
          <span className="text-gray-500 text-xs">No Cards Seen</span>
        ) : (
          <div
            className="grid gap-1.5 justify-center"
            style={{
              gridTemplateColumns: `repeat(2, ${DETAIL_CARD_DIMS.width}px)`,
            }}
          >
            {cards.map((card) =>
              showUpgradeTargets ? (
                <UpgradeStack
                  key={card.id}
                  upgrade={card}
                  dimensions={DETAIL_CARD_DIMS}
                />
              ) : (
                <Card
                  key={card.id}
                  card={card}
                  dimensions={DETAIL_CARD_DIMS}
                  isCompanion={companionIds?.has(card.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
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

export function PlayerDetailPanel({
  player,
  currentPlayer,
  players,
  useUpgrades,
  isMobile,
  onClose,
}: PlayerDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const isViewingSelf = player.name === currentPlayer.name;
  const appliedUpgrades = player.upgrades.filter(
    (u) => u.upgrade_target !== null,
  );
  const pendingUpgrades = currentPlayer.upgrades.filter(
    (u) => u.upgrade_target === null,
  );
  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades;
  const companionIds = new Set(player.command_zone.map((c) => c.id));

  useEffect(() => {
    if (isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobile, onClose]);

  const content = (
    <div className="p-4 space-y-3" data-guide-target="sidebar-revealed-details">
      <div className="relative flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm shrink-0"
          >
            &larr; Back
          </button>
        )}
        <div className="relative">
          <PlacementBadge player={player} players={players} />
          <span className="text-amber-50 font-medium">{player.name}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <div className="relative">
          <img
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="h-16 rounded"
            style={{ borderRadius: "var(--card-border-radius)" }}
          />
          <span className="absolute bottom-0 right-0 bg-black/70 text-purple-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {player.poison}
          </span>
        </div>
        <div className="relative">
          <img
            src={TREASURE_TOKEN_IMAGE}
            alt="Treasure"
            className="h-16 rounded"
            style={{ borderRadius: "var(--card-border-radius)" }}
          />
          <span className="absolute bottom-0 right-0 bg-black/70 text-amber-400 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {player.treasures}
          </span>
        </div>
      </div>

      {useUpgrades && allUpgrades.length > 0 && (
        <DetailSection
          title="Upgrades"
          cards={allUpgrades}
          showUpgradeTargets
        />
      )}

      {player.most_recently_revealed_cards.length > 0 && (
        <DetailSection
          title="Seen in Battle"
          cards={player.most_recently_revealed_cards}
          companionIds={companionIds}
        />
      )}

      {!useUpgrades &&
        player.most_recently_revealed_cards.length === 0 &&
        allUpgrades.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-2">
            No details available
          </div>
        )}
    </div>
  );

  if (isMobile) {
    return <div className="overflow-auto flex-1 pt-3">{content}</div>;
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-0 z-30 w-[var(--sidebar-width)] modal-chrome felt-raised-panel gold-border border rounded-lg overflow-auto max-h-full"
      style={{
        right: "var(--sidebar-width)",
        boxShadow:
          "0 18px 42px rgba(0, 0, 0, 0.58), 0 6px 18px rgba(0, 0, 0, 0.3)",
        transition: "transform 200ms ease-out",
      }}
    >
      {content}
    </div>
  );
}
