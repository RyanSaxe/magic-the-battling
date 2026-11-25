import type { ReactElement } from "react";
import { OPTION_BOX } from "../common/styles";
import { SegmentedFilter } from "./SegmentedFilter";

const OPPONENT_COUNTS = [1, 3, 5, 7] as const;
const LABEL = "Default Opponents";
const OPPONENT_OPTIONS = OPPONENT_COUNTS.map((count) => ({
  value: String(count),
  label: String(count),
}));

/** The choice of how many puppet opponents a game, or a saved cube or deck by default, starts with. */
export function DefaultOpponentsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: (typeof OPPONENT_COUNTS)[number]) => void;
}): ReactElement {
  return (
    <div className={`${OPTION_BOX} p-3`}>
      <label className="block text-[var(--ivory-muted)] text-sm mb-2">
        {LABEL}
      </label>
      <SegmentedFilter
        label={LABEL}
        options={OPPONENT_OPTIONS}
        value={String(value)}
        onChange={(count) => {
          const matched = OPPONENT_COUNTS.find((c) => String(c) === count);
          if (matched !== undefined) onChange(matched);
        }}
        className="h-9"
      />
    </div>
  );
}
