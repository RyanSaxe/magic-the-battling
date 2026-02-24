import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './contexts'
import { Home } from './pages/Home'
import { Play } from './pages/Play'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'
import { ShareGame } from './pages/ShareGame'
import { SummaryEmbed } from './pages/SummaryEmbed'

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/play" element={<Play />} />
            <Route path="/game/:gameId/lobby" element={<Lobby />} />
            <Route path="/game/:gameId/play" element={<Game />} />
            <Route path="/game/:gameId/share/:playerName/embed" element={<SummaryEmbed />} />
            <Route path="/game/:gameId/share/:playerName" element={<ShareGame />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
