import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/authState'
import { JoinGameModal } from '../home/JoinGameModal'

interface AppHeaderProps {
  renderRight: (opts: { compact: boolean }) => ReactNode
}

export function AppHeader({ renderRight }: AppHeaderProps) {
  return (
    <header className="shrink-0 py-3 frame-chrome bar-pad-both">
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <div className="flex items-baseline">
            <h1 className="hero-title text-[32px] font-bold tracking-wide leading-tight">
              Crucible
            </h1>
            <span className="hero-sep mx-2.5">—</span>
            <span className="hero-subtitle text-base font-normal tracking-widest">
              an MtG format
            </span>
          </div>
          <p className="hero-tagline">
            Inspired by Roguelikes and Autobattlers
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {renderRight({ compact: false })}
        </div>
      </div>
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline whitespace-nowrap">
              <h1 className="hero-title text-lg font-bold tracking-wide leading-tight">
                Crucible
              </h1>
              <span className="hero-sep mx-1 text-xs">—</span>
              <span className="hero-subtitle text-[11px] font-normal tracking-wider">
                an MtG format
              </span>
            </div>
            <p className="hero-tagline !text-[9px] !tracking-[0.04em]">
              Inspired by Roguelikes and Autobattlers
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {renderRight({ compact: true })}
          </div>
        </div>
      </div>
    </header>
  )
}

export function AuthHeaderButton({ compact }: { compact: boolean }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/login')}
      className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
    >
      Log in
    </button>
  )
}

export function UserMenuButton({ compact }: { compact: boolean }) {
  const navigate = useNavigate()
  const { logout } = useAuth()
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

  const btnClass = compact
    ? 'py-1.5 px-2 text-sm'
    : 'py-2 px-3'

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={`btn btn-secondary ${btnClass} flex items-center justify-center`}
          aria-label="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-50 modal-chrome border gold-border rounded-lg shadow-2xl py-1 min-w-[160px]">
            <button
              onClick={() => { setOpen(false); navigate('/dashboard') }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              Dashboard
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
