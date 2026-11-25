import type { ReactNode } from "react";

export interface PlayerCardProps {
  /** The left column: a standings rank in a game, who sits there before one. */
  lead?: ReactNode;
  name: ReactNode;
  /** The end of the name line, such as the last fight's result. */
  nameEnd?: ReactNode;
  /** The line under the name. */
  children: ReactNode;
  /** Sits over the start of the name line, as the mic does. */
  control?: ReactNode;
  /** Sit over the end of the status line, as a seat's Remove does. */
  actions?: ReactNode;
  isSelf?: boolean;
  isOut?: boolean;
  isOpen?: boolean;
  selected?: boolean;
  /** Without one the card is not a button. */
  onSelect?: () => void;
  disabled?: boolean;
  guideName?: string;
}

interface PlayerCardClassFlags {
  hasLead: boolean;
  isSelf: boolean;
  isOut: boolean;
  hasControl: boolean;
  isOpen: boolean;
  hasActions: boolean;
}

function getPlayerCardClassName(flags: PlayerCardClassFlags): string {
  return [
    "player-card",
    !flags.hasLead && "is-unranked",
    flags.isSelf && "is-self",
    flags.isOut && "is-out",
    flags.hasControl && "has-control",
    flags.isOpen && "is-open",
    flags.hasActions && "has-actions",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A player's card. The card is one button that selects the player, and an optional control such as the mic sits
 * beside it, over a space kept free at the start of the name line, because a button can't hold another button.
 */
export function PlayerCard({
  lead,
  name,
  nameEnd,
  children,
  control,
  actions,
  isSelf = false,
  isOut = false,
  isOpen = false,
  selected,
  onSelect,
  disabled,
  guideName,
}: PlayerCardProps): ReactNode {
  const className = getPlayerCardClassName({
    hasLead: Boolean(lead),
    isSelf,
    isOut,
    hasControl: Boolean(control),
    isOpen,
    hasActions: Boolean(actions),
  });
  const face = (
    <>
      {lead}
      <span className="player-card-body">
        <span className="player-card-line">
          <span className="player-card-name">{name}</span>
          {nameEnd}
        </span>
        <span className="player-card-line">{children}</span>
      </span>
    </>
  );

  return (
    <div className={className} data-guide-player-row={guideName}>
      {onSelect ? (
        <button
          type="button"
          className="player-card-button"
          aria-pressed={selected}
          disabled={disabled}
          onClick={onSelect}
        >
          {face}
        </button>
      ) : (
        <div className="player-card-button">{face}</div>
      )}
      {control && <span className="player-card-control">{control}</span>}
      {actions && <span className="player-card-actions">{actions}</span>}
    </div>
  );
}
