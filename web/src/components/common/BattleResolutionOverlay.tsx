import type { CSSProperties, ReactElement } from "react";
import { Card } from "../card";
import { PoisonCard } from "./PoisonCard";
import type { BattleResolution, BattleView } from "../../types";
import {
  rectForSelector,
  useBattleResolutionAnimation,
} from "../../hooks/ui/useOverlayAnimations";

interface BattleResolutionOverlayProps {
  battle: BattleView;
  resolution: BattleResolution;
  onComplete: () => void;
}

type CSSVarsStyle = CSSProperties & Record<`--${string}`, string>;

function SkullIcon(): ReactElement {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className="h-[60%] w-[60%]">
      <path
        d="M32 6c-12.7 0-23 10.3-23 23 0 9 5.2 16.8 12.8 20.6v8.4c0 1.7 1.3 3 3 3h4.2v-6.2h6v6.2h4.2c1.7 0 3-1.3 3-3v-8.4C49.8 45.8 55 38 55 29 55 16.3 44.7 6 32 6Zm-8.6 24.3a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm17.2 0a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm-13.9 8.6h10.6a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-2.6V42h-5.4v4.4h-2.6a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function BattleResolutionOverlay({
  battle,
  resolution,
  onComplete,
}: BattleResolutionOverlayProps): ReactElement {
  const {
    counts,
    focusedOwners,
    incrementOwners,
    lethalOwners,
    deadOwners,
    settlingOwners,
    activeSource,
    activeBeam,
    showContinuation,
  } = useBattleResolutionAnimation({ battle, resolution, onComplete });

  const poisonRects = {
    player: rectForSelector('[data-poison-owner="player"]'),
    opponent: rectForSelector('[data-poison-owner="opponent"]'),
  };

  const counterScale = window.innerWidth < 640 ? "1.55" : "1.82";

  return (
    <div className="fixed inset-0 z-[80] pointer-events-auto">
      <div className="battle-resolution-backdrop absolute inset-0" />

      <svg className="pointer-events-none fixed inset-0 z-[85] h-full w-full overflow-visible">
        {activeBeam && (
          <g>
            <line
              x1={activeBeam.from.x}
              y1={activeBeam.from.y}
              x2={activeBeam.to.x}
              y2={activeBeam.to.y}
              className="battle-resolution-beam-core"
            />
            <line
              x1={activeBeam.from.x}
              y1={activeBeam.from.y}
              x2={activeBeam.to.x}
              y2={activeBeam.to.y}
              className="battle-resolution-beam-glow"
            />
          </g>
        )}
      </svg>

      {(["player", "opponent"] as const).map((owner) => {
        const rect = poisonRects[owner];
        if (!rect) return null;

        const isFocused = focusedOwners.includes(owner);
        const isIncrementing = incrementOwners.includes(owner);
        const isLethal = lethalOwners.includes(owner);
        const isDead = deadOwners.includes(owner);
        const counterStyle: CSSVarsStyle = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          "--battle-counter-scale": counterScale,
        };

        return (
          <div
            key={owner}
            className={[
              "fixed z-[83] battle-resolution-counter",
              isFocused && "battle-resolution-counter-focused",
              isIncrementing && "battle-resolution-counter-increment",
              isLethal && "battle-resolution-counter-lethal",
              isDead && "battle-resolution-counter-dead",
              settlingOwners.includes(owner) &&
                "battle-resolution-counter-settling",
            ]
              .filter(Boolean)
              .join(" ")}
            style={counterStyle}
          >
            <PoisonCard
              count={counts[owner]}
              dimensions={{ width: rect.width, height: rect.height }}
              owner={owner}
              badgeTextClassName={isLethal ? "text-red-200" : "text-purple-200"}
            />
            <div className="battle-resolution-counter-skull">
              <SkullIcon />
            </div>
          </div>
        );
      })}

      {activeSource &&
        ((): ReactElement => {
          const sourceStyle: CSSVarsStyle = {
            left: activeSource.stageRect.left,
            top: activeSource.stageRect.top,
            width: activeSource.stageRect.width,
            height: activeSource.stageRect.height,
            "--battle-enter-x": `${activeSource.enterX}px`,
            "--battle-enter-y": `${activeSource.enterY}px`,
            "--battle-enter-scale": String(activeSource.enterScale),
          };
          return (
            <div
              className={[
                "fixed z-[84] battle-resolution-source-card",
                activeSource.isExiting
                  ? "battle-resolution-source-card-exiting"
                  : "battle-resolution-source-card-entering",
              ].join(" ")}
              style={sourceStyle}
            >
              <Card
                card={activeSource.card}
                dimensions={{
                  width: Math.round(activeSource.stageRect.width),
                  height: Math.round(activeSource.stageRect.height),
                }}
                upgraded
                trackDomId={false}
              />
            </div>
          );
        })()}

      {showContinuation && (
        <div className="fixed inset-0 z-[86] pointer-events-none flex items-center justify-center">
          <div className="battle-resolution-continue-panel">Sudden Death</div>
        </div>
      )}
    </div>
  );
}
