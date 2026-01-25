import { TREASURE_TOKEN_IMAGE } from '../../constants/assets'

interface DraftSidebarContentProps {
  treasures: number
  canRoll: boolean
  onRoll: () => void
  onDone: () => void
}

export function DraftSidebarContent({
  treasures,
  canRoll,
  onRoll,
  onDone,
}: DraftSidebarContentProps) {
  return (
    <div className="space-y-4 mt-4">
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
          Resources
        </div>
        <div className="flex items-center gap-2 bg-black/30 rounded-lg p-3">
          <img
            src={TREASURE_TOKEN_IMAGE}
            alt="Treasure"
            className="w-8 h-10 rounded object-cover"
          />
          <span className="text-white font-medium">{treasures}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide">
          Actions
        </div>
        <button
          onClick={onRoll}
          disabled={!canRoll}
          className="btn btn-secondary w-full text-sm"
        >
          Roll Pack (1 💰)
        </button>
        <button
          onClick={onDone}
          className="btn btn-primary w-full"
        >
          Done Drafting
        </button>
      </div>
    </div>
  )
}
