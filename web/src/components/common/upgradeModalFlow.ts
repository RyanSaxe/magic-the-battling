import { flushSync } from "react-dom";

export function applyUpgradeWithModalClose(options: {
  upgradeId: string;
  targetId: string;
  onApply?: (upgradeId: string, targetId: string) => void;
  onClose: () => void;
  flush?: (callback: () => void) => void;
}) {
  const { upgradeId, targetId, onApply, onClose, flush = flushSync } = options;
  if (!onApply) return;

  flush(() => {
    onClose();
  });
  onApply(upgradeId, targetId);
}
