// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { MoreMenu } from "../dashboard/MoreMenu";
import { UserMenuButton } from "./AppHeader";
import { SidePanelHostContext } from "./sidePanelHost";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
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

vi.mock("../../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));
vi.mock("../../contexts/authState", () => ({
  useAuth: (): { user: { username: string }; loading: boolean } => ({
    user: { username: "tester" },
    loading: false,
  }),
}));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

it.each<[string, () => ReactElement, string]>([
  [
    "a card's menu",
    (): ReactElement => (
      <MoreMenu
        label="More"
        items={[{ label: "View", onSelect: (): void => {} }]}
      />
    ),
    "More",
  ],
  ["the account menu", (): ReactElement => <UserMenuButton />, "Menu"],
])(
  "%s takes the whole tap that closes it, so nothing underneath gets the click",
  (_, renderMenu, opener) => {
    const feltCover = document.body.appendChild(document.createElement("div"));
    render(
      <MemoryRouter>
        <SidePanelHostContext.Provider value={feltCover}>
          {renderMenu()}
        </SidePanelHostContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: opener }));

    const tapTarget = feltCover.firstElementChild;
    expect(tapTarget).not.toBeNull();
    if (!tapTarget) return;
    fireEvent.mouseDown(tapTarget);
    expect(feltCover.firstElementChild).toBe(tapTarget);

    fireEvent.click(tapTarget);
    expect(feltCover.childElementCount).toBe(0);
  },
);
