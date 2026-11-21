import { useNavigate } from 'react-router-dom'
import { AppHeader, UserMenuButton } from '../common/AppHeader'

/** The app header for pages reached from the dashboard: Home, then the account menu. */
export function HomeHeader() {
  const navigate = useNavigate()
  return (
    <AppHeader
      renderRight={({ compact }) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
          >
            Home
          </button>
          <UserMenuButton compact={compact} />
        </div>
      )}
    />
  )
}
