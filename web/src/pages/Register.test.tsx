// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Register } from "./Register";

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const registered: string[][] = [];
const register = vi.hoisted(() => vi.fn());

vi.mock("../contexts", () => ({ useToast: () => ({ addToast: () => {} }) }));
vi.mock("../contexts/authState", () => ({
  useAuth: () => ({ user: null, loading: false, register }),
}));

beforeEach(() => {
  registered.length = 0;
  register.mockReset();
  register.mockImplementation(async (...account: string[]) => {
    registered.push(account);
  });
});

afterEach(cleanup);

it("says what keeps Create Account off, then creates the account once the form is ready", async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
  const field = (label: string) => screen.getByLabelText(label);
  const reason = (label: string) =>
    field(label).getAttribute("aria-invalid") &&
    document.getElementById(field(label).getAttribute("aria-describedby")!)
      ?.textContent;
  const type = (label: string, value: string) =>
    fireEvent.change(field(label), { target: { value } });
  const submit = screen.getByRole<HTMLButtonElement>("button", {
    name: "Create Account",
  });

  expect(reason("Email")).toBeNull();
  expect(submit.disabled).toBe(true);

  fireEvent.focus(field("Password"));
  expect(reason("Username")).toBe("Enter a username");
  expect(reason("Email")).toBe("Enter your email");

  type("Username", "jace-fan");
  type("Password", "short");
  type("Confirm Password", "other");
  expect(reason("Username")).toBe(
    "3-30 characters: letters, numbers, underscores",
  );
  expect(reason("Password")).toBe("At least 8 characters");
  expect(reason("Confirm Password")).toBe("Passwords don't match");
  expect(submit.disabled).toBe(true);

  type("Username", "jace_fan");
  type("Email", "jace@example.com");
  type("Password", "password1");
  type("Confirm Password", "password1");
  expect(submit.disabled).toBe(false);

  await act(async () => submit.click());
  expect(registered).toEqual([["jace_fan", "password1", "jace@example.com"]]);
});

it("drops the sign-up error once the player edits the form", async () => {
  const TAKEN = "That username is already taken.";
  register.mockRejectedValueOnce(new Error(TAKEN));
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type("Username", "jace_fan");
  type("Email", "jace@example.com");
  type("Password", "password1");
  type("Confirm Password", "password1");
  await act(async () =>
    screen.getByRole("button", { name: "Create Account" }).click(),
  );
  expect(screen.queryByText(TAKEN)).not.toBeNull();

  type("Username", "jace_fan2");
  expect(screen.queryByText(TAKEN)).toBeNull();
});
