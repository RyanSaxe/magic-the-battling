import { Suspense, lazy, type ReactElement } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ServerStatusBanner } from "./components/common/ServerStatusBanner";
import { ToastProvider } from "./contexts";
import { AuthProvider } from "./contexts/AuthContext";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";

const Play = lazy(async () => ({
  default: (await import("./pages/Play")).Play,
}));
const Lobby = lazy(async () => ({
  default: (await import("./pages/Lobby")).Lobby,
}));
const Game = lazy(async () => ({
  default: (await import("./pages/Game")).Game,
}));
const ShareGame = lazy(async () => ({
  default: (await import("./pages/ShareGame")).ShareGame,
}));
const SummaryEmbed = lazy(async () => ({
  default: (await import("./pages/SummaryEmbed")).SummaryEmbed,
}));
const Login = lazy(async () => ({
  default: (await import("./pages/Login")).Login,
}));
const Register = lazy(async () => ({
  default: (await import("./pages/Register")).Register,
}));
const Dashboard = lazy(async () => ({
  default: (await import("./pages/Dashboard")).Dashboard,
}));
const DashboardDiscover = lazy(async () => ({
  default: (await import("./pages/DashboardDiscover")).DashboardDiscover,
}));
const DashboardGames = lazy(async () => ({
  default: (await import("./pages/DashboardGames")).DashboardGames,
}));
const BattlerView = lazy(async () => ({
  default: (await import("./pages/BattlerView")).BattlerView,
}));
const CubeView = lazy(async () => ({
  default: (await import("./pages/CubeView")).CubeView,
}));

function App(): ReactElement {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <ServerStatusBanner />
            <Suspense fallback={<LoadingScreen title="Loading" />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/games" element={<DashboardGames />} />
                <Route
                  path="/dashboard/discover"
                  element={<DashboardDiscover />}
                />
                <Route
                  path="/dashboard/list/:listId"
                  element={<BattlerView />}
                />
                <Route path="/cube/:cubeId" element={<CubeView />} />
                <Route path="/play" element={<Play />} />
                <Route path="/game/:gameId/lobby" element={<Lobby />} />
                <Route path="/game/:gameId/play" element={<Game />} />
                <Route
                  path="/game/:gameId/share/:playerName/embed"
                  element={<SummaryEmbed />}
                />
                <Route
                  path="/game/:gameId/share/:playerName"
                  element={<ShareGame />}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
