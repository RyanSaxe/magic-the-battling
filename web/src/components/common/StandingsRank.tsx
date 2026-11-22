import { getOrdinal } from '../../utils/format'

/** A place as a standings table shows it: the number over its suffix, in a column down a card's left edge. */
export function StandingsRank({ rank, isLast, className }: { rank: number; isLast: boolean; className?: string }) {
  const ordinal = getOrdinal(rank)
  return (
    <span className={['standings-rank', isLast && 'is-last', className].filter(Boolean).join(' ')} title={`${ordinal} place`}>
      <span className="standings-rank-number">{rank}</span>
      <span className="standings-rank-suffix">{ordinal.slice(-2)}</span>
    </span>
  )
}
