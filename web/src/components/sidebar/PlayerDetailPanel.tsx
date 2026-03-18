import { useCallback, useEffect, useRef, useState } from "react";
import type { Card as CardType, LastResult, PlayerView } from "../../types";
import type { RevealedPlayerTab } from "../../contexts/contextStripState";
import { useContextStrip } from "../../contexts";
import {
  CARD_ASPECT_RATIO,
  bestFit,
  type ZoneDims,
} from "../../hooks/cardSizeUtils";
import { Card } from "../card";
import { UpgradeStack } from "./UpgradeStack";
import {
  POISON_COUNTER_IMAGE,
  TREASURE_TOKEN_IMAGE,
} from "../../constants/assets";
import { getPlayerPhaseStatusLabel } from "../../utils/format";
import { buildAppliedUpgradeMap, getAppliedUpgrades, getUpgradeDisplayScope, getUnappliedUpgrades } from "../../utils/upgrades";

interface PlayerDetailPanelProps {
  player: PlayerView;
  currentPlayer: PlayerView;
  useUpgrades: boolean;
  isMobile: boolean;
  activeTab: RevealedPlayerTab;
  onTabChange: (tab: RevealedPlayerTab) => void;
  onClose: () => void;
  isOpen?: boolean;
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
  return `${player.stage}-${player.round} @ ${getPlayerPhaseStatusLabel(player.phase, player.build_ready)}`;
}

function countLabel(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}

function OverviewToken({
  value,
  imageSrc,
  badgeClassName,
}: {
  value: number;
  imageSrc: string;
  badgeClassName: string;
}) {
  return (
    <div className="relative">
      <img
        src={imageSrc}
        alt=""
        className="h-[72px] block shadow-lg"
        style={{ borderRadius: "var(--card-border-radius)" }}
      />
      <span className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 px-1.5 py-0.5 text-xs font-bold leading-none ${badgeClassName}`}>
        {value}
      </span>
    </div>
  );
}

function OverviewTokenRow({
  poison,
  treasures,
}: {
  poison: number;
  treasures: number;
}) {
  return (
    <div className="flex items-start justify-center gap-5">
      <div className="relative">
        <OverviewToken
          value={poison}
          imageSrc={POISON_COUNTER_IMAGE}
          badgeClassName="text-purple-300"
        />
      </div>
      <div className="relative">
        <OverviewToken
          value={treasures}
          imageSrc={TREASURE_TOKEN_IMAGE}
          badgeClassName="text-amber-300"
        />
      </div>
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
  upgradedCardIds,
  appliedUpgradesByCardId,
  emptyText,
  guideTarget,
  maxWidth = 108,
  minWidth = 46,
  minColumns = 1,
  measureKey,
}: {
  title: string;
  cards: CardType[];
  showUpgradeTargets?: boolean;
  companionIds?: Set<string>;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
  emptyText: string;
  guideTarget?: string;
  maxWidth?: number;
  minWidth?: number;
  minColumns?: number;
  measureKey?: string;
}) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_CARD_DIMS);
  const observerRef = useRef<ResizeObserver | null>(null);
  const measureRef = useRef<(() => void) | null>(null);

  const resolveBestFit = useCallback((
    width: number,
    height: number,
  ) => {
    const next = bestFit(cards.length, width, height, 8, maxWidth, minWidth);

    if (cards.length < minColumns || next.columns >= minColumns) {
      return next;
    }

    const columns = Math.min(cards.length, minColumns);
    const rows = Math.ceil(cards.length / columns);
    const widthByColumns = Math.floor((width - 8 * Math.max(0, columns - 1)) / columns);
    const widthByRows = Math.floor(
      (height - 8 * Math.max(0, rows - 1)) / (rows * CARD_ASPECT_RATIO),
    );
    const forcedWidth = Math.max(
      1,
      Math.floor(Math.min(maxWidth, widthByColumns, widthByRows)),
    );

    return {
      width: forcedWidth,
      height: Math.round(forcedWidth * CARD_ASPECT_RATIO),
      rows,
      columns,
    };
  }, [cards.length, maxWidth, minColumns, minWidth]);

  const bodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      measureRef.current = null;

      if (!node) return;

      const measure = () => {
        const width = Math.max(node.clientWidth, 0);
        const height = Math.max(node.clientHeight, 0);
        const next = resolveBestFit(width, height);
        setDims((prev) =>
          prev.width === next.width &&
          prev.height === next.height &&
          prev.rows === next.rows &&
          prev.columns === next.columns
            ? prev
            : next,
        );
      };
      measureRef.current = measure;

      measure();

      const observer = new ResizeObserver(() => {
        measure();
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [resolveBestFit],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    let frameOne = 0;
    let frameTwo = 0;

    frameOne = requestAnimationFrame(() => {
      measureRef.current?.();
      frameTwo = requestAnimationFrame(() => {
        measureRef.current?.();
      });
    });

    return () => {
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
    };
  }, [measureKey, resolveBestFit]);

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
                  upgraded={upgradedCardIds?.has(card.id)}
                  appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
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
  useUpgrades,
  isMobile,
  activeTab,
  onTabChange,
  onClose,
  isOpen = true,
}: PlayerDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { state } = useContextStrip();
  const [renderOpen, setRenderOpen] = useState(false);

  const isViewingSelf = player.name === currentPlayer.name;
  const upgradeDisplayScope = getUpgradeDisplayScope(isViewingSelf, currentPlayer.phase);
  const appliedUpgrades = getAppliedUpgrades(player.upgrades);
  const pendingUpgrades = getUnappliedUpgrades(currentPlayer.upgrades);
  const allUpgrades = isViewingSelf
    ? [...appliedUpgrades, ...pendingUpgrades]
    : appliedUpgrades;
  const { upgradedCardIds, appliedUpgradesByCardId } = buildAppliedUpgradeMap(
    player.upgrades,
    upgradeDisplayScope,
  );
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
    if (isMobile || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const panel = panelRef.current;
      if (!panel || !target) return;
      if (target.closest("[data-card-preview-modal='true']")) return;
      if (panel.contains(target)) return;
      const sidebarRoot = panel.closest("[data-guide-target='sidebar-panel']");
      if (sidebarRoot instanceof HTMLElement && sidebarRoot.contains(target)) return;
      onClose();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.previewCard === null) onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobile, isOpen, onClose, state.previewCard]);

  useEffect(() => {
    if (isMobile) return;

    const frame = requestAnimationFrame(() => {
      setRenderOpen(isOpen);
    });

    return () => cancelAnimationFrame(frame);
  }, [isMobile, isOpen]);

  const overviewContent = (
    <div className="flex h-full flex-col gap-3">
      <OverviewTokenRow poison={player.poison} treasures={player.treasures} />

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
      upgradedCardIds={upgradedCardIds}
      appliedUpgradesByCardId={appliedUpgradesByCardId}
      emptyText="Nothing was revealed in battle yet."
      guideTarget="sidebar-seen-in-battle"
      maxWidth={104}
      minColumns={isMobile ? 1 : 2}
      measureKey={`${player.name}:${activeTab}:${isOpen ? "open" : "closed"}`}
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
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-medium text-amber-50">
              <span className="text-gray-300">scouting </span>
              <span className="text-[var(--color-gold)]">{player.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center px-4 pb-3 pt-3">
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
      data-guide-target="sidebar-detail-drawer"
      aria-hidden={!isOpen}
      className={`absolute inset-y-0 z-[30] overflow-hidden border-l-2 border-r-0 border-t-0 border-b-0 border-[var(--gold-border-opaque)] frame-chrome ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      style={{
        right: "calc(100% - 8px)",
        width: "var(--sidebar-width)",
        boxShadow: "-14px 0 22px -12px rgba(0, 0, 0, 0.42)",
        transform: renderOpen ? "translateX(0)" : "translateX(calc(100% - 8px))",
        transition: "transform 220ms ease-out",
      }}
    >
      {shell}
    </div>
  );
}
