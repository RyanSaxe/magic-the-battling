import type { CSSProperties, ReactElement } from "react";

interface Dimensions {
  width: number;
  height: number;
}

interface TokenCounterBadgeProps {
  count: number;
  dimensions: Dimensions;
  textClassName: string;
}

function getDigitScale(digitCount: number): number {
  if (digitCount >= 3) return 0.72;
  if (digitCount === 2) return 0.85;
  return 1;
}

function buildBadgeStyle(dimensions: Dimensions, count: number): CSSProperties {
  const smallestEdge = Math.max(
    1,
    Math.min(dimensions.width, dimensions.height),
  );
  const badgeDiameter = Math.round(
    Math.max(12, Math.min(34, smallestEdge * 0.4)),
  );
  const baseFontSize = Math.round(
    Math.max(8, Math.min(16, smallestEdge * 0.22)),
  );
  const digitCount = String(Math.abs(count)).length;
  const digitScale = getDigitScale(digitCount);
  const fontSize = Math.max(7, Math.round(baseFontSize * digitScale));
  const horizontalPadding = Math.max(2, Math.round(badgeDiameter * 0.16));

  return {
    minWidth: badgeDiameter,
    height: badgeDiameter,
    fontSize,
    paddingInline: horizontalPadding,
  };
}

export function TokenCounterBadge({
  count,
  dimensions,
  textClassName,
}: TokenCounterBadgeProps): ReactElement {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span
        className={`token-counter-badge bg-black/75 font-bold rounded-full leading-none flex items-center justify-center border border-black/40 ${textClassName}`}
        data-token-counter-badge
        style={buildBadgeStyle(dimensions, count)}
      >
        {count}
      </span>
    </div>
  );
}
