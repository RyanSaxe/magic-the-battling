import { useContext, useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnimatedPresence } from "../../hooks/ui/useOverlayAnimations";
import { useEscapeKey } from "../../hooks/useDomEffects";
import { usePanelHoldsEnter } from "../../hooks/usePanelHoldsEnter";
import { BoardBackdrop } from "./BoardBackdrop";
import { CloseButton } from "./CloseButton";
import { SidePanelHostContext } from "./sidePanelHost";

/** Placed over the board and its sidebar, it marks the box between their gold edges where side panels open. */
export function SidePanelFrame({
  ref,
}: {
  ref: (element: HTMLDivElement | null) => void;
}): ReactElement {
  return <div ref={ref} className="side-panel-frame" />;
}

export const SIDE_PANEL_HEADER_HEIGHT = 40;

interface SidePanelProps {
  open: boolean;
  title: string;
  /** A quiet word before the title, such as "Scouting" before a player's name, which then shows in gold. */
  prefix?: string;
  count?: number;
  onClose: () => void;
  headerActions?: ReactNode;
  /** Slides out of view while it stays open, so a card dragged out of it can be dropped on the board it covers. */
  steppedAside?: boolean;
  /** A tap on the board outside the panel closes it, and does nothing else. */
  closeOnBoardTap?: boolean;
  /**
   * `column` covers the sidebar's column, or the whole board on phones. `beside` opens over the board next to the
   * sidebar's column, so the player list there stays in view, and slides out from under it.
   */
  placement?: "column" | "beside";
  guideTarget?: string;
  children: ReactNode;
}

function shouldIgnorePanelEscape(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target;
  // Escape first cancels typing in a field, and closes a dialog or card preview open over the panel.
  if (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    return true;
  }
  return Boolean(
    document.querySelector(
      "[aria-modal='true'], [data-card-preview-modal='true']",
    ),
  );
}

interface SidePanelHeaderProps {
  title: string;
  prefix?: string;
  count?: number;
  label: string;
  headerActions?: ReactNode;
  onClose: () => void;
}

function SidePanelHeader({
  title,
  prefix,
  count,
  label,
  headerActions,
  onClose,
}: SidePanelHeaderProps): ReactElement {
  return (
    <div
      className="side-panel-header"
      style={{ height: SIDE_PANEL_HEADER_HEIGHT }}
    >
      <h2 className="side-panel-title">
        {prefix && <span className="side-panel-prefix">{prefix}</span>}
        <span className={prefix ? "side-panel-name" : undefined}>{title}</span>
        {count !== undefined && (
          <span className="side-panel-count">{count}</span>
        )}
      </h2>
      <div className="flex items-center gap-2">
        {headerActions}
        <CloseButton onClick={onClose} label={`Close ${label}`} />
      </div>
    </div>
  );
}

function buildSidePanelClass(open: boolean, steppedAside?: boolean): string {
  return [
    "side-panel frame-chrome",
    open ? "side-panel--open" : "",
    steppedAside ? "side-panel--aside" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The one panel that opens over the board: inside its gold edge, under any banner and between the bars, so the
 * bars and their buttons always show. From 1120px wide it covers the docked sidebar's column, from 640px the same
 * column over the board, and on phones the whole board. It slides in from the right, and × or Escape closes it.
 *
 * It stays mounted while it slides out, and drops its content once it has gone.
 */
export function SidePanel(props: SidePanelProps): ReactElement | null {
  const { open, title, prefix, count, onClose, headerActions, children } =
    props;
  const host = useContext(SidePanelHostContext);
  const panelRef = useRef<HTMLElement>(null);
  const { present, finishExit } = useAnimatedPresence(open, panelRef);
  usePanelHoldsEnter(open);

  useEscapeKey(
    (event) => {
      if (!shouldIgnorePanelEscape(event)) onClose();
    },
    { enabled: open },
  );

  if (!present || !host) return null;
  const label = prefix ? `${prefix} ${title}` : title;
  const panel = (
    <section
      ref={panelRef}
      className={buildSidePanelClass(open, props.steppedAside)}
      aria-label={label}
      inert={!open}
      data-guide-target={props.guideTarget}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !open) finishExit();
      }}
    >
      <SidePanelHeader
        title={title}
        prefix={prefix}
        count={count}
        label={label}
        headerActions={headerActions}
        onClose={onClose}
      />
      <div className="side-panel-body">{children}</div>
    </section>
  );

  return (
    <>
      {open && props.closeOnBoardTap && <BoardBackdrop onTap={onClose} />}
      {createPortal(
        props.placement === "beside" ? (
          <div className="side-panel-beside">{panel}</div>
        ) : (
          panel
        ),
        host,
      )}
    </>
  );
}
