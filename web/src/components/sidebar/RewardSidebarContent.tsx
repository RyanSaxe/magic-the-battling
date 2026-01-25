interface RewardSidebarContentProps {
  canContinue: boolean
  buttonLabel: string
  onContinue: () => void
}

export function RewardSidebarContent({
  canContinue,
  buttonLabel,
  onContinue,
}: RewardSidebarContentProps) {
  return (
    <div className="space-y-4 mt-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide">
        Actions
      </div>
      <button
        onClick={onContinue}
        disabled={!canContinue}
        className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {buttonLabel}
      </button>
    </div>
  )
}
