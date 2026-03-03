import { describe, expect, it } from "vitest";
import { pickAutoReconnectPlayer, type ReconnectStatusPlayer } from "./deviceIdentity";

const PLAYERS: ReconnectStatusPlayer[] = [
  { name: "Alice", is_connected: false, is_puppet: false },
  { name: "Bob", is_connected: true, is_puppet: false },
  { name: "Puppet 1", is_connected: false, is_puppet: true },
];

describe("pickAutoReconnectPlayer", () => {
  it("returns null when there is no remembered player", () => {
    expect(pickAutoReconnectPlayer(null, PLAYERS)).toBeNull();
  });

  it("returns remembered player when disconnected", () => {
    expect(pickAutoReconnectPlayer("Alice", PLAYERS)).toBe("Alice");
  });

  it("returns null when remembered player is currently connected", () => {
    expect(pickAutoReconnectPlayer("Bob", PLAYERS)).toBeNull();
  });

  it("returns null when remembered player is missing", () => {
    expect(pickAutoReconnectPlayer("Charlie", PLAYERS)).toBeNull();
  });

  it("never auto-reconnects puppet seats", () => {
    expect(pickAutoReconnectPlayer("Puppet 1", PLAYERS)).toBeNull();
  });
});

