import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameSummary } from '../../types'
import { cubeTitle, formatWhen, gameMeta, modeLabel, seatsLabel, upgradesLabel } from '../../utils/accountFormat'
import { getOrdinal, getPlacementBadgeColor } from '../../utils/format'
import { SurfaceCard } from '../common/SurfaceCard'
import { Chip } from './CubeTile'

const MAX_HAND_CARDS = 7
const HAND_OVERLAP_PX = 8

export function PlacementBadge({ placement, playerCount }: { placement: number; playerCount: number }) {
  const { bg, text } = getPlacementBadgeColor(placement, playerCount)
  return (
    <span
      className="inline-flex h-[22px] min-w-[38px] shrink-0 items-center justify-center rounded-full px-2 text-[11px] leading-4 font-extrabold uppercase tracking-[0.04em] tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {getOrdinal(placement)}
    </span>
  )
}

type CardImageSize = 'small' | 'normal'

function scryfallImage(id: string, size: CardImageSize): string {
  return `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg`
}

/**
 * The final hand, overlapping like a fan. The cards grow to fill the box the card gives them, so a
 * game card stretched to match its row still looks full, and they shrink to fit the box's width.
 */
function HandFan({
  scryfallIds,
  className = 'min-h-[60px] flex-1',
  imageSize = 'small',
  centered = false,
}: {
  scryfallIds: string[]
  className?: string
  imageSize?: CardImageSize
  centered?: boolean
}) {
  const cards = scryfallIds.slice(0, MAX_HAND_CARDS)
  if (cards.length === 0) return null
  const fitsWidth = `calc((100cqw + ${HAND_OVERLAP_PX * (cards.length - 1)}px) / ${cards.length} * 1.4)`
  return (
    <div className={`${className} [container-type:size]`}>
      <div className={`flex h-full items-center ${centered ? 'justify-center' : ''}`}>
        {cards.map((id, index) => (
          <img
            key={`${id}-${index}`}
            src={scryfallImage(id, imageSize)}
            alt=""
            loading="lazy"
            className="aspect-[5/7] rounded-[4px] border border-black/60 bg-black/60 object-cover"
            style={{ height: `min(100cqh, ${fitsWidth})`, marginLeft: index === 0 ? 0 : -HAND_OVERLAP_PX }}
          />
        ))}
      </div>
    </div>
  )
}

function recapPath(game: GameSummary): string {
  return `/game/${game.game_id}/share/${encodeURIComponent(game.best_human_name)}`
}

interface GameTileProps {
  game: GameSummary
  className?: string
  style?: CSSProperties
}

/** A finished game: the cube, the table, the date, the player's placement and final hand. Opens its recap. */
export function GameTile({ game, className, style }: GameTileProps) {
  const navigate = useNavigate()
  const href = recapPath(game)
  return (
    <SurfaceCard
      as="article"
      layout="tile"
      onClick={() => navigate(href)}
      style={style}
      className={`flex flex-col gap-2 px-3 py-2.5 cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(255,236,181,0.58)] ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] leading-5 font-semibold text-amber-50">
            <Link to={href} onClick={(e) => e.stopPropagation()}>{cubeTitle(game)}</Link>
          </h3>
          <p className="truncate text-[11px] leading-4 text-amber-100/60">{gameMeta(game)}</p>
        </div>
        {game.best_human_placement !== null && (
          <PlacementBadge placement={game.best_human_placement} playerCount={game.player_count} />
        )}
      </div>
      <HandFan scryfallIds={game.hand_scryfall_ids} />
    </SurfaceCard>
  )
}

/** A game in a cube's history, shown by one seat: its placement, name, table, final hand and settings. */
export function RecapCard({ game }: { game: GameSummary }) {
  const navigate = useNavigate()
  const href = recapPath(game)
  return (
    <SurfaceCard
      as="article"
      layout="tile"
      onClick={() => navigate(href)}
      className="flex flex-col gap-2.5 p-3 cursor-pointer transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(255,236,181,0.58)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {game.best_human_placement !== null && (
            <PlacementBadge placement={game.best_human_placement} playerCount={game.player_count} />
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-amber-50">
              <Link to={href} onClick={(e) => e.stopPropagation()}>{game.best_human_name}</Link>
            </h3>
            <p className="truncate text-[11px] leading-4 text-amber-100/60">
              {seatsLabel(game.human_count, game.player_count - game.human_count)}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] leading-4 text-amber-100/60">{formatWhen(game.created_at)}</span>
      </div>
      {game.hand_scryfall_ids.length > 0 && (
        <HandFan scryfallIds={game.hand_scryfall_ids} className="h-[111px]" imageSize="normal" centered />
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip>{modeLabel(game.play_mode)}</Chip>
          <Chip>{upgradesLabel(game.use_upgrades ?? true)}</Chip>
        </div>
        <span className="shrink-0 text-xs font-semibold text-amber-400">View Recap →</span>
      </div>
    </SurfaceCard>
  )
}
