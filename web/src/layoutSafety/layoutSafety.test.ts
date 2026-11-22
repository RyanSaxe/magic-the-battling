// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { computeBattleZones } from "../hooks/useBattleCardSizes";
import { layoutForContainer } from "../hooks/useCardLayout";
import {
  MODAL_BOXES,
  SAVED_LAYOUTS,
  VIEWPORTS,
  battleCases,
  battleConfig,
  checksSavedLayouts,
  isTypicalCase,
  modalCases,
  zoneCases,
  type Viewport,
} from "./cases";
import {
  checkBattleLayout,
  checkBattleMeasurement,
  checkZoneLayout,
  checkZoneMeasurement,
  type CheckId,
  type Failure,
} from "./checks";

// Viewports first, then the boxes the modals are swept over, in the order the results list them.
const SIZES = [...VIEWPORTS, ...MODAL_BOXES];

// Fractional content boxes, as OS display scaling and browser zoom produce.
const SUBPIXEL_OFFSETS = [0.2, 0.4, 0.6, 0.8];

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

interface Group {
  checked: Set<string>;
  failing: Set<string>;
}

class Results {
  readonly failures: Failure[] = [];
  private readonly groups = new Map<string, Group>();
  private readonly outputs = new Map<string, string[]>();

  record(check: CheckId, surface: string, viewport: Viewport, label: string, failures: Failure[]) {
    const key = `${check}\t${surface}\t${viewport.name}`;
    const group = this.groups.get(key) ?? { checked: new Set(), failing: new Set() };
    this.groups.set(key, group);
    group.checked.add(label);
    for (const failure of failures.filter((each) => each.check === check)) {
      group.failing.add(failure.label);
      this.failures.push(failure);
    }
  }

  output(surface: string, viewport: Viewport, value: unknown) {
    const key = `${surface}\t${viewport.name}`;
    const list = this.outputs.get(key) ?? [];
    this.outputs.set(key, list);
    list.push(JSON.stringify(value));
  }

  format(): string {
    const lines = [
      "Layout safety results. Regenerate with `npx vitest run src/layoutSafety -u` and review the diff:",
      "a failing count that grows is a regression. Columns: check, phase, viewport, failing cases of",
      "cases checked, and a hash of the failing set, which changes when different cases fail.",
      "",
    ];
    const order = (key: string) => {
      const [check, surface, viewport] = key.split("\t");
      return [check, surface, String(SIZES.findIndex((each) => each.name === viewport)).padStart(3, "0")].join("\t");
    };
    const keys = [...this.groups.keys()].sort((a, b) => order(a).localeCompare(order(b)));
    let check = "";
    for (const key of keys) {
      const [groupCheck, surface, viewport] = key.split("\t");
      const group = this.groups.get(key)!;
      if (group.failing.size === 0) continue;
      if (groupCheck !== check) {
        check = groupCheck;
        lines.push(check);
      }
      const failing = [...group.failing].sort();
      lines.push(
        `  ${surface.padEnd(20)} ${viewport.padEnd(10)} ${`${failing.length}/${group.checked.size}`.padStart(10)}  ${hash(failing.join("\n"))}`,
      );
    }
    lines.push("", "Layout fingerprints: a hash of every size the sweep renders, per phase and viewport.");
    for (const key of [...this.outputs.keys()].sort((a, b) => order(`\t${a}`).localeCompare(order(`\t${b}`)))) {
      const [surface, viewport] = key.split("\t");
      lines.push(`  ${surface.padEnd(20)} ${viewport.padEnd(10)}  ${hash(this.outputs.get(key)!.join("\n"))}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

function sweep(): Results {
  const results = new Results();
  for (const viewport of VIEWPORTS) {
    for (const zoneCase of zoneCases(viewport)) {
      const layouts = [null, ...(checksSavedLayouts(zoneCase) ? SAVED_LAYOUTS : [])];
      for (const saved of layouts) {
        const label = saved ? `${zoneCase.label}, saved ${JSON.stringify(saved)}` : zoneCase.label;
        const failures = checkZoneLayout(viewport, zoneCase, saved);
        const checks: CheckId[] = ["card-outside-zone", "card-below-minimum", "zones-off-board", "grab-moves-layout"];
        if (saved) checks.push("divider-off-saved-layout", "saved-layout-squeezes-zone");
        for (const check of checks) results.record(check, zoneCase.phase, viewport, label, failures);
        const { width, height } = viewport.zoneBoard;
        const layout = layoutForContainer(width, height, { ...zoneCase.config, constraints: saved });
        results.output(zoneCase.phase, viewport, [label, layout.dims, layout.frames]);
      }
      if (isTypicalCase(viewport, zoneCase)) {
        for (const offset of SUBPIXEL_OFFSETS) {
          const board = { width: viewport.zoneBoard.width - offset, height: viewport.zoneBoard.height - offset };
          const failures = checkZoneMeasurement(viewport, zoneCase, board);
          results.record("measurement-changes-layout", zoneCase.phase, viewport, `${zoneCase.label}, board ${board.width}x${board.height}`, failures);
        }
      }
    }

    const battles = battleCases();
    for (const isSuddenDeath of [false, true]) {
      const surface = isSuddenDeath ? "battle-sudden-death" : "battle";
      for (const battleCase of battles) {
        const failures = checkBattleLayout(viewport, battleCase, isSuddenDeath);
        for (const check of ["card-outside-zone", "card-below-minimum", "zones-off-board"] as const) {
          results.record(check, surface, viewport, battleCase.label, failures);
        }
        const { width, height } = viewport.battleBoard;
        results.output(surface, viewport, [battleCase.label, computeBattleZones(width, height, battleConfig(viewport, battleCase, isSuddenDeath))]);
      }
    }
    const typicalBattle = battles.find((battleCase) => battleCase.label === "hand 7, opponent hand 7, lands 4, nonlands 3")!;
    const battleBoards = [viewport.battleBoard, ...SUBPIXEL_OFFSETS.map((offset) => ({
      width: Math.round(viewport.battleBoard.width) - offset,
      height: Math.round(viewport.battleBoard.height) - offset,
    }))];
    for (const board of battleBoards) {
      const failures = checkBattleMeasurement(viewport, typicalBattle, board);
      results.record("measurement-changes-layout", "battle", viewport, `${typicalBattle.label}, board ${board.width}x${board.height}`, failures);
    }
  }

  for (const box of MODAL_BOXES) {
    for (const zoneCase of modalCases()) {
      const failures = checkZoneLayout(box, zoneCase, null);
      for (const check of ["card-outside-zone", "card-below-minimum", "zones-off-board"] as const) {
        results.record(check, zoneCase.phase, box, zoneCase.label, failures);
      }
      const layout = layoutForContainer(box.width, box.height, zoneCase.config);
      results.output(zoneCase.phase, box, [zoneCase.label, layout.dims, layout.frames]);
    }
  }
  return results;
}

describe("layout safety sweep", () => {
  const results = sweep();

  it("matches the recorded results", async () => {
    if (import.meta.env.LAYOUT_SAFETY_DETAILS) {
      for (const failure of results.failures) console.log(`LAYOUT_FAILURE ${JSON.stringify(failure)}`);
    }
    await expect(results.format()).toMatchFileSnapshot("./layoutSafety.results.txt");
  });
});
