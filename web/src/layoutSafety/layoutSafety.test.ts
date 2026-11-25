// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { computeBattleZones } from "../hooks/useBattleCardSizes";
import { layoutForContainer } from "../hooks/useCardLayout";
import {
  MODAL_BOXES,
  SAVED_LAYOUTS,
  VIEWPORTS,
  battleBoard,
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

function keyOrder(key: string): string {
  const [check, surface, viewport] = key.split("\t");
  return [
    check,
    surface,
    String(SIZES.findIndex((each) => each.name === viewport)).padStart(3, "0"),
  ].join("\t");
}

interface RecordEntry {
  check: CheckId;
  surface: string;
  viewport: Viewport;
  label: string;
  failures: Failure[];
}

class Results {
  readonly failures: Failure[] = [];
  private readonly groups = new Map<string, Group>();
  private readonly outputs = new Map<string, string[]>();

  record({ check, surface, viewport, label, failures }: RecordEntry): void {
    const key = `${check}\t${surface}\t${viewport.name}`;
    const group = this.groups.get(key) ?? {
      checked: new Set(),
      failing: new Set(),
    };
    this.groups.set(key, group);
    group.checked.add(label);
    for (const failure of failures.filter((each) => each.check === check)) {
      group.failing.add(failure.label);
      this.failures.push(failure);
    }
  }

  output(surface: string, viewport: Viewport, value: unknown): void {
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
    const keys = [...this.groups.keys()];
    keys.sort((a, b) => keyOrder(a).localeCompare(keyOrder(b)));
    let check = "";
    for (const key of keys) {
      const [groupCheck, surface, viewport] = key.split("\t");
      const group = this.groups.get(key);
      if (!group || group.failing.size === 0) continue;
      if (groupCheck !== check) {
        check = groupCheck;
        lines.push(check);
      }
      const failing = [...group.failing];
      failing.sort();
      lines.push(
        `  ${surface.padEnd(20)} ${viewport.padEnd(10)} ${`${failing.length}/${group.checked.size}`.padStart(10)}  ${hash(failing.join("\n"))}`,
      );
    }
    lines.push(
      "",
      "Layout fingerprints: a hash of every size the sweep renders, per phase and viewport.",
    );
    const outputKeys = [...this.outputs.keys()];
    outputKeys.sort((a, b) =>
      keyOrder(`\t${a}`).localeCompare(keyOrder(`\t${b}`)),
    );
    for (const key of outputKeys) {
      const [surface, viewport] = key.split("\t");
      const values = this.outputs.get(key) ?? [];
      lines.push(
        `  ${surface.padEnd(20)} ${viewport.padEnd(10)}  ${hash(values.join("\n"))}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }
}

function sweepViewportZones(viewport: Viewport, results: Results): void {
  for (const zoneCase of zoneCases(viewport)) {
    const layouts = [
      null,
      ...(checksSavedLayouts(zoneCase) ? SAVED_LAYOUTS : []),
    ];
    for (const saved of layouts) {
      const label = saved
        ? `${zoneCase.label}, saved ${JSON.stringify(saved)}`
        : zoneCase.label;
      const failures = checkZoneLayout({ viewport, zoneCase, saved });
      const checks: CheckId[] = [
        "card-outside-zone",
        "card-below-minimum",
        "zones-off-board",
        "grab-moves-layout",
      ];
      if (saved) {
        checks.push("divider-off-saved-layout", "saved-layout-squeezes-zone");
      }
      for (const check of checks) {
        results.record({
          check,
          surface: zoneCase.phase,
          viewport,
          label,
          failures,
        });
      }
      const { width, height } = viewport.zoneBoard;
      const layout = layoutForContainer(width, height, {
        ...zoneCase.config,
        constraints: saved,
      });
      results.output(zoneCase.phase, viewport, [
        label,
        layout.dims,
        layout.frames,
      ]);
    }
    if (isTypicalCase(viewport, zoneCase)) {
      for (const offset of SUBPIXEL_OFFSETS) {
        const board = {
          width: viewport.zoneBoard.width - offset,
          height: viewport.zoneBoard.height - offset,
        };
        const failures = checkZoneMeasurement(viewport, zoneCase, board);
        results.record({
          check: "measurement-changes-layout",
          surface: zoneCase.phase,
          viewport,
          label: `${zoneCase.label}, board ${board.width}x${board.height}`,
          failures,
        });
      }
    }
  }
}

function sweepViewportBattles(viewport: Viewport, results: Results): void {
  const battles = battleCases();
  for (const isSuddenDeath of [false, true]) {
    const surface = isSuddenDeath ? "battle-sudden-death" : "battle";
    for (const battleCase of battles) {
      const failures = checkBattleLayout({
        viewport,
        battleCase,
        isSuddenDeath,
      });
      for (const check of [
        "card-outside-zone",
        "card-below-minimum",
        "zones-off-board",
      ] as const) {
        results.record({
          check,
          surface,
          viewport,
          label: battleCase.label,
          failures,
        });
      }
      const { width, height } = battleBoard(viewport, isSuddenDeath);
      results.output(surface, viewport, [
        battleCase.label,
        computeBattleZones(width, height, battleConfig(viewport, battleCase)),
      ]);
    }
  }
  const typicalBattle = battles.find(
    (battleCase) =>
      battleCase.label === "hand 7, opponent hand 7, lands 4, nonlands 3",
  );
  if (!typicalBattle) {
    throw new Error("Expected typical battle case to exist");
  }
  const battleBoards = [
    viewport.battleBoard,
    ...SUBPIXEL_OFFSETS.map((offset) => ({
      width: Math.round(viewport.battleBoard.width) - offset,
      height: Math.round(viewport.battleBoard.height) - offset,
    })),
  ];
  for (const board of battleBoards) {
    const failures = checkBattleMeasurement(viewport, typicalBattle, board);
    results.record({
      check: "measurement-changes-layout",
      surface: "battle",
      viewport,
      label: `${typicalBattle.label}, board ${board.width}x${board.height}`,
      failures,
    });
  }
}

function sweepModals(results: Results): void {
  for (const box of MODAL_BOXES) {
    for (const zoneCase of modalCases()) {
      const failures = checkZoneLayout({
        viewport: box,
        zoneCase,
        saved: null,
      });
      for (const check of [
        "card-outside-zone",
        "card-below-minimum",
        "zones-off-board",
      ] as const) {
        results.record({
          check,
          surface: zoneCase.phase,
          viewport: box,
          label: zoneCase.label,
          failures,
        });
      }
      const layout = layoutForContainer(box.width, box.height, zoneCase.config);
      results.output(zoneCase.phase, box, [
        zoneCase.label,
        layout.dims,
        layout.frames,
      ]);
    }
  }
}

function sweep(): Results {
  const results = new Results();
  for (const viewport of VIEWPORTS) {
    sweepViewportZones(viewport, results);
    sweepViewportBattles(viewport, results);
  }
  sweepModals(results);
  return results;
}

describe("layout safety sweep", () => {
  const results = sweep();

  it("matches the recorded results", async () => {
    if (import.meta.env.LAYOUT_SAFETY_DETAILS) {
      for (const failure of results.failures) {
        console.log(`LAYOUT_FAILURE ${JSON.stringify(failure)}`);
      }
    }
    await expect(results.format()).toMatchFileSnapshot(
      "./layoutSafety.results.txt",
    );
  });
});
