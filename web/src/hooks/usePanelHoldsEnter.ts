/**
 * Hook that holds the Enter key while an overlay panel is open so Enter cannot
 * accidentally advance a phase behind the panel.
 */
import { useEffect } from "react";
import { acquireEnterPanelHold } from "../utils/enterKey";

export function usePanelHoldsEnter(open = true): void {
  useEffect(() => {
    if (!open) return;
    return acquireEnterPanelHold();
  }, [open]);
}
