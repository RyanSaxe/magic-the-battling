import { describe, expect, it } from "vitest";
import { getUpgradeGridColumns, getUpgradeGridDims } from "../../utils/upgradeGrid";

describe("getUpgradeGridColumns", () => {
  it("uses one column for up to three upgrades", () => {
    expect(getUpgradeGridColumns(1)).toBe(1);
    expect(getUpgradeGridColumns(2)).toBe(1);
    expect(getUpgradeGridColumns(3)).toBe(1);
  });

  it("uses two columns for four or more upgrades", () => {
    expect(getUpgradeGridColumns(4)).toBe(2);
    expect(getUpgradeGridColumns(6)).toBe(2);
  });
});

describe("getUpgradeGridDims", () => {
  it("forces a single-column layout for three upgrades", () => {
    const dims = getUpgradeGridDims(
      3,
      {
        innerWidth: 300,
        innerHeight: 600,
        outerWidth: 324,
        outerHeight: 632,
      },
      { width: 100, height: 140, columns: 2, rows: 2 },
    );

    expect(dims.columns).toBe(1);
    expect(dims.rows).toBe(3);
    expect(dims.width).toBeGreaterThan(100);
  });

  it("forces a two-column layout for four upgrades", () => {
    const dims = getUpgradeGridDims(
      4,
      {
        innerWidth: 280,
        innerHeight: 520,
        outerWidth: 304,
        outerHeight: 552,
      },
      { width: 100, height: 140, columns: 1, rows: 4 },
    );

    expect(dims.columns).toBe(2);
    expect(dims.rows).toBe(2);
  });
});
