import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { closeSeat } from '../api/client'
import type { ResumableSeat } from '../hooks/useResumableGames'
import { unknownToAppError, type AppError } from '../utils/appError'
import { forgetSeatForGame, getRememberedSeat } from '../utils/deviceIdentity'
import { formatTimeSince } from '../utils/format'
import { Dialog } from './common/Dialog'
import { CubeArt } from './dashboard/CubeArt'
import { CrossIcon } from './icons/CrossIcon'

const ROWS_SHOWN = 2
const CLOSE_COLUMN = 'w-11 shrink-0'
// A longer cube name takes two lines in a shelf row, whose height is fixed.
const ONE_LINE_TITLE = 24

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

function closeWords(seat: ResumableSeat) {
  return seat.kind === 'game'
    ? { title: 'Close this game?', warning: "You won't be able to come back to it.", confirm: 'Close Game' }
    : { title: 'Leave this lobby?', warning: "You'll give up your seat.", confirm: 'Leave Lobby' }
}

function SeatArt({ seat }: { seat: ResumableSeat }) {
  return <span className="resume-art">{seat.cubeImageUri && <CubeArt src={seat.cubeImageUri} />}</span>
}

/** The cube, then whose seat it is and where it stands. A line that doesn't fit wraps between those, never inside. */
function SeatSummary({ seat, lead }: { seat: ResumableSeat; lead?: string }) {
  return (
    <span className="resume-summary">
      <span className="resume-title">{seatTitle(seat)}</span>
      <span className="resume-detail">
        {lead && `${lead} `}
        {seat.playerName}
        {' · '}
        {seat.kind === 'lobby' ? (
          <span className="whitespace-nowrap">{seat.joinCode ? `Lobby ${seat.joinCode}` : 'Lobby'}</span>
        ) : (
          <>
            <span className="whitespace-nowrap">
              Stage {seat.stage}-{seat.round}
            </span>
            {seat.lastActiveAt && (
              <>
                {' · '}
                <span className="whitespace-nowrap">{formatTimeSince(seat.lastActiveAt)}</span>
              </>
            )}
          </>
        )}
      </span>
    </span>
  )
}

function ResumeRow({
  seat,
  hasCloseColumn,
  onClose,
}: {
  seat: ResumableSeat
  hasCloseColumn: boolean
  onClose: (seat: ResumableSeat) => void
}) {
  const navigate = useNavigate()
  return (
    <li className={`resume-row ${seatTitle(seat).length > ONE_LINE_TITLE ? 'is-long' : ''}`}>
      <button
        type="button"
        onClick={() => navigate(seatPath(seat))}
        aria-label={`${actionWord(seat)} ${seatTitle(seat)} as ${seat.playerName}`}
        className="resume-open"
      >
        <SeatArt seat={seat} />
        <SeatSummary seat={seat} lead={`${actionWord(seat)} as`} />
        <span aria-hidden="true" className="resume-chevron">›</span>
      </button>
      {seat.canClose ? (
        <button
          type="button"
          onClick={() => onClose(seat)}
          aria-label={`${seat.kind === 'game' ? 'Close' : 'Leave'} ${seatTitle(seat)} as ${seat.playerName}`}
          className="icon-target self-center"
        >
          <CrossIcon />
        </button>
      ) : (
        hasCloseColumn && <span aria-hidden="true" className={CLOSE_COLUMN} />
      )}
    </li>
  )
}

/** Asks before this browser's seat ends for good, and says why when it can't. */
export function CloseSeatDialog({
  seat,
  onKeep,
  onClosed,
}: {
  seat: ResumableSeat
  onKeep: () => void
  onClosed: () => void
}) {
  const [closing, setClosing] = useState(false)
  const [failure, setFailure] = useState<AppError | null>(null)
  const words = closeWords(seat)
  const refused = failure?.status === 409

  const close = async () => {
    setClosing(true)
    try {
      await closeSeat(seat.gameId, seat.playerName, getRememberedSeat(seat.gameId)?.seatToken ?? '')
    } catch (error) {
      const appError = unknownToAppError(error, 'default', "Couldn't close it. Try again.")
      // A game or seat that's already gone is as closed as this could make it.
      if (appError.code !== 'GAME_NOT_FOUND' && appError.code !== 'PLAYER_NOT_IN_GAME') {
        setFailure(appError)
        setClosing(false)
        return
      }
    }
    forgetSeatForGame(seat.gameId)
    onClosed()
  }

  return (
    <Dialog title={words.title} onClose={onKeep}>
      <div className="flex items-center gap-2.5">
        <SeatArt seat={seat} />
        <SeatSummary seat={seat} />
      </div>
      <p role="status" className="mt-4 text-sm leading-relaxed text-[var(--ivory-muted)]">
        {failure?.message ?? words.warning}
      </p>
      <div className={`mt-5 grid gap-2 ${refused ? '' : 'grid-cols-2'}`}>
        <button type="button" onClick={onKeep} className="btn btn-secondary px-2! whitespace-nowrap">
          Keep
        </button>
        {!refused && (
          <button
            type="button"
            onClick={close}
            disabled={closing}
            className="btn btn-secondary btn-destructive px-2! whitespace-nowrap"
          >
            {words.confirm}
          </button>
        )}
      </div>
    </Dialog>
  )
}

/**
 * Play's shelf of the games and lobbies this browser can go back to: two of them, or the first and a way to the rest.
 * It keeps their room when there are fewer, so nothing above it moves as they load or close.
 */
export function ResumeShelf({
  seats,
  onClose,
  onShowAll,
}: {
  seats: ResumableSeat[]
  onClose: (seat: ResumableSeat) => void
  onShowAll: (byKeyboard: boolean) => void
}) {
  const hasMore = seats.length > ROWS_SHOWN
  const shown = hasMore ? seats.slice(0, 1) : seats
  const hasCloseColumn = seats.some((seat) => seat.canClose)
  return (
    <div className="resume-space">
      {seats.length > 0 && (
        <section aria-label="In progress" className="resume-shelf">
          <ul className="resume-items">
            {shown.map((seat) => (
              <ResumeRow key={seat.gameId} seat={seat} hasCloseColumn={hasCloseColumn} onClose={onClose} />
            ))}
            {hasMore && (
              <li className="resume-row">
                <button
                  type="button"
                  onClick={(event) => onShowAll(event.detail === 0)}
                  className={`resume-open ${hasCloseColumn ? 'has-close-space' : ''}`}
                >
                  <SeatArt seat={seats[1]} />
                  <span className="resume-summary">
                    <span className="resume-title">{seats.length - 1} more games</span>
                    <span className="resume-detail">Show all {seats.length} games to resume</span>
                  </span>
                  <span aria-hidden="true" className="resume-chevron">›</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Every game and lobby this browser can go back to, in place of the setup for a new game. */
export function ResumeList({ seats, onClose }: { seats: ResumableSeat[]; onClose: (seat: ResumableSeat) => void }) {
  const hasCloseColumn = seats.some((seat) => seat.canClose)
  return (
    <section aria-label="In progress" className="resume-all">
      <ul className="resume-items">
        {seats.map((seat) => (
          <ResumeRow key={seat.gameId} seat={seat} hasCloseColumn={hasCloseColumn} onClose={onClose} />
        ))}
      </ul>
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
