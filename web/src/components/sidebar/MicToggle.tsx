interface MicToggleProps {
  muted: boolean
  onClick: (e: React.MouseEvent) => void
}

export function MicToggle({ muted, onClick }: MicToggleProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      className={`relative inline-flex items-center justify-center w-6 h-6 rounded transition-colors ${
        muted
          ? 'text-red-400 hover:text-red-300'
          : 'text-indigo-300 hover:text-indigo-200'
      }`}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? <MicOffIcon className="w-3.5 h-3.5" /> : <MicIcon className="w-3.5 h-3.5" />}
    </button>
  )
}

export function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

export function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

export function MicBlockedIndicator() {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[10px] text-red-400/80">
      <MicOffIcon className="w-3 h-3" />
      <span>Mic blocked</span>
    </div>
  )
}
