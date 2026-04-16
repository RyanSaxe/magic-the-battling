import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ServerStatusBanner } from './components/common/ServerStatusBanner'
import { ToastProvider } from './contexts'
import { AuthProvider } from './contexts/AuthContext'
import { Home } from './pages/Home'
import { Play } from './pages/Play'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'
import { ShareGame } from './pages/ShareGame'
import { SummaryEmbed } from './pages/SummaryEmbed'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { BattlerView } from './pages/BattlerView'

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <ServerStatusBanner />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/battler/:battlerId" element={<BattlerView />} />
              <Route path="/play" element={<Play />} />
              <Route path="/game/:gameId/lobby" element={<Lobby />} />
              <Route path="/game/:gameId/play" element={<Game />} />
              <Route path="/game/:gameId/share/:playerName/embed" element={<SummaryEmbed />} />
              <Route path="/game/:gameId/share/:playerName" element={<ShareGame />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
