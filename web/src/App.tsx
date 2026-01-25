import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Home } from './pages/Home'
import { Lobby } from './pages/Lobby'
import { Game } from './pages/Game'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:gameId/lobby" element={<Lobby />} />
          <Route path="/game/:gameId/play" element={<Game />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
