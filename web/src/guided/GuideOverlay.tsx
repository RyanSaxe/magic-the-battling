interface GuideOverlayProps {
  clipPath: string;
  allowInteraction: boolean;
}

export function GuideOverlay({ clipPath, allowInteraction }: GuideOverlayProps) {
  return (
    <div
      className="absolute inset-0 transition-[clip-path] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        clipPath: clipPath === "none" ? undefined : clipPath,
        background:
          "linear-gradient(180deg, rgba(54,40,33,0.28), rgba(21,15,13,0.54)), rgba(20,15,13,0.4)",
        backdropFilter: "blur(1px)",
        pointerEvents: allowInteraction ? "none" : "auto",
      }}
    />
  );
}
