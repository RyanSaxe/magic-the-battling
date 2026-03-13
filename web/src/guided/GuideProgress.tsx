interface GuideProgressProps {
  current: number;
  total: number;
}

export function GuideProgress({ current, total }: GuideProgressProps) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
            i === current
              ? "bg-amber-400"
              : i < current
                ? "bg-amber-400/40"
                : "bg-white/20"
          }`}
        />
      ))}
    </div>
  );
}
