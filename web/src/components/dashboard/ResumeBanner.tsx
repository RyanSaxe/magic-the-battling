import type { ReactElement } from "react";
import type { ResumableSeat } from "../../hooks/useResumableGames";
import { useResumeSeat } from "../../hooks/useResumeSeat";
import { resumeDetail, resumeHeadline } from "../../utils/accountFormat";
import { SurfaceCard } from "../common/SurfaceCard";
import { CrossIcon } from "../icons/CrossIcon";

/** The lobby or game this browser or its account can go back to, at the top of the dashboard. */
export function ResumeBanner({
  seat,
  onClose,
}: {
  seat: ResumableSeat;
  onClose?: (seat: ResumableSeat) => void;
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
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => resume(seat)}
          className="btn btn-primary flex-1 px-4 py-2 font-semibold sm:flex-none"
        >
          {inGame ? "Resume Game →" : "Return to Lobby →"}
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
    </SurfaceCard>
  );
}
