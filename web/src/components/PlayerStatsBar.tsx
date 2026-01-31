import { TREASURE_TOKEN_IMAGE, POISON_COUNTER_IMAGE } from '../constants/assets'

interface PlayerStatsBarProps {
  treasures: number
  poison: number
}

export function PlayerStatsBar({ treasures, poison }: PlayerStatsBarProps) {
  return (
    <>
      <div className="absolute top-4 left-4 z-10">
        <div className="relative">
          <img
            src={POISON_COUNTER_IMAGE}
            alt="Poison"
            className="h-24 rounded-lg shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 bg-purple-600 text-white text-lg font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-md border-2 border-purple-400">
            {poison}
          </div>
        </div>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <div className="relative">
          <img
            src={TREASURE_TOKEN_IMAGE}
            alt="Treasure"
            className="h-24 rounded-lg shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 bg-amber-600 text-white text-lg font-bold rounded-full w-8 h-8 flex items-center justify-center shadow-md border-2 border-amber-400">
            {treasures}
          </div>
        </div>
      </div>
    </>
  )
}
