// @vitest-environment jsdom
import type { ReactElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { installMemoryLocalStorage } from "../../test/memoryStorage";
import { createAppError } from "../../utils/appError";
import { rememberGuestName } from "../../utils/deviceIdentity";
import { LobbySeatNotice } from "./LobbySeatNotice";

interface MockAuthState {
  user: { username: string } | null;
}

const auth = vi.hoisted((): MockAuthState => ({ user: null }));
vi.mock("../../contexts/authState", () => ({
  useAuth: (): MockAuthState => auth,
}));
vi.mock("../../api/client", () => ({
  getLobby: async (): Promise<{
    join_code: string;
    players: never[];
    puppet_count: number;
    target_player_count: number;
  }> => ({
    join_code: "ABC123",
    players: [],
    puppet_count: 0,
    target_player_count: 4,
  }),
}));

function renderJoinNotice(): ReactElement {
  return (
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
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("offers a guest's remembered name until the login check finds an account, whose name wins", async () => {
  installMemoryLocalStorage();
  rememberGuestName("Kellogg");
  const { rerender } = render(renderJoinNotice());
  await act(async () => {});
  const name = screen.getByLabelText<HTMLInputElement>("Your Name");
  expect(name.value).toBe("Kellogg");

  auth.user = { username: "Jaya" };
  rerender(renderJoinNotice());

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
