// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShareModal } from "./ShareModal";

const SHARE_URL = "http://pitfight.test/game/abc/share/Morgan";

let copied: string[];
let copyWorks: boolean;

// jsdom has no Clipboard API, as in a browser on a plain http page, so copying selects the text instead.
beforeEach(() => {
  copied = [];
  copyWorks = true;
  // Browsers focus a field when selecting its text, and jsdom doesn't.
  vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(
    function (this: HTMLTextAreaElement) {
      this.focus();
    },
  );
  document.execCommand = (): boolean => {
    const field = document.activeElement;
    if (copyWorks && field instanceof HTMLTextAreaElement) {
      copied.push(field.value);
    }
    return copyWorks;
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "execCommand");
});

async function tapCopyLink(): Promise<void> {
  render(
    <ShareModal url={SHARE_URL} shareText="4th place" onClose={vi.fn()} />,
  );
  // Safari leaves nothing focused when a button is tapped.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
  await new Promise((resolve) => setTimeout(resolve));
}

it("copies the share link from inside the dialog", async () => {
  await tapCopyLink();

  expect(copied).toEqual([SHARE_URL]);
  expect(screen.getByText("Copied!")).toBeTruthy();
});

it("doesn't say Copied when nothing was copied", async () => {
  copyWorks = false;

  await tapCopyLink();

  expect(screen.queryByText("Copied!")).toBeNull();
});
