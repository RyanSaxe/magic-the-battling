import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ResumableSeat } from '../hooks/useResumableGames'
import { formatTimeSince } from '../utils/format'

const ROWS_SHOWN = 2
const SECTION_CAPTION = 'text-[10px] leading-4 font-bold uppercase tracking-[0.12em] text-[var(--ivory-muted)]'

function seatPath(seat: ResumableSeat): string {
  return `/game/${seat.gameId}/${seat.kind === 'lobby' ? 'lobby' : 'play'}`
}

function StatusDot({ kind }: { kind: ResumableSeat['kind'] }) {
  return (
    <span
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${
        kind === 'game' ? 'bg-green-500 shadow-[0_0_6px_#22c55e]' : 'bg-amber-500'
      }`}
    />
  )
}

function seatTitle(seat: ResumableSeat): string {
  return seat.cubeName ?? seat.cubeId
}

function actionWord(seat: ResumableSeat): string {
  return seat.kind === 'game' ? 'Resume' : 'Return'
}

function SeatArt({ seat }: { seat: ResumableSeat }) {
  return (
    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border gold-border bg-[var(--art-fade)] max-[359px]:hidden">
      {seat.cubeImageUri && <img src={seat.cubeImageUri} alt="" className="h-full w-full object-cover" />}
    </span>
  )
}

/**
 * The cube, then one line that never wraps: the player's name is cut first, and the word Stage goes on a narrow
 * line, so the stage and time always show whole.
 */
function SeatSummary({ seat }: { seat: ResumableSeat }) {
  return (
    <span className="@container block min-w-0 flex-1 text-left">
      <span className="block truncate text-sm leading-5 font-semibold text-[var(--ivory)]">{seatTitle(seat)}</span>
      <span className="flex min-w-0 whitespace-nowrap text-xs leading-4 text-[var(--ivory-muted)]">
        <span className="min-w-0 truncate">{seat.playerName}</span>
        <span className="shrink-0">
          <span className="whitespace-pre"> · </span>
          {seat.kind === 'lobby' ? (
            seat.joinCode ? `Lobby ${seat.joinCode}` : 'Lobby'
          ) : (
            <>
              <span className="whitespace-pre @max-[184px]:hidden">Stage </span>
              {seat.stage}-{seat.round}
              {seat.lastActiveAt && <span className="whitespace-pre"> · {formatTimeSince(seat.lastActiveAt)}</span>}
            </>
          )}
        </span>
      </span>
    </span>
  )
}

function ResumeRow({ seat }: { seat: ResumableSeat }) {
  const navigate = useNavigate()
  return (
    <li className="flex items-stretch border-t gold-divider first:border-t-0">
      <button
        type="button"
        onClick={() => navigate(seatPath(seat))}
        aria-label={`${actionWord(seat)} ${seatTitle(seat)} as ${seat.playerName}`}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded py-1.5 hover:bg-[var(--stone)] hover:[--ivory-muted:var(--ivory-soft)]"
      >
        <SeatArt seat={seat} />
        <SeatSummary seat={seat} />
        <span className="shrink-0 text-xs font-semibold text-[var(--ivory)]">
          <span className="max-[359px]:hidden">{actionWord(seat)} </span>
          <span aria-hidden="true" className="text-base leading-none">›</span>
        </span>
      </button>
    </li>
  )
}

/** The lobbies and games this browser can go back to, a line each, above the setup for a new game. */
export function ResumeRows({ seats }: { seats: ResumableSeat[] }) {
  const [showsAll, setShowsAll] = useState(false)
  if (seats.length === 0) return null

  const shown = showsAll ? seats : seats.slice(0, ROWS_SHOWN)
  return (
    <section aria-label="In progress" className="mb-3">
      <h2 className={SECTION_CAPTION}>In progress</h2>
      <ul>
        {shown.map((seat) => (
          <ResumeRow key={seat.gameId} seat={seat} />
        ))}
      </ul>
      {shown.length < seats.length && (
        <button
          type="button"
          onClick={() => setShowsAll(true)}
          className="flex h-9 w-full items-center justify-between border-t gold-divider text-xs font-semibold text-[var(--ivory)] max-sm:h-11"
        >
          {seats.length - shown.length} more <span aria-hidden="true" className="text-base leading-none">▾</span>
        </button>
      )}
      <div className="border-t gold-border pt-3">
        <h2 className={SECTION_CAPTION}>New game</h2>
      </div>
    </section>
  )
}

/** One line for the most recent lobby or game, for pages without room for a card. */
export function ResumeGameStrip({ seat }: { seat: ResumableSeat }) {
  const navigate = useNavigate()
  const since = seat.kind === 'game' && seat.lastActiveAt ? ` · last played ${formatTimeSince(seat.lastActiveAt)}` : ''
  return (
    <div className="mb-4 flex w-full max-w-[30rem] shrink-0 items-center gap-2.5 rounded-lg border gold-border bg-black/35 py-1.5 pl-3 pr-1.5">
      <StatusDot kind={seat.kind} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ivory)]">
        {seat.kind === 'game' ? 'Game in progress' : 'Lobby waiting'} as{' '}
        <b className="font-semibold text-white">{seat.playerName}</b>
        <span className="hidden sm:inline">{since}</span>
      </span>
      <button onClick={() => navigate(seatPath(seat))} className="btn btn-primary shrink-0 px-3 py-1 text-sm">
        {seat.kind === 'game' ? 'Resume' : 'Return'}
      </button>
    </div>
  )
}
