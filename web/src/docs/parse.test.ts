import { describe, expect, it } from "vitest";

import { DOCS } from ".";
import { selectInputBlocks } from "./parse";

const markdown = [
  "## Controls",
  "",
  ":::pointer",
  "- Click a card.",
  ":::",
  "",
  ":::touch",
  "- Tap a card.",
  ":::",
  "",
  "## Next",
].join("\n");

describe("selectInputBlocks", () => {
  it("keeps the pointer block on devices that hover", () => {
    const result = selectInputBlocks(markdown, true);
    expect(result).toContain("- Click a card.");
    expect(result).not.toContain("Tap a card");
    expect(result).not.toContain(":::");
  });

  it("keeps the touch block on touch screens", () => {
    const result = selectInputBlocks(markdown, false);
    expect(result).toContain("- Tap a card.");
    expect(result).not.toContain("Click a card");
    expect(result).not.toContain(":::");
  });

  it("leaves no keyboard shortcuts in the docs on touch screens", () => {
    for (const doc of DOCS) {
      expect(selectInputBlocks(doc.parsed.body, false)).not.toContain(
        "{{hotkeys:",
      );
    }
  });
});
