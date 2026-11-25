import { useState, type ReactElement } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CardShowcase } from "../components/home/CardShowcase";
import { JoinGameModal } from "../components/home/JoinGameModal";
import { AppHeader } from "../components/common/AppHeader";
import { BarLabel } from "../components/common/FrameBar";
import { PageFrame } from "../components/common/PageFrame";
import {
  CloseSeatDialog,
  ResumeGamesDialog,
  ResumeShelf,
} from "../components/ResumeGame";
import { useHomeSession } from "../hooks/pages/useAuthSession";
import type { ResumableSeat } from "../hooks/useResumableGames";
import { LINK } from "../components/common/styles";

export function Home(): ReactElement | null {
  const navigate = useNavigate();
  const { user, loading, seats, markSeatClosed } = useHomeSession();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [seatToClose, setSeatToClose] = useState<ResumableSeat | null>(null);

  if (loading || user) return null;

  return (
    <>
      <PageFrame
        header={
          <AppHeader
            helpers={
              <>
                <button
                  onClick={() => {
                    void navigate("/login");
                  }}
                  className="btn btn-secondary hidden sm:inline-block"
                >
                  Log in
                </button>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="btn btn-secondary"
                >
                  <BarLabel desktop="Join Game" phone="Join" />
                </button>
              </>
            }
            primary={
              <button
                onClick={() => {
                  void navigate("/play");
                }}
                className="btn btn-primary font-semibold animate-gentle-glow"
              >
                <BarLabel desktop="Play Game" phone="Play" />
              </button>
            }
          />
        }
        scroll={false}
        contentClassName="items-center justify-center p-4 overflow-hidden"
        shelf={
          <ResumeShelf
            seats={seats}
            onCloseSeat={setSeatToClose}
            onShowAll={() => setShowAllGames(true)}
          />
        }
      >
        <CardShowcase />
        {/* Phones only, where the bar has no room for Log in. */}
        <p className="sm:hidden shrink-0 text-[var(--ivory-muted)] text-sm mt-3 text-center">
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
            markSeatClosed(seatToClose.gameId);
            setSeatToClose(null);
          }}
        />
      )}
    </>
  );
}
