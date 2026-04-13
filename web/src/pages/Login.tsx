import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'

export function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
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
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary py-2 px-4"
            >
              Home
            </button>
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
            <button
              onClick={() => navigate("/")}
              className="btn btn-secondary py-1.5 px-3 text-sm shrink-0"
            >
              Home
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
          <div className="zone-pack h-full min-h-0 flex flex-col items-center justify-center px-4">
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-sm modal-chrome border gold-border rounded-lg p-6 felt-raised-panel"
            >
              <h2 className="text-xl font-bold text-white mb-5">Log In</h2>

              {error && (
                <p className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{error}</p>
              )}

              <div className="mb-4">
                <label htmlFor="username" className="block text-gray-300 text-sm mb-1">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                  required
                />
              </div>

              <div className="mb-6">
                <label htmlFor="password" className="block text-gray-300 text-sm mb-1">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="btn btn-primary w-full py-2 font-semibold disabled:opacity-50"
              >
                {loading ? 'Logging in...' : 'Log In'}
              </button>

              <p className="text-center text-gray-400 text-sm mt-4">
                Don't have an account?{' '}
                <Link to="/register" className="text-amber-400 hover:text-amber-300">Create one</Link>
              </p>
            </form>
          </div>
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a
            href="https://discord.gg/2NAjcWXNKn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
          >
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>
    </div>
  )
}
