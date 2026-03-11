import { useCallback, useEffect, useRef, useState } from "react";
import type { Card as CardType, LastResult, PlayerView } from "../../types";
import type { RevealedPlayerTab } from "../../contexts/contextStripState";
import { bestFit, type ZoneDims } from "../../hooks/cardSizeUtils";
import { PlacementBadge } from "./PlacementBadge";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";
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
  activeTab: RevealedPlayerTab;
  onTabChange: (tab: RevealedPlayerTab) => void;
  onClose: () => void;
}

const DEFAULT_CARD_DIMS: ZoneDims = {
  width: 84,
  height: 118,
  rows: 1,
  columns: 1,
};

function getLastResultLabel(
  result: LastResult | null,
  inSuddenDeath: boolean,
): string {
  if (inSuddenDeath) return "Sudden death";
  if (result === "win") return "Win";
  if (result === "draw") return "Draw";
  if (result === "loss") return "Loss";
  return "No result yet";
}

function getPlayerStatus(player: PlayerView): string {
  if (player.is_most_recent_ghost) return "Recent ghost";
  if (player.is_ghost) return "Ghost";
  if (player.is_puppet) return "Puppet";
  if (player.phase === "build" && player.build_ready) {
    return `${player.stage}-${player.round} @ ready`;
  }
  return `${player.stage}-${player.round} @ ${player.phase}`;
}

function countLabel(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}

function OverviewToken({
  title,
  value,
  imageSrc,
  badgeClassName,
}: {
  title: string;
  value: number;
  imageSrc: string;
  badgeClassName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <img
          src={imageSrc}
          alt={title}
          className="h-16 rounded"
          style={{ borderRadius: "var(--card-border-radius)" }}
        />
        <span className={`absolute bottom-0 right-0 rounded-full bg-black/70 px-1.5 py-0.5 text-xs font-bold ${badgeClassName}`}>
          {value}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-[0.12em] text-gray-400">
        {title}
      </span>
    </div>
  );
}

function OverviewInfoTable({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <dl className="overflow-hidden rounded-lg border border-[color:rgba(212,175,55,0.22)] bg-black/10">
      {rows.map((row, index) => (
        <div
          key={row.label}
          className={`grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 px-3 py-2 ${
            index > 0 ? "border-t border-[color:rgba(212,175,55,0.12)]" : ""
          }`}
        >
          <dt className="text-[11px] font-medium text-gray-400">
            {row.label}
          </dt>
          <dd className="min-w-0 text-right text-sm text-amber-50">
            <span className="block truncate">
              {row.value}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function getLikelihoodValue(
  pairingProbability: number | null,
): string | null {
  if (pairingProbability === null) return null;
  return `${Math.round(pairingProbability * 100)}%`;
}

function getOverviewRows({
  player,
  lastResultLabel,
  showPairingChance,
}: {
  player: PlayerView;
  lastResultLabel: string;
  showPairingChance: boolean;
}): { label: string; value: string }[] {
  const rows = [
    { label: "Last result", value: lastResultLabel },
    { label: "Currently at", value: getPlayerStatus(player) },
  ];

  if (showPairingChance) {
    rows.splice(1, 0, {
      label: "Likelihood to battle",
      value: getLikelihoodValue(player.pairing_probability) ?? "-",
    });
  }

  return rows;
}

function SectionHeading({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.14em] text-gray-400">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-gray-500">
          {countLabel(count)}
        </span>
      )}
    </div>
  );
}

function AdaptiveCardSection({
  title,
  cards,
  showUpgradeTargets = false,
  companionIds,
  emptyText,
  guideTarget,
  maxWidth = 108,
  minWidth = 46,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  emptyText: string;
  guideTarget?: string;
  maxWidth?: number;
  minWidth?: number;
}) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_CARD_DIMS);
  const observerRef = useRef<ResizeObserver | null>(null);

  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node) return;

      const measure = () => {
        const width = Math.max(node.clientWidth, 0);
        const height = Math.max(node.clientHeight, 0);
        const next = bestFit(cards.length, width, height, 8, maxWidth, minWidth);
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
    [cards.length, maxWidth, minWidth],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <SectionHeading title={title} count={cards.length} />
      <div className="mb-2 mt-1 border-t gold-divider" />
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 overflow-hidden"
        data-guide-target={guideTarget}
      >
        {cards.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[color:rgba(212,175,55,0.25)] bg-black/10 px-4 text-center text-sm text-gray-500">
            {emptyText}
          </div>
        ) : (
          <div
            className="grid h-full content-start justify-center gap-2"
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
    </section>
  );
}

function DetailTabButton({
  isActive,
  label,
  onClick,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        isActive
          ? "border border-[var(--gold-border)] bg-amber-950/35 text-amber-100 shadow-[inset_0_1px_0_rgba(255,236,181,0.16)]"
          : "border border-transparent bg-black/10 text-gray-400 hover:text-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

export function PlayerDetailPanel({
  player,
  currentPlayer,
  players,
  useUpgrades,
  isMobile,
  activeTab,
  onTabChange,
  onClose,
}: PlayerDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const isViewingSelf = player.name === currentPlayer.name;
  const appliedUpgrades = player.upgrades.filter(
    (upgrade) => upgrade.upgrade_target !== null,
  );
  const pendingUpgrades = currentPlayer.upgrades.filter(
    (upgrade) => upgrade.upgrade_target === null,
  );
  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades;
  const companionIds = new Set(player.command_zone.map((card) => card.id));
  const lastResultLabel = getLastResultLabel(player.last_result, player.in_sudden_death);
  const showPairingChance =
    player.name !== currentPlayer.name && player.pairing_probability !== null;
  const overviewRows = getOverviewRows({
    player,
    lastResultLabel,
    showPairingChance,
  });

  useEffect(() => {
    if (isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobile, onClose]);

  const overviewContent = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-center gap-6">
        <OverviewToken
          title="Poison"
          value={player.poison}
          imageSrc={POISON_COUNTER_IMAGE}
          badgeClassName="text-purple-300"
        />
        <OverviewToken
          title="Treasure"
          value={player.treasures}
          imageSrc={TREASURE_TOKEN_IMAGE}
          badgeClassName="text-amber-300"
        />
      </div>

      <SectionHeading title="Overview" />
      <div className="-mt-1">
        <OverviewInfoTable rows={overviewRows} />
      </div>

      {useUpgrades && allUpgrades.length > 0 && (
        <AdaptiveCardSection
          title="Upgrades"
          cards={allUpgrades}
          showUpgradeTargets
          emptyText="No upgrades applied."
          maxWidth={92}
          minWidth={44}
        />
      )}
    </div>
  );

  const seenContent = (
    <AdaptiveCardSection
      title="Seen in Battle"
      cards={player.most_recently_revealed_cards}
      companionIds={companionIds}
      emptyText="Nothing was revealed in battle yet."
      guideTarget="sidebar-seen-in-battle"
    />
  );

  const shell = (
    <div className="flex h-full flex-col overflow-hidden" data-guide-target="sidebar-revealed-details">
      <div className="border-b gold-divider px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-sm text-gray-400 hover:text-white"
            >
              &larr; Back
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PlacementBadge player={player} players={players} className="shrink-0" />
              <span className="truncate text-base font-medium text-amber-50">
                {player.name}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Opponent scouting
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="inline-flex rounded-full border border-[color:rgba(212,175,55,0.25)] bg-black/15 p-1">
          <DetailTabButton
            isActive={activeTab === "seen"}
            label="Seen in Battle"
            onClick={() => onTabChange("seen")}
          />
          <DetailTabButton
            isActive={activeTab === "overview"}
            label="Overview"
            onClick={() => onTabChange("overview")}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        {activeTab === "overview" ? overviewContent : seenContent}
      </div>
    </div>
  );

  if (isMobile) {
    return <div className="flex-1 min-h-0">{shell}</div>;
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-0 z-30 h-full w-[var(--sidebar-width)] overflow-hidden rounded-lg border gold-border modal-chrome felt-raised-panel"
      style={{
        right: "calc(var(--sidebar-width) + 8px)",
        boxShadow:
          "0 18px 42px rgba(0, 0, 0, 0.58), 0 6px 18px rgba(0, 0, 0, 0.3)",
        transition: "transform 200ms ease-out",
      }}
    >
      {shell}
    </div>
  );
}
