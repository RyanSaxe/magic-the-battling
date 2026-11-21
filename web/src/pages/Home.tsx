import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CardShowcase } from "../components/home/CardShowcase";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { AppHeader } from "../components/common/AppHeader";
import { PageFrame } from "../components/common/PageFrame";
import { ResumeGameStrip } from "../components/ResumeGame";
import { useResumableGames } from "../hooks/useResumableGames";
import { useAuth } from "../contexts/authState";
import { prefetchLegendaryName } from "../utils/prefetchName";

export function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    prefetchLegendaryName();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, user, navigate]);

  const [resumable] = useResumableGames(1);

  if (loading || user) return null;

  return (
    <>
      <PageFrame
        header={<AppHeader renderRight={({ compact }) => (
          <>
            <button
              onClick={() => setShowJoinModal(true)}
              className={`btn btn-secondary ${compact ? "py-1.5 px-3 text-sm" : "py-2 px-4"}`}
            >
              {compact ? "Join" : "Join Game"}
            </button>
            <button
              onClick={() => navigate("/play")}
              className={`btn btn-primary ${compact ? "py-1.5 px-3 text-sm" : "py-2 px-4"} font-semibold animate-gentle-glow`}
            >
              {compact ? "Play" : "Play Game"}
            </button>
          </>
        )} />}
        center="always"
        contentClassName="items-center px-4 pb-6"
      >
        {resumable && <ResumeGameStrip seat={resumable} />}
        <CardShowcase />
        {/* mt-10 rather than mt-6 offsets the column's top padding, so the showcase stays centered where it was. */}
        <p className="text-gray-400 text-sm mt-10">
          <Link to="/login" className="text-amber-400 hover:text-amber-300">
            Log in
          </Link>
          {" or "}
          <Link to="/register" className="text-amber-400 hover:text-amber-300">
            create an account
          </Link>
          {" to track your games"}
        </p>
      </PageFrame>

      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
    </>
  );
}
