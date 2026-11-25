import type { ReactNode } from "react";
import { useAudioMeter } from "../../hooks/pages/useAudioMeter";
import { type VoicePeer } from "../../hooks/useVoiceChat";

interface MicToggleProps {
  muted: boolean;
  onClick: (e: React.MouseEvent) => void;
  variant?: "default" | "player-row" | "seat";
  audioLevelKey?: string;
  connectionState?: VoicePeer["connectionState"];
  remoteMuted?: boolean;
}

interface MicVisual {
  icon: "mic" | "warning" | "off";
  color: string;
  animation: string;
  title: string;
}

function getMicVisual(
  props: Pick<MicToggleProps, "muted" | "connectionState" | "remoteMuted">,
): MicVisual {
  const { muted, connectionState, remoteMuted } = props;

  if (connectionState === "connecting") {
    return {
      icon: "mic",
      color: "text-[var(--ivory-muted)]",
      animation: "animate-mic-connecting",
      title: "Connecting...",
    };
  }
  if (connectionState === "failed") {
    return {
      icon: "warning",
      color: "text-amber-400",
      animation: "",
      title: "Connection failed",
    };
  }
  if (connectionState === "disconnected") {
    return {
      icon: "warning",
      color: "text-[var(--ivory-muted)]",
      animation: "",
      title: "Disconnected",
    };
  }
  if (muted) {
    return {
      icon: "off",
      color: "text-red-400 hover:text-red-300",
      animation: "",
      title: "Unmute",
    };
  }
  if (remoteMuted) {
    return {
      icon: "off",
      color: "text-[var(--ivory-muted)]",
      animation: "",
      title: "Player muted",
    };
  }
  return {
    icon: "mic",
    color: "text-[var(--color-gold)] hover:text-[var(--color-gold-bright)]",
    animation: "",
    title: "Mute",
  };
}

function sizeClasses(
  variant: MicToggleProps["variant"],
  showsLevel: boolean,
): string {
  if (variant === "seat") {
    return "h-11 w-11 -ml-2 shrink-0 justify-center gap-0.5 py-2.5 focus-visible:-outline-offset-4";
  }
  if (variant === "player-row") {
    return `h-6 shrink-0 justify-start ${showsLevel ? "w-5 gap-0.5" : "w-4"}`;
  }
  return `h-6 justify-center ${showsLevel ? "w-7 gap-0.5" : "w-6"}`;
}

function renderMicIcon(
  icon: MicVisual["icon"],
  connectionState: MicToggleProps["connectionState"],
  variant: MicToggleProps["variant"],
): ReactNode {
  if (icon === "warning") {
    return connectionState === "failed" && variant !== "seat" ? (
      <WarningTriangleIcon className="w-3.5 h-3.5" />
    ) : (
      <MicWarningIcon className="w-3.5 h-3.5" />
    );
  }
  if (icon === "off") {
    return <MicOffIcon className="w-3.5 h-3.5" />;
  }
  return <MicIcon className="w-3.5 h-3.5" />;
}

export function MicToggle({
  muted,
  onClick,
  variant = "default",
  audioLevelKey,
  connectionState,
  remoteMuted,
}: MicToggleProps): ReactNode {
  const visual = getMicVisual({ muted, connectionState, remoteMuted });
  const barRef = useAudioMeter(audioLevelKey);
  const iconEl = renderMicIcon(visual.icon, connectionState, variant);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`relative inline-flex items-center rounded transition-colors ${sizeClasses(variant, !!audioLevelKey)} ${visual.color}${visual.animation ? ` ${visual.animation}` : ""}`}
      title={visual.title}
    >
      {audioLevelKey && <span ref={barRef} className="mic-level-bar" />}
      {iconEl}
    </button>
  );
}

export function MicIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export function MicOffIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export function MicWarningIcon({
  className,
}: {
  className?: string;
}): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
      <path d="M20 16l-1.5 3h3L20 16Z" fill="currentColor" stroke="none" />
      <circle cx="20" cy="20.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WarningTriangleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  );
}

export function MicBlockedIndicator(): ReactNode {
  return (
    <div className="flex items-center justify-center gap-1.5 text-[10px] text-red-400/80">
      <MicOffIcon className="w-3 h-3" />
      <span>Mic blocked</span>
    </div>
  );
}
