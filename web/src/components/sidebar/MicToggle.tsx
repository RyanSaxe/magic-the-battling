import type { VoicePeer } from '../../hooks/useVoiceChat'

interface MicToggleProps {
  muted: boolean
  onClick: (e: React.MouseEvent) => void
  variant?: 'default' | 'player-row'
  speaking?: boolean
  connectionState?: VoicePeer['connectionState']
}

function getMicVisual(props: Pick<MicToggleProps, 'muted' | 'connectionState'>) {
  const { muted, connectionState } = props

  if (connectionState === 'connecting') {
    return { icon: 'mic', color: 'text-gray-400', animation: 'animate-mic-connecting', title: 'Connecting...' }
  }
  if (connectionState === 'failed') {
    return { icon: 'warning', color: 'text-amber-400', animation: '', title: 'Connection failed' }
  }
  if (connectionState === 'disconnected') {
    return { icon: 'warning', color: 'text-gray-500', animation: '', title: 'Disconnected' }
  }
  if (muted) {
    return { icon: 'off', color: 'text-red-400 hover:text-red-300', animation: '', title: 'Unmute' }
  }
  return { icon: 'mic', color: 'text-indigo-300 hover:text-indigo-200', animation: '', title: 'Mute' }
}

export function MicToggle({ muted, onClick, variant = 'default', speaking, connectionState }: MicToggleProps) {
  const isPlayerRow = variant === 'player-row'
  const visual = getMicVisual({ muted, connectionState })
  const showGlow = speaking && !muted && visual.icon === 'mic'

  const iconEl = visual.icon === 'warning'
    ? <MicWarningIcon className="w-3.5 h-3.5" />
    : visual.icon === 'off'
      ? <MicOffIcon className="w-3.5 h-3.5" />
      : <MicIcon className="w-3.5 h-3.5" />

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      className={`relative inline-flex items-center rounded transition-colors ${
        isPlayerRow
          ? 'h-6 w-4 shrink-0 justify-start'
          : 'h-6 w-6 justify-center'
      } ${visual.color}${visual.animation ? ` ${visual.animation}` : ''}${showGlow ? ' animate-mic-speaking' : ''}`}
      title={visual.title}
    >
      {iconEl}
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

export function MicWarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <path d="M20 16l-1.5 3h3L20 16Z" fill="currentColor" stroke="none" />
      <circle cx="20" cy="20.5" r="0.5" fill="currentColor" stroke="none" />
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
