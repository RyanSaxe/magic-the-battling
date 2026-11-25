import type { CSSProperties, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SurfaceCard } from "../common/SurfaceCard";
import { CubeBadge, type CubeBadgeTone } from "./CubeBadge";
import { DetailLine } from "./Details";
import { MoreMenu, type MoreMenuItem } from "./MoreMenu";

interface CubeTileProps {
  title: string;
  cubeId: string;
  imageUri?: string | null;
  badge: CubeBadgeTone;
  chips: string[];
  footer: ReactNode;
  /** The page the card opens. */
  href: string;
  onPlay: () => void;
  menuItems: MoreMenuItem[];
  className?: string;
  style?: CSSProperties;
}

/** A saved cube or deck, a followed cube or a community cube: its art, settings or community numbers, and Play. */
export function CubeTile({
  title,
  cubeId,
  imageUri,
  badge,
  chips,
  footer,
  href,
  onPlay,
  menuItems,
  className,
  style,
}: CubeTileProps) {
  const navigate = useNavigate();
  return (
    <SurfaceCard
      as="article"
      layout="tile"
      onClick={() => navigate(href)}
      style={style}
      className={`flex flex-col cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(255,236,181,0.58)] ${className ?? ""}`}
    >
      <div className="relative h-[92px] shrink-0 overflow-hidden rounded-t-lg bg-[var(--art-fade)]">
        {imageUri && (
          <img
            src={imageUri}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-[center_28%] brightness-[0.68]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--art-fade)] via-transparent to-transparent" />
        <CubeBadge tone={badge} className="absolute right-2.5 top-2.5">
          {badge}
        </CubeBadge>
        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-2 min-w-0">
          <h3 className="truncate font-['Cinzel',serif] text-[14px] leading-5 font-bold text-[var(--ivory)] drop-shadow-md">
            <Link to={href} onClick={(e) => e.stopPropagation()}>
              {title}
            </Link>
          </h3>
          <a
            href={`https://cubecobra.com/cube/overview/${encodeURIComponent(cubeId)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] leading-4 text-amber-400/90 hover:text-amber-300 transition-colors"
          >
            {cubeId} ↗
          </a>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3 pt-2.5">
        <DetailLine items={chips} />
        <div className="mt-auto flex items-center justify-between gap-2 border-t gold-divider pt-2.5">
          <div className="min-w-0 truncate text-xs text-[var(--ivory-muted)]">
            {footer}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
              className="btn btn-primary h-8 !py-0 px-4 text-sm font-semibold"
            >
              Play
            </button>
            <MoreMenu label={`More for ${title}`} items={menuItems} />
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}
