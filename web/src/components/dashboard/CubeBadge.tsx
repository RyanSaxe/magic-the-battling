import type { ReactNode } from "react";
import { Tag, type TagTone } from "../common/Tag";

/** What a cube card or page says it is: a saved Cube or Deck, a followed cube, or a community cube (Cube). */
export type CubeBadgeTone = "Cube" | "Deck" | "Following";

const TONES: Record<CubeBadgeTone, TagTone> = {
  Cube: "gold",
  Deck: "stone",
  Following: "emerald",
};

export function CubeBadge({
  tone,
  children,
  className,
}: {
  tone: CubeBadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag tone={TONES[tone]} className={className}>
      {children}
    </Tag>
  );
}
