import { MdScreenRotation } from "react-icons/md";
import { canHover } from "../../utils/inputMode";
import { POPOVER_CHROME } from "./styles";

export function RotatePrompt() {
  if (canHover) return null;

  return (
    <div className="rotate-prompt game-table fixed inset-0 z-[200] items-center justify-center p-4">
      <div className={`${POPOVER_CHROME} px-5 py-4 flex items-center gap-3`}>
        <MdScreenRotation className="h-7 w-7 shrink-0 text-amber-400" aria-hidden="true" />
        <span className="text-sm text-[var(--ivory)]">Turn your phone upright to keep playing.</span>
      </div>
    </div>
  );
}
