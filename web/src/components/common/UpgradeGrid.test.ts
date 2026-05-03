import { describe, expect, it } from "vitest";
import { getUpgradeGridDims } from "../../utils/upgradeGrid";

describe("getUpgradeGridDims", () => {
  it("renders a single column when the layout picked 1 column", () => {
    const dims = getUpgradeGridDims(
      3,
      {
        innerWidth: 300,
        innerHeight: 600,
        outerWidth: 324,
        outerHeight: 632,
      },
      { width: 100, height: 140, columns: 1, rows: 3 },
    );

    expect(dims.columns).toBe(1);
    expect(dims.rows).toBe(3);
    expect(dims.width).toBeGreaterThan(100);
  });

  it("renders two columns when the layout picked 2 columns", () => {
    const dims = getUpgradeGridDims(
      4,
      {
        innerWidth: 280,
        innerHeight: 520,
        outerWidth: 304,
        outerHeight: 552,
      },
      { width: 100, height: 140, columns: 2, rows: 2 },
    );

    expect(dims.columns).toBe(2);
    expect(dims.rows).toBe(2);
  });
});
