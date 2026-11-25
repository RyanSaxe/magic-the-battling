import { useCallback, useId, useRef, useState, type ReactElement } from "react";
import { createBattler } from "../../api/client";
import { useAsyncAction } from "../../hooks/useAsyncResource";
import type { PlayMode, UserBattler } from "../../types";
import { unknownToAppError } from "../../utils/appError";
import { DefaultOpponentsField } from "./DefaultOpponentsField";
import { FIELD_LABEL, OPTION_BOX, TEXT_INPUT } from "../common/styles";
import { Dialog } from "../common/Dialog";
import { InfoTip } from "../common/InfoTip";
import { UPGRADES_HELP } from "../../constants/rules";

export function AddCubeModal({
  initialCubeId = "",
  onClose,
  onCreated,
  addToast,
}: {
  initialCubeId?: string;
  onClose: () => void;
  onCreated: (b: UserBattler) => void;
  addToast: (msg: string, type: "error" | "info") => void;
}): ReactElement {
  const cubeInputId = useId();
  const displayNameInputId = useId();
  const focusedRef = useRef(false);
  const [cubeId, setCubeId] = useState(initialCubeId);
  const [displayName, setDisplayName] = useState("");
  const [playMode, setPlayMode] = useState<PlayMode>("limited");
  const [useUpgrades, setUseUpgrades] = useState(true);
  const [puppetCount, setPuppetCount] = useState(3);

  const { run: submitCube, pending: saving } = useAsyncAction(
    useCallback(
      async (trimmedCubeId: string) => {
        try {
          const b = await createBattler({
            cube_id: trimmedCubeId,
            display_name: displayName.trim() || undefined,
            play_mode: playMode,
            use_upgrades: useUpgrades,
            puppet_count: puppetCount,
            target_player_count: puppetCount + 1,
          });
          onCreated(b);
        } catch (err) {
          addToast(
            unknownToAppError(err, "create-battler", "Failed to create")
              .message,
            "error",
          );
        }
      },
      [displayName, playMode, useUpgrades, puppetCount, onCreated, addToast],
    ),
  );

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = cubeId.trim();
    if (!trimmed) {
      addToast("Please enter a CubeCobra ID", "error");
      return;
    }
    void submitCube(trimmed);
  };

  return (
    <Dialog title="Add Cube / Deck" onClose={onClose} onSubmit={handleSubmit}>
      <div className="space-y-3">
        <div>
          <label htmlFor={cubeInputId} className={FIELD_LABEL}>
            CubeCobra ID
          </label>
          <input
            id={cubeInputId}
            type="text"
            value={cubeId}
            onChange={(e) => setCubeId(e.target.value)}
            className={TEXT_INPUT}
            placeholder="e.g. auto, or paste the cube's link"
            ref={(el): void => {
              if (el && !focusedRef.current) {
                focusedRef.current = true;
                el.focus();
              }
            }}
            required
          />
        </div>

        <div>
          <label htmlFor={displayNameInputId} className={FIELD_LABEL}>
            Display Name{" "}
            <span className="text-[var(--ivory-muted)]">(optional)</span>
          </label>
          <input
            id={displayNameInputId}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={TEXT_INPUT}
            placeholder="My Draft Cube"
          />
        </div>

        <label
          className={`${OPTION_BOX} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}
        >
          <input
            type="checkbox"
            checked={playMode === "constructed"}
            onChange={(e) =>
              setPlayMode(e.target.checked ? "constructed" : "limited")
            }
            className="w-4 h-4"
          />
          <span className="text-white text-sm">Constructed</span>
          <span className="text-[var(--ivory-muted)] text-xs">
            — bring your own deck
          </span>
        </label>

        <div className={`${OPTION_BOX} pl-3 pr-1 flex items-center`}>
          <label className="flex items-center gap-2 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useUpgrades}
              onChange={(e) => setUseUpgrades(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">Upgrades</span>
          </label>
          <InfoTip label="What upgrades are" text={UPGRADES_HELP} />
        </div>

        <DefaultOpponentsField value={puppetCount} onChange={setPuppetCount} />
      </div>

      <button
        type="submit"
        disabled={saving || !cubeId.trim()}
        className="btn btn-primary w-full py-2 mt-4 font-semibold disabled:opacity-50"
      >
        {saving ? "Saving..." : "Add Cube / Deck"}
      </button>
    </Dialog>
  );
}
