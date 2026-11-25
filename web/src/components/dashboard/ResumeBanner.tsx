import type { ReactElement } from "react";
import type { ResumableSeat } from "../../hooks/useResumableGames";
import { useResumeSeat } from "../../hooks/useResumeSeat";
import { resumeDetail, resumeHeadline } from "../../utils/accountFormat";
import { SurfaceCard } from "../common/SurfaceCard";
import { CrossIcon } from "../icons/CrossIcon";

function ResumeBannerActions({
  seat,
  title,
  inGame,
  totalCount,
  onResume,
  onClose,
  onShowAll,
}: {
  seat: ResumableSeat;
  title: string;
  inGame: boolean;
  totalCount: number;
  onResume: () => void;
  onClose?: (seat: ResumableSeat) => void;
  onShowAll?: () => void;
}): ReactElement {
  const resumeLabel = inGame ? "Resume Game →" : "Return to Lobby →";
  if (totalCount > 1 && onShowAll) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onShowAll}
          className="btn btn-secondary px-3 py-2 font-medium whitespace-nowrap"
        >
          See all {totalCount}
        </button>
        <button
          type="button"
          onClick={onResume}
          className="btn btn-primary flex-1 px-4 py-2 font-semibold whitespace-nowrap sm:flex-none"
        >
          {resumeLabel}
        </button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onResume}
        className="btn btn-primary flex-1 px-4 py-2 font-semibold sm:flex-none"
      >
        {resumeLabel}
      </button>
      {seat.canClose && onClose && (
        <button
          type="button"
          onClick={() => onClose(seat)}
          aria-label={`${inGame ? "Close" : "Leave"} ${title} as ${seat.playerName}`}
          className="icon-target -mr-2"
        >
          <CrossIcon />
        </button>
      )}
    </div>
  );
}

/** The lobby or game this browser or its account can go back to, at the top of the dashboard. */
export function ResumeBanner({
  seat,
  totalCount = 1,
  onClose,
  onShowAll,
}: {
  seat: ResumableSeat;
  totalCount?: number;
  onClose?: (seat: ResumableSeat) => void;
  onShowAll?: () => void;
}): ReactElement {
  const resume = useResumeSeat();
  const inGame = seat.kind === "game";
  const title = seat.cubeName ?? seat.cubeId;
  return (
    <SurfaceCard
      as="section"
      layout="tile"
      aria-label={inGame ? "Game in progress" : "Lobby waiting"}
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        {seat.cubeImageUri && (
          <img
            src={seat.cubeImageUri}
            alt=""
            className="h-[46px] w-[46px] shrink-0 rounded-[6px] border gold-border object-cover"
          />
        )}
        <div className="min-w-0">
          <div
            className={`flex items-center gap-1.5 text-[10px] leading-4 font-bold uppercase tracking-[0.08em] ${
              inGame ? "text-[#86efac]" : "text-[var(--color-gold-bright)]"
            }`}
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                inGame
                  ? "bg-[#22c55e] shadow-[0_0_6px_#22c55e]"
                  : "bg-[var(--color-gold)]"
              }`}
            />
            {resumeHeadline(seat)}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-[14px] leading-5 font-semibold text-[var(--ivory)]">
              {title}
            </span>
            <span className="text-xs text-[var(--ivory-muted)]">
              {resumeDetail(seat)}
            </span>
          </div>
        </div>
      </div>
      <ResumeBannerActions
        seat={seat}
        title={title}
        inGame={inGame}
        totalCount={totalCount}
        onResume={() => resume(seat)}
        onClose={onClose}
        onShowAll={onShowAll}
      />
    </SurfaceCard>
  );
}
