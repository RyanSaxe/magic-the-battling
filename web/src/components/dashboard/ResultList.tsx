import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { SearchBox } from "./SearchBox";
import { SectionTitle } from "./Section";

/** The top of a page that lists search results: its title, the counts of what it shows, and its search box. */
export function ListHeader({
  title,
  counts,
  search,
}: {
  title: string;
  counts?: ReactNode;
  search: Omit<ComponentProps<typeof SearchBox>, "className">;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2">
      <div className="flex items-baseline gap-4">
        <SectionTitle>{title}</SectionTitle>
        {counts}
      </div>
      <SearchBox {...search} className="w-full sm:w-72" />
    </div>
  );
}

/** A grid of result cards, dimmed while newer results load in their place. */
export function ResultGrid({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy={busy}
      className={`grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${busy ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}

export function LoadMoreButton({
  loading,
  disabled = false,
  onClick,
  className = "self-center",
  style,
}: {
  loading: boolean;
  /** Holds the button back without saying it is loading, such as while a card's removal runs. */
  disabled?: boolean;
  onClick: () => void;
  /** Where the button sits in its list. */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      style={style}
      className={`btn btn-secondary px-6 py-2 disabled:opacity-50 ${className}`}
    >
      {loading ? "Loading..." : "Load more"}
    </button>
  );
}
