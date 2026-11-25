export function VerticalDivider({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center self-stretch"
      style={{ width: 32 }}
    >
      <div className="flex-1 border-l border-[var(--stone-light)]/40" />
      <span
        className="text-[10px] text-[var(--ivory-muted)] uppercase tracking-widest py-2"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
      <div className="flex-1 border-l border-[var(--stone-light)]/40" />
    </div>
  );
}
