// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "../../test/memoryStorage";
import { createAppError } from "../../utils/appError";
import { rememberGuestName } from "../../utils/deviceIdentity";
import { LobbySeatNotice } from "./LobbySeatNotice";

const auth = vi.hoisted(() => ({ user: null as { username: string } | null }));
vi.mock("../../contexts/authState", () => ({ useAuth: () => auth }));
vi.mock("../../api/client", () => ({
  getLobby: async () => ({
    join_code: "ABC123",
    players: [],
    puppet_count: 0,
    target_player_count: 4,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("offers a guest's remembered name until the login check finds an account, whose name wins", async () => {
  installMemoryLocalStorage();
  rememberGuestName("Kellogg");
  const notice = () => (
    <MemoryRouter>
      <LobbySeatNotice
        gameId="game-1"
        seat={{ kind: "none" }}
        onJoined={() => {}}
        onClaim={() => {}}
        onTakeBack={() => {}}
      />
    </MemoryRouter>
  );
  const { rerender } = render(notice());
  await act(async () => {});
  const name = screen.getByLabelText<HTMLInputElement>("Your Name");
  expect(name.value).toBe("Kellogg");

  auth.user = { username: "Jaya" };
  rerender(notice());

  expect(name.value).toBe("Jaya");
});

it("says a moved seat is open somewhere else, which holds for another tab and another device", () => {
  const moved = createAppError({
    code: "SEAT_MOVED",
    context: "lobby-connection",
    fallbackMessage: "Seat opened elsewhere",
  });
  render(
    <MemoryRouter>
      <LobbySeatNotice
        gameId="game-1"
        seat={{ kind: "lost", error: moved }}
        onJoined={() => {}}
        onClaim={() => {}}
        onTakeBack={() => {}}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText("Open somewhere else")).toBeTruthy();
});
