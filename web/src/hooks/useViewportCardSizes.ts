import { useState, useEffect } from "react";

export interface CardDimensions {
  width: number;
  height: number;
}

export const MOBILE_BREAKPOINT_PX = 640;

interface ViewportCardSizes {
  hand: CardDimensions;
  battlefield: CardDimensions;
  featured: CardDimensions;
  pool: CardDimensions;
  opponentHand: CardDimensions;
  isMobile: boolean;
}

function clampDims(
  vh: number,
  fraction: number,
  bounds: { min: number; max: number },
): CardDimensions {
  const height = Math.round(
    Math.min(bounds.max, Math.max(bounds.min, vh * fraction)),
  );
  const width = Math.round((height * 5) / 7);
  return { width, height };
}

export function computeViewportCardSizes(
  width: number,
  height: number,
): ViewportCardSizes {
  const isMobile = width < MOBILE_BREAKPOINT_PX;
  const scale = isMobile ? 0.6 : 1;

  return {
    featured: clampDims(height, 0.22 * scale, { min: 70, max: 250 }),
    pool: clampDims(height, 0.11 * scale, { min: 50, max: 130 }),
    hand: clampDims(height, 0.14 * scale, { min: 70, max: 182 }),
    battlefield: clampDims(height, 0.1 * scale, { min: 50, max: 130 }),
    opponentHand: clampDims(height, 0.08 * scale, { min: 50, max: 112 }),
    isMobile,
  };
}

export function useViewportCardSizes(): ViewportCardSizes {
  const [sizes, setSizes] = useState(() =>
    computeViewportCardSizes(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const handleResize = (): void => {
      setSizes(computeViewportCardSizes(window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", handleResize);
    return (): void => window.removeEventListener("resize", handleResize);
  }, []);

  return sizes;
}
