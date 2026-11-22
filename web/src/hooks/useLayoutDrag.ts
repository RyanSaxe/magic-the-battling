import { useCallback, useMemo, useRef, useState } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";

/** A divider drag, from press to release. */
export interface LayoutDrag {
  /** A divider is pressed. The layout on screen, every fraction of it, becomes the draft. */
  start: (seed: ZoneConstraints) => void;
  move: (key: keyof ZoneConstraints, fraction: number) => void;
  /** The divider is released. A draft that moved is saved once; a press without a move saves nothing. */
  end: () => void;
}

interface Dragging {
  draft: ZoneConstraints;
  moved: boolean;
  /** The save of the layout the drag started on, so a resize mid-drag can't move it to another board size. */
  save: (constraints: ZoneConstraints) => void;
}

/**
 * Owns a divider drag: the zones follow the draft in memory while the divider
 * is held, and the layout is saved once, when it is released.
 */
export function useLayoutDrag(
  saved: ZoneConstraints | null,
  save: (constraints: ZoneConstraints) => void,
): { constraints: ZoneConstraints | null; drag: LayoutDrag } {
  const [draft, setDraft] = useState<ZoneConstraints | null>(null);
  const draggingRef = useRef<Dragging | null>(null);

  const start = useCallback(
    (seed: ZoneConstraints) => {
      draggingRef.current = { draft: seed, moved: false, save };
      setDraft(seed);
    },
    [save],
  );

  const move = useCallback((key: keyof ZoneConstraints, fraction: number) => {
    const dragging = draggingRef.current;
    if (!dragging) return;
    dragging.draft = { ...dragging.draft, [key]: fraction };
    dragging.moved = true;
    setDraft(dragging.draft);
  }, []);

  const end = useCallback(() => {
    const dragging = draggingRef.current;
    draggingRef.current = null;
    setDraft(null);
    if (dragging?.moved) dragging.save(dragging.draft);
  }, []);

  const drag = useMemo(() => ({ start, move, end }), [start, move, end]);
  return { constraints: draft ?? saved, drag };
}
