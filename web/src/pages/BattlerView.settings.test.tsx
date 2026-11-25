// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { UserBattler } from "../types";
import { BattlerView } from "./BattlerView";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const preset = vi.hoisted(() => ({
  id: 7,
  cube_id: "vintage",
  cube_name: "Powered Cube",
  display_name: "Vintage Pod",
  play_mode: "limited",
  puppet_count: 3,
}));

const deleteBattler = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../api/client", () => ({
  getBattler: async () => preset,
  getBattlerGames: async () => ({ games: [], has_more: false, total_games: 0 }),
  // Like the server, a null leaves a field as it was.
  updateBattler: async (_id: number, updates: Partial<UserBattler>) => ({
    ...preset,
    ...Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== null),
    ),
  }),
  deleteBattler,
}));
vi.mock("../contexts", () => ({ useToast: () => ({ addToast: () => {} }) }));
vi.mock("../contexts/authState", () => ({
  useAuth: () => ({ user: { username: "tester" }, loading: false }),
}));

afterEach(() => {
  cleanup();
  deleteBattler.mockClear();
});

it("saves an emptied Display Name as no name when Enter is pressed", async () => {
  render(
    <MemoryRouter initialEntries={["/dashboard/list/7"]}>
      <Routes>
        <Route path="/dashboard/list/:listId" element={<BattlerView />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const settings = screen.getByRole("dialog", { name: "Settings" });
  const name =
    within(settings).getByDisplayValue<HTMLInputElement>("Vintage Pod");
  fireEvent.change(name, { target: { value: "" } });

  // jsdom has no Enter to submit, which in a browser clicks the field's form's first submit button.
  const submitButtons = [
    ...(name.form?.querySelectorAll("button") ?? []),
  ].filter((button) => button.type === "submit");
  expect(submitButtons.map((button) => button.textContent)).toEqual(["Save"]);
  fireEvent.click(submitButtons[0]);

  expect(
    await screen.findByRole("heading", { name: "Powered Cube" }),
  ).toBeTruthy();
});

it("confirms preset deletion over Settings, keeping edits when Escape cancels it", async () => {
  render(
    <MemoryRouter initialEntries={["/dashboard/list/7"]}>
      <Routes>
        <Route path="/dashboard/list/:listId" element={<BattlerView />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const settings = screen.getByRole("dialog", { name: "Settings" });
  const name =
    within(settings).getByDisplayValue<HTMLInputElement>("Vintage Pod");
  fireEvent.change(name, { target: { value: "Draft Night" } });

  fireEvent.click(within(settings).getByRole("button", { name: "Delete" }));
  const confirm = screen.getByRole("dialog", { name: "Delete this preset?" });
  expect(
    within(confirm).getByText("Your finished games stay in Recent Games."),
  ).toBeTruthy();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(
    screen.queryByRole("dialog", { name: "Delete this preset?" }),
  ).toBeNull();
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(within(settings).getByDisplayValue("Draft Night")).toBeTruthy();
  expect(deleteBattler).not.toHaveBeenCalled();

  fireEvent.click(within(settings).getByRole("button", { name: "Delete" }));
  const confirmAgain = screen.getByRole("dialog", {
    name: "Delete this preset?",
  });
  fireEvent.click(within(confirmAgain).getByRole("button", { name: "Delete" }));

  expect(await screen.findByText("Dashboard")).toBeTruthy();
  expect(deleteBattler).toHaveBeenCalledWith(7);
});
