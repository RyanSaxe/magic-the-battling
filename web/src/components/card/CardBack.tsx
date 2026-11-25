import type { ReactElement } from "react";
import { CARD_BACK_IMAGE } from "../../constants/assets";

interface CardBackProps {
  size?: "xs" | "sm" | "md" | "lg";
  dimensions?: { width: number; height: number };
  tapped?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const sizeStyles = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
};

export function CardBack({
  size = "md",
  dimensions,
  tapped = false,
  onClick,
  className = "",
  style: externalStyle,
}: CardBackProps): ReactElement {
  const dims = dimensions ?? sizeStyles[size];

  const baseClasses = [
    "card card-on-table",
    "relative overflow-hidden",
    onClick && "cursor-pointer",
    tapped && "tapped",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const boxStyle: React.CSSProperties = {
    ...externalStyle,
    width: dims.width,
    height: dims.height,
  };

  const image = (
    <img
      src={CARD_BACK_IMAGE}
      alt="Card back"
      className="w-full h-full object-cover"
      draggable={false}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`${baseClasses} border-0 bg-transparent p-0 text-left block`}
        style={boxStyle}
        onClick={onClick}
      >
        {image}
      </button>
    );
  }

  return (
    <div className={baseClasses} style={boxStyle}>
      {image}
    </div>
  );
}
