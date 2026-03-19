import { useEffect, useState } from "react";

export type GameShellMode = "mobile" | "small" | "big";

export const GAME_SHELL_SMALL_BREAKPOINT_PX = 1120;
export const GAME_SHELL_MOBILE_BREAKPOINT_PX = 640;

export function computeGameShellMode(width: number): GameShellMode {
  if (width < GAME_SHELL_MOBILE_BREAKPOINT_PX) {
    return "mobile";
  }
  if (width < GAME_SHELL_SMALL_BREAKPOINT_PX) {
    return "small";
  }
  return "big";
}

export function useGameShellMode(): GameShellMode {
  const [mode, setMode] = useState<GameShellMode>(() =>
    computeGameShellMode(window.innerWidth),
  );

  useEffect(() => {
    const handleResize = () => {
      setMode(computeGameShellMode(window.innerWidth));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return mode;
}
