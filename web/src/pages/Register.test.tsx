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
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: (): boolean => false,
  });
});

const registered: string[][] = [];
const register = vi.hoisted(() => vi.fn());

vi.mock("../contexts", () => ({
  useToast: (): { addToast: () => void } => ({ addToast: (): void => {} }),
}));
vi.mock("../contexts/authState", () => ({
  useAuth: (): {
    user: null;
    loading: boolean;
    register: typeof register;
  } => ({ user: null, loading: false, register }),
}));

beforeEach(() => {
  registered.length = 0;
  register.mockReset();
  register.mockImplementation(async (...account: string[]) => {
    registered.push(account);
  });
});

afterEach(cleanup);

function getField(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function typeInField(label: string, value: string): boolean {
  return fireEvent.change(getField(label), { target: { value } });
}

function fieldReason(label: string): string | null | undefined {
  const input = getField(label);
  const invalid = input.getAttribute("aria-invalid");
  if (!invalid) return null;
  const describedBy = input.getAttribute("aria-describedby");
  return describedBy ? document.getElementById(describedBy)?.textContent : null;
}

it("says what keeps Create Account off, then creates the account once the form is ready", async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
  const submit = screen.getByRole<HTMLButtonElement>("button", {
    name: "Create Account",
  });

  expect(fieldReason("Email")).toBeNull();
  expect(submit.disabled).toBe(true);

  fireEvent.focus(getField("Password"));
  expect(fieldReason("Username")).toBe("Enter a username");
  expect(fieldReason("Email")).toBe("Enter your email");

  typeInField("Username", "jace-fan");
  typeInField("Password", "short");
  typeInField("Confirm Password", "other");
  expect(fieldReason("Username")).toBe(
    "3-30 characters: letters, numbers, underscores",
  );
  expect(fieldReason("Password")).toBe("At least 8 characters");
  expect(fieldReason("Confirm Password")).toBe("Passwords don't match");
  expect(submit.disabled).toBe(true);

  typeInField("Username", "jace_fan");
  typeInField("Email", "jace@example.com");
  typeInField("Password", "password1");
  typeInField("Confirm Password", "password1");
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
  typeInField("Username", "jace_fan");
  typeInField("Email", "jace@example.com");
  typeInField("Password", "password1");
  typeInField("Confirm Password", "password1");
  await act(async () =>
    screen.getByRole("button", { name: "Create Account" }).click(),
  );
  expect(screen.queryByText(TAKEN)).not.toBeNull();

  typeInField("Username", "jace_fan2");
  expect(screen.queryByText(TAKEN)).toBeNull();
});
