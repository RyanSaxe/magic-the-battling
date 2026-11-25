import { useContext, type Ref } from "react";
import { createPortal } from "react-dom";
import { SidePanelHostContext } from "./sidePanelHost";

/**
 * Covers what's inside the felt, such as a game's board and sidebar or a page's cards, between the bars, while
 * something open closes on a tap there, so that tap only closes it. It waits for the click: closing on the press
 * would uncover what's under it in time to take the tap's click.
 */
export function BoardBackdrop({
  onTap,
  ref,
}: {
  onTap: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const host = useContext(SidePanelHostContext);
  if (!host) return null;
  return createPortal(
    <div
      ref={ref}
      className="board-backdrop"
      aria-hidden="true"
      onClick={(event) => {
        // A portal's events also reach the React parents of whatever rendered it.
        event.stopPropagation();
        onTap();
      }}
    />,
    host,
  );
}
