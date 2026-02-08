import type { ReactNode } from 'react'
import { TREASURE_TOKEN_IMAGE, POISON_COUNTER_IMAGE } from '../constants/assets'

interface PlayerStatsBarProps {
  treasures: number
  poison: number
  children?: ReactNode
}

export function PlayerStatsBar({ treasures, poison, children }: PlayerStatsBarProps) {
  return (
    <div className="relative shrink-0">
      {children}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        <div className="relative">
          <img
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="h-10 rounded shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md border border-purple-400">
            {poison}
          </div>
        </div>
        <div className="relative">
          <img
            src={TREASURE_TOKEN_IMAGE}
            alt="Treasure"
            className="h-10 rounded shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 bg-amber-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md border border-amber-400">
            {treasures}
          </div>
        </div>
      </div>
    </div>
  )
}
