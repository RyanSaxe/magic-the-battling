import { useEffect } from 'react'
import type { Card as CardType } from '../../types'

interface UpgradeConfirmationModalProps {
  upgrade: CardType
  target: CardType
  onConfirm: () => void
  onCancel: () => void
}

const getImageUrl = (card: CardType) => card.png_url ?? card.image_url

export function UpgradeConfirmationModal({
  upgrade,
  target,
  onConfirm,
  onCancel,
}: UpgradeConfirmationModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white text-lg font-semibold">Apply Upgrade?</div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-400 text-sm">Upgrade</span>
            <img
              src={getImageUrl(upgrade)}
              alt={upgrade.name}
              className="max-h-[35vh] w-auto rounded-lg shadow-2xl"
            />
          </div>
          <div className="text-white text-3xl font-bold">&rarr;</div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-400 text-sm">Target</span>
            <img
              src={getImageUrl(target)}
              alt={target.name}
              className="max-h-[35vh] w-auto rounded-lg shadow-2xl"
            />
          </div>
        </div>
        <div className="text-yellow-500 text-sm">This action cannot be undone</div>
        <div className="flex gap-4 mt-2">
          <button
            className="btn btn-secondary px-6 py-2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary px-6 py-2"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
