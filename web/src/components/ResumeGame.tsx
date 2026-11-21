import { useNavigate } from 'react-router-dom'
import type { ResumableSeat } from '../hooks/useResumableGames'
import { formatTimeSince } from '../utils/format'

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

function seatDetail(seat: ResumableSeat): string {
  if (seat.kind === 'lobby') return seat.joinCode ? `Lobby · code ${seat.joinCode}` : 'Lobby'
  return seat.lastActiveAt ? `In progress · last played ${formatTimeSince(seat.lastActiveAt)}` : 'In progress'
}

/** A card for a lobby or game this browser can go back to. */
export function ResumeGameCard({ seat }: { seat: ResumableSeat }) {
  const navigate = useNavigate()
  return (
    <div className="mb-4 rounded-lg border gold-border bg-black/35 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-amber-300/85">
        <StatusDot kind={seat.kind} />
        {seat.kind === 'game' ? 'Game in progress' : 'Lobby waiting'}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white">as {seat.playerName}</div>
          <div className="text-xs text-gray-400">{seatDetail(seat)}</div>
        </div>
        <button onClick={() => navigate(seatPath(seat))} className="btn btn-primary shrink-0 px-4 py-1.5 text-sm">
          {seat.kind === 'game' ? 'Resume' : 'Return'}
        </button>
      </div>
    </div>
  )
}

/** One line for the most recent lobby or game, for pages without room for a card. */
export function ResumeGameStrip({ seat }: { seat: ResumableSeat }) {
  const navigate = useNavigate()
  const since = seat.kind === 'game' && seat.lastActiveAt ? ` · last played ${formatTimeSince(seat.lastActiveAt)}` : ''
  return (
    <div className="mb-4 flex w-full max-w-[30rem] shrink-0 items-center gap-2.5 rounded-lg border gold-border bg-black/35 py-1.5 pl-3 pr-1.5">
      <StatusDot kind={seat.kind} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-gray-200">
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
