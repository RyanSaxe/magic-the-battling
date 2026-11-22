import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CardShowcase } from "../components/home/CardShowcase";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { AppHeader } from "../components/common/AppHeader";
import { BarLabel } from "../components/common/FrameBar";
import { PageFrame } from "../components/common/PageFrame";
import { CloseSeatDialog, ResumeGamesDialog, ResumeShelf } from "../components/ResumeGame";
import { useResumableGames, type ResumableSeat } from "../hooks/useResumableGames";
import { useAuth } from "../contexts/authState";
import { prefetchLegendaryName } from "../utils/prefetchName";
import { LINK } from "../components/common/styles";

export function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [seatToClose, setSeatToClose] = useState<ResumableSeat | null>(null);
  const [closedIds, setClosedIds] = useState<string[]>([]);

  useEffect(() => {
    prefetchLegendaryName();
  }, []);

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, user, navigate]);

  const resumableGames = useResumableGames();
  const seats = resumableGames.filter((seat) => !closedIds.includes(seat.gameId));

  if (loading || user) return null;

  return (
    <>
      <PageFrame
        header={<AppHeader
          helpers={
            <>
              <button onClick={() => navigate("/login")} className="btn btn-secondary hidden sm:inline-block">
                Log in
              </button>
              <button onClick={() => setShowJoinModal(true)} className="btn btn-secondary">
                <BarLabel desktop="Join Game" phone="Join" />
              </button>
            </>
          }
          primary={
            <button onClick={() => navigate("/play")} className="btn btn-primary font-semibold animate-gentle-glow">
              <BarLabel desktop="Play Game" phone="Play" />
            </button>
          }
        />}
        center
        contentClassName="items-center pb-6"
        shelf={
          <ResumeShelf
            seats={seats}
            onCloseSeat={setSeatToClose}
            onShowAll={() => setShowAllGames(true)}
          />
        }
      >
        <CardShowcase />
        {/* Phones only, where the bar has no room for Log in. mt-10 rather than mt-6 offsets the column's top
            padding, so the showcase stays centered. */}
        <p className="sm:hidden text-[var(--ivory-muted)] text-sm mt-10">
          <Link to="/login" className={LINK}>
            Log in
          </Link>
          {" or "}
          <Link to="/register" className={LINK}>
            create an account
          </Link>
          {" to track your games"}
        </p>
      </PageFrame>

      {showJoinModal && (
        <JoinGameModal onClose={() => setShowJoinModal(false)} />
      )}
      {showAllGames && (
        <ResumeGamesDialog
          seats={seats}
          onClose={() => setShowAllGames(false)}
          onCloseSeat={setSeatToClose}
        />
      )}
      {seatToClose && (
        <CloseSeatDialog
          seat={seatToClose}
          onKeep={() => setSeatToClose(null)}
          onClosed={() => {
            setClosedIds((ids) => [...ids, seatToClose.gameId]);
            setSeatToClose(null);
          }}
        />
      )}
    </>
  );
}
