/**
 * Shared-game loading for ShareGame and image-readiness tracking for SummaryEmbed.
 */
import { useEffect, useRef, useState } from "react";
import { getShareGame } from "../../api/client";
import type { ShareGameResponse, SharePlayerSnapshot } from "../../types";
import { type AppError, unknownToAppError } from "../../utils/appError";
import { getShareRoundValue } from "../../utils/share";

function getLatestRoundValue(rounds: SharePlayerSnapshot[]): string {
  const latest = rounds[rounds.length - 1];
  return latest ? getShareRoundValue(latest) : "";
}

export function useShareGameData(gameId?: string, playerName?: string) {
  const [data, setData] = useState<ShareGameResponse | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");

  useEffect(() => {
    if (!gameId || !playerName) return;
    let cancelled = false;

    getShareGame(gameId, playerName).then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setSelectedPlayer(res.owner_name);
        const ownerPlayer = res.players.find(
          (player) => player.name === res.owner_name,
        );
        const referenceSnapshots =
          ownerPlayer?.snapshots ?? res.players[0]?.snapshots ?? [];
        setSelectedRound(getLatestRoundValue(referenceSnapshots));
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(
          unknownToAppError(err, "share-game", "Failed to load shared game"),
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [gameId, playerName]);

  return {
    data,
    error,
    loading,
    selectedRound,
    setSelectedRound,
    selectedPlayer,
    setSelectedPlayer,
  };
}

export function useSummaryEmbed(gameId?: string, playerName?: string) {
  const [data, setData] = useState<ShareGameResponse | null>(null);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gameId || !playerName) return;
    let cancelled = false;
    getShareGame(gameId, playerName)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, playerName]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (error) {
      el.setAttribute("data-embed-ready", "true");
      return;
    }
    if (!data) return;

    const images = Array.from(el.querySelectorAll("img"));
    if (images.length === 0) {
      el.setAttribute("data-embed-ready", "true");
      return;
    }

    let loaded = 0;
    const total = images.length;
    const onDone = () => {
      loaded += 1;
      if (loaded >= total) {
        el.setAttribute("data-embed-ready", "true");
      }
    };

    const pendingImages: HTMLImageElement[] = [];
    for (const img of images) {
      if (img.complete) {
        onDone();
      } else {
        pendingImages.push(img);
        img.addEventListener("load", onDone, { once: true });
        img.addEventListener("error", onDone, { once: true });
      }
    }

    return () => {
      for (const img of pendingImages) {
        img.removeEventListener("load", onDone);
        img.removeEventListener("error", onDone);
      }
    };
  }, [data, error]);

  return { data, containerRef };
}
