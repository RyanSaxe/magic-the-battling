import { SHOWCASE_STAGES } from "../../constants/showcaseCards";
import {
  useCardShowcase,
  type ShowcaseBounds,
  type UpgradePhase,
} from "../../hooks/pages/useCardShowcase";
import type { Card as CardType } from "../../types";
import { Card } from "../card/Card";
import { BasicLandCard } from "../common/BasicLandCard";
import { TreasureCard } from "../common/TreasureCard";
import { UpgradeStack } from "../sidebar/UpgradeStack";

function UpgradeSourceCard({
  card,
  dimensions,
  phase,
  targetPosition,
  bounds,
}: {
  card: CardType;
  dimensions: { width: number; height: number };
  phase: UpgradePhase;
  targetPosition: { centerY: number; right: number } | null;
  bounds: ShowcaseBounds | null;
}) {
  const isVisible = phase === "slide-in" || phase === "linger";
  const isFading = phase === "glow";

  const enlargedWidth = Math.round(dimensions.width * 1.5);
  const enlargedHeight = Math.round(dimensions.height * 1.5);
  const gap = window.innerWidth < 640 ? 8 : 16;

  const centerY = targetPosition?.centerY ?? window.innerHeight / 2;
  const rawTop = centerY - enlargedHeight / 2;
  const rawLeft = targetPosition
    ? targetPosition.right + gap
    : window.innerWidth / 2;

  const top = bounds
    ? Math.max(bounds.top, Math.min(rawTop, bounds.bottom - enlargedHeight))
    : rawTop;
  const left = bounds
    ? Math.max(bounds.left, Math.min(rawLeft, bounds.right - enlargedWidth))
    : rawLeft;

  const style: React.CSSProperties = {
    top,
    left,
    width: enlargedWidth,
    height: enlargedHeight,
    transform:
      isVisible || isFading
        ? "translateX(0)"
        : `translateX(${window.innerWidth}px)`,
  };

  const className = [
    "upgrade-source",
    (isVisible || isFading) && !isFading && "phase-slide-in",
    isFading && "phase-fade-out",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} style={style}>
      <Card
        card={card}
        dimensions={{ width: enlargedWidth, height: enlargedHeight }}
      />
    </div>
  );
}

export function CardShowcase() {
  const {
    sizes,
    containerRef,
    taglineRef,
    dotsRef,
    targetCardRef,
    currentStage,
    fading,
    upgradePhase,
    myrUpgraded,
    targetPosition,
    bounds,
    showSourceCard,
    handleDotClick,
  } = useCardShowcase();

  const stage = SHOWCASE_STAGES[currentStage];
  const isEnlarged =
    upgradePhase === "enlarge" ||
    upgradePhase === "slide-in" ||
    upgradePhase === "linger" ||
    upgradePhase === "glow";
  const showBattlefieldStack =
    upgradePhase === "glow" ||
    upgradePhase === "shrink" ||
    upgradePhase === "done";

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full flex flex-col items-center gap-3 flex-1 min-h-0 justify-center"
    >
      <p
        ref={taglineRef}
        className="shrink-0 text-amber-200/80 text-lg sm:text-xl italic font-medium tracking-wide"
      >
        {stage.tagline}
      </p>

      <div className={fading ? "carousel-fade-out" : "carousel-fade-in"}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-end justify-center"
            style={{ gap: sizes.handGap >= 0 ? sizes.handGap : 0 }}
          >
            {stage.hand.map((card, i) => {
              const isTarget = stage.upgrade?.targetCardId === card.id;
              const targetClass = isTarget
                ? [
                    "upgrade-target",
                    isEnlarged && "phase-enlarge",
                    upgradePhase === "glow" && "phase-glow",
                    upgradePhase === "shrink" && "phase-shrink",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "";

              return (
                <div
                  key={card.id}
                  ref={isTarget ? targetCardRef : undefined}
                  className={targetClass}
                  style={{
                    ...(sizes.handGap < 0 && i > 0
                      ? { marginLeft: sizes.handGap }
                      : undefined),
                    ...(sizes.handGap < 0
                      ? {
                          zIndex:
                            isTarget && isEnlarged ? stage.hand.length + 1 : i,
                        }
                      : undefined),
                  }}
                >
                  <Card
                    card={card}
                    dimensions={sizes.hand}
                    upgraded={isTarget && myrUpgraded}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2">
            {stage.battlefield.lands.map((land, i) => (
              <BasicLandCard
                key={`${land}-${i}`}
                name={land}
                dimensions={sizes.field}
              />
            ))}
            {stage.battlefield.treasures > 0 && (
              <TreasureCard
                count={stage.battlefield.treasures}
                dimensions={sizes.field}
              />
            )}
            {stage.upgrade && (
              <div
                className="transition-opacity duration-500"
                style={{ opacity: showBattlefieldStack ? 1 : 0 }}
              >
                <UpgradeStack
                  upgrade={stage.upgrade.stackedCard}
                  dimensions={sizes.field}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={dotsRef} className="shrink-0 flex gap-2">
        {SHOWCASE_STAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => handleDotClick(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === currentStage
                ? "bg-amber-400"
                : "bg-[var(--stone-light)] hover:bg-[var(--ivory)]/50"
            }`}
            aria-label={`Stage ${i + 1}`}
          />
        ))}
      </div>

      {stage.upgrade && showSourceCard && (
        <UpgradeSourceCard
          card={stage.upgrade.upgradeCard}
          dimensions={sizes.hand}
          phase={upgradePhase}
          targetPosition={targetPosition}
          bounds={bounds}
        />
      )}
    </div>
  );
}
