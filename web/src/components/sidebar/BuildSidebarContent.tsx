import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'

interface BuildSidebarContentProps {
  selectedBasics: string[]
  numBasicsNeeded: number
  handSize: number
  maxHandSize: number
  isReady: boolean
  onAddBasic: (name: string) => void
  onRemoveBasic: (name: string) => void
  onReady: () => void
  onUnready: () => void
}

export function BuildSidebarContent({
  selectedBasics,
  numBasicsNeeded,
  handSize,
  maxHandSize,
  isReady,
  onAddBasic,
  onRemoveBasic,
  onReady,
  onUnready,
}: BuildSidebarContentProps) {
  const countBasic = (basic: string) =>
    selectedBasics.filter((b) => b === basic).length

  const handExceedsLimit = handSize > maxHandSize
  const basicsComplete = selectedBasics.length === numBasicsNeeded
  const canReady = basicsComplete && !handExceedsLimit

  return (
    <div className="space-y-4 mt-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Basic Lands
          </span>
          <span className="text-xs text-gray-400">
            {selectedBasics.length}/{numBasicsNeeded}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BASIC_LANDS.map(({ name }) => {
            const count = countBasic(name)
            return (
              <div key={name} className="flex flex-col items-center">
                <img
                  src={BASIC_LAND_IMAGES[name]}
                  alt={name}
                  className="w-12 h-16 rounded object-cover shadow-lg"
                />
                <div className="flex items-center gap-1 mt-1">
                  <button
                    onClick={() => onRemoveBasic(name)}
                    disabled={count === 0}
                    className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                  >
                    -
                  </button>
                  <span className="text-white text-xs w-3 text-center">
                    {count}
                  </span>
                  <button
                    onClick={() => onAddBasic(name)}
                    disabled={selectedBasics.length >= numBasicsNeeded}
                    className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide">
          Actions
        </div>
        {isReady ? (
          <>
            <div className="text-amber-400 text-sm text-center py-2">
              Waiting for others...
            </div>
            <button
              onClick={onUnready}
              className="btn bg-gray-600 hover:bg-gray-500 text-white w-full"
            >
              Unready
            </button>
          </>
        ) : (
          <button
            onClick={onReady}
            disabled={!canReady}
            className="btn btn-primary w-full"
          >
            Ready
          </button>
        )}
        {handExceedsLimit && !isReady && (
          <div className="text-red-400 text-xs text-center">
            Hand size exceeds limit ({handSize}/{maxHandSize})
          </div>
        )}
      </div>
    </div>
  )
}
