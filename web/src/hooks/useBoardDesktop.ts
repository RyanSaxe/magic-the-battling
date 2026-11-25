import { useEffect, useState } from "react";

const BOARD_QUERY = "(min-width: 1024px) and (min-height: 640px)";

function matchesBoard(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(BOARD_QUERY).matches
  );
}

export function useBoardDesktop(): boolean {
  const [isBoard, setIsBoard] = useState(matchesBoard);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }
    const query = window.matchMedia(BOARD_QUERY);
    const update = (): void => setIsBoard(query.matches);
    update();
    query.addEventListener("change", update);
    return (): void => query.removeEventListener("change", update);
  }, []);

  return isBoard;
}
