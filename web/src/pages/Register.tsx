import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { useAuth } from '../contexts/authState'
import { AppHeader } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      await register(username, password, email)
      navigate(returnTo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <AppHeader renderRight={({ compact }) => (
        <button
          onClick={() => navigate('/')}
          className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
        >
          Home
        </button>
      )} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-h-0 p-[2px] zone-divider-bg">
          <div className="zone-pack h-full min-h-0 flex flex-col items-center justify-center px-4">
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-sm modal-chrome border gold-border rounded-lg p-6 felt-raised-panel"
            >
              <h2 className="text-xl font-bold text-white mb-5">Create Account</h2>

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
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  title="Letters, numbers, and underscores only"
                />
                <p className="text-gray-500 text-xs mt-1">3-30 characters: letters, numbers, underscores</p>
              </div>

              <div className="mb-4">
                <label htmlFor="email" className="block text-gray-300 text-sm mb-1">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="block text-gray-300 text-sm mb-1">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                  minLength={8}
                />
                <p className="text-gray-500 text-xs mt-1">At least 8 characters</p>
              </div>

              <div className="mb-6">
                <label htmlFor="confirm-password" className="block text-gray-300 text-sm mb-1">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-[42px] bg-black/40 border border-black/40 text-white rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !username || !email || !password || password.length < 8 || password !== confirmPassword}
                className="btn btn-primary w-full py-2 font-semibold disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>

              <p className="text-center text-gray-400 text-sm mt-4">
                Already have an account?{' '}
                <Link to={`/login${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-amber-400 hover:text-amber-300">Log in</Link>
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
