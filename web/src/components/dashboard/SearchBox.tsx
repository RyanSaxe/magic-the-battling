import { FIELD_SURFACE } from "../common/styles";

/** A search field styled like the dashboard's join code box, with a button that clears it. */
export function SearchBox({
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  label: string;
  /** What the field searches, shown while it is empty. */
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="search"
      className={`flex h-9 items-center rounded-md ${FIELD_SURFACE} pl-2.5 pr-1 ${className ?? ""}`}
    >
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-white focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--ivory-muted)] hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}
