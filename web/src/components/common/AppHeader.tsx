import { useState, useRef, useEffect, type ReactNode, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authState'
import { JoinGameModal } from '../home/JoinGameModal'
import { BarLabel, BrandLockup, TopBar } from './FrameBar'

interface AppHeaderProps {
  helpers?: ReactNode
  home?: ReactNode
  primary?: ReactNode
  account?: ReactNode
  ref?: Ref<HTMLElement>
}

/** The top bar on pages outside a game: the brand lockup, then the page's buttons by role. */
export function AppHeader(props: AppHeaderProps) {
  return <TopBar lead={<BrandLockup />} {...props} />
}

export function GuideButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`btn btn-secondary btn-icon-phone ${className}`} title="Guide" data-guide-target="guide-button">
      <BarLabel desktop="Guide" phone="?" />
    </button>
  )
}

/** `onHome` runs before the page is left, for a screen that has something to undo first. */
export function HomeButton({
  to = '/',
  className = '',
  onHome,
}: {
  to?: string
  className?: string
  onHome?: () => void
}) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => {
        onHome?.()
        navigate(to)
      }}
      className={`btn btn-secondary ${className}`}
    >
      Home
    </button>
  )
}

/** The account menu: the username on desktop, ☰ on phones. */
export function UserMenuButton() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="btn btn-secondary btn-icon-phone inline-flex items-center justify-center gap-1"
          aria-label="Menu"
        >
          <span className="hidden sm:inline max-w-[12rem] truncate">{user?.username}</span>
          <span className="hidden sm:inline text-[10px]" aria-hidden="true">▾</span>
          <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-50 modal-chrome border gold-border rounded-lg shadow-2xl py-1 min-w-[160px]">
            <div className="px-4 py-2 text-xs text-gray-500 border-b border-black/40">
              {user?.username}
            </div>
            <button
              onClick={() => { setOpen(false); navigate('/dashboard') }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Dashboard
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/dashboard/games') }}
              className="sm:hidden w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Games
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/dashboard/discover') }}
              className="sm:hidden w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Discover
            </button>
            <button
              onClick={() => { setOpen(false); navigate('/play') }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Play Game
            </button>
            <button
              onClick={() => { setOpen(false); setShowJoinModal(true) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Join Game
            </button>
            <div className="border-t border-black/40 my-1" />
            <button
              disabled={loggingOut}
              onClick={async () => {
                setOpen(false)
                setLoggingOut(true)
                try {
                  await logout()
                  navigate('/')
                } finally {
                  setLoggingOut(false)
                }
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              {loggingOut ? 'Logging out...' : 'Log Out'}
            </button>
          </div>
        )}
      </div>
      {showJoinModal && <JoinGameModal onClose={() => setShowJoinModal(false)} />}
    </>
  )
}
