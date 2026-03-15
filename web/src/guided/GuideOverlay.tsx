interface GuideOverlayProps {
  clipPath: string;
  allowInteraction: boolean;
  overlayOpacity?: number;
  overlayTransition?: string;
  overlayAnimation?: string;
  clipPathTransition?: string;
}

export function GuideOverlay({
  clipPath,
  allowInteraction,
  overlayOpacity,
  overlayTransition,
  overlayAnimation,
  clipPathTransition,
}: GuideOverlayProps) {
  return (
    <div
      className="absolute inset-0"
      style={{
        clipPath: clipPath === "none" ? undefined : clipPath,
        background:
          "linear-gradient(180deg, rgba(54,40,33,0.28), rgba(21,15,13,0.54)), rgba(20,15,13,0.4)",
        backdropFilter: "blur(1px)",
        pointerEvents: allowInteraction ? "none" : "auto",
        opacity: overlayOpacity ?? 1,
        animation: overlayAnimation,
        transition: [
          clipPathTransition ?? "clip-path 280ms cubic-bezier(0.22,1,0.36,1)",
          overlayTransition,
        ]
          .filter(Boolean)
          .join(", "),
      }}
    />
  );
}
