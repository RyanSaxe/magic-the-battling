import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { AppHeader, HomeButton } from '../components/common/AppHeader'
import { PageFrame } from '../components/common/PageFrame'
import { SurfaceCard } from '../components/common/SurfaceCard'
import { unknownToAppError } from '../utils/appError'

export function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') || '/'
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
      navigate(returnTo)
    } catch (err) {
      setError(unknownToAppError(err, 'login', 'Login failed').message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageFrame
      header={<AppHeader home={<HomeButton />} />}
      center
      contentClassName="items-center"
    >
      <SurfaceCard as="form" onSubmit={handleSubmit}>
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
          <Link to={`/register${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-amber-400 hover:text-amber-300">Create one</Link>
        </p>
      </SurfaceCard>
    </PageFrame>
  )
}
