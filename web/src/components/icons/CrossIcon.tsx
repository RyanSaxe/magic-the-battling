import type { ReactElement } from "react";

export function CrossIcon(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="h-[11px] w-[11px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M2 2l20 20M22 2L2 22" />
    </svg>
  );
}
