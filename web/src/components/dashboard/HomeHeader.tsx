import { useNavigate } from 'react-router-dom'
import { AppHeader, HomeButton, UserMenuButton } from '../common/AppHeader'
import { BarLabel } from '../common/FrameBar'

/** The app header for pages reached from the dashboard: Home, New Game where asked, then the account menu. */
export function HomeHeader({ newGame = false }: { newGame?: boolean }) {
  const navigate = useNavigate()
  return (
    <AppHeader
      // Phones have no room for Home beside New Game, and the account menu still leads to the dashboard.
      home={<HomeButton to="/dashboard" className={newGame ? 'hidden sm:inline-block' : ''} />}
      primary={newGame && (
        <button type="button" onClick={() => navigate('/play')} className="btn btn-primary">
          <BarLabel desktop="New Game" phone="Play" />
        </button>
      )}
      account={<UserMenuButton />}
    />
  )
}
