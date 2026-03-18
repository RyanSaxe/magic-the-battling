import { flushSync } from "react-dom";

function runModalActionWithClose(options: {
  onClose: () => void;
  flush?: (callback: () => void) => void;
  onRun?: () => void;
}) {
  const { onClose, flush = flushSync, onRun } = options;
  if (!onRun) return;

  flush(() => {
    onClose();
  });
  onRun();
}

export function applyUpgradeWithModalClose(options: {
  upgradeId: string;
  targetId: string;
  onApply?: (upgradeId: string, targetId: string) => void;
  onClose: () => void;
  flush?: (callback: () => void) => void;
}) {
  const { upgradeId, targetId, onApply, onClose, flush = flushSync } = options;
  runModalActionWithClose({
    onClose,
    flush,
    onRun: onApply ? () => onApply(upgradeId, targetId) : undefined,
  });
}

export function revealUpgradeWithModalClose(options: {
  upgradeId: string;
  onReveal?: (upgradeId: string) => void;
  onClose: () => void;
  flush?: (callback: () => void) => void;
}) {
  const { upgradeId, onReveal, onClose, flush = flushSync } = options;
  runModalActionWithClose({
    onClose,
    flush,
    onRun: onReveal ? () => onReveal(upgradeId) : undefined,
  });
}
