import { vi } from "vitest";

// Node 25+ defines its own localStorage global, which stays undefined without --localstorage-file and hides
// jsdom's. Tests that need localStorage install this in-memory one instead.
export function installMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", {
    value: storage,
    configurable: true,
  });
  return storage;
}
