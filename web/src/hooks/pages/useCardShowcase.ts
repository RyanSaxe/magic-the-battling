/**
 * Responsive layout sizing, stage cycling, and upgrade animation orchestration
 * for the landing page CardShowcase.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { SHOWCASE_STAGES } from "../../constants/showcaseCards";
import {
  computeShowcaseSizes,
  type ShowcaseSizes,
} from "../../components/home/showcaseSizes";

const CYCLE_INTERVAL = 4000;
const FADE_DURATION = 400;
const FALLBACK_CHROME_HEIGHT = 80;
const STACK_GAPS_HEIGHT = 40;

export type UpgradePhase =
  | "hidden"
  | "enlarge"
  | "slide-in"
  | "linger"
  | "glow"
  | "shrink"
  | "done";

export interface ShowcaseBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const UPGRADE_TIMINGS = {
  startDelay: 500,
  enlargeDuration: 500,
  slideInDuration: 600,
  lingerDuration: 1000,
  glowDuration: 600,
  shrinkDuration: 500,
};

function totalUpgradeDuration(): number {
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

function useShowcaseSizes(): {
  sizes: ShowcaseSizes;
  containerRef: RefObject<HTMLDivElement | null>;
  taglineRef: RefObject<HTMLParagraphElement | null>;
  dotsRef: RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const taglineRef = useRef<HTMLParagraphElement | null>(null);
  const dotsRef = useRef<HTMLDivElement | null>(null);

  const [sizes, setSizes] = useState(() =>
    computeShowcaseSizes({
      containerWidth: window.innerWidth,
      containerHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      chromeHeight: FALLBACK_CHROME_HEIGHT,
    }),
  );

  const updateSizes = useEffectEvent(() => {
    const viewportWidth = window.innerWidth;
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || viewportWidth;
    const containerHeight = container?.clientHeight || window.innerHeight;
    const taglineHeight = taglineRef.current?.offsetHeight ?? 28;
    const dotsHeight = dotsRef.current?.offsetHeight ?? 10;
    const chromeHeight = container
      ? taglineHeight + dotsHeight + STACK_GAPS_HEIGHT
      : FALLBACK_CHROME_HEIGHT;
    setSizes(
      computeShowcaseSizes({
        containerWidth,
        containerHeight,
        viewportWidth,
        chromeHeight,
      }),
    );
  });

  useLayoutEffect(() => {
    updateSizes();

    const container = containerRef.current;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updateSizes());
    if (container && observer) observer.observe(container);

    window.addEventListener("resize", updateSizes);
    return (): void => {
      window.removeEventListener("resize", updateSizes);
      observer?.disconnect();
    };
  }, []);

  return { sizes, containerRef, taglineRef, dotsRef };
}

export interface UseCardShowcaseResult {
  sizes: ShowcaseSizes;
  containerRef: RefObject<HTMLDivElement | null>;
  taglineRef: RefObject<HTMLParagraphElement | null>;
  dotsRef: RefObject<HTMLDivElement | null>;
  targetCardRef: RefObject<HTMLDivElement | null>;
  currentStage: number;
  fading: boolean;
  upgradePhase: UpgradePhase;
  myrUpgraded: boolean;
  targetPosition: { centerY: number; right: number } | null;
  bounds: ShowcaseBounds | null;
  showSourceCard: boolean;
  handleDotClick: (index: number) => void;
}

export function useCardShowcase(): UseCardShowcaseResult {
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
  const sequenceTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const targetCardRef = useRef<HTMLDivElement | null>(null);
  const { sizes, containerRef, taglineRef, dotsRef } = useShowcaseSizes();

  const clearSequenceTimers = useCallback(() => {
    for (const id of sequenceTimersRef.current) {
      clearTimeout(id);
    }
    sequenceTimersRef.current = [];
  }, []);

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
    clearSequenceTimers();
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

    sequenceTimersRef.current = [
      setTimeout(() => setUpgradePhase("enlarge"), t1),
      setTimeout(() => {
        // Measure AFTER the enlarge CSS transition completes —
        // getBoundingClientRect includes transforms, so no manual math needed
        measureUpgradeGeometry();
        setUpgradePhase("slide-in");
      }, t2),
      setTimeout(() => setUpgradePhase("linger"), t3),
      setTimeout(() => {
        setUpgradePhase("glow");
        setMyrUpgraded(true);
      }, t4),
      setTimeout(() => setUpgradePhase("shrink"), t5),
      setTimeout(() => setUpgradePhase("done"), t6),
    ];
  }, [clearSequenceTimers, measureUpgradeGeometry]);

  const goTo = useCallback(
    (index: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearSequenceTimers();
      setFading(true);
      setUpgradePhase("hidden");
      setMyrUpgraded(false);
      sequenceTimersRef.current.push(
        setTimeout(() => {
          setCurrentStage(index);
          setFading(false);
          if (index === 2) {
            runUpgradeSequence();
          }
        }, FADE_DURATION),
      );
    },
    [clearSequenceTimers, runUpgradeSequence],
  );

  const onAutoAdvance = useEffectEvent(() => {
    goTo((currentStage + 1) % SHOWCASE_STAGES.length);
  });

  // Auto-advance: schedule the next stage transition after fading completes
  useEffect(() => {
    if (fading) return undefined;
    const delay =
      currentStage === 2
        ? totalUpgradeDuration() + CYCLE_INTERVAL
        : CYCLE_INTERVAL;
    timerRef.current = setTimeout(() => {
      onAutoAdvance();
    }, delay);
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStage, fading]);

  useEffect(() => {
    return (): void => clearSequenceTimers();
  }, [clearSequenceTimers]);

  const showSourceCard =
    upgradePhase === "enlarge" ||
    upgradePhase === "slide-in" ||
    upgradePhase === "linger" ||
    upgradePhase === "glow";

  const onWindowResize = useEffectEvent(() => {
    measureUpgradeGeometry();
  });

  useEffect(() => {
    if (!showSourceCard) return undefined;
    window.addEventListener("resize", onWindowResize);
    return (): void => window.removeEventListener("resize", onWindowResize);
  }, [showSourceCard]);

  const handleDotClick = useCallback(
    (index: number) => {
      if (index === currentStage) return;
      goTo(index);
    },
    [currentStage, goTo],
  );

  return {
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
  };
}
