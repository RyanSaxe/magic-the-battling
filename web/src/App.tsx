import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Home } from './pages/Home'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'
import { ShareGame } from './pages/ShareGame'
import { SummaryEmbed } from './pages/SummaryEmbed'
import { Rules } from './pages/Rules'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/game/:gameId/lobby" element={<Lobby />} />
          <Route path="/game/:gameId/play" element={<Game />} />
          <Route path="/game/:gameId/share/:playerName/embed" element={<SummaryEmbed />} />
          <Route path="/game/:gameId/share/:playerName" element={<ShareGame />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
