import type { ReactElement } from "react";

interface GuideProgressProps {
  current: number;
  total: number;
}

function progressDotClass(index: number, current: number): string {
  if (index === current) return "bg-amber-400";
  if (index < current) return "bg-amber-400/40";
  return "bg-white/20";
}

export function GuideProgress({
  current,
  total,
}: GuideProgressProps): ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <progress className="sr-only" value={current + 1} max={total} />
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-200 ${progressDotClass(i, current)}`}
        />
      ))}
    </div>
  );
}
