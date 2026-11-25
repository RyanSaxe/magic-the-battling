// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuickGuide } from "./QuickGuide";

vi.hoisted(() => {
  // inputMode reads matchMedia as it's imported, and jsdom has none.
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener(): void {},
    removeListener(): void {},
    addEventListener(): void {},
    removeEventListener(): void {},
    dispatchEvent(): boolean {
      return false;
    },
  });
});

function requireElement(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) {
    throw new Error(`Expected element matching ${selector}`);
  }
  return el;
}

function currentGuideSection(): string {
  return requireElement('[aria-current="page"]').textContent;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("scrolls to the heading a link points to on another tab", async () => {
  // jsdom has no layout, so the page starts at 100 and the Treasures heading 300 below it.
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(2000);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(500);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return new DOMRect(
        0,
        this.tagName === "H2" && this.textContent === "Treasures" ? 400 : 100,
        300,
        20,
      );
    },
  );
  render(<QuickGuide />);

  fireEvent.click(screen.getByRole("radio", { name: "Tips" }));
  fireEvent.click(screen.getAllByText("treasures", { selector: "button" })[0]);

  await vi.waitFor(() =>
    expect(requireElement(".guide-book-page").scrollTop).toBe(300),
  );
});

it("turns to a section from the contents or the next section link, each at its top", () => {
  render(<QuickGuide />);

  requireElement(".guide-book-page").scrollTop = 200;
  fireEvent.click(requireElement(".guide-book-switch"));
  fireEvent.click(
    screen.getByText("Game Pieces", { selector: ".guide-book-item" }),
  );
  expect(currentGuideSection()).toBe("Game Pieces");
  expect(
    requireElement(".guide-book-switch").getAttribute("aria-expanded"),
  ).toBe("false");
  expect(requireElement(".guide-book-page").scrollTop).toBe(0);

  requireElement(".guide-book-page").scrollTop = 200;
  fireEvent.click(requireElement(".guide-book-next"));
  expect(currentGuideSection()).toBe("Draft Phase");
  expect(requireElement(".guide-book-page").scrollTop).toBe(0);
});
