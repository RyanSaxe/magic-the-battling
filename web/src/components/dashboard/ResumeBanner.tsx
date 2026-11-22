import type { ResumableSeat } from '../../hooks/useResumableGames'
import { useResumeSeat } from '../../hooks/useResumeSeat'
import { resumeDetail, resumeHeadline } from '../../utils/accountFormat'
import { SurfaceCard } from '../common/SurfaceCard'

/** The lobby or game this browser or its account can go back to, at the top of the dashboard. */
export function ResumeBanner({ seat }: { seat: ResumableSeat }) {
  const resume = useResumeSeat()
  const inGame = seat.kind === 'game'
  return (
    <SurfaceCard
      as="section"
      layout="tile"
      aria-label={inGame ? 'Game in progress' : 'Lobby waiting'}
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        {seat.cubeImageUri && (
          <img src={seat.cubeImageUri} alt="" className="h-[46px] w-[46px] shrink-0 rounded-[7px] border gold-border object-cover" />
        )}
        <div className="min-w-0">
          <div
            className={`flex items-center gap-1.5 text-[10.5px] leading-4 font-bold uppercase tracking-[0.1em] ${
              inGame ? 'text-[#86efac]' : 'text-[var(--color-gold-bright)]'
            }`}
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                inGame ? 'bg-[#22c55e] shadow-[0_0_6px_#22c55e]' : 'bg-[var(--color-gold)]'
              }`}
            />
            {resumeHeadline(seat)}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-[15px] leading-5 font-semibold text-[var(--ivory)]">{seat.cubeName ?? seat.cubeId}</span>
            <span className="text-xs text-[var(--ivory-muted)]">{resumeDetail(seat)}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => resume(seat)}
        className="btn btn-primary w-full shrink-0 px-4 py-2 font-semibold sm:w-auto"
      >
        {inGame ? 'Resume Game →' : 'Return to Lobby →'}
      </button>
    </SurfaceCard>
  )
}
