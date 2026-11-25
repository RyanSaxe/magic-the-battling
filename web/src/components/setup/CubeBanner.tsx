import type { ReactElement, ReactNode } from "react";
import type { CubeLook } from "../../hooks/useCubeLook";
import type { PlayMode } from "../../types";
import { Tag } from "../common/Tag";
import { CubeBandArt } from "../dashboard/CubeArt";

// The band is one height whatever the cube is called, so a long name steps down in size instead of being cut. The
// longest is small type, which on phones leaves the art for walnut.
function nameSize(name: string): string {
  if (name.length > 36) return "is-longest";
  if (name.length > 22) return "is-long";
  return name.length > 14 ? "is-medium" : "";
}

function BannerTitle({
  name,
  playMode,
  href,
}: {
  name: string;
  playMode: PlayMode;
  href?: string;
}): ReactElement {
  return (
    <div className={`cube-banner-title ${name ? "" : "is-unnamed"}`}>
      <h2 className={`cube-banner-name ${nameSize(name)}`}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={name ? undefined : "Open on CubeCobra"}
            className="cube-banner-link"
          >
            <span className="cube-banner-words">
              {name}
              <span aria-hidden="true" className="cube-banner-arrow">
                {"\u00a0"}↗
              </span>
            </span>
          </a>
        ) : (
          <span className="cube-banner-words">{name}</span>
        )}
      </h2>
      <Tag tone="muted">{playMode === "constructed" ? "Deck" : "Cube"}</Tag>
    </div>
  );
}

/** The top of Play and the Lobby: the cube over its art, then a walnut row of that screen's controls. */
export function CubeBanner({
  look,
  playMode,
  href,
  action,
  notice,
  children,
}: {
  /** null before a player in constructed has a deck. */
  look: CubeLook | null;
  playMode: PlayMode;
  href?: string;
  action?: ReactNode;
  /** Takes the cube's place over the controls while it lasts, so nothing under the banner moves. */
  notice?: ReactNode;
  children: ReactNode;
}): ReactElement {
  const name = look?.name ?? "No deck yet";
  const imageUri = look?.imageUri;
  return (
    <div
      className={`cube-banner ${imageUri ? "has-art" : ""} ${notice ? "has-notice" : ""}`}
    >
      <div className="cube-banner-art">
        {imageUri && <CubeBandArt src={imageUri} />}
      </div>
      <div className="cube-banner-top">
        {notice}
        {(name || href) && (
          <BannerTitle name={name} playMode={playMode} href={href} />
        )}
        {action && <div className="cube-banner-action">{action}</div>}
      </div>
      <div className="cube-banner-strip">{children}</div>
    </div>
  );
}
