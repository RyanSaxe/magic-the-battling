import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { SHOWCASE_STAGES } from "../../constants/showcaseCards";
import type { Card as CardType } from "../../types";
import { Card } from "../card/Card";
import { BasicLandCard } from "../common/BasicLandCard";
import { TreasureCard } from "../common/TreasureCard";
import { UpgradeStack } from "../sidebar/UpgradeStack";
import { computeShowcaseSizes } from "./showcaseSizes";

const CYCLE_INTERVAL = 4000;
const FADE_DURATION = 400;
const FALLBACK_CHROME_HEIGHT = 80;
const STACK_GAPS_HEIGHT = 40;

type UpgradePhase =
  | "hidden"
  | "enlarge"
  | "slide-in"
  | "linger"
  | "glow"
  | "shrink"
  | "done";

const UPGRADE_TIMINGS = {
  startDelay: 500,
  enlargeDuration: 500,
  slideInDuration: 600,
  lingerDuration: 1000,
  glowDuration: 600,
  shrinkDuration: 500,
};

interface ShowcaseBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function useShowcaseSizes() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const taglineRef = useRef<HTMLParagraphElement | null>(null);
  const dotsRef = useRef<HTMLDivElement | null>(null);

  const calculateSizes = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || viewportWidth;
    const containerHeight = container?.clientHeight || window.innerHeight;
    const taglineHeight = taglineRef.current?.offsetHeight ?? 28;
    const dotsHeight = dotsRef.current?.offsetHeight ?? 10;
    const chromeHeight = container
      ? taglineHeight + dotsHeight + STACK_GAPS_HEIGHT
      : FALLBACK_CHROME_HEIGHT;
    return computeShowcaseSizes(
      containerWidth,
      containerHeight,
      viewportWidth,
      chromeHeight,
    );
  }, []);

  const [sizes, setSizes] = useState(() =>
    computeShowcaseSizes(
      window.innerWidth,
      window.innerHeight,
      window.innerWidth,
      FALLBACK_CHROME_HEIGHT,
    ),
  );

  useLayoutEffect(() => {
    const updateSizes = () => setSizes(calculateSizes());
    updateSizes();

    const container = containerRef.current;
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateSizes)
        : null;
    if (container && observer) observer.observe(container);

    window.addEventListener("resize", updateSizes);
    return () => {
      window.removeEventListener("resize", updateSizes);
      observer?.disconnect();
    };
  }, [calculateSizes]);

  return { sizes, containerRef, taglineRef, dotsRef };
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

function totalUpgradeDuration() {
  const t = UPGRADE_TIMINGS;
  return (
    t.startDelay +
    t.enlargeDuration +
    t.slideInDuration +
    t.lingerDuration +
    t.glowDuration +
    t.shrinkDuration
  );
}

export function CardShowcase() {
  const [currentStage, setCurrentStage] = useState(0);
  const [fading, setFading] = useState(false);
  const [upgradePhase, setUpgradePhase] = useState<UpgradePhase>("hidden");
  const [myrUpgraded, setMyrUpgraded] = useState(false);
  const [targetPosition, setTargetPosition] = useState<{
    centerY: number;
    right: number;
  } | null>(null);
  const [bounds, setBounds] = useState<ShowcaseBounds | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetCardRef = useRef<HTMLDivElement | null>(null);
  const { sizes, containerRef, taglineRef, dotsRef } = useShowcaseSizes();

  const measureUpgradeGeometry = useCallback(() => {
    const rect = targetCardRef.current?.getBoundingClientRect();
    if (rect) {
      setTargetPosition({
        centerY: rect.top + rect.height / 2,
        right: rect.right,
      });
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setBounds({
        top: containerRect.top,
        right: containerRect.right,
        bottom: containerRect.bottom,
        left: containerRect.left,
      });
    }
  }, [containerRef]);

  const runUpgradeSequence = useCallback(() => {
    const {
      startDelay,
      enlargeDuration,
      slideInDuration,
      lingerDuration,
      glowDuration,
      shrinkDuration,
    } = UPGRADE_TIMINGS;
    const t1 = startDelay;
    const t2 = t1 + enlargeDuration;
    const t3 = t2 + slideInDuration;
    const t4 = t3 + lingerDuration;
    const t5 = t4 + glowDuration;
    const t6 = t5 + shrinkDuration;

    setTimeout(() => setUpgradePhase("enlarge"), t1);
    setTimeout(() => {
      // Measure AFTER the enlarge CSS transition completes —
      // getBoundingClientRect includes transforms, so no manual math needed
      measureUpgradeGeometry();
      setUpgradePhase("slide-in");
    }, t2);
    setTimeout(() => setUpgradePhase("linger"), t3);
    setTimeout(() => {
      setUpgradePhase("glow");
      setMyrUpgraded(true);
    }, t4);
    setTimeout(() => setUpgradePhase("shrink"), t5);
    setTimeout(() => setUpgradePhase("done"), t6);
  }, [measureUpgradeGeometry]);

  const goTo = useCallback(
    (index: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setFading(true);
      setUpgradePhase("hidden");
      setMyrUpgraded(false);
      setTimeout(() => {
        setCurrentStage(index);
        setFading(false);
        if (index === 2) {
          runUpgradeSequence();
        }
      }, FADE_DURATION);
    },
    [runUpgradeSequence],
  );

  // Auto-advance: schedule the next stage transition after fading completes
  useEffect(() => {
    if (fading) return;
    const delay =
      currentStage === 2
        ? totalUpgradeDuration() + CYCLE_INTERVAL
        : CYCLE_INTERVAL;
    timerRef.current = setTimeout(() => {
      goTo((currentStage + 1) % SHOWCASE_STAGES.length);
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStage, fading, goTo]);

  const handleDotClick = (index: number) => {
    if (index === currentStage) return;
    goTo(index);
  };

  const stage = SHOWCASE_STAGES[currentStage];
  const isEnlarged =
    upgradePhase === "enlarge" ||
    upgradePhase === "slide-in" ||
    upgradePhase === "linger" ||
    upgradePhase === "glow";
  const showSourceCard =
    upgradePhase === "enlarge" ||
    upgradePhase === "slide-in" ||
    upgradePhase === "linger" ||
    upgradePhase === "glow";
  const showBattlefieldStack =
    upgradePhase === "glow" ||
    upgradePhase === "shrink" ||
    upgradePhase === "done";

  useEffect(() => {
    if (!showSourceCard) return;
    window.addEventListener("resize", measureUpgradeGeometry);
    return () => window.removeEventListener("resize", measureUpgradeGeometry);
  }, [showSourceCard, measureUpgradeGeometry]);

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
