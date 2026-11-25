import type { ReactNode } from "react";

export type TagTone = "gold" | "stone" | "muted" | "crimson" | "emerald";

/**
 * A small rimmed label: what a cube is, a feature's status or a player's state.
 * - small: 18px instead of 20px, for statuses beside other text.
 * - quiet: a near-black fill and softer rim, for statuses that shouldn't compete with labels.
 * - dot: leads with a dot in the tone's colour.
 */
export function Tag({
  tone,
  small = false,
  quiet = false,
  dot = false,
  title,
  className,
  children,
}: {
  tone: TagTone;
  small?: boolean;
  quiet?: boolean;
  dot?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    "tag",
    `tag-${tone}`,
    small && "tag-small",
    quiet && "tag-quiet",
    dot && "tag-dot",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}
