import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameSummary } from '../../types'
import { cubeTitle, formatWhen, modeLabel, seatsLabel, upgradesLabel } from '../../utils/accountFormat'
import { SurfaceCard } from '../common/SurfaceCard'
import { StandingsRank } from '../common/StandingsRank'

const MAX_HAND_CARDS = 7
const HAND_OVERLAP_PX = 8
const HAND_MAX_HEIGHT_PX = 111

type CardImageSize = 'small' | 'normal'

function scryfallImage(id: string, size: CardImageSize): string {
  return `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg`
}

interface HandSizing {
  box: string
  row: string
}

/**
 * The short sizing: the box is as tall as the cards, up to HAND_MAX_HEIGHT_PX, so a narrow card leaves no gap around
 * a hand that had to shrink.
 */
const SHORT_HAND: HandSizing = { box: '[container-type:inline-size]', row: 'justify-center' }

/** A game tile's hand is as tall as the box its card gives it, or takes the short sizing beside the cubes. */
const TILE_HAND: HandSizing = {
  box: 'min-h-[60px] flex-1 [container-type:size] [--hand-room:100cqh] beside-cubes:min-h-0 beside-cubes:flex-none beside-cubes:[container-type:inline-size] beside-cubes:[--hand-room:initial]',
  row: 'beside-cubes:justify-center',
}

/** The final hand, overlapping like a fan, and shrinking to fit the box's width. */
function HandFan({
  scryfallIds,
  sizing,
  imageSize = 'small',
}: {
  scryfallIds: string[]
  sizing: HandSizing
  imageSize?: CardImageSize
}) {
  const cards = scryfallIds.slice(0, MAX_HAND_CARDS)
  if (cards.length === 0) return null
  const fitsWidth = `calc((100cqw + ${HAND_OVERLAP_PX * (cards.length - 1)}px) / ${cards.length} * 1.4)`
  const height = `min(var(--hand-room, ${HAND_MAX_HEIGHT_PX}px), ${fitsWidth})`
  return (
    <div className={sizing.box}>
      <div className={`flex h-full items-center ${sizing.row}`}>
        {cards.map((id, index) => (
          <img
            key={`${id}-${index}`}
            src={scryfallImage(id, imageSize)}
            alt=""
            loading="lazy"
            className="aspect-[5/7] rounded-[4px] border border-black/60 bg-black/60 object-cover"
            style={{ height, marginLeft: index === 0 ? 0 : -HAND_OVERLAP_PX }}
          />
        ))}
      </div>
    </div>
  )
}

function recapPath(game: GameSummary): string {
  return `/game/${game.game_id}/share/${encodeURIComponent(game.best_human_name)}`
}

/** The rank down a game card's left edge, red for last place, where the card shows a placement. */
function GameRank({ game }: { game: GameSummary }) {
  if (game.best_human_placement === null) return null
  return (
    <StandingsRank
      rank={game.best_human_placement}
      isLast={game.best_human_placement === game.player_count}
      className="w-9 shrink-0"
    />
  )
}

/**
 * Who played and the table on the left; when and the settings on the right, so each side reads as two lines.
 * The arrow after the date is the recap's link, as the whole card opens it too.
 */
function GameHeader({ title, href, game }: { title: string; href: string; game: GameSummary }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm leading-5 font-semibold text-[var(--ivory)]">
          <Link to={href} onClick={(e) => e.stopPropagation()}>{title}</Link>
        </h3>
        <p className="truncate text-[11px] leading-4 text-[var(--ivory-muted)]">
          {seatsLabel(game.human_count, game.player_count - game.human_count)}
        </p>
      </div>
      <div className="shrink-0 text-right text-[11px] text-[var(--ivory-muted)]">
        <p className="leading-5">
          {formatWhen(game.created_at)}{' '}
          <Link to={href} onClick={(e) => e.stopPropagation()} aria-label="View recap" className="font-semibold text-amber-400">
            →
          </Link>
        </p>
        <p className="leading-4">{modeLabel(game.play_mode)} · {upgradesLabel(game.use_upgrades ?? true)}</p>
      </div>
    </div>
  )
}

const GAME_CARD_CLASS =
  'flex overflow-hidden cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(255,236,181,0.58)]'

interface GameTileProps {
  game: GameSummary
  className?: string
  style?: CSSProperties
}

/** A finished game: the player's placement, the cube, the table, the date, the settings and final hand. Opens its recap. */
export function GameTile({ game, className, style }: GameTileProps) {
  const navigate = useNavigate()
  const href = recapPath(game)
  return (
    <SurfaceCard
      as="article"
      layout="tile"
      onClick={() => navigate(href)}
      style={style}
      className={`${GAME_CARD_CLASS} ${className ?? ''}`}
    >
      <GameRank game={game} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-2.5 beside-cubes:py-3">
        <GameHeader title={cubeTitle(game)} href={href} game={game} />
        <HandFan scryfallIds={game.hand_scryfall_ids} sizing={TILE_HAND} />
      </div>
    </SurfaceCard>
  )
}

/** A game in a cube's history, shown by one seat: its placement, name, table, date, settings and final hand. */
export function RecapCard({ game }: { game: GameSummary }) {
  const navigate = useNavigate()
  const href = recapPath(game)
  return (
    <SurfaceCard as="article" layout="tile" onClick={() => navigate(href)} className={GAME_CARD_CLASS}>
      <GameRank game={game} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <GameHeader title={game.best_human_name} href={href} game={game} />
        {game.hand_scryfall_ids.length > 0 && (
          <HandFan scryfallIds={game.hand_scryfall_ids} sizing={SHORT_HAND} imageSize="normal" />
        )}
      </div>
    </SurfaceCard>
  )
}
