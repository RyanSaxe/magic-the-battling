// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { ResumableSeat } from "../hooks/useResumableGames";
import { CloseSeatDialog, ResumeGamesDialog, ResumeShelf } from "./ResumeGame";

const closeSeat = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../api/client", () => ({
  closeSeat,
  rejoinGame: vi.fn(),
}));
vi.mock("../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));

afterEach(() => {
  cleanup();
  closeSeat.mockClear();
});

function seat(id: string, name: string): ResumableSeat {
  return {
    gameId: id,
    playerName: "Alice",
    kind: "game",
    lastActiveAt: null,
    joinCode: null,
    cubeId: id,
    cubeName: name,
    cubeImageUri: null,
    playMode: "limited",
    useUpgrades: true,
    playerCount: 4,
    canClose: true,
    stage: 3,
    round: 2,
    poison: 0,
  };
}

function Harness({ initial }: { initial: ResumableSeat[] }): ReactNode {
  const [seats, setSeats] = useState(initial);
  const [showAll, setShowAll] = useState(false);
  const [closing, setClosing] = useState<ResumableSeat | null>(null);
  return (
    <MemoryRouter>
      <ResumeShelf
        seats={seats}
        onCloseSeat={setClosing}
        onShowAll={() => setShowAll(true)}
      />
      {showAll && (
        <ResumeGamesDialog
          seats={seats}
          onClose={() => setShowAll(false)}
          onCloseSeat={setClosing}
        />
      )}
      {closing && (
        <CloseSeatDialog
          seat={closing}
          onKeep={() => setClosing(null)}
          onClosed={() => {
            setSeats((prev) =>
              prev.filter((item) => item.gameId !== closing.gameId),
            );
            setClosing(null);
          }}
        />
      )}
    </MemoryRouter>
  );
}

it("keeps ResumeShelf sleek with only a close button when a single active game exists", () => {
  render(<Harness initial={[seat("g1", "Pitfight")]} />);

  expect(screen.getByText("Pitfight")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Close Pitfight as Alice" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
});

it("opens In progress modal from +N more, keeps modal open on Escape over CloseSeatDialog, and closes when last game closes", async () => {
  render(<Harness initial={[seat("g1", "Pitfight"), seat("g2", "Vintage")]} />);

  fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
  const modal = screen.getByRole("dialog", { name: "In progress" });
  expect(within(modal).getByText("Pitfight")).toBeTruthy();
  expect(within(modal).getByText("Vintage")).toBeTruthy();

  // Closing one game opens CloseSeatDialog on top; Escape closes only CloseSeatDialog.
  fireEvent.click(
    within(modal).getByRole("button", { name: "Close Pitfight as Alice" }),
  );
  expect(screen.getByRole("dialog", { name: "Close this game?" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Close this game?" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "In progress" })).toBeTruthy();

  // Close both games -> modal closes automatically.
  fireEvent.click(
    within(modal).getByRole("button", { name: "Close Pitfight as Alice" }),
  );
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Close this game?" })).getByRole(
      "button",
      { name: "Close Game" },
    ),
  );
  await screen.findByRole("button", { name: "Close Vintage as Alice" });

  fireEvent.click(
    within(screen.getByRole("dialog", { name: "In progress" })).getByRole(
      "button",
      { name: "Close Vintage as Alice" },
    ),
  );
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Close this game?" })).getByRole(
      "button",
      { name: "Close Game" },
    ),
  );

  await vi.waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "In progress" })).toBeNull();
  });
  expect(closeSeat).toHaveBeenCalledTimes(2);
});
