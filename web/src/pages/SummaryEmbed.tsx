import type { ReactElement } from "react";
import { useParams } from "react-router-dom";
import { GameSummary } from "../components/GameSummary";
import { FrameBoard } from "../components/common/PageFrame";
import { useSummaryEmbed } from "../hooks/pages/useShareGame";
import { buildGameSummaryData } from "../utils/share";

export function SummaryEmbed(): ReactElement {
  const { gameId, playerName } = useParams<{
    gameId: string;
    playerName: string;
  }>();
  const { data, containerRef } = useSummaryEmbed(gameId, playerName);

  const summaryData = data ? buildGameSummaryData(data) : null;

  return (
    <div
      ref={containerRef}
      style={{ width: 1200, height: 630 }}
      className="bg-[var(--chrome)] text-white overflow-hidden"
    >
      {data && summaryData ? (
        <div className="w-full h-full flex flex-col pt-3 px-2 pb-2">
          <FrameBoard>
            <GameSummary
              player={summaryData.selfPlayer}
              useUpgrades={data.use_upgrades}
            />
          </FrameBoard>
        </div>
      ) : (
        <div className="w-full h-full" />
      )}
    </div>
  );
}
