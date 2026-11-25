import type { ReactElement, Ref } from "react";

/** The walnut ✕ that closes a panel or a dialog. */
export function CloseButton({
  label,
  onClick,
  className = "",
  ref,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}): ReactElement {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`btn btn-secondary side-panel-close ${className}`.trim()}
      aria-label={label}
    >
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <path
          d="M3 3l8 8M11 3l-8 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
