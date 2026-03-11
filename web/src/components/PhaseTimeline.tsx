import { useState, useRef, useCallback, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import type { Phase } from "../constants/phases";
import type { RulesPanelTarget } from "./RulesPanel";
import { PhasePopover } from "./PhasePopover";
import { GuideStateContext } from "../guided/guideState";

const PHASES: Phase[] = ["draft", "build", "battle", "reward"];

const PHASE_TIMELINE_LABELS: Record<Phase, string> = {
  draft: "draft",
  build: "build",
  battle: "battle",
  reward: "advance",
};

const PHASE_ACTIVE_STYLE: Record<Phase, string> = {
  draft: "bg-purple-500/30 text-purple-300 ring-1 ring-purple-400/60",
  build: "bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/60",
  battle: "bg-red-500/30 text-red-300 ring-1 ring-red-400/60",
  reward: "bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/60",
};
const GUIDED_POPOVER_AUTO_CLOSE_MS = 10_000;
const PHASE_POPOVER_FADE_OUT_MS = 220;

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
  useUpgrades?: boolean;
  autoOpenPhase?: Phase | null;
  autoOpenDurationMs?: number;
  onAutoOpenHandled?: (phase: Phase) => void;
  onOpenRules?: (target?: RulesPanelTarget) => void;
  hamburger?: React.ReactNode;
  title?: React.ReactNode;
  headerClassName?: string;
}

function isGamePhase(phase: string): phase is Phase {
  return PHASES.includes(phase as Phase);
}

function RulesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-secondary text-xs sm:text-sm"
      title="Guide"
      data-guide-target="guide-button"
    >
      <span className="hidden sm:inline">Guide</span>
      <span className="sm:hidden">?</span>
    </button>
  );
}

function HomeButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/")}
      className="btn btn-secondary text-xs sm:text-sm"
    >
      Home
    </button>
  );
}

export function PhaseTimeline({
  currentPhase,
  stage,
  round,
  nextStage,
  nextRound,
  useUpgrades = true,
  autoOpenPhase = null,
  autoOpenDurationMs = GUIDED_POPOVER_AUTO_CLOSE_MS,
  onAutoOpenHandled,
  onOpenRules,
  hamburger,
  title,
  headerClassName,
}: PhaseTimelineProps) {
  const guideState = useContext(GuideStateContext);
  const welcomeGuideActive = guideState?.guideRequest?.guideId === "welcome";
  const [popoverPhase, setPopoverPhase] = useState<Phase | null>(null);
  const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(null);
  const [isPopoverClosing, setIsPopoverClosing] = useState(false);
  const autoCloseTimerRef = useRef<number | null>(null);
  const closeAnimationTimerRef = useRef<number | null>(null);
  const popoverPhaseRef = useRef<Phase | null>(null);
  const phaseButtonRefs = useRef<Record<Phase, HTMLButtonElement | null>>({
    draft: null,
    build: null,
    battle: null,
    reward: null,
  });

  useEffect(() => {
    popoverPhaseRef.current = popoverPhase;
  }, [popoverPhase]);

  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);

  const clearCloseAnimationTimer = useCallback(() => {
    if (closeAnimationTimerRef.current !== null) {
      window.clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    }
  }, []);

  const closePopoverImmediately = useCallback(() => {
    clearAutoCloseTimer();
    clearCloseAnimationTimer();
    setIsPopoverClosing(false);
    setPopoverPhase(null);
    setPopoverAnchorRect(null);
  }, [clearAutoCloseTimer, clearCloseAnimationTimer]);

  const beginClosingPopover = useCallback(() => {
    if (!popoverPhaseRef.current || closeAnimationTimerRef.current !== null) {
      return;
    }
    clearAutoCloseTimer();
    setIsPopoverClosing(true);
    closeAnimationTimerRef.current = window.setTimeout(() => {
      closeAnimationTimerRef.current = null;
      setIsPopoverClosing(false);
      setPopoverPhase(null);
      setPopoverAnchorRect(null);
    }, PHASE_POPOVER_FADE_OUT_MS);
  }, [clearAutoCloseTimer]);

  const openPopoverForPhase = useCallback(
    (phase: Phase, autoCloseAfterMs?: number): boolean => {
      const btn = phaseButtonRefs.current[phase];
      if (!btn) {
        return false;
      }
      clearAutoCloseTimer();
      clearCloseAnimationTimer();
      setIsPopoverClosing(false);
      setPopoverAnchorRect(btn.getBoundingClientRect());
      setPopoverPhase(phase);
      if (autoCloseAfterMs && autoCloseAfterMs > 0) {
        autoCloseTimerRef.current = window.setTimeout(() => {
          if (popoverPhaseRef.current === phase) {
            beginClosingPopover();
          }
          autoCloseTimerRef.current = null;
        }, autoCloseAfterMs);
      }
      return true;
    },
    [beginClosingPopover, clearAutoCloseTimer, clearCloseAnimationTimer],
  );

  const handleClosePopover = useCallback(() => {
    beginClosingPopover();
  }, [beginClosingPopover]);

  const handlePhaseClick = useCallback((phase: Phase) => {
    if (welcomeGuideActive) {
      return;
    }
    if (popoverPhase === phase) {
      handleClosePopover();
      return;
    }
    openPopoverForPhase(phase);
  }, [handleClosePopover, openPopoverForPhase, popoverPhase, welcomeGuideActive]);

  useEffect(() => {
    if (!autoOpenPhase) return;
    if (!isGamePhase(currentPhase)) return;
    if (autoOpenPhase !== currentPhase) return;

    let cancelled = false;
    let retryId: number | null = null;
    const openId = window.setTimeout(() => {
      if (cancelled) return;
      if (openPopoverForPhase(autoOpenPhase, autoOpenDurationMs)) {
        onAutoOpenHandled?.(autoOpenPhase);
        return;
      }
      retryId = window.setTimeout(() => {
        if (cancelled) return;
        if (openPopoverForPhase(autoOpenPhase, autoOpenDurationMs)) {
          onAutoOpenHandled?.(autoOpenPhase);
        }
      }, 0);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(openId);
      if (retryId !== null) {
        window.clearTimeout(retryId);
      }
    };
  }, [autoOpenDurationMs, autoOpenPhase, currentPhase, onAutoOpenHandled, openPopoverForPhase]);

  useEffect(() => {
    return () => {
      clearAutoCloseTimer();
      clearCloseAnimationTimer();
    };
  }, [clearAutoCloseTimer, clearCloseAnimationTimer]);

  const handleOpenDetailsFromPopover = useCallback(() => {
    const phase = popoverPhase;
    closePopoverImmediately();
    onOpenRules?.(phase ? { docId: phase } : undefined);
  }, [closePopoverImmediately, onOpenRules, popoverPhase]);

  const handleOpenControlsFromPopover = useCallback(() => {
    const phase = popoverPhase;
    closePopoverImmediately();
    onOpenRules?.(phase ? { docId: phase, tab: 'controls' } : undefined);
  }, [closePopoverImmediately, onOpenRules, popoverPhase]);

  const headerCls = headerClassName ?? "py-1.5 pl-4 pr-1.5";

  if (!isGamePhase(currentPhase)) {
    return (
      <header className={`frame-chrome ${headerCls}`}>
        <div className="flex items-center justify-between">
          {title ? (
            <div className="min-w-0">{title}</div>
          ) : (
            <span className="text-sm font-medium text-gray-300">
              {END_STATE_LABELS[currentPhase]}
            </span>
          )}
          <div className="flex items-center gap-1.5 timeline-actions">
            {onOpenRules && <RulesButton onClick={() => onOpenRules()} />}
            <HomeButton />
            {hamburger && <div className="shrink-0">{hamburger}</div>}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={`frame-chrome ${headerCls}`}>
      <div className="flex items-center">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-1 justify-start min-w-0">
          <span
            className="text-xs sm:text-sm text-gray-300 font-mono"
            data-guide-target="timeline-stage-round"
          >
            {stage}-{round}
          </span>

          {PHASES.map((phase, index) => {
            const currentIndex = PHASES.indexOf(currentPhase);
            const isActive = index === currentIndex;
            const isCompleted = index < currentIndex;
            const isUpcoming = index > currentIndex;
            const phaseButton = (
              <button
                ref={(el) => { phaseButtonRefs.current[phase] = el; }}
                disabled={welcomeGuideActive}
                onClick={() => handlePhaseClick(phase)}
                data-guide-target={`timeline-phase-${phase}`}
                className={`text-xs sm:text-sm font-medium capitalize transition-colors cursor-pointer
                  ${isActive ? `rounded-full px-2.5 py-0.5 sm:px-3 sm:py-0.5 ${PHASE_ACTIVE_STYLE[phase]}` : ""}
                  ${isCompleted ? "text-gray-500 line-through decoration-gray-600" : ""}
                  ${isUpcoming ? "text-gray-500" : ""}
                  ${welcomeGuideActive ? "cursor-default hover:brightness-100" : "hover:brightness-125"}
                `}
              >
                {PHASE_TIMELINE_LABELS[phase]}
              </button>
            );

            if (phase === "reward") {
              return (
                <div key={phase} className="flex items-center gap-1 sm:gap-1.5">
                  <span className="text-gray-600 text-xs">→</span>
                  <div
                    className="flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                    data-guide-target="timeline-next-stage-round"
                  >
                    {phaseButton}
                    <span className="text-xs sm:text-sm text-gray-500">
                      to <span className="font-mono">{nextStage}-{nextRound}</span>
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={phase} className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-gray-600 text-xs">→</span>
                {phaseButton}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 timeline-actions">
          {onOpenRules && <RulesButton onClick={() => onOpenRules()} />}
          <div className="hidden sm:block">
            <HomeButton />
          </div>
          {hamburger && <div className="shrink-0">{hamburger}</div>}
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
    </header>
  );
}
