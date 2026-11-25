import { type ReactNode, useRef, useState } from "react";
import type { Card as CardType, ZoneName, CardStateAction } from "../types";
import type { ZoneOwner } from "../dnd/types";
import { useLayoutMeasure } from "../hooks/useDomEffects";
import { useOpenSubmenus } from "../hooks/useOpenSubmenus";
import { MenuPrompt } from "./common/MenuPrompt";
import type { BattleSelectedCard } from "../pages/phases/Battle";
import {
  canUseBattleFaceDownAction,
  canUseBattleFlipAction,
} from "../utils/battleInteraction";
import { POPOVER_CHROME } from "./common/styles";

export interface ActionMenuMove {
  cardId: string;
  fromZone: ZoneName;
  toZone: ZoneName;
  fromOwner: ZoneOwner;
  toOwner: ZoneOwner;
}

interface ActionMenuZoneSlice {
  battlefield: CardType[];
  library: CardType[];
  tapped_card_ids: string[];
  face_down_card_ids: string[];
  counters: Record<string, Record<string, number>>;
  attachments: Record<string, string[]>;
}

interface ActionMenuBattle {
  your_zones: ActionMenuZoneSlice;
  opponent_zones: ActionMenuZoneSlice;
  current_turn_name: string | null;
  can_manipulate_opponent: boolean;
}

interface ActionMenuProps {
  selectedCard: BattleSelectedCard | null;
  battle: ActionMenuBattle;
  playerName: string;
  sideboardCount: number;
  opponentSideboardCount: number;
  onAction: (
    action: CardStateAction,
    cardId: string,
    data?: Record<string, unknown>,
  ) => void;
  onMove: (move: ActionMenuMove) => void;
  onUntapAll: () => void;
  onUntapOpponentAll: () => void;
  onShowSideboard: () => void;
  onShowOpponentSideboard: () => void;
  onCreateTreasure: () => void;
  onDrawLibrary: () => void;
  onShuffleLibrary: () => void;
  onDrawOpponentLibrary: () => void;
  onShuffleOpponentLibrary: () => void;
  onPassTurn: () => void;
  onRollDie: (sides: number) => void;
  onClose: () => void;
}

type SubmenuType =
  | "addCounter"
  | "removeCounter"
  | "spawnToken"
  | "attachTo"
  | "moveTo"
  | "rollDie";

const COUNTER_TYPES = ["+1/+1", "-1/-1", "Loyalty", "Charge"];
const DIE_SIDES = [2, 4, 6, 8, 10, 12, 20];
const MOVE_DESTINATIONS: { zone: ZoneName; label: string }[] = [
  { zone: "hand", label: "Hand" },
  { zone: "battlefield", label: "Battlefield" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "library", label: "Library" },
];

type CardActionHandler = (
  action: CardStateAction,
  data?: Record<string, unknown>,
) => void;

interface SelectedCardState {
  card: CardType;
  zone: ZoneName;
  owner: ZoneOwner;
  onBattlefield: boolean;
  isFaceDown: boolean;
  isScrubbed: boolean;
  isTapped: boolean;
  hasFlip: boolean;
  canFaceDown: boolean;
  canFlip: boolean;
  hasTokens: boolean;
  counters: Record<string, number>;
  isAttached: boolean;
  attachableCards: CardType[];
}

function deriveSelectedCardState(
  selectedCard: BattleSelectedCard,
  battle: ActionMenuBattle,
): SelectedCardState {
  const { card, zone, owner } = selectedCard;
  const ownerZones =
    owner === "player" ? battle.your_zones : battle.opponent_zones;
  const onBattlefield = zone === "battlefield";
  const isFaceDown = ownerZones.face_down_card_ids.includes(card.id);
  const counters = ownerZones.counters[card.id] ?? {};
  const attachments = ownerZones.attachments;

  return {
    card,
    zone,
    owner,
    onBattlefield,
    isFaceDown,
    isScrubbed: !card.name,
    isTapped: ownerZones.tapped_card_ids.includes(card.id),
    hasFlip: Boolean(card.flip_image_url),
    canFaceDown: canUseBattleFaceDownAction(
      owner,
      battle.can_manipulate_opponent,
    ),
    canFlip: canUseBattleFlipAction(
      owner,
      isFaceDown,
      battle.can_manipulate_opponent,
    ),
    hasTokens: card.tokens.length > 0,
    counters,
    isAttached: Object.values(attachments).some((children) =>
      children.includes(card.id),
    ),
    attachableCards: onBattlefield
      ? ownerZones.battlefield.filter((c) => c.id !== card.id)
      : [],
  };
}

function MoveToSubmenu({
  currentZone,
  open,
  onToggle,
  onMove,
}: {
  currentZone: ZoneName;
  open: boolean;
  onToggle: () => void;
  onMove: (toZone: ZoneName) => void;
}): ReactNode {
  return (
    <>
      <MenuItem label="Move To" hasSubmenu open={open} onClick={onToggle} />
      {open && (
        <Submenu>
          {MOVE_DESTINATIONS.filter(({ zone }) => zone !== currentZone).map(
            ({ zone, label }) => (
              <MenuItem key={zone} label={label} onClick={() => onMove(zone)} />
            ),
          )}
        </Submenu>
      )}
    </>
  );
}

function CounterSubmenus({
  counters,
  isOpen,
  toggle,
  onAction,
}: {
  counters: Record<string, number>;
  isOpen: (submenu: SubmenuType) => boolean;
  toggle: (submenu: SubmenuType) => void;
  onAction: CardActionHandler;
}): ReactNode {
  const [namingCounter, setNamingCounter] = useState(false);
  const counterEntries = Object.entries(counters);

  return (
    <>
      <MenuItem
        label="Add Counter"
        hasSubmenu
        open={isOpen("addCounter")}
        guideTarget="battle-action-add-counter"
        onClick={() => toggle("addCounter")}
      />
      {isOpen("addCounter") && (
        <Submenu>
          {COUNTER_TYPES.map((type) => (
            <MenuItem
              key={type}
              label={type}
              onClick={() =>
                onAction("counter", { counter_type: type, delta: 1 })
              }
            />
          ))}
          {namingCounter ? (
            <MenuPrompt
              label="Counter name"
              placeholder="Name"
              action="Add"
              onSubmit={(name) =>
                onAction("counter", { counter_type: name, delta: 1 })
              }
              onCancel={() => setNamingCounter(false)}
            />
          ) : (
            <MenuItem
              label="Custom..."
              onClick={() => setNamingCounter(true)}
            />
          )}
        </Submenu>
      )}

      {counterEntries.length > 0 && (
        <>
          <MenuItem
            label="Remove Counter"
            hasSubmenu
            open={isOpen("removeCounter")}
            onClick={() => toggle("removeCounter")}
          />
          {isOpen("removeCounter") && (
            <Submenu>
              {counterEntries.map(([type, count]) => (
                <MenuItem
                  key={type}
                  label={`${type} (${count})`}
                  onClick={() =>
                    onAction("counter", { counter_type: type, delta: -1 })
                  }
                />
              ))}
            </Submenu>
          )}
        </>
      )}
    </>
  );
}

function TokenAndAttachmentItems({
  state,
  isOpen,
  toggle,
  onAction,
}: {
  state: SelectedCardState;
  isOpen: (submenu: SubmenuType) => boolean;
  toggle: (submenu: SubmenuType) => void;
  onAction: CardActionHandler;
}): ReactNode {
  return (
    <>
      {state.hasTokens && state.onBattlefield && (
        <>
          <MenuItem
            label="Spawn Token"
            hasSubmenu
            open={isOpen("spawnToken")}
            onClick={() => toggle("spawnToken")}
          />
          {isOpen("spawnToken") && (
            <Submenu>
              {state.card.tokens.map((token) => (
                <MenuItem
                  key={token.id}
                  label={token.name}
                  onClick={() =>
                    onAction("spawn", {
                      token: {
                        name: token.name,
                        image_url: token.image_url,
                        type_line: token.type_line,
                      },
                      for_opponent: state.owner === "opponent",
                    })
                  }
                />
              ))}
            </Submenu>
          )}
        </>
      )}

      {!state.isScrubbed && (
        <MenuItem
          label="Make Copy Token"
          onClick={() => onAction("copy_token")}
        />
      )}

      {state.onBattlefield && state.attachableCards.length > 0 && (
        <>
          <MenuItem
            label="Attach To"
            hasSubmenu
            open={isOpen("attachTo")}
            onClick={() => toggle("attachTo")}
          />
          {isOpen("attachTo") && (
            <Submenu maxHeight={200}>
              {state.attachableCards.map((target) => (
                <MenuItem
                  key={target.id}
                  label={target.name}
                  onClick={() => onAction("attach", { parent_id: target.id })}
                />
              ))}
            </Submenu>
          )}
        </>
      )}

      {state.isAttached && (
        <MenuItem label="Detach" onClick={() => onAction("detach")} />
      )}
    </>
  );
}

function SelectedCardSection({
  selectedCard,
  battle,
  isOpen,
  toggle,
  onAction,
  onMove,
}: {
  selectedCard: BattleSelectedCard;
  battle: ActionMenuBattle;
  isOpen: (submenu: SubmenuType) => boolean;
  toggle: (submenu: SubmenuType) => void;
  onAction: CardActionHandler;
  onMove: (toZone: ZoneName) => void;
}): ReactNode {
  const state = deriveSelectedCardState(selectedCard, battle);

  return (
    <>
      <div className="px-3 py-1.5 text-xs text-[var(--ivory-muted)] border-b gold-divider truncate">
        {state.card.name}
      </div>

      {state.onBattlefield && (
        <MenuItem
          label={state.isTapped ? "Untap" : "Tap"}
          onClick={() => onAction(state.isTapped ? "untap" : "tap")}
        />
      )}

      {state.hasFlip && !state.isScrubbed && state.canFlip && (
        <MenuItem label="Flip" onClick={() => onAction("flip")} />
      )}

      {!state.isScrubbed && state.canFaceDown && (
        <MenuItem
          label={state.isFaceDown ? "Turn Face Up" : "Turn Face Down"}
          onClick={() => onAction("face_down")}
        />
      )}

      <MenuDivider />

      <MoveToSubmenu
        currentZone={state.zone}
        open={isOpen("moveTo")}
        onToggle={() => toggle("moveTo")}
        onMove={onMove}
      />

      {state.onBattlefield && (
        <CounterSubmenus
          counters={state.counters}
          isOpen={isOpen}
          toggle={toggle}
          onAction={onAction}
        />
      )}

      <TokenAndAttachmentItems
        state={state}
        isOpen={isOpen}
        toggle={toggle}
        onAction={onAction}
      />

      <MenuDivider />
    </>
  );
}

function RollDieSubmenu({
  open,
  onToggle,
  onRollDie,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onRollDie: (sides: number) => void;
  onClose: () => void;
}): ReactNode {
  const [sizingDie, setSizingDie] = useState(false);

  return (
    <>
      <MenuItem label="Roll a Die" hasSubmenu open={open} onClick={onToggle} />
      {open && (
        <Submenu>
          <div className="menu-submenu-grid grid grid-cols-4 pr-3">
            {DIE_SIDES.map((sides) => (
              <DieButton
                key={sides}
                label={`d${sides}`}
                onClick={() => {
                  onRollDie(sides);
                  onClose();
                }}
              />
            ))}
            <DieButton label="Custom…" onClick={() => setSizingDie(true)} />
          </div>
          {sizingDie && (
            <MenuPrompt
              label="Number of sides"
              placeholder="Sides"
              action="Roll"
              numeric
              onSubmit={(sides) => {
                onRollDie(parseInt(sides, 10));
                onClose();
              }}
              onCancel={() => setSizingDie(false)}
            />
          )}
        </Submenu>
      )}
    </>
  );
}

function GeneralBattleActions({
  sideboardCount,
  opponentSideboardCount,
  yourLibraryCount,
  opponentLibraryCount,
  canManipulateOpponent,
  canPassTurn,
  onGeneralAction,
  onUntapAll,
  onUntapOpponentAll,
  onShowSideboard,
  onShowOpponentSideboard,
  onCreateTreasure,
  onDrawLibrary,
  onShuffleLibrary,
  onDrawOpponentLibrary,
  onShuffleOpponentLibrary,
  onPassTurn,
}: {
  sideboardCount: number;
  opponentSideboardCount: number;
  yourLibraryCount: number;
  opponentLibraryCount: number;
  canManipulateOpponent: boolean;
  canPassTurn: boolean;
  onGeneralAction: (fn: () => void) => void;
  onUntapAll: () => void;
  onUntapOpponentAll: () => void;
  onShowSideboard: () => void;
  onShowOpponentSideboard: () => void;
  onCreateTreasure: () => void;
  onDrawLibrary: () => void;
  onShuffleLibrary: () => void;
  onDrawOpponentLibrary: () => void;
  onShuffleOpponentLibrary: () => void;
  onPassTurn: () => void;
}): ReactNode {
  return (
    <>
      <MenuItem
        label="Untap Your Permanents"
        onClick={() => onGeneralAction(onUntapAll)}
      />
      <MenuItem
        label="Untap Opponent's Permanents"
        onClick={() => onGeneralAction(onUntapOpponentAll)}
      />

      {sideboardCount > 0 && (
        <MenuItem
          label={`View Your Sideboard (${sideboardCount})`}
          onClick={() => onGeneralAction(onShowSideboard)}
        />
      )}
      {opponentSideboardCount > 0 && (
        <MenuItem
          label={`View Opp. Sideboard (${opponentSideboardCount})`}
          onClick={() => onGeneralAction(onShowOpponentSideboard)}
        />
      )}
      {yourLibraryCount > 0 && (
        <>
          <MenuItem
            label={`Draw from Library (${yourLibraryCount})`}
            onClick={() => onGeneralAction(onDrawLibrary)}
          />
          <MenuItem
            label={`Shuffle Library (${yourLibraryCount})`}
            onClick={() => onGeneralAction(onShuffleLibrary)}
          />
        </>
      )}
      {canManipulateOpponent && opponentLibraryCount > 0 && (
        <>
          <MenuItem
            label={`Draw Opp. Library (${opponentLibraryCount})`}
            onClick={() => onGeneralAction(onDrawOpponentLibrary)}
          />
          <MenuItem
            label={`Shuffle Opp. Library (${opponentLibraryCount})`}
            onClick={() => onGeneralAction(onShuffleOpponentLibrary)}
          />
        </>
      )}

      <MenuDivider />

      <MenuItem
        label="Create Treasure"
        onClick={() => onGeneralAction(onCreateTreasure)}
      />
      <MenuItem
        label="Pass Turn"
        onClick={() => onGeneralAction(onPassTurn)}
        disabled={!canPassTurn}
      />
    </>
  );
}

export function ActionMenu({
  selectedCard,
  battle,
  playerName,
  sideboardCount,
  opponentSideboardCount,
  onAction,
  onMove,
  onUntapAll,
  onUntapOpponentAll,
  onShowSideboard,
  onShowOpponentSideboard,
  onCreateTreasure,
  onDrawLibrary,
  onShuffleLibrary,
  onDrawOpponentLibrary,
  onShuffleOpponentLibrary,
  onPassTurn,
  onRollDie,
  onClose,
}: ActionMenuProps): ReactNode {
  const { isOpen, toggle } = useOpenSubmenus<SubmenuType>();
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu sits on the Actions button and grows upward, so a submenu would move every row above the one clicked.
  // Keeping the size it opened with makes a submenu push the rows below it down, inside the menu's scroll.
  useLayoutMeasure(menuRef, (node) => {
    node.style.height = `${node.getBoundingClientRect().height}px`;
  });

  // A puppet can't press Pass, so the player facing it passes for it, as the sidebar and P already do.
  const canPassTurn =
    battle.current_turn_name === playerName || battle.can_manipulate_opponent;

  const handleAction: CardActionHandler = (action, data) => {
    if (!selectedCard) return;
    onAction(action, selectedCard.card.id, data);
    onClose();
  };

  const handleMove = (toZone: ZoneName): void => {
    if (!selectedCard) return;
    onMove({
      cardId: selectedCard.card.id,
      fromZone: selectedCard.zone,
      toZone,
      fromOwner: selectedCard.owner,
      toOwner: selectedCard.owner,
    });
    onClose();
  };

  const handleGeneralAction = (fn: () => void): void => {
    fn();
    onClose();
  };

  return (
    <>
      {/* Stops at the bars, so a bar button takes the first click instead of only closing the menu. */}
      <button
        type="button"
        aria-label="Close actions menu"
        className="fixed inset-x-0 top-[var(--frame-bar-height)] bottom-[var(--frame-bar-height)] z-[86] cursor-default border-0 bg-transparent p-0"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className={`fixed bottom-16 left-[calc(var(--bar-inline)+0.5rem)] ${POPOVER_CHROME} py-1 w-[280px] max-h-[70vh] overflow-auto z-[87]`}
      >
        {selectedCard && (
          <SelectedCardSection
            selectedCard={selectedCard}
            battle={battle}
            isOpen={isOpen}
            toggle={toggle}
            onAction={handleAction}
            onMove={handleMove}
          />
        )}

        <RollDieSubmenu
          open={isOpen("rollDie")}
          onToggle={() => toggle("rollDie")}
          onRollDie={onRollDie}
          onClose={onClose}
        />

        <MenuDivider />

        <GeneralBattleActions
          sideboardCount={sideboardCount}
          opponentSideboardCount={opponentSideboardCount}
          yourLibraryCount={battle.your_zones.library.length}
          opponentLibraryCount={battle.opponent_zones.library.length}
          canManipulateOpponent={battle.can_manipulate_opponent}
          canPassTurn={canPassTurn}
          onGeneralAction={handleGeneralAction}
          onUntapAll={onUntapAll}
          onUntapOpponentAll={onUntapOpponentAll}
          onShowSideboard={onShowSideboard}
          onShowOpponentSideboard={onShowOpponentSideboard}
          onCreateTreasure={onCreateTreasure}
          onDrawLibrary={onDrawLibrary}
          onShuffleLibrary={onShuffleLibrary}
          onDrawOpponentLibrary={onDrawOpponentLibrary}
          onShuffleOpponentLibrary={onShuffleOpponentLibrary}
          onPassTurn={onPassTurn}
        />
      </div>
    </>
  );
}

function MenuItem({
  label,
  onClick,
  hasSubmenu,
  open,
  disabled,
  guideTarget,
}: {
  label: string;
  onClick: () => void;
  hasSubmenu?: boolean;
  open?: boolean;
  disabled?: boolean;
  guideTarget?: string;
}): ReactNode {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
        menu-item ${disabled ? "text-[var(--ivory-faint)] cursor-not-allowed" : "text-white"}
      `}
      data-guide-target={guideTarget}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-expanded={hasSubmenu ? open : undefined}
    >
      <span>{label}</span>
      {hasSubmenu && <span className="text-[var(--ivory-muted)]">›</span>}
    </button>
  );
}

function DieButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      className="menu-item rounded py-1.5 text-sm text-center text-white whitespace-nowrap"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MenuDivider(): ReactNode {
  return <div className="border-t gold-divider my-1" />;
}

function Submenu({
  children,
  maxHeight,
}: {
  children: ReactNode;
  maxHeight?: number;
}): ReactNode {
  return (
    <div
      className="menu-submenu"
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      {children}
    </div>
  );
}
