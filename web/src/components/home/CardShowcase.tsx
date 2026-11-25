import type { CSSProperties, ReactElement, RefObject } from "react";
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

const ENLARGED_PHASES: ReadonlySet<UpgradePhase> = new Set([
  "enlarge",
  "slide-in",
  "linger",
  "glow",
]);
const STACK_PHASES: ReadonlySet<UpgradePhase> = new Set([
  "glow",
  "shrink",
  "done",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function keyedLands(lands: string[]): { key: string; name: string }[] {
  const counts = new Map<string, number>();
  return lands.map((name) => {
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    return { key: `${name}#${count}`, name };
  });
}

function computeSourcePosition({
  enlargedWidth,
  enlargedHeight,
  targetPosition,
  bounds,
}: {
  enlargedWidth: number;
  enlargedHeight: number;
  targetPosition: { centerY: number; right: number } | null;
  bounds: ShowcaseBounds | null;
}): { top: number; left: number } {
  const gap = window.innerWidth < 640 ? 8 : 16;
  const centerY = targetPosition?.centerY ?? window.innerHeight / 2;
  const rawTop = centerY - enlargedHeight / 2;
  const rawLeft = targetPosition
    ? targetPosition.right + gap
    : window.innerWidth / 2;
  return {
    top: bounds
      ? clamp(rawTop, bounds.top, bounds.bottom - enlargedHeight)
      : rawTop,
    left: bounds
      ? clamp(rawLeft, bounds.left, bounds.right - enlargedWidth)
      : rawLeft,
  };
}

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
}): ReactElement {
  const isVisible = phase === "slide-in" || phase === "linger";
  const isFading = phase === "glow";
  const enlargedWidth = Math.round(dimensions.width * 1.5);
  const enlargedHeight = Math.round(dimensions.height * 1.5);
  const { top, left } = computeSourcePosition({
    enlargedWidth,
    enlargedHeight,
    targetPosition,
    bounds,
  });

  const style: CSSProperties = {
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
    isVisible && "phase-slide-in",
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

function handCardTargetClass(
  isTarget: boolean,
  isEnlarged: boolean,
  upgradePhase: UpgradePhase,
): string {
  if (!isTarget) return "";
  return [
    "upgrade-target",
    isEnlarged && "phase-enlarge",
    upgradePhase === "glow" && "phase-glow",
    upgradePhase === "shrink" && "phase-shrink",
  ]
    .filter(Boolean)
    .join(" ");
}

function handCardOverlapStyle({
  handGap,
  index,
  elevated,
  handLength,
}: {
  handGap: number;
  index: number;
  elevated: boolean;
  handLength: number;
}): CSSProperties | undefined {
  if (handGap >= 0) return undefined;
  return {
    marginLeft: index > 0 ? handGap : undefined,
    zIndex: elevated ? handLength + 1 : index,
  };
}

function ShowcaseHandCard({
  card,
  index,
  handLength,
  dimensions,
  handGap,
  isTarget,
  isEnlarged,
  upgradePhase,
  myrUpgraded,
  targetCardRef,
}: {
  card: CardType;
  index: number;
  handLength: number;
  dimensions: { width: number; height: number };
  handGap: number;
  isTarget: boolean;
  isEnlarged: boolean;
  upgradePhase: UpgradePhase;
  myrUpgraded: boolean;
  targetCardRef: RefObject<HTMLDivElement | null>;
}): ReactElement {
  return (
    <div
      ref={isTarget ? targetCardRef : undefined}
      className={handCardTargetClass(isTarget, isEnlarged, upgradePhase)}
      style={handCardOverlapStyle({
        handGap,
        index,
        elevated: isTarget && isEnlarged,
        handLength,
      })}
    >
      <Card
        card={card}
        dimensions={dimensions}
        upgraded={isTarget && myrUpgraded}
      />
    </div>
  );
}

export function CardShowcase(): ReactElement {
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
  const isEnlarged = ENLARGED_PHASES.has(upgradePhase);
  const showBattlefieldStack = STACK_PHASES.has(upgradePhase);

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
            {stage.hand.map((card, i) => (
              <ShowcaseHandCard
                key={card.id}
                card={card}
                index={i}
                handLength={stage.hand.length}
                dimensions={sizes.hand}
                handGap={sizes.handGap}
                isTarget={stage.upgrade?.targetCardId === card.id}
                isEnlarged={isEnlarged}
                upgradePhase={upgradePhase}
                myrUpgraded={myrUpgraded}
                targetCardRef={targetCardRef}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            {keyedLands(stage.battlefield.lands).map((land) => (
              <BasicLandCard
                key={land.key}
                name={land.name}
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
        {SHOWCASE_STAGES.map((stageItem, i) => (
          <button
            key={stageItem.tagline}
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
