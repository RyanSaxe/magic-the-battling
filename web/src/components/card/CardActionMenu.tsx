import { useState, useRef, type ReactElement } from "react";
import type { Card as CardType, ZoneName, CardStateAction } from "../../types";
import { useFaceDown } from "../../contexts/faceDownState";
import { useEscapeKey, useLayoutMeasure } from "../../hooks/useDomEffects";
import { useOpenSubmenus } from "../../hooks/useOpenSubmenus";
import { MenuPrompt } from "../common/MenuPrompt";
import {
  canUseBattleFaceDownAction,
  canUseBattleFlipAction,
} from "../../utils/battleInteraction";
import { clampMenuToViewport, menuMaxHeight } from "../../utils/menuPosition";
import { POPOVER_CHROME } from "../common/styles";
import { usePanelHoldsEnter } from "../../hooks/usePanelHoldsEnter";

interface CardActionMenuProps {
  card: CardType;
  position: { x: number; y: number };
  zone: ZoneName;
  isTapped: boolean;
  isFlipped: boolean;
  counters: Record<string, number>;
  isAttached: boolean;
  battlefieldCards: CardType[];
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  onAction: (action: CardStateAction, data?: Record<string, unknown>) => void;
  onMove: (toZone: ZoneName) => void;
  onClose: () => void;
}

type SubmenuName =
  | "addCounter"
  | "removeCounter"
  | "spawnToken"
  | "attachTo"
  | "moveTo";

type ActionHandler = (
  action: CardStateAction,
  data?: Record<string, unknown>,
) => void;

const COUNTER_TYPES = ["+1/+1", "-1/-1", "Loyalty", "Charge"];
// Custom's field is taller than the row it replaces, so it takes the room of two.
const ADD_COUNTER_ROWS = COUNTER_TYPES.length + 2;
const ATTACH_TO_MAX_HEIGHT = 200;
const MOVE_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: "hand", label: "Hand" },
  { zone: "battlefield", label: "Battlefield" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "library", label: "Library" },
];

function computeTallestSubmenuRows(options: {
  onBattlefield: boolean;
  moveTargetCount: number;
  counterCount: number;
  tokenCount: number;
}): number {
  if (!options.onBattlefield) return options.moveTargetCount;
  return Math.max(
    options.moveTargetCount,
    ADD_COUNTER_ROWS,
    options.counterCount,
    options.tokenCount,
  );
}

interface CounterMenuSectionProps {
  counters: Record<string, number>;
  isOpen: (name: SubmenuName) => boolean;
  toggle: (name: SubmenuName) => void;
  onAction: ActionHandler;
}

function CounterMenuSection({
  counters,
  isOpen,
  toggle,
  onAction,
}: CounterMenuSectionProps): ReactElement {
  const [namingCounter, setNamingCounter] = useState(false);
  const counterEntries = Object.entries(counters);

  return (
    <>
      <MenuItem
        label="Add Counter"
        hasSubmenu
        open={isOpen("addCounter")}
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

      <MenuDivider />
    </>
  );
}

interface TokenMenuSectionProps {
  tokens: CardType["tokens"];
  isOpponent: boolean;
  open: boolean;
  onToggle: () => void;
  onAction: ActionHandler;
}

function TokenMenuSection({
  tokens,
  isOpponent,
  open,
  onToggle,
  onAction,
}: TokenMenuSectionProps): ReactElement | null {
  if (tokens.length === 0) return null;

  return (
    <>
      <MenuItem label="Spawn Token" hasSubmenu open={open} onClick={onToggle} />
      {open && (
        <Submenu>
          {tokens.map((token) => (
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
                  for_opponent: isOpponent,
                })
              }
            />
          ))}
        </Submenu>
      )}
      <MenuDivider />
    </>
  );
}

interface AttachMenuSectionProps {
  attachableCards: CardType[];
  isAttached: boolean;
  open: boolean;
  onToggle: () => void;
  onAction: ActionHandler;
}

function AttachMenuSection({
  attachableCards,
  isAttached,
  open,
  onToggle,
  onAction,
}: AttachMenuSectionProps): ReactElement | null {
  const canAttach = attachableCards.length > 0;
  if (!canAttach && !isAttached) return null;

  return (
    <>
      {canAttach && (
        <>
          <MenuItem
            label="Attach To"
            hasSubmenu
            open={open}
            onClick={onToggle}
          />
          {open && (
            <Submenu maxHeight={ATTACH_TO_MAX_HEIGHT}>
              {attachableCards.map((target) => (
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
      {isAttached && (
        <MenuItem label="Detach" onClick={() => onAction("detach")} />
      )}
      <MenuDivider />
    </>
  );
}

interface StateActionsSectionProps {
  onBattlefield: boolean;
  isTapped: boolean;
  isFlipped: boolean;
  isFaceDown: boolean;
  showFlip: boolean;
  canFaceDown: boolean;
  onAction: ActionHandler;
}

function StateActionsSection({
  onBattlefield,
  isTapped,
  isFlipped,
  isFaceDown,
  showFlip,
  canFaceDown,
  onAction,
}: StateActionsSectionProps): ReactElement {
  return (
    <>
      {onBattlefield && (
        <>
          <MenuItem
            label={isTapped ? "Untap" : "Tap"}
            onClick={() => onAction(isTapped ? "untap" : "tap")}
          />
          <MenuDivider />
        </>
      )}

      {showFlip && (
        <MenuItem
          label={isFlipped ? "Flip to Front" : "Flip to Back"}
          onClick={() => onAction("flip")}
        />
      )}

      {canFaceDown && (
        <MenuItem
          label={isFaceDown ? "Turn Face Up" : "Turn Face Down"}
          onClick={() => onAction("face_down")}
        />
      )}

      <MenuDivider />
    </>
  );
}

export function CardActionMenu({
  card,
  position,
  zone,
  isTapped,
  isFlipped,
  counters,
  isAttached,
  battlefieldCards,
  isOpponent = false,
  canManipulateOpponent = true,
  onAction,
  onMove,
  onClose,
}: CardActionMenuProps): ReactElement {
  const isFaceDown = useFaceDown(card.id);
  const { isOpen, toggle } = useOpenSubmenus<SubmenuName>();

  const menuRef = useRef<HTMLDivElement>(null);

  const onBattlefield = zone === "battlefield";
  const moveTargets = MOVE_TARGETS.filter((target) => target.zone !== zone);
  const attachableCards = onBattlefield
    ? battlefieldCards.filter((c) => c.id !== card.id)
    : [];
  const tallestSubmenuRows = computeTallestSubmenuRows({
    onBattlefield,
    moveTargetCount: moveTargets.length,
    counterCount: Object.keys(counters).length,
    tokenCount: card.tokens.length,
  });
  const attachToRows = attachableCards.length;

  // A submenu opens under the row that was clicked. Moving the menu then would put a different row under the pointer,
  // so the menu is placed once, with room under it for its tallest submenu.
  useLayoutMeasure(
    menuRef,
    (node) => {
      const rowHeight =
        node.querySelector<HTMLElement>(".menu-item")?.offsetHeight ?? 0;
      const tallestSubmenu = Math.max(
        tallestSubmenuRows * rowHeight,
        Math.min(attachToRows * rowHeight, ATTACH_TO_MAX_HEIGHT),
      );
      const rect = node.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const { x, y } = clampMenuToViewport(
        position,
        { width: rect.width, height: rect.height + tallestSubmenu },
        viewport,
      );
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.maxHeight = `${menuMaxHeight(y, viewport)}px`;
    },
    { deps: [position, tallestSubmenuRows, attachToRows] },
  );

  usePanelHoldsEnter();
  // The menu is on top, so it takes Escape while the key is captured, before a panel under it hears it.
  useEscapeKey(
    (e) => {
      e.preventDefault();
      onClose();
    },
    { capture: true },
  );

  const owner = isOpponent ? "opponent" : "player";
  const canFaceDown = canUseBattleFaceDownAction(owner, canManipulateOpponent);
  const showFlip =
    Boolean(card.flip_image_url) &&
    canUseBattleFlipAction(owner, isFaceDown, canManipulateOpponent);

  const handleAction: ActionHandler = (action, data) => {
    onAction(action, data);
    onClose();
  };

  const handleMove = (toZone: ZoneName): void => {
    onMove(toZone);
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: position.x,
    top: position.y,
    zIndex: 100,
    overflowY: "auto",
  };

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        style={menuStyle}
        className={`${POPOVER_CHROME} py-1 min-w-[160px] z-50`}
      >
        <StateActionsSection
          onBattlefield={onBattlefield}
          isTapped={isTapped}
          isFlipped={isFlipped}
          isFaceDown={isFaceDown}
          showFlip={showFlip}
          canFaceDown={canFaceDown}
          onAction={handleAction}
        />

        {onBattlefield && (
          <CounterMenuSection
            counters={counters}
            isOpen={isOpen}
            toggle={toggle}
            onAction={handleAction}
          />
        )}

        {onBattlefield && (
          <TokenMenuSection
            tokens={card.tokens}
            isOpponent={isOpponent}
            open={isOpen("spawnToken")}
            onToggle={() => toggle("spawnToken")}
            onAction={handleAction}
          />
        )}

        {card.name && (
          <>
            <MenuItem
              label="Make Copy Token"
              onClick={() => handleAction("copy_token")}
            />
            <MenuDivider />
          </>
        )}

        <AttachMenuSection
          attachableCards={attachableCards}
          isAttached={isAttached}
          open={isOpen("attachTo")}
          onToggle={() => toggle("attachTo")}
          onAction={handleAction}
        />

        <MenuItem
          label="Move To"
          hasSubmenu
          open={isOpen("moveTo")}
          onClick={() => toggle("moveTo")}
        />
        {isOpen("moveTo") && (
          <Submenu>
            {moveTargets.map((target) => (
              <MenuItem
                key={target.zone}
                label={target.label}
                onClick={() => handleMove(target.zone)}
              />
            ))}
          </Submenu>
        )}
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
}: {
  label: string;
  onClick: () => void;
  hasSubmenu?: boolean;
  open?: boolean;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
        menu-item ${disabled ? "text-[var(--ivory-faint)] cursor-not-allowed" : "text-white"}
      `}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-expanded={hasSubmenu ? open : undefined}
    >
      <span>{label}</span>
      {hasSubmenu && <span className="text-[var(--ivory-muted)]">›</span>}
    </button>
  );
}

function MenuDivider(): ReactElement {
  return <div className="border-t gold-divider my-1" />;
}

function Submenu({
  children,
  maxHeight,
}: {
  children: React.ReactNode;
  maxHeight?: number;
}): ReactElement {
  return (
    <div
      className="menu-submenu"
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      {children}
    </div>
  );
}
