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
  const addCards = (cards: CardType[], owner: OverlayOwner): void => {
    cards.forEach((card) => lookup.set(card.id, { card, owner }));
  };

  const addZones = (
    owner: OverlayOwner,
    zones: BattleView["your_zones"],
  ): void => {
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
    const timers = [
      window.setTimeout(() => setPhase("glow"), showMs),
      window.setTimeout(() => setPhase("fade"), showMs + glowMs),
      window.setTimeout(() => handleComplete(), showMs + glowMs + fadeMs),
    ];

    return (): void => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [showMs, glowMs, fadeMs]);

  return phase;
}

export interface BattleResolutionAnimationState {
  counts: { player: number; opponent: number };
  focusedOwners: OverlayOwner[];
  incrementOwners: OverlayOwner[];
  lethalOwners: OverlayOwner[];
  deadOwners: OverlayOwner[];
  settlingOwners: OverlayOwner[];
  activeSource: ActiveSourceState | null;
  activeBeam: { from: Point; to: Point } | null;
  showContinuation: boolean;
}

interface AnimationDriver {
  isCancelled: () => boolean;
  wait: (ms: number) => Promise<void>;
  applyIncrement: (owner: OverlayOwner, nextValue: number) => void;
  setIncrementOwners: (owners: OverlayOwner[]) => void;
  setActiveSource: React.Dispatch<
    React.SetStateAction<ActiveSourceState | null>
  >;
  setActiveBeam: (beam: { from: Point; to: Point } | null) => void;
}

function resolveBeamEnd(targetOwner: OverlayOwner): Point {
  const targetRect = rectForSelector(`[data-poison-owner="${targetOwner}"]`);
  if (targetRect) return centerOfRect(targetRect);
  return {
    x:
      targetOwner === "player"
        ? window.innerWidth * 0.72
        : window.innerWidth * 0.78,
    y:
      targetOwner === "player"
        ? window.innerHeight * 0.68
        : window.innerHeight * 0.24,
  };
}

async function runSingleBeam(
  driver: AnimationDriver,
  beam: { from: Point; to: Point; targetOwner: OverlayOwner },
  currentCounts: Record<OverlayOwner, number>,
): Promise<boolean> {
  driver.setActiveBeam({ from: beam.from, to: beam.to });
  await driver.wait(BEAM_TRAVEL_MS);
  if (driver.isCancelled()) return false;

  currentCounts[beam.targetOwner] += 1;
  driver.applyIncrement(beam.targetOwner, currentCounts[beam.targetOwner]);
  driver.setIncrementOwners([beam.targetOwner]);

  await driver.wait(BEAM_SETTLE_MS);
  if (driver.isCancelled()) return false;

  driver.setActiveBeam(null);
  driver.setIncrementOwners([]);
  return true;
}

async function runBeamsSequentially(
  driver: AnimationDriver,
  options: {
    from: Point;
    to: Point;
    targetOwner: OverlayOwner;
    remaining: number;
  },
  currentCounts: Record<OverlayOwner, number>,
): Promise<boolean> {
  if (options.remaining <= 0) return true;
  const ok = await runSingleBeam(driver, options, currentCounts);
  if (!ok) return false;
  if (options.remaining > 1) {
    await driver.wait(BEAM_PAUSE_MS);
    if (driver.isCancelled()) return false;
  }
  return runBeamsSequentially(
    driver,
    { ...options, remaining: options.remaining - 1 },
    currentCounts,
  );
}

async function runUpgradeGroup(
  driver: AnimationDriver,
  group: BeamGroup,
  context: {
    cardLookup: Map<string, CardLookupEntry>;
    currentCounts: Record<OverlayOwner, number>;
  },
): Promise<boolean> {
  const lookup = context.cardLookup.get(group.sourceCardId) ?? null;
  if (!lookup) return true;

  const sourceRect = rectForSelector(selectorForCard(group.sourceCardId));
  const stageRect = buildStageRect(lookup.owner);
  const { enterX, enterY, enterScale } = buildEntryTransform(
    lookup.owner,
    stageRect,
    sourceRect,
  );

  driver.setActiveSource({
    card: lookup.card,
    owner: lookup.owner,
    stageRect,
    enterX,
    enterY,
    enterScale,
    isExiting: false,
  });

  await driver.wait(SOURCE_MOVE_MS);
  if (driver.isCancelled()) return false;

  const beamsOk = await runBeamsSequentially(
    driver,
    {
      from: centerOfRect(stageRect),
      to: resolveBeamEnd(group.targetOwner),
      targetOwner: group.targetOwner,
      remaining: group.beamCount,
    },
    context.currentCounts,
  );
  if (!beamsOk) return false;

  driver.setActiveSource((current) =>
    current && current.card.id === group.sourceCardId
      ? { ...current, isExiting: true }
      : current,
  );

  await driver.wait(GROUP_EXIT_MS);
  if (driver.isCancelled()) return false;
  driver.setActiveSource(null);
  await driver.wait(120);
  return !driver.isCancelled();
}

async function runUpgradeGroupsSequentially(
  driver: AnimationDriver,
  groups: readonly BeamGroup[],
  context: {
    cardLookup: Map<string, CardLookupEntry>;
    currentCounts: Record<OverlayOwner, number>;
  },
): Promise<boolean> {
  if (groups.length === 0) return true;
  const [head, ...rest] = groups;
  const ok = await runUpgradeGroup(driver, head, context);
  if (!ok) return false;
  return runUpgradeGroupsSequentially(driver, rest, context);
}

export function useBattleResolutionAnimation({
  battle,
  resolution,
  onComplete,
}: {
  battle: BattleView;
  resolution: BattleResolution;
  onComplete: () => void;
}): BattleResolutionAnimationState {
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

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        activeTimer = window.setTimeout(() => {
          activeTimer = null;
          resolve();
        }, ms);
      });

    const applyIncrement = (owner: OverlayOwner, nextValue: number): void => {
      setCounts((current) => ({
        ...current,
        [owner]: nextValue,
      }));
      if (nextValue >= POISON_TO_LOSE) {
        setLethalOwners((current) => uniqueOwners([...current, owner]));
      }
    };

    const driver: AnimationDriver = {
      isCancelled: () => cancelled,
      wait,
      applyIncrement,
      setIncrementOwners,
      setActiveSource,
      setActiveBeam,
    };

    const runBaseDamage = async (
      baseOwners: OverlayOwner[],
    ): Promise<boolean> => {
      if (baseOwners.length === 0) return true;
      baseOwners.forEach((owner) => {
        applyIncrement(owner, initialSides[owner].starting_poison + 1);
      });
      setIncrementOwners(baseOwners);
      await wait(COUNTER_TICK_MS);
      if (cancelled) return false;
      setIncrementOwners([]);
      await wait(BASE_SETTLE_MS);
      return !cancelled;
    };

    const runOutro = async (
      damagedOwners: OverlayOwner[],
      currentCounts: Record<OverlayOwner, number>,
    ): Promise<void> => {
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

    const run = async (): Promise<void> => {
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
      if (!(await runBaseDamage(baseOwners))) return;

      const groups = interleave(
        groupUpgradeEvents(initialSides.player.events, "player"),
        groupUpgradeEvents(initialSides.opponent.events, "opponent"),
      );
      const currentCounts: Record<OverlayOwner, number> = {
        player:
          initialSides.player.starting_poison +
          (baseOwners.includes("player") ? 1 : 0),
        opponent:
          initialSides.opponent.starting_poison +
          (baseOwners.includes("opponent") ? 1 : 0),
      };

      const groupsOk = await runUpgradeGroupsSequentially(driver, groups, {
        cardLookup: initialCardLookup,
        currentCounts,
      });
      if (!groupsOk) return;

      await runOutro(damagedOwners, currentCounts);
    };

    void run();

    return (): void => {
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
): { index: number; visible: boolean; prev: () => void; next: () => void } {
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
    if (count <= 0 || index < 0) return undefined;
    clearCycleTimer();
    cycleRef.current = window.setTimeout(() => {
      cycleRef.current = null;
      scheduleNext();
    }, cycleMs);
    return clearCycleTimer;
  }, [clearCycleTimer, count, cycleMs, index]);

  useEffect(() => {
    return (): void => {
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
): { present: boolean; finishExit: () => void } {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open || !present) return undefined;
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.getAnimations().length) setPresent(false);
    });
    return (): void => cancelAnimationFrame(frame);
  }, [open, present, ref]);

  const finishExit = useCallback(() => setPresent(false), []);

  return { present, finishExit };
}
