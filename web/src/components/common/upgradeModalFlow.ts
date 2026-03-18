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
  upgradeIds: string[];
  onReveal?: (upgradeIds: string[]) => void;
  onClose: () => void;
  flush?: (callback: () => void) => void;
}) {
  const { upgradeIds, onReveal, onClose, flush = flushSync } = options;
  if (upgradeIds.length === 0) return;
  runModalActionWithClose({
    onClose,
    flush,
    onRun: onReveal ? () => onReveal(upgradeIds) : undefined,
  });
}
