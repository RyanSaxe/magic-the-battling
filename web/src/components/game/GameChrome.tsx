/**
 * Shared top/bottom game-table chrome: TopBar, Banner, and phase-specific
 * BottomBar action controls.
 */
import type { ReactNode } from "react";
import {
  BATTLE_SUBMIT_BUTTON_LABEL,
  BUILD_SUBMIT_BUTTON_LABEL,
  DRAFT_DONE_BUTTON_LABEL,
  REWARD_CONTINUE_BUTTON_LABEL,
} from "../../constants/phases";
import type {
  GameSurfaceKind,
  UpgradesWindowMode,
} from "../../hooks/useGameSurfaces";
import type { PendingPhaseAction } from "../../pages/pendingPhaseAction";
import { isPhaseActionPending } from "../../pages/pendingPhaseAction";
import type { BattleView, GameState } from "../../types";
import { hasBattleResultConflict } from "../../utils/battleInteraction";
import { getOrdinal } from "../../utils/format";
import { suddenDeathDecidesGame } from "../../utils/playerPlacement";
import { GuideButton, HomeButton } from "../common/AppHeader";
import { Banner } from "../common/Banner";
import { BottomBar, BrandMark, TopBar } from "../common/FrameBar";
import { SubmitPopover } from "../common/SubmitPopover";
import { PhaseTimeline } from "../PhaseTimeline";
import type { RulesPanelTarget } from "../RulesPanel";

export function GameTopBar({
  gameState,
  timelinePhase,
  isOut,
  isSpectator,
  isEndPhase,
  displayBattleResolution,
  selfPlacement,
  outPlace,
  guideMinimized,
  usesOverlaySidebar,
  onToggleSidebar,
  onOpenRulesPanel,
  onCloseActions,
}: {
  gameState: GameState;
  timelinePhase: GameState["self_player"]["phase"];
  isOut: boolean;
  isSpectator: boolean;
  isEndPhase: boolean;
  displayBattleResolution: boolean;
  selfPlacement: number;
  outPlace: string;
  guideMinimized: boolean;
  usesOverlaySidebar: boolean;
  onToggleSidebar: () => void;
  onOpenRulesPanel: (target?: RulesPanelTarget) => void;
  onCloseActions: () => void;
}) {
  const { self_player } = gameState;
  const isStageIncreasing = self_player.is_stage_increasing;

  return (
    <div className="relative">
      <TopBar
        lead={
          <>
            <BrandMark className="hidden sm:block mr-2" />
            {isOut ? (
              <div className="flex flex-1 min-w-0 items-center gap-2 max-lg:-translate-y-0.5 whitespace-nowrap">
                <span className="text-xs sm:text-sm text-[#e2d8cb] font-mono">
                  {self_player.stage}-{self_player.round}
                </span>
                <span className="out-title text-[13px] sm:text-[14px]">
                  {isSpectator ? "Out" : "You’re out"}
                </span>
                <span className="min-w-0 truncate text-xs sm:text-sm text-[var(--ivory-muted)]">
                  {outPlace}
                </span>
              </div>
            ) : (
              <PhaseTimeline
                currentPhase={timelinePhase}
                stage={self_player.stage}
                round={self_player.round}
                nextStage={
                  isStageIncreasing ? self_player.stage + 1 : self_player.stage
                }
                nextRound={isStageIncreasing ? 1 : self_player.round + 1}
                inSuddenDeath={self_player.in_sudden_death}
                suddenDeathDecidesGame={suddenDeathDecidesGame(
                  gameState.players,
                )}
                useUpgrades={gameState.use_upgrades}
                onOpenRules={onOpenRulesPanel}
                onStepClick={onCloseActions}
                title={
                  isEndPhase && !displayBattleResolution
                    ? `${getOrdinal(selfPlacement)} Place`
                    : undefined
                }
              />
            )}
          </>
        }
        helpers={
          <GuideButton
            onClick={() => onOpenRulesPanel()}
            className={`${isEndPhase ? "hidden sm:inline-block" : ""} ${guideMinimized ? "btn-dot-phone" : ""}`}
          />
        }
        home={
          <HomeButton className={isEndPhase ? "" : "hidden sm:inline-block"} />
        }
        account={
          usesOverlaySidebar ? (
            <button
              onClick={onToggleSidebar}
              className="btn btn-secondary btn-icon"
              data-guide-target="sidebar-toggle"
            >
              ☰
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

export function GameBanner({
  isSpectator,
  spectatePlayer,
  inSuddenDeath,
}: {
  isSpectator: boolean;
  spectatePlayer: string | null;
  inSuddenDeath: boolean;
}): ReactNode {
  if (isSpectator && spectatePlayer) {
    return (
      <Banner
        title={`Watching ${spectatePlayer}`}
        tone={inSuddenDeath ? "sudden-death" : "gold"}
        note={inSuddenDeath ? "Sudden Death" : undefined}
      />
    );
  }
  if (inSuddenDeath) {
    return (
      <Banner
        tone="sudden-death"
        title="Sudden Death"
        note="Loser is eliminated"
        info="Multiple players reached lethal poison. The two with the lowest poison are reset to 9 and face off. A draw causes both players to rebuild. Play continues until one is eliminated."
      />
    );
  }
  return null;
}

interface GameBottomBarProps {
  gameId: string;
  gameState: GameState;
  actionBarPhase: string;
  actionBarBattle: BattleView | null;
  displayBattleResolution: boolean;
  isEndPhase: boolean;
  isSpectator: boolean;
  watchesOutPlayer: boolean;
  canSpectate: boolean;
  shareUrl: string;
  watchUrl: string;
  canRoll: boolean;
  canReady: boolean;
  canContinue: boolean;
  needsUpgrade: boolean;
  selectedUpgradeId: string | null;
  hasPendingBuildUpgrades: boolean;
  hasUnrevealedBattleUpgrades: boolean;
  pendingPhaseAction: PendingPhaseAction;
  buildReadyPending: boolean;
  battleSubmitPending: boolean;
  changingResult: boolean;
  actionMenuOpen: boolean;
  showSubmitHandPopover: boolean;
  showSubmitResultPopover: boolean;
  buildSubmitGuideActive: boolean;
  battleSubmitGuideActive: boolean;
  onDraftRoll: () => void;
  onGoToBuild: () => void;
  onBuildUnready: () => void;
  onBuildReadySubmit: (preference: "play" | "draw") => void;
  onBattleResultSubmit: (result: string) => void;
  onContinue: () => void;
  onOpenUpgradesModal: (
    targetCardId?: string,
    mode?: UpgradesWindowMode,
  ) => void;
  onOpenBattleRevealUpgradesModal: () => void;
  onToggleBuildSubmitPopover: () => void;
  onToggleBattleSubmitPopover: () => void;
  onOpenActionMenu: () => void;
  onCloseSurface: (kind: GameSurfaceKind) => void;
  onStartChangingResult: () => void;
  onCancelChangingResult: () => void;
  onOpenShareModal: () => void;
}

function buildDraftActionSlots(props: GameBottomBarProps): {
  left: ReactNode;
  right: ReactNode;
} {
  const { gameState, canRoll, pendingPhaseAction } = props;
  return {
    left: (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={props.onDraftRoll}
          disabled={!canRoll}
          className="btn btn-game"
          data-guide-target="draft-roll"
        >
          Roll for 1💰
        </button>
        {gameState.self_player.upgrades.length > 0 && (
          <button
            onClick={() => props.onOpenUpgradesModal(undefined, "view")}
            className="btn btn-secondary"
          >
            View Upgrades
          </button>
        )}
      </div>
    ),
    right: (
      <button
        onClick={props.onGoToBuild}
        data-ends-phase
        disabled={isPhaseActionPending(pendingPhaseAction, "draft_done")}
        className="btn btn-primary"
        data-guide-target="draft-continue"
      >
        {DRAFT_DONE_BUTTON_LABEL}
      </button>
    ),
  };
}

function buildBuildActionSlots(props: GameBottomBarProps): {
  left: ReactNode;
  right: ReactNode;
} {
  const { self_player } = props.gameState;
  const left =
    self_player.upgrades.length === 0 ? null : props.hasPendingBuildUpgrades ? (
      <button
        onClick={() => props.onOpenUpgradesModal(undefined, "auto")}
        className="btn btn-game btn-pending"
        data-guide-target="build-apply-upgrade"
      >
        Apply Upgrade
      </button>
    ) : (
      <button
        onClick={() => props.onOpenUpgradesModal(undefined, "view")}
        className="btn btn-secondary"
      >
        View Upgrades
      </button>
    );

  const right = self_player.build_ready ? (
    <div
      className="flex items-center gap-1.5 sm:gap-2"
      data-guide-target="build-submit"
    >
      <span className="text-amber-400 text-sm">Waiting...</span>
      <button onClick={props.onBuildUnready} className="btn btn-secondary">
        Change
      </button>
    </div>
  ) : (
    <div className="relative flex items-center gap-1.5 sm:gap-2">
      <button
        onClick={props.onToggleBuildSubmitPopover}
        disabled={!props.canReady || props.buildReadyPending}
        className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        data-guide-target="build-submit"
      >
        {props.buildReadyPending ? "Submitting..." : BUILD_SUBMIT_BUTTON_LABEL}
      </button>
      {props.showSubmitHandPopover && props.canReady && (
        <SubmitPopover
          options={[
            {
              label: "Play",
              onClick: () => props.onBuildReadySubmit("play"),
              className: "btn btn-success text-sm py-1.5",
            },
            {
              label: "Draw",
              onClick: () => props.onBuildReadySubmit("draw"),
              className: "btn btn-success text-sm py-1.5",
            },
          ]}
          onClose={() => props.onCloseSurface("submitHand")}
          guideTarget="build-submit-popover"
          closeOnOutsideClick
          ignoreOutsideClickSelector={
            props.buildSubmitGuideActive
              ? "[data-guided-tooltip='true']"
              : "[data-guide-target='build-submit']"
          }
        />
      )}
    </div>
  );

  return { left, right };
}

function buildBattleActionSlots(
  props: GameBottomBarProps,
  battle: BattleView,
): { left: ReactNode; right: ReactNode } {
  const { self_player } = props.gameState;
  const { opponent_name, result_submissions } = battle;
  const mySubmission = result_submissions[self_player.name];
  const opponentSubmission = result_submissions[opponent_name];

  const left = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {props.hasUnrevealedBattleUpgrades && (
        <button
          onClick={props.onOpenBattleRevealUpgradesModal}
          className="btn btn-game btn-pending"
          data-guide-target="battle-reveal-upgrade"
        >
          Reveal Upgrade
        </button>
      )}
      <button
        onClick={
          props.actionMenuOpen
            ? () => props.onCloseSurface("actions")
            : props.onOpenActionMenu
        }
        className="btn btn-secondary"
        data-guide-target="battle-actions"
      >
        Actions
      </button>
    </div>
  );

  if (mySubmission && !props.changingResult) {
    const resultsConflict = hasBattleResultConflict({
      mySubmission,
      opponentSubmission,
      isResolved: props.displayBattleResolution,
    });
    return {
      left,
      right: (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className={`text-sm ${resultsConflict ? "text-red-400" : "text-amber-400"}`}
          >
            {resultsConflict ? "Results conflict!" : "Waiting..."}
          </span>
          <button
            onClick={props.onStartChangingResult}
            className="btn btn-secondary"
          >
            Change
          </button>
        </div>
      ),
    };
  }

  return {
    left,
    right: (
      <div className="relative flex items-center gap-1.5 sm:gap-2">
        {props.changingResult && (
          <button
            onClick={() => {
              props.onCancelChangingResult();
              props.onCloseSurface("submitResult");
            }}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        )}
        <button
          onClick={props.onToggleBattleSubmitPopover}
          disabled={props.battleSubmitPending}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          data-guide-target="battle-submit"
        >
          {props.battleSubmitPending
            ? "Submitting..."
            : BATTLE_SUBMIT_BUTTON_LABEL}
        </button>
        {props.showSubmitResultPopover && (
          <SubmitPopover
            options={[
              {
                label: "I Won",
                onClick: () => props.onBattleResultSubmit(self_player.name),
                className: "btn btn-success text-sm py-1.5",
              },
              {
                label: "Draw",
                onClick: () => props.onBattleResultSubmit("draw"),
                className: "btn btn-secondary text-sm py-1.5",
              },
              {
                label: "I Lost",
                onClick: () => props.onBattleResultSubmit(opponent_name),
                className: "btn btn-danger text-sm py-1.5",
              },
            ]}
            onClose={() => props.onCloseSurface("submitResult")}
            guideTarget="battle-submit-popover"
            closeOnOutsideClick
            ignoreOutsideClickSelector={
              props.battleSubmitGuideActive
                ? "[data-guided-tooltip='true']"
                : "[data-guide-target='battle-submit']"
            }
          />
        )}
      </div>
    ),
  };
}

function buildPhaseActionSlots(props: GameBottomBarProps): {
  left: ReactNode;
  right: ReactNode;
} {
  if (props.actionBarPhase === "draft") return buildDraftActionSlots(props);
  if (props.actionBarPhase === "build") return buildBuildActionSlots(props);
  if (props.actionBarPhase === "battle" && props.actionBarBattle) {
    return buildBattleActionSlots(props, props.actionBarBattle);
  }
  if (props.actionBarPhase === "reward") {
    const buttonLabel = props.needsUpgrade
      ? props.selectedUpgradeId
        ? "Claim & Continue"
        : "Select Upgrade"
      : REWARD_CONTINUE_BUTTON_LABEL;
    return {
      left: null,
      right: (
        <button
          onClick={props.onContinue}
          data-ends-phase
          disabled={
            !props.canContinue ||
            isPhaseActionPending(props.pendingPhaseAction, "reward_done")
          }
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          data-guide-target="reward-continue"
        >
          {buttonLabel}
        </button>
      ),
    };
  }
  return { left: null, right: null };
}

export function GameBottomBar(props: GameBottomBarProps) {
  const endOfGame =
    props.isEndPhase && !!props.gameId && !props.displayBattleResolution;
  const slots = endOfGame
    ? { left: null, right: null }
    : buildPhaseActionSlots(props);

  return (
    <BottomBar
      className="relative z-[46]"
      guideTarget="phase-action-bar"
      inert={props.isSpectator && !props.watchesOutPlayer}
      secondary={
        endOfGame ? (
          <>
            <button
              className="btn btn-secondary"
              onClick={() =>
                window.open(props.shareUrl, "_blank", "noopener,noreferrer")
              }
            >
              Review
            </button>
            {props.canSpectate && !props.isSpectator && (
              <button
                onClick={() =>
                  window.open(props.watchUrl, "_blank", "noopener")
                }
                className="btn btn-secondary"
              >
                Spectate
              </button>
            )}
          </>
        ) : (
          slots.left
        )
      }
      main={
        endOfGame ? (
          props.watchesOutPlayer ? (
            props.canSpectate && (
              <button
                className="btn btn-primary"
                onClick={() =>
                  window.open(props.watchUrl, "_blank", "noopener")
                }
              >
                Watch Another
              </button>
            )
          ) : (
            <button
              className="btn btn-primary"
              onClick={props.onOpenShareModal}
            >
              Share Game
            </button>
          )
        ) : (
          slots.right
        )
      }
    />
  );
}
