import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ResumableSeat } from '../hooks/useResumableGames'
import { useResumeSeat } from '../hooks/useResumeSeat'
import { countLabel } from '../utils/accountFormat'
import { unknownToAppError, type AppError } from '../utils/appError'
import { getRememberedSeat } from '../utils/deviceIdentity'
import { endSeat } from '../utils/endSeat'
import { formatTimeSince } from '../utils/format'
import { Dialog } from './common/Dialog'
import { CubeArt } from './dashboard/CubeArt'
import { CrossIcon } from './icons/CrossIcon'

const ROWS_SHOWN = 2
const CLOSE_COLUMN = 'w-11 shrink-0'
// A longer cube name takes two lines in a shelf row, whose height is fixed.
const ONE_LINE_TITLE = 24

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

function StageColumn({ seat }: { seat: ResumableSeat }) {
  return (
    <span className="resume-stage">
      {seat.kind === 'lobby' ? (
        <span className="resume-stage-lobby">Lobby</span>
      ) : (
        <>
          <span className="resume-stage-number">
            {seat.stage}-{seat.round}
          </span>
          <span className="resume-stage-word">Stage</span>
        </>
      )}
    </span>
  )
}

function SeatFact({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={className}>
      {' · '}
      <span className="whitespace-nowrap">{children}</span>
    </span>
  )
}

function SinceFact({ seat }: { seat: ResumableSeat }) {
  if (!seat.lastActiveAt) return null
  return <SeatFact className="resume-since">{formatTimeSince(seat.lastActiveAt)}</SeatFact>
}

/** The cube, then whose seat it is and its facts. A line that doesn't fit wraps between those, never inside. */
function SeatSummary({ seat, children }: { seat: ResumableSeat; children: ReactNode }) {
  return (
    <span className="resume-summary">
      <span className="resume-title">{seatTitle(seat)}</span>
      <span className="resume-detail">
        {seat.playerName}
        {children}
      </span>
    </span>
  )
}

function ResumeSeatSummary({ seat }: { seat: ResumableSeat }) {
  const inLobby = seat.kind === 'lobby'
  return (
    <SeatSummary seat={seat}>
      <SeatFact>{inLobby ? `${seat.playerCount} seated` : countLabel(seat.playerCount, 'player')}</SeatFact>
      {inLobby ? seat.joinCode && <SeatFact>{seat.joinCode}</SeatFact> : <SinceFact seat={seat} />}
    </SeatSummary>
  )
}

function ResumeButton({ seat }: { seat: ResumableSeat }) {
  const resume = useResumeSeat()
  return (
    <button
      type="button"
      onClick={() => resume(seat)}
      aria-label={`${actionWord(seat)} ${seatTitle(seat)} as ${seat.playerName}`}
      className="resume-open"
    >
      <StageColumn seat={seat} />
      <SeatArt seat={seat} />
      <ResumeSeatSummary seat={seat} />
      <span aria-hidden="true" className="resume-chevron">›</span>
    </button>
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
  return (
    <li className={`resume-row ${seatTitle(seat).length > ONE_LINE_TITLE ? 'is-long' : ''}`}>
      <ResumeButton seat={seat} />
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

/** One row for Board's sidebar: Stage column and facts from the same owner, without a thumbnail or chevron. */
export function ResumeBoardRow({ seat, onClose }: { seat: ResumableSeat; onClose: (seat: ResumableSeat) => void }) {
  const resume = useResumeSeat()
  return (
    <li className={`board-game ${seatTitle(seat).length > ONE_LINE_TITLE ? 'is-long' : ''}`}>
      <button
        type="button"
        onClick={() => resume(seat)}
        aria-label={`${actionWord(seat)} ${seatTitle(seat)} as ${seat.playerName}`}
        className={`board-game-open ${seat.canClose ? 'has-close' : ''}`}
      >
        <StageColumn seat={seat} />
        <ResumeSeatSummary seat={seat} />
      </button>
      {seat.canClose && (
        <button
          type="button"
          className="icon-target board-game-close"
          onClick={() => onClose(seat)}
          aria-label={`${seat.kind === 'game' ? 'Close' : 'Leave'} ${seatTitle(seat)} as ${seat.playerName}`}
        >
          <CrossIcon />
        </button>
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
      await endSeat(seat.gameId, seat.playerName, getRememberedSeat(seat.gameId)?.seatToken ?? '')
    } catch (error) {
      setFailure(unknownToAppError(error, 'default', "Couldn't close it. Try again."))
      setClosing(false)
      return
    }
    onClosed()
  }

  return (
    <Dialog title={words.title} onClose={onKeep}>
      <div className="flex items-center gap-2.5">
        <SeatArt seat={seat} />
        <SeatSummary seat={seat}>
          {seat.kind === 'lobby' ? (
            <SeatFact>{seat.joinCode ? `Lobby ${seat.joinCode}` : 'Lobby'}</SeatFact>
          ) : (
            <>
              <SeatFact>
                Stage {seat.stage}-{seat.round}
              </SeatFact>
              <SinceFact seat={seat} />
            </>
          )}
        </SeatSummary>
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
          <ul className={`resume-items ${hasCloseColumn ? '' : 'has-no-close'}`}>
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
                  <span aria-hidden="true" className="resume-stage">
                    <span className="resume-stage-number">+{seats.length - 1}</span>
                  </span>
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
      <ul className={`resume-items ${hasCloseColumn ? '' : 'has-no-close'}`}>
        {seats.map((seat) => (
          <ResumeRow key={seat.gameId} seat={seat} hasCloseColumn={hasCloseColumn} onClose={onClose} />
        ))}
      </ul>
    </section>
  )
}

/** Home's shelf, pinned under its felt: the most recent game or lobby, and the way to Play's list of the others. */
export function HomeResumeShelf({ seats }: { seats: ResumableSeat[] }) {
  const navigate = useNavigate()
  if (seats.length === 0) return null
  return (
    <section aria-label="In progress" className="resume-shelf home-shelf">
      <div className="home-shelf-row">
        <ResumeButton seat={seats[0]} />
        {seats.length > 1 && (
          <button type="button" onClick={() => navigate('/play')} className="home-shelf-more">
            +{seats.length - 1} more
          </button>
        )}
      </div>
    </section>
  )
}
