import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { getGameCards } from "../api/client";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { CardPreviewModal } from "./card/CardPreviewModal";
import type { Card } from "../types";
import { unknownToAppError } from "../utils/appError";
import { TEXT_INPUT } from "./common/styles";
import { ManaSymbol } from "./icons/ManaSymbol";

const COLOR_CHIPS = [
  { code: "W", label: "White" },
  { code: "U", label: "Blue" },
  { code: "B", label: "Black" },
  { code: "R", label: "Red" },
  { code: "G", label: "Green" },
  { code: "C", label: "Colorless" },
] as const;

const COLOR_ORDER = ["W", "U", "B", "R", "G"];
const INPUT_CLASS = `${TEXT_INPUT} placeholder-[var(--ivory-faint)]`;

interface CardFilters {
  nameLower: string;
  typeLower: string;
  textLower: string;
  selectedColors: Set<string>;
}

function colorSortKey(colors: string[]): number {
  if (colors.length === 0) return 100;
  const minIndex = Math.min(
    ...colors.map((c) => COLOR_ORDER.indexOf(c)).filter((i) => i >= 0),
  );
  return colors.length * 10 + (minIndex >= 0 ? minIndex : 9);
}

function matchesCardColors(
  cardColors: string[],
  selectedColors: Set<string>,
): boolean {
  if (selectedColors.size === 0) return true;
  if (selectedColors.has("C")) return cardColors.length === 0;
  for (const color of selectedColors) {
    if (!cardColors.includes(color)) return false;
  }
  return true;
}

function matchesCardFilters(card: Card, filters: CardFilters): boolean {
  if (
    filters.nameLower &&
    !card.name.toLowerCase().includes(filters.nameLower)
  ) {
    return false;
  }
  if (
    filters.typeLower &&
    !card.type_line.toLowerCase().includes(filters.typeLower)
  ) {
    return false;
  }
  if (
    filters.textLower &&
    !(card.oracle_text?.toLowerCase().includes(filters.textLower) ?? false)
  ) {
    return false;
  }
  return matchesCardColors(card.colors, filters.selectedColors);
}

function compareCards(a: Card, b: Card): number {
  const colorA = colorSortKey(a.colors);
  const colorB = colorSortKey(b.colors);
  if (colorA !== colorB) return colorA - colorB;
  if (a.cmc !== b.cmc) return a.cmc - b.cmc;
  return a.name.localeCompare(b.name);
}

function mergeSortedCards(left: Card[], right: Card[]): Card[] {
  const merged: Card[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compareCards(left[i], right[j]) <= 0) {
      merged.push(left[i]);
      i += 1;
    } else {
      merged.push(right[j]);
      j += 1;
    }
  }
  return [...merged, ...left.slice(i), ...right.slice(j)];
}

function sortCards(cards: readonly Card[]): Card[] {
  if (cards.length <= 1) return [...cards];
  const mid = Math.floor(cards.length / 2);
  return mergeSortedCards(
    sortCards(cards.slice(0, mid)),
    sortCards(cards.slice(mid)),
  );
}

function selectGameCards(
  data: { cards: Card[]; upgrades: Card[] } | null | undefined,
  which: "cards" | "upgrades",
): Card[] {
  if (!data) return [];
  return which === "cards" ? data.cards : data.upgrades;
}

function toggleColorSelection(prev: Set<string>, code: string): Set<string> {
  if (code === "C") return prev.has("C") ? new Set() : new Set(["C"]);
  const next = new Set(prev);
  next.delete("C");
  if (next.has(code)) next.delete(code);
  else next.add(code);
  return next;
}

function CardsGrid({
  cards,
  onSelectCard,
}: {
  cards: Card[];
  onSelectCard: (card: Card) => void;
}): ReactNode {
  if (cards.length === 0) {
    return (
      <div className="text-[var(--ivory-muted)] text-center py-8">
        No cards match
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
          onClick={() => onSelectCard(card)}
        >
          <img
            src={card.image_url}
            alt={card.name}
            title={card.name}
            className="block w-full hover:brightness-125 transition-all"
            style={{ borderRadius: "var(--card-border-radius)" }}
          />
        </button>
      ))}
    </div>
  );
}

function colorChipStateClass(
  selectedColors: Set<string>,
  code: string,
): string {
  if (selectedColors.size === 0) return "";
  return selectedColors.has(code) ? "is-on" : "is-off";
}

function CardsFilterBar({
  searchName,
  searchType,
  searchText,
  selectedColors,
  shownCount,
  totalCount,
  onSearchNameChange,
  onSearchTypeChange,
  onSearchTextChange,
  onToggleColor,
}: {
  searchName: string;
  searchType: string;
  searchText: string;
  selectedColors: Set<string>;
  shownCount: number;
  totalCount: number;
  onSearchNameChange: (value: string) => void;
  onSearchTypeChange: (value: string) => void;
  onSearchTextChange: (value: string) => void;
  onToggleColor: (code: string) => void;
}): ReactNode {
  return (
    <div className="cards-view-filters shrink-0 flex flex-col gap-2 pb-3">
      <div className="cards-view-fields grid grid-cols-3 gap-2">
        <input
          type="text"
          value={searchName}
          onChange={(e) => onSearchNameChange(e.target.value)}
          placeholder="Name..."
          className={INPUT_CLASS}
        />
        <input
          type="text"
          value={searchType}
          onChange={(e) => onSearchTypeChange(e.target.value)}
          placeholder="Type..."
          className={INPUT_CLASS}
        />
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder="Text..."
          className={INPUT_CLASS}
        />
      </div>

      <div className="cards-view-colors flex items-center gap-1.5 flex-wrap">
        {COLOR_CHIPS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            aria-label={label}
            aria-pressed={selectedColors.has(code)}
            onClick={() => onToggleColor(code)}
            className={`mana-filter-btn ${colorChipStateClass(selectedColors, code)}`}
          >
            <ManaSymbol symbol={code} size="md" />
          </button>
        ))}
      </div>

      <div className="text-xs text-[var(--ivory-muted)]">
        {shownCount === totalCount
          ? `${totalCount} cards`
          : `${shownCount} of ${totalCount} cards`}
      </div>
    </div>
  );
}

export function CardsView({
  gameId,
  which,
  playerName,
}: {
  gameId: string;
  which: "cards" | "upgrades";
  playerName?: string;
}): ReactNode {
  const {
    data,
    loading,
    error: loadError,
  } = useAsyncResource(
    () => getGameCards(gameId, playerName),
    [gameId, playerName],
  );
  const error = loadError
    ? unknownToAppError(loadError, "default", "Failed to load cards").message
    : null;
  const [searchName, setSearchName] = useState("");
  const [searchType, setSearchType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [previewCard, setPreviewCard] = useState<Card | null>(null);

  if (loading) {
    return (
      <div className="cards-view-list flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cards-view-list text-red-400 text-center py-8">
        {error}
      </div>
    );
  }

  const allCards = selectGameCards(data, which);
  const filters: CardFilters = {
    nameLower: searchName.toLowerCase(),
    typeLower: searchType.toLowerCase(),
    textLower: searchText.toLowerCase(),
    selectedColors,
  };
  const sorted = sortCards(
    allCards.filter((card) => matchesCardFilters(card, filters)),
  );

  return (
    <div className="cards-view flex flex-col min-h-0 flex-1">
      {which === "cards" && (
        <CardsFilterBar
          searchName={searchName}
          searchType={searchType}
          searchText={searchText}
          selectedColors={selectedColors}
          shownCount={sorted.length}
          totalCount={allCards.length}
          onSearchNameChange={setSearchName}
          onSearchTypeChange={setSearchType}
          onSearchTextChange={setSearchText}
          onToggleColor={(code) =>
            setSelectedColors((prev) => toggleColorSelection(prev, code))
          }
        />
      )}

      <div className="cards-view-list flex-1 overflow-y-auto min-h-0 pb-3">
        <CardsGrid cards={sorted} onSelectCard={setPreviewCard} />
      </div>

      {/* Out of the Guide's container, which older Safari would fit the preview to instead of the screen. */}
      {previewCard &&
        createPortal(
          <CardPreviewModal
            card={previewCard}
            appliedUpgrades={[]}
            onClose={() => setPreviewCard(null)}
          />,
          document.body,
        )}
    </div>
  );
}
