import { describe, expect, it } from "vitest";
import { rewardZoneStyles } from "./rewardZoneStyles";

const frame = (outerHeight: number) => ({
  innerWidth: 0,
  innerHeight: 0,
  outerWidth: 0,
  outerHeight,
});

const zoneFrames = {
  rewards: frame(568),
  upgrades: frame(200),
  pool: frame(300),
};

describe("rewardZoneStyles", () => {
  it("lets the Loot zone fill the phase when there is no upgrade section", () => {
    expect(rewardZoneStyles(zoneFrames, false).rewards).toEqual({
      minHeight: 568,
      flex: "1 1 auto",
    });
  });

  it("holds the Loot zone at its height above an upgrade section and lets the pool fill", () => {
    const styles = rewardZoneStyles(zoneFrames, true);

    expect(styles.rewards).toEqual({ height: 568, flex: "0 0 auto" });
    expect(styles.upgrades).toEqual({ height: 200, flex: "0 0 auto" });
    expect(styles.pool).toEqual({ minHeight: 300, flex: "1 1 auto" });
  });
});
