import { type ReactNode, useRef, useCallback, useContext } from "react";
import { getTimelinePhases, type Phase } from "../constants/phases";
import type { RulesPanelTarget } from "./RulesPanel";
import { PhasePopover } from "./PhasePopover";
import { GuideStateContext } from "../guided/guideState";
import { useContentOverflows } from "../hooks/useContentOverflows";
import { usePhaseTimelineSync } from "../hooks/ui/usePhaseTimelineSync";

const PHASES = new Set<string>(["draft", "build", "battle", "reward"]);

const PHASE_TIMELINE_LABELS: Record<Phase, string> = {
  draft: "draft",
  build: "build",
  battle: "fight",
  reward: "advance",
};

// The current step reads as "you are here": a walnut tag with a gold rim, crimson in the Fight.
const STEP_HERE =
  "bg-[#352c25] text-[var(--gold-pale)] ring-1 ring-[var(--color-gold)]";
const PHASE_ACTIVE_STYLE: Record<Phase, string> = {
  draft: STEP_HERE,
  build: STEP_HERE,
  battle: "bg-[#441f1e] text-[#fecaca] ring-1 ring-[#d9534f]",
  reward: STEP_HERE,
};
const STEP_ARROW =
  "max-[360px]:hidden text-[var(--gold-border-opaque)] text-xs";
const GUIDED_POPOVER_AUTO_CLOSE_MS = 10_000;

type EndState = "eliminated" | "winner" | "game_over" | "awaiting_elimination";

const END_STATE_LABELS: Record<EndState, string> = {
  eliminated: "Eliminated",
  winner: "Victory!",
  game_over: "Game Over",
  awaiting_elimination: "Awaiting Result",
};

interface PhaseTimelineProps {
  currentPhase: Phase | EndState;
  stage: number;
  round: number;
  nextStage: number;
  nextRound: number;
  inSuddenDeath?: boolean;
  suddenDeathDecidesGame?: boolean;
  useUpgrades?: boolean;
  autoOpenPhase?: Phase | null;
  autoOpenDurationMs?: number;
  onAutoOpenHandled?: (phase: Phase) => void;
  onOpenRules?: (target?: RulesPanelTarget) => void;
  onStepClick?: () => void;
  title?: string;
}

function isGamePhase(phase: string): phase is Phase {
  return PHASES.has(phase);
}

function getStepLabel(options: {
  phase: Phase;
  currentPhase: Phase | EndState;
  isEndReward: boolean;
  endsInWinner: boolean;
  title?: string;
}): string {
  if (options.isEndReward) {
    if (options.title !== undefined) return options.title;
    return isGamePhase(options.currentPhase)
      ? PHASE_TIMELINE_LABELS[options.phase]
      : END_STATE_LABELS[options.currentPhase];
  }
  if (options.endsInWinner && options.phase === "reward") {
    return "winner";
  }
  return PHASE_TIMELINE_LABELS[options.phase];
}

function getStepButtonClassName(options: {
  phase: Phase;
  isHighlighted: boolean;
  isCompleted: boolean;
  isUpcoming: boolean;
}): string {
  const activeClass = options.isHighlighted
    ? `rounded-[4px] px-2.5 py-0.5 sm:px-3 sm:py-0.5 max-lg:ring-inset ${PHASE_ACTIVE_STYLE[options.phase]}`
    : "phase-step-idle";
  const completedClass =
    options.isCompleted && !options.isHighlighted
      ? "text-[var(--ivory-faint)] line-through decoration-[var(--gold-border-opaque)]"
      : "";
  const upcomingClass = options.isUpcoming ? "text-[var(--ivory-faint)]" : "";
  return `phase-step text-xs sm:text-sm font-medium capitalize transition-colors ${activeClass} ${completedClass} ${upcomingClass}`;
}

interface TimelineStepProps {
  phase: Phase;
  index: number;
  currentIndex: number;
  currentPhase: Phase | EndState;
  isEnd: boolean;
  endsInWinner: boolean;
  welcomeGuideActive: boolean;
  nextStage: number;
  nextRound: number;
  title?: string;
  buttonRef: (node: HTMLButtonElement | null) => void;
  stepRef: (node: HTMLDivElement | null) => void;
  onPhaseClick: (phase: Phase) => void;
}

function TimelineStep({
  phase,
  index,
  currentIndex,
  currentPhase,
  isEnd,
  endsInWinner,
  welcomeGuideActive,
  nextStage,
  nextRound,
  title,
  buttonRef,
  stepRef,
  onPhaseClick,
}: TimelineStepProps): ReactNode {
  const isEndReward = isEnd && phase === "reward";
  const isHighlighted = (!isEnd && index === currentIndex) || isEndReward;
  const label = getStepLabel({
    phase,
    currentPhase,
    isEndReward,
    endsInWinner,
    title,
  });
  const className = getStepButtonClassName({
    phase,
    isHighlighted,
    isCompleted: index < currentIndex,
    isUpcoming: !isEnd && index > currentIndex,
  });

  const phaseButton = (
    <button
      ref={buttonRef}
      disabled={welcomeGuideActive || isEnd}
      onClick={() => onPhaseClick(phase)}
      data-guide-target={`timeline-phase-${phase}`}
      className={className}
    >
      {label}
    </button>
  );

  if (phase === "reward") {
    return (
      <div ref={stepRef} className="flex items-center gap-1 sm:gap-1.5">
        <span className={STEP_ARROW}>→</span>
        <div
          className="flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
          data-guide-target="timeline-next-stage-round"
        >
          {phaseButton}
          {!isEnd && !endsInWinner && (
            <span className="max-[400px]:hidden text-xs sm:text-sm text-[var(--ivory-faint)]">
              to{" "}
              <span className="font-mono">
                {nextStage}-{nextRound}
              </span>
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={stepRef} className="flex items-center gap-1 sm:gap-1.5">
      <span className={STEP_ARROW}>→</span>
      {phaseButton}
    </div>
  );
}

function resolveTimelineState(props: PhaseTimelineProps): {
  activeGamePhase: Phase | null;
  isEnd: boolean;
  timelinePhases: Phase[];
  endsInWinner: boolean;
  currentIndex: number;
  useUpgrades: boolean;
  autoOpenPhase: Phase | null;
  autoOpenDurationMs: number;
} {
  const activeGamePhase = isGamePhase(props.currentPhase)
    ? props.currentPhase
    : null;
  const isEnd = activeGamePhase === null;
  const inSuddenDeath = Boolean(props.inSuddenDeath);
  const suddenDeathDecidesGame = Boolean(props.suddenDeathDecidesGame);
  const timelinePhases = getTimelinePhases(inSuddenDeath && !isEnd);
  return {
    activeGamePhase,
    isEnd,
    timelinePhases,
    endsInWinner: inSuddenDeath && suddenDeathDecidesGame && !isEnd,
    currentIndex: activeGamePhase
      ? timelinePhases.indexOf(activeGamePhase)
      : timelinePhases.length,
    useUpgrades: props.useUpgrades ?? true,
    autoOpenPhase: props.autoOpenPhase ?? null,
    autoOpenDurationMs:
      props.autoOpenDurationMs ?? GUIDED_POPOVER_AUTO_CLOSE_MS,
  };
}

export function PhaseTimeline(props: PhaseTimelineProps): ReactNode {
  const {
    currentPhase,
    stage,
    round,
    nextStage,
    nextRound,
    onAutoOpenHandled,
    onOpenRules,
    onStepClick,
    title,
  } = props;
  const {
    activeGamePhase,
    isEnd,
    timelinePhases,
    endsInWinner,
    currentIndex,
    useUpgrades,
    autoOpenPhase,
    autoOpenDurationMs,
  } = resolveTimelineState(props);
  const guideState = useContext(GuideStateContext);
  const welcomeGuideActive = guideState?.guideRequest?.guideId === "welcome";
  const stepsRowRef = useRef<HTMLDivElement | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const stepsOverflow = useContentOverflows(stepsRowRef, stepsRef);

  const {
    popoverPhase,
    popoverAnchorRect,
    isPopoverClosing,
    openPopoverForPhase,
    beginClosingPopover,
    closePopoverImmediately,
    bindPhaseButtonRef,
    bindPhaseStepRef,
  } = usePhaseTimelineSync({
    activeGamePhase,
    stepsOverflow,
    stepsRowRef,
    autoOpenPhase,
    autoOpenDurationMs,
    onAutoOpenHandled,
  });

  const handleClosePopover = useCallback(() => {
    beginClosingPopover();
  }, [beginClosingPopover]);

  const handlePhaseClick = useCallback(
    (phase: Phase) => {
      if (welcomeGuideActive) {
        return;
      }
      onStepClick?.();
      if (popoverPhase === phase) {
        handleClosePopover();
        return;
      }
      openPopoverForPhase(phase);
    },
    [
      handleClosePopover,
      onStepClick,
      openPopoverForPhase,
      popoverPhase,
      welcomeGuideActive,
    ],
  );

  const handleOpenDetailsFromPopover = useCallback(() => {
    const phase = popoverPhase;
    closePopoverImmediately();
    onOpenRules?.(phase ? { docId: phase } : undefined);
  }, [closePopoverImmediately, onOpenRules, popoverPhase]);

  const handleOpenControlsFromPopover = useCallback(() => {
    const phase = popoverPhase;
    closePopoverImmediately();
    onOpenRules?.(phase ? { docId: phase, tab: "controls" } : undefined);
  }, [closePopoverImmediately, onOpenRules, popoverPhase]);

  return (
    <>
      {/* Below lg the top zone's label can sit under the current step, so the row rises 2px and the step's ring
          turns inward. Every phase gets both, so the row stays put from phase to phase. */}
      <div
        ref={stepsRowRef}
        className={`flex items-center flex-1 min-w-0 max-lg:-translate-y-0.5 ${stepsOverflow ? "phase-timeline-scroll" : ""}`}
      >
        <div
          ref={stepsRef}
          className="flex items-center gap-1 sm:gap-1.5 max-[360px]:gap-[7px] shrink-0"
        >
          <span
            className="text-xs sm:text-sm text-[#e2d8cb] font-mono"
            data-guide-target="timeline-stage-round"
          >
            {stage}-{round}
          </span>

          {timelinePhases.map((phase, index) => (
            <TimelineStep
              key={phase}
              phase={phase}
              index={index}
              currentIndex={currentIndex}
              currentPhase={currentPhase}
              isEnd={isEnd}
              endsInWinner={endsInWinner}
              welcomeGuideActive={welcomeGuideActive}
              nextStage={nextStage}
              nextRound={nextRound}
              title={title}
              buttonRef={bindPhaseButtonRef(phase)}
              stepRef={bindPhaseStepRef(phase)}
              onPhaseClick={handlePhaseClick}
            />
          ))}
        </div>
      </div>

      {popoverPhase && popoverAnchorRect && (
        <PhasePopover
          phase={popoverPhase}
          anchorRect={popoverAnchorRect}
          useUpgrades={useUpgrades}
          isClosing={isPopoverClosing}
          onClose={handleClosePopover}
          onOpenDetails={handleOpenDetailsFromPopover}
          onOpenControls={handleOpenControlsFromPopover}
        />
      )}
    </>
  );
}
