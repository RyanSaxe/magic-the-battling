import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authGetMe, authLogin, authLogout } from "./client";

const USER = { user_id: "u1", username: "alice" };

function createStorageMock(): Pick<Storage, "getItem" | "setItem"> {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
  };
}

function meRequests(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/auth/me").length;
}

describe("authGetMe", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let signedIn: boolean;

  beforeEach(() => {
    signedIn = false;
    fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/login") {
        signedIn = true;
        return new Response(JSON.stringify(USER), { status: 200 });
      }
      if (url === "/api/auth/logout") {
        signedIn = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return signedIn
        ? new Response(JSON.stringify(USER), { status: 200 })
        : new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
          });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: createStorageMock() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops asking the server once it has said there is no session", async () => {
    expect(await authGetMe()).toBeNull();
    expect(await authGetMe()).toBeNull();
    expect(meRequests(fetchMock)).toBe(1);
  });

  it("asks the server again after logging in", async () => {
    await authGetMe();
    await authLogin("alice", "secret");

    expect(await authGetMe()).toEqual(USER);
    expect(meRequests(fetchMock)).toBe(2);
  });

  it("keeps a session the client has not recorded yet", async () => {
    signedIn = true;

    expect(await authGetMe()).toEqual(USER);
    expect(await authGetMe()).toEqual(USER);
  });

  it("stops asking the server after logging out", async () => {
    await authLogin("alice", "secret");
    await authLogout();

    expect(await authGetMe()).toBeNull();
    expect(meRequests(fetchMock)).toBe(0);
  });

  it("doesn't count a logout the server failed", async () => {
    await authLogin("alice", "secret");
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));

    await expect(authLogout()).rejects.toThrow();
    expect(await authGetMe()).toEqual(USER);
  });
});
