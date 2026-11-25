/**
 * Animation lifecycle hooks for battle resolution, upgrade reveal/build overlays,
 * cycling hint banners, and transition-backed panel presence.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { POISON_TO_LOSE } from "../../constants/rules";
import type {
  BattleResolution,
  BattleView,
  Card as CardType,
} from "../../types";

export type OverlayOwner = "player" | "opponent";

export interface Point {
  x: number;
  y: number;
}

export interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ActiveSourceState {
  card: CardType;
  owner: OverlayOwner;
  stageRect: StageRect;
  enterX: number;
  enterY: number;
  enterScale: number;
  isExiting: boolean;
}

interface CardLookupEntry {
  card: CardType;
  owner: OverlayOwner;
}

interface BeamGroup {
  sourceCardId: string;
  targetOwner: OverlayOwner;
  beamCount: number;
}

const BASE_SETTLE_MS = 620;
const COUNTER_TICK_MS = 260;
const DEATH_PHASE_MS = 1450;
const SOURCE_MOVE_MS = 540;
const BEAM_TRAVEL_MS = 260;
const BEAM_SETTLE_MS = 320;
const BEAM_PAUSE_MS = 260;
const GROUP_EXIT_MS = 220;
const COUNTER_SETTLE_MS = 800;
const COUNTER_SETTLE_PAUSE_MS = 200;
const CONTINUATION_MS = 1500;

function buildCardLookup(battle: BattleView): Map<string, CardLookupEntry> {
  const lookup = new Map<string, CardLookupEntry>();
  const addCards = (cards: CardType[], owner: OverlayOwner) => {
    cards.forEach((card) => lookup.set(card.id, { card, owner }));
  };

  const addZones = (owner: OverlayOwner, zones: BattleView["your_zones"]) => {
    addCards(zones.hand, owner);
    addCards(zones.battlefield, owner);
    addCards(zones.graveyard, owner);
    addCards(zones.exile, owner);
    addCards(zones.sideboard, owner);
    addCards(zones.command_zone, owner);
    addCards(zones.submitted_cards, owner);
    addCards(zones.upgrades, owner);
    for (const upgrade of zones.upgrades) {
      if (upgrade.upgrade_target) {
        lookup.set(upgrade.upgrade_target.id, {
          card: upgrade.upgrade_target,
          owner,
        });
      }
    }
  };

  addZones("player", battle.your_zones);
  addZones("opponent", battle.opponent_zones);
  return lookup;
}

function selectorForCard(cardId: string): string {
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(cardId)
      : cardId.replace(/["\\]/g, "\\$&");
  return `[data-card-id="${escaped}"]`;
}

export function rectForSelector(selector: string): DOMRect | null {
  return document.querySelector(selector)?.getBoundingClientRect() ?? null;
}

function centerOfRect(rect: StageRect | DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function uniqueOwners(owners: OverlayOwner[]): OverlayOwner[] {
  return Array.from(new Set(owners));
}

function buildStageRect(owner: OverlayOwner): StageRect {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = clamp(Math.round(viewportWidth * 0.035), 18, 34);
  const width = clamp(
    Math.round(Math.min(viewportWidth * 0.22, viewportHeight * 0.19)),
    120,
    220,
  );
  const height = Math.round((width * 7) / 5);
  const topPadding = clamp(Math.round(viewportHeight * 0.11), 74, 116);
  const bottomPadding = clamp(Math.round(viewportHeight * 0.14), 96, 132);

  return {
    left: margin,
    top:
      owner === "player" ? viewportHeight - bottomPadding - height : topPadding,
    width,
    height,
  };
}

function buildEntryTransform(
  owner: OverlayOwner,
  stageRect: StageRect,
  sourceRect: DOMRect | null,
): { enterX: number; enterY: number; enterScale: number } {
  if (!sourceRect) {
    return {
      enterX: owner === "player" ? 36 : 28,
      enterY: owner === "player" ? 54 : -54,
      enterScale: 0.84,
    };
  }

  return {
    enterX: sourceRect.left - stageRect.left,
    enterY: sourceRect.top - stageRect.top,
    enterScale: clamp(sourceRect.width / stageRect.width, 0.28, 0.86),
  };
}

function groupUpgradeEvents(
  events: BattleResolution["your_side"]["events"],
  targetOwner: OverlayOwner,
): BeamGroup[] {
  const groups: BeamGroup[] = [];

  events
    .filter(
      (event) => event.event_type === "upgrade_beam" && event.source_card_id,
    )
    .forEach((event) => {
      const sourceCardId = event.source_card_id;
      if (!sourceCardId) return;

      const previous = groups.at(-1);
      if (
        previous &&
        previous.sourceCardId === sourceCardId &&
        previous.targetOwner === targetOwner
      ) {
        previous.beamCount += 1;
        return;
      }

      groups.push({
        sourceCardId,
        targetOwner,
        beamCount: 1,
      });
    });

  return groups;
}

function interleave<T>(first: T[], second: T[]): T[] {
  const output: T[] = [];
  const maxLength = Math.max(first.length, second.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (index < first.length) output.push(first[index]);
    if (index < second.length) output.push(second[index]);
  }
  return output;
}

export function useThreePhaseOverlay(
  timings: { showMs: number; glowMs: number; fadeMs: number },
  onComplete: () => void,
): "show" | "glow" | "fade" {
  const { showMs, glowMs, fadeMs } = timings;
  const [phase, setPhase] = useState<"show" | "glow" | "fade">("show");
  const handleComplete = useEffectEvent(onComplete);

  useEffect(() => {
    let timerId: number | null = window.setTimeout(() => {
      setPhase("glow");
      timerId = window.setTimeout(() => {
        setPhase("fade");
        timerId = window.setTimeout(() => {
          timerId = null;
          handleComplete();
        }, fadeMs);
      }, glowMs);
    }, showMs);

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [showMs, glowMs, fadeMs]);

  return phase;
}

export function useBattleResolutionAnimation({
  battle,
  resolution,
  onComplete,
}: {
  battle: BattleView;
  resolution: BattleResolution;
  onComplete: () => void;
}) {
  const [counts, setCounts] = useState({
    player: resolution.your_side.starting_poison,
    opponent: resolution.opponent_side.starting_poison,
  });
  const [focusedOwners, setFocusedOwners] = useState<OverlayOwner[]>([]);
  const [incrementOwners, setIncrementOwners] = useState<OverlayOwner[]>([]);
  const [lethalOwners, setLethalOwners] = useState<OverlayOwner[]>([]);
  const [deadOwners, setDeadOwners] = useState<OverlayOwner[]>([]);
  const [settlingOwners, setSettlingOwners] = useState<OverlayOwner[]>([]);
  const [activeSource, setActiveSource] = useState<ActiveSourceState | null>(
    null,
  );
  const [activeBeam, setActiveBeam] = useState<{
    from: Point;
    to: Point;
  } | null>(null);
  const [showContinuation, setShowContinuation] = useState(false);

  const cardLookup = useMemo(() => buildCardLookup(battle), [battle]);
  const resolutionSides = useMemo(
    () => ({
      player: resolution.your_side,
      opponent: resolution.opponent_side,
    }),
    [resolution],
  );

  const handleComplete = useEffectEvent(onComplete);
  const readInitialInput = useEffectEvent(() => ({
    cardLookup,
    resolutionSides,
    continueSuddenDeath: resolution.continue_sudden_death,
  }));

  useEffect(() => {
    let cancelled = false;
    let activeTimer: number | null = null;
    const {
      cardLookup: initialCardLookup,
      resolutionSides: initialSides,
      continueSuddenDeath,
    } = readInitialInput();

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        activeTimer = window.setTimeout(() => {
          activeTimer = null;
          resolve();
        }, ms);
      });

    const applyIncrement = (owner: OverlayOwner, nextValue: number) => {
      setCounts((current) => ({
        ...current,
        [owner]: nextValue,
      }));
      if (nextValue >= POISON_TO_LOSE) {
        setLethalOwners((current) => uniqueOwners([...current, owner]));
      }
    };

    const run = async () => {
      await wait(160);
      if (cancelled) return;

      const damagedOwners = (["player", "opponent"] as const).filter(
        (owner) => initialSides[owner].took_damage,
      );

      if (damagedOwners.length === 0) {
        await wait(220);
        if (!cancelled) handleComplete();
        return;
      }

      setFocusedOwners(damagedOwners);
      await wait(360);
      if (cancelled) return;

      const baseOwners = (["player", "opponent"] as const).filter(
        (owner) =>
          initialSides[owner].events[0]?.event_type === "base_increment",
      );

      if (baseOwners.length > 0) {
        baseOwners.forEach((owner) => {
          applyIncrement(owner, initialSides[owner].starting_poison + 1);
        });
        setIncrementOwners(baseOwners);
        await wait(COUNTER_TICK_MS);
        if (cancelled) return;
        setIncrementOwners([]);
        await wait(BASE_SETTLE_MS);
        if (cancelled) return;
      }

      const playerGroups = groupUpgradeEvents(
        initialSides.player.events,
        "player",
      );
      const opponentGroups = groupUpgradeEvents(
        initialSides.opponent.events,
        "opponent",
      );
      const groups = interleave(playerGroups, opponentGroups);

      const currentCounts = {
        player:
          initialSides.player.starting_poison +
          (baseOwners.includes("player") ? 1 : 0),
        opponent:
          initialSides.opponent.starting_poison +
          (baseOwners.includes("opponent") ? 1 : 0),
      };

      for (const group of groups) {
        const lookup = initialCardLookup.get(group.sourceCardId) ?? null;
        if (!lookup) continue;

        const sourceRect = rectForSelector(selectorForCard(group.sourceCardId));
        const stageRect = buildStageRect(lookup.owner);
        const { enterX, enterY, enterScale } = buildEntryTransform(
          lookup.owner,
          stageRect,
          sourceRect,
        );

        setActiveSource({
          card: lookup.card,
          owner: lookup.owner,
          stageRect,
          enterX,
          enterY,
          enterScale,
          isExiting: false,
        });

        await wait(SOURCE_MOVE_MS);
        if (cancelled) return;

        const targetRect = rectForSelector(
          `[data-poison-owner="${group.targetOwner}"]`,
        );
        const beamStart = centerOfRect(stageRect);
        const beamEnd = targetRect
          ? centerOfRect(targetRect)
          : {
              x:
                group.targetOwner === "player"
                  ? window.innerWidth * 0.72
                  : window.innerWidth * 0.78,
              y:
                group.targetOwner === "player"
                  ? window.innerHeight * 0.68
                  : window.innerHeight * 0.24,
            };

        for (let beamIndex = 0; beamIndex < group.beamCount; beamIndex += 1) {
          setActiveBeam({ from: beamStart, to: beamEnd });
          await wait(BEAM_TRAVEL_MS);
          if (cancelled) return;

          currentCounts[group.targetOwner] += 1;
          applyIncrement(group.targetOwner, currentCounts[group.targetOwner]);
          setIncrementOwners([group.targetOwner]);

          await wait(BEAM_SETTLE_MS);
          if (cancelled) return;

          setActiveBeam(null);
          setIncrementOwners([]);

          if (beamIndex < group.beamCount - 1) {
            await wait(BEAM_PAUSE_MS);
            if (cancelled) return;
          }
        }

        setActiveSource((current) =>
          current && current.card.id === group.sourceCardId
            ? { ...current, isExiting: true }
            : current,
        );

        await wait(GROUP_EXIT_MS);
        if (cancelled) return;
        setActiveSource(null);
        await wait(120);
        if (cancelled) return;
      }

      const deathTargets = (["player", "opponent"] as const).filter(
        (owner) =>
          initialSides[owner].show_death_animation &&
          currentCounts[owner] >= POISON_TO_LOSE,
      );

      if (deathTargets.length > 0) {
        await wait(360);
        if (cancelled) return;
        setDeadOwners(deathTargets);
        await wait(DEATH_PHASE_MS);
        if (cancelled) return;
      }

      setSettlingOwners(damagedOwners);
      await wait(COUNTER_SETTLE_MS);
      if (cancelled) return;
      await wait(COUNTER_SETTLE_PAUSE_MS);
      if (cancelled) return;

      if (continueSuddenDeath) {
        setShowContinuation(true);
        await wait(CONTINUATION_MS);
        if (cancelled) return;
      }

      handleComplete();
    };

    void run();

    return () => {
      cancelled = true;
      if (activeTimer !== null) window.clearTimeout(activeTimer);
    };
  }, []);

  return {
    counts,
    focusedOwners,
    incrementOwners,
    lethalOwners,
    deadOwners,
    settlingOwners,
    activeSource,
    activeBeam,
    showContinuation,
  };
}

export function useHintCycler(
  count: number,
  timings: { cycleMs: number; fadeOutMs: number; swapPauseMs: number },
) {
  const { cycleMs, fadeOutMs, swapPauseMs } = timings;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * count));
  const [visible, setVisible] = useState(true);
  const fadeOutRef = useRef<number | null>(null);
  const fadeInRef = useRef<number | null>(null);
  const cycleRef = useRef<number | null>(null);

  const clearTransitionTimers = useCallback(() => {
    if (fadeOutRef.current !== null) {
      window.clearTimeout(fadeOutRef.current);
      fadeOutRef.current = null;
    }
    if (fadeInRef.current !== null) {
      window.clearTimeout(fadeInRef.current);
      fadeInRef.current = null;
    }
  }, []);

  const clearCycleTimer = useCallback(() => {
    if (cycleRef.current !== null) {
      window.clearTimeout(cycleRef.current);
      cycleRef.current = null;
    }
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      clearTransitionTimers();
      setVisible(false);
      fadeOutRef.current = window.setTimeout(() => {
        setIndex(nextIndex);
        fadeInRef.current = window.setTimeout(() => {
          setVisible(true);
          fadeInRef.current = null;
        }, swapPauseMs);
        fadeOutRef.current = null;
      }, fadeOutMs);
    },
    [clearTransitionTimers, fadeOutMs, swapPauseMs],
  );

  const scheduleNext = useEffectEvent(() => {
    goTo((index + 1) % count);
  });

  useEffect(() => {
    clearCycleTimer();
    cycleRef.current = window.setTimeout(() => {
      cycleRef.current = null;
      scheduleNext();
    }, cycleMs);
    return clearCycleTimer;
  }, [clearCycleTimer, count, cycleMs, index]);

  useEffect(() => {
    return () => {
      clearCycleTimer();
      clearTransitionTimers();
    };
  }, [clearCycleTimer, clearTransitionTimers]);

  const prev = useCallback(() => {
    clearCycleTimer();
    goTo((index - 1 + count) % count);
  }, [clearCycleTimer, count, goTo, index]);

  const next = useCallback(() => {
    clearCycleTimer();
    goTo((index + 1) % count);
  }, [clearCycleTimer, count, goTo, index]);

  return { index, visible, prev, next };
}

export function useAnimatedPresence(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open || !present) return;
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.getAnimations().length) setPresent(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, present, ref]);

  const finishExit = useCallback(() => setPresent(false), []);

  return { present, finishExit };
}
