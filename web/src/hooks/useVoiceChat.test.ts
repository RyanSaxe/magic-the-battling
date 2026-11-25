// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVoiceChat } from "./useVoiceChat";
import {
  BASE_OFFER_REPEAT_DELAY_MS,
  BASE_RETRY_DELAY_MS,
  DISCONNECTED_GRACE_MS,
} from "../utils/voiceChat";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface FakeTrack {
  enabled: boolean;
  stopped: boolean;
  stop: () => void;
}

interface FakeSender {
  track: FakeTrack | null;
  replacedWith: (FakeTrack | null)[];
  replaceTrack: (next: FakeTrack | null) => Promise<void>;
}

function createFakeStream(): {
  stream: MediaStream;
  track: FakeTrack;
} {
  const track: FakeTrack = {
    enabled: true,
    stopped: false,
    stop() {
      track.stopped = true;
    },
  };
  const streamLike = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  return {
    // Minimal MediaStream fake for WebRTC signaling tests in jsdom.
    stream: streamLike as unknown as MediaStream,
    track,
  };
}

class FakePeerConnection {
  static made: FakePeerConnection[] = [];
  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate: ((event: { candidate: null }) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  senders: FakeSender[] = [];
  iceCandidates: RTCIceCandidateInit[] = [];
  offerOptions: (RTCOfferOptions | undefined)[] = [];
  rollbacks = 0;
  closed = false;
  private offerSeq = 0;

  constructor() {
    FakePeerConnection.made.push(this);
  }

  addTrack(track: FakeTrack): FakeSender {
    const sender: FakeSender = {
      track,
      replacedWith: [],
      async replaceTrack(next: FakeTrack | null) {
        sender.track = next;
        sender.replacedWith.push(next);
      },
    };
    this.senders.push(sender);
    return sender;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.iceCandidates.push(candidate);
  }

  async createOffer(
    options?: RTCOfferOptions,
  ): Promise<RTCSessionDescriptionInit> {
    this.offerOptions.push(options);
    this.offerSeq++;
    const tag = options?.iceRestart ? "restart" : "initial";
    return { type: "offer", sdp: `${tag}-offer-${this.offerSeq}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: "answer",
      sdp: `answer-to-${this.remoteDescription?.sdp ?? "none"}`,
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    if (description.type === "rollback") {
      this.rollbacks++;
      this.localDescription = null;
      this.signalingState = "stable";
      return;
    }
    this.localDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    if (description.type === "offer" && this.signalingState !== "stable") {
      throw new DOMException(
        "Cannot set remote offer while not stable",
        "InvalidStateError",
      );
    }
    this.remoteDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
  }

  emitConnectionState(next: RTCPeerConnectionState) {
    this.connectionState = next;
    this.onconnectionstatechange?.();
  }

  emitIceConnectionState(next: RTCIceConnectionState) {
    this.iceConnectionState = next;
    this.oniceconnectionstatechange?.();
  }

  close() {
    this.closed = true;
    this.signalingState = "closed";
    this.connectionState = "closed";
  }
}

function stubVoiceBrowser(getUserMedia: () => Promise<MediaStream>) {
  FakePeerConnection.made = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    "AudioContext",
    class {
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
      createAnalyser() {
        return { frequencyBinCount: 1 };
      }
      async close() {}
    },
  );
}

type SignalRef = Parameters<typeof useVoiceChat>[3];

function createSignalHarness() {
  const inboxes: Record<string, SignalRef> = {};
  const sent: {
    from: string;
    to: string;
    signalType: string;
    data: unknown;
    delivered: boolean;
  }[] = [];
  let shouldDeliver = (_signal: {
    from: string;
    to: string;
    signalType: string;
  }) => true;

  const inboxFor = (name: string): SignalRef => {
    if (!inboxes[name]) inboxes[name] = { current: null };
    return inboxes[name];
  };

  const sendFrom =
    (from: string) => (_action: string, payload: Record<string, unknown>) => {
      const to =
        typeof payload.target_player === "string" ? payload.target_player : "";
      const signalType =
        typeof payload.signal_type === "string" ? payload.signal_type : "";
      const handler = inboxes[to]?.current ?? null;
      const delivered =
        handler !== null && shouldDeliver({ from, to, signalType });
      sent.push({ from, to, signalType, data: payload.data, delivered });
      if (delivered) {
        handler({
          signal_type: signalType,
          data: payload.data,
          from_player: from,
        });
      }
    };

  return {
    inboxFor,
    sendFrom,
    sent,
    setDeliveryFilter(
      filter: (signal: {
        from: string;
        to: string;
        signalType: string;
      }) => boolean,
    ) {
      shouldDeliver = filter;
    },
  };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

it("asks for the microphone and says it was refused once, until Voice has been off", async () => {
  const prompts: (() => void)[] = [];
  const getUserMedia = () =>
    new Promise<MediaStream>((_, reject) => {
      prompts.push(() =>
        reject(new DOMException("Permission denied", "NotAllowedError")),
      );
    });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  let notices = 0;
  const send = () => {};
  const signalRef: SignalRef = { current: null };
  const { result, rerender } = renderHook(
    ({ peers, self }: { peers: string[]; self: string | null }) =>
      useVoiceChat(send, peers, self, signalRef, () => {
        notices++;
      }),
    { initialProps: { peers: ["Bob"], self: "Alice" as string | null } },
  );
  const update = (peers: string[], self: string | null = "Alice") =>
    act(async () => rerender({ peers, self }));

  await update(["Bob"]);
  await update(["Bob", "Cara"]);
  expect(prompts).toHaveLength(1);

  await act(async () => prompts[0]());
  expect(result.current.state.isAvailable).toBe(false);
  await update(["Bob", "Cara"]);
  await update(["Cara"]);
  // A fight against a puppet has nobody to talk to, with Voice still on.
  await update([]);
  await update(["Bob", "Cara"]);
  expect(prompts).toHaveLength(1);
  expect(notices).toBe(1);

  await update([], null);
  expect(result.current.state.isAvailable).toBe(true);
  await update(["Bob"]);
  expect(prompts).toHaveLength(2);
});

it("keeps one RTCPeerConnection per opponent and requests the microphone once across phases", async () => {
  const { stream, track } = createFakeStream();
  let micCalls = 0;
  stubVoiceBrowser(async () => {
    micCalls++;
    return stream;
  });

  const harness = createSignalHarness();
  const { result, rerender } = renderHook(
    ({ peers, self }: { peers: string[]; self: string | null }) =>
      useVoiceChat(
        harness.sendFrom("Alice"),
        peers,
        self,
        harness.inboxFor("Alice"),
      ),
    {
      initialProps: {
        peers: ["Bob", "Cara"],
        self: "Alice" as string | null,
      },
    },
  );

  await advance(0);
  expect(micCalls).toBe(1);
  expect(FakePeerConnection.made).toHaveLength(2);
  const [bobPc, caraPc] = FakePeerConnection.made;
  await act(async () => {
    bobPc.emitConnectionState("connected");
    caraPc.emitConnectionState("connected");
  });
  expect(result.current.state.peers).toEqual([
    { name: "Bob", connectionState: "connected" },
    { name: "Cara", connectionState: "connected" },
  ]);

  // Entering battle against Bob parks Cara without closing her RTCPeerConnection.
  await act(async () => rerender({ peers: ["Bob"], self: "Alice" }));
  expect(FakePeerConnection.made).toHaveLength(2);
  expect(caraPc.closed).toBe(false);
  expect(caraPc.senders[0].track).toBeNull();
  expect(result.current.state.peers).toEqual([
    { name: "Bob", connectionState: "connected" },
  ]);

  // Entering a puppet battle parks all peers without stopping the microphone.
  await act(async () => rerender({ peers: [], self: "Alice" }));
  expect(track.stopped).toBe(false);
  expect(bobPc.closed).toBe(false);
  expect(caraPc.closed).toBe(false);
  expect(bobPc.senders[0].track).toBeNull();
  expect(result.current.state.peers).toEqual([]);

  // Returning to build reuses both existing RTCPeerConnections and the original mic stream.
  await act(async () => rerender({ peers: ["Bob", "Cara"], self: "Alice" }));
  expect(micCalls).toBe(1);
  expect(FakePeerConnection.made).toHaveLength(2);
  expect(bobPc.senders[0].track).toBe(track);
  expect(caraPc.senders[0].track).toBe(track);
  expect(result.current.state.peers).toEqual([
    { name: "Bob", connectionState: "connected" },
    { name: "Cara", connectionState: "connected" },
  ]);

  // Turning Voice off closes all peer connections and releases the microphone.
  await act(async () => rerender({ peers: [], self: null }));
  expect(bobPc.closed).toBe(true);
  expect(caraPc.closed).toBe(true);
  expect(track.stopped).toBe(true);
});

it("resends a lost WebRTC offer after a timeout and stops once answered", async () => {
  const aliceMedia = createFakeStream();
  const bobMedia = createFakeStream();
  let calls = 0;
  stubVoiceBrowser(async () =>
    calls++ === 0 ? aliceMedia.stream : bobMedia.stream,
  );

  const harness = createSignalHarness();
  let droppedOffers = 0;
  harness.setDeliveryFilter(({ signalType }) => {
    if (signalType === "offer" && droppedOffers < 2) {
      droppedOffers++;
      return false;
    }
    return true;
  });

  renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Alice"),
      ["Bob"],
      "Alice",
      harness.inboxFor("Alice"),
    ),
  );
  renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Bob"),
      ["Alice"],
      "Bob",
      harness.inboxFor("Bob"),
    ),
  );

  await advance(0);
  // Offer #1 was sent immediately and dropped.
  expect(
    harness.sent.filter((s) => s.from === "Alice" && s.signalType === "offer"),
  ).toHaveLength(1);
  expect(
    harness.sent.filter((s) => s.from === "Bob" && s.signalType === "answer"),
  ).toHaveLength(0);

  // Offer #2 fires after 2s and is also dropped.
  await advance(BASE_OFFER_REPEAT_DELAY_MS);
  expect(
    harness.sent.filter((s) => s.from === "Alice" && s.signalType === "offer"),
  ).toHaveLength(2);
  expect(
    harness.sent.filter((s) => s.from === "Bob" && s.signalType === "answer"),
  ).toHaveLength(0);

  // Offer #3 fires after 4s backoff and is delivered -> Bob answers once.
  await advance(BASE_OFFER_REPEAT_DELAY_MS * 2);
  expect(
    harness.sent.filter((s) => s.from === "Alice" && s.signalType === "offer"),
  ).toHaveLength(3);
  expect(
    harness.sent.filter((s) => s.from === "Bob" && s.signalType === "answer"),
  ).toHaveLength(1);
  expect(FakePeerConnection.made.map((pc) => pc.signalingState)).toEqual([
    "stable",
    "stable",
  ]);

  // No further offers are sent after the handshake settles.
  const totalAfterHandshake = harness.sent.length;
  await advance(30_000);
  expect(harness.sent).toHaveLength(totalAfterHandshake);
});

it("resolves offer glare so polite peer rolls back and impolite peer wins on the same PC", async () => {
  const aliceMedia = createFakeStream();
  const bobMedia = createFakeStream();
  let calls = 0;
  stubVoiceBrowser(async () =>
    calls++ === 0 ? aliceMedia.stream : bobMedia.stream,
  );

  const harness = createSignalHarness();
  renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Alice"),
      ["Bob"],
      "Alice",
      harness.inboxFor("Alice"),
    ),
  );
  renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Bob"),
      ["Alice"],
      "Bob",
      harness.inboxFor("Bob"),
    ),
  );

  await advance(0);
  expect(FakePeerConnection.made).toHaveLength(2);
  const [alicePc, bobPc] = FakePeerConnection.made;
  await act(async () => {
    alicePc.emitConnectionState("connected");
    bobPc.emitConnectionState("connected");
  });

  // Queue outgoing offers while both sides drop simultaneously so both enter have-local-offer.
  const queuedSignals: {
    to: string;
    from: string;
    signalType: string;
    data: unknown;
  }[] = [];
  harness.setDeliveryFilter(() => false);

  await act(async () => {
    alicePc.emitConnectionState("failed");
    bobPc.emitConnectionState("failed");
  });
  await advance(BASE_RETRY_DELAY_MS);

  expect(alicePc.signalingState).toBe("have-local-offer");
  expect(bobPc.signalingState).toBe("have-local-offer");

  const restartOffers = harness.sent.filter(
    (s) => s.signalType === "offer" && !s.delivered,
  );
  expect(restartOffers).toHaveLength(2);
  for (const offer of restartOffers) {
    queuedSignals.push({
      to: offer.to,
      from: offer.from,
      signalType: offer.signalType,
      data: offer.data,
    });
  }

  // Deliver the colliding offers in both directions simultaneously.
  harness.setDeliveryFilter(() => true);
  await act(async () => {
    for (const sig of queuedSignals) {
      harness.inboxFor(sig.to).current?.({
        signal_type: sig.signalType,
        data: sig.data,
        from_player: sig.from,
      });
    }
  });
  await advance(0);

  // Polite Bob rolled back his colliding offer; impolite Alice ignored Bob's offer.
  expect(bobPc.rollbacks).toBe(1);
  expect(alicePc.rollbacks).toBe(0);
  expect(alicePc.signalingState).toBe("stable");
  expect(bobPc.signalingState).toBe("stable");
  // Still only one RTCPeerConnection per peer.
  expect(FakePeerConnection.made).toHaveLength(2);
});

it("connects to a player who comes back, and allows the microphone, minutes after the offer", async () => {
  const { stream } = createFakeStream();
  let bobAllows = () => {};
  let calls = 0;
  stubVoiceBrowser(() => {
    if (calls++ === 0) return Promise.resolve(stream);
    return new Promise((resolve) => {
      bobAllows = () => resolve(stream);
    });
  });

  const harness = createSignalHarness();
  const failed: string[] = [];
  const join = (self: string, peers: string[]) => {
    renderHook(() =>
      useVoiceChat(
        harness.sendFrom(self),
        peers,
        self,
        harness.inboxFor(self),
        undefined,
        (peer) => failed.push(peer),
      ),
    );
  };
  const MINUTE = 60_000;

  join("Alice", ["Bob"]);
  await advance(5 * MINUTE);
  join("Bob", ["Alice"]);
  await advance(5 * MINUTE);
  await act(async () => bobAllows());
  await advance(0);

  expect(
    harness.sent.filter((s) => s.from === "Bob" && s.signalType === "answer"),
  ).toHaveLength(1);
  expect(FakePeerConnection.made.map((pc) => pc.signalingState)).toEqual([
    "stable",
    "stable",
  ]);
  expect(failed).toEqual([]);
  expect(harness.sent.length).toBeLessThan(80);
  const once = harness.sent.length;
  await advance(MINUTE);
  expect(harness.sent).toHaveLength(once);
});

it("reconnects an established peer after a mid-game server restart without recreating PCs", async () => {
  const aliceMedia = createFakeStream();
  const bobMedia = createFakeStream();
  let calls = 0;
  stubVoiceBrowser(async () =>
    calls++ === 0 ? aliceMedia.stream : bobMedia.stream,
  );

  const harness = createSignalHarness();
  const exhausted: string[] = [];
  const alice = renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Alice"),
      ["Bob"],
      "Alice",
      harness.inboxFor("Alice"),
      undefined,
      (peer) => exhausted.push(peer),
    ),
  );
  renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Bob"),
      ["Alice"],
      "Bob",
      harness.inboxFor("Bob"),
    ),
  );

  await advance(0);
  const [alicePc, bobPc] = FakePeerConnection.made;
  await act(async () => {
    alicePc.emitConnectionState("connected");
    bobPc.emitConnectionState("connected");
  });

  // Server restarts: Bob's WS is temporarily down while Alice detects failure.
  harness.setDeliveryFilter(() => false);
  await act(async () => {
    alicePc.emitConnectionState("failed");
  });
  await advance(BASE_RETRY_DELAY_MS);
  // First ICE-restart offer was dropped during restart.
  expect(alicePc.offerOptions.at(-1)).toEqual({ iceRestart: true });
  expect(alicePc.signalingState).toBe("have-local-offer");

  // Server & Bob's WS come back before the offer-resend timeout fires.
  harness.setDeliveryFilter(() => true);
  await advance(BASE_OFFER_REPEAT_DELAY_MS);

  expect(alicePc.signalingState).toBe("stable");
  expect(bobPc.signalingState).toBe("stable");
  await act(async () => {
    alicePc.emitConnectionState("connected");
    bobPc.emitConnectionState("connected");
  });

  expect(alice.result.current.state.peers).toEqual([
    { name: "Bob", connectionState: "connected" },
  ]);
  expect(FakePeerConnection.made).toHaveLength(2);
  expect(exhausted).toEqual([]);
});

it("serializes reconnect attempts with exponential backoff so concurrent failures cannot race", async () => {
  const { stream } = createFakeStream();
  stubVoiceBrowser(async () => stream);

  const harness = createSignalHarness();
  const exhausted: string[] = [];
  const { result } = renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Alice"),
      ["Bob"],
      "Alice",
      harness.inboxFor("Alice"),
      undefined,
      (peer) => exhausted.push(peer),
    ),
  );

  await advance(0);
  const [pc] = FakePeerConnection.made;
  await act(async () => {
    pc.emitConnectionState("connected");
  });

  // Transient disconnect that recovers before the 4s grace triggers zero ICE restarts.
  await act(async () => {
    pc.emitConnectionState("disconnected");
  });
  await advance(DISCONNECTED_GRACE_MS - 500);
  await act(async () => {
    pc.emitConnectionState("connected");
  });
  expect(pc.offerOptions).toHaveLength(1);

  // Concurrent failure burst schedules only ONE attempt (1s backoff), never racing into giving up.
  await act(async () => {
    pc.emitConnectionState("disconnected");
    pc.emitConnectionState("failed");
    pc.emitIceConnectionState("failed");
    pc.emitConnectionState("failed");
  });
  expect(exhausted).toEqual([]);
  await advance(BASE_RETRY_DELAY_MS - 1);
  expect(pc.offerOptions).toHaveLength(1);

  // Retry #1 fires at 1s.
  await advance(1);
  expect(pc.offerOptions).toHaveLength(2);
  expect(pc.offerOptions[1]).toEqual({ iceRestart: true });

  // Retry #1 fails -> 2s backoff (concurrent bursts still ignored).
  await act(async () => {
    pc.emitConnectionState("failed");
    pc.emitIceConnectionState("failed");
  });
  await advance(BASE_RETRY_DELAY_MS * 2 - 1);
  expect(pc.offerOptions).toHaveLength(2);
  await advance(1);
  expect(pc.offerOptions).toHaveLength(3);

  // Retry #2 fails -> 4s backoff.
  await act(async () => {
    pc.emitConnectionState("failed");
  });
  await advance(BASE_RETRY_DELAY_MS * 4 - 1);
  expect(pc.offerOptions).toHaveLength(3);
  await advance(1);
  expect(pc.offerOptions).toHaveLength(4);
  expect(exhausted).toEqual([]);

  // Retry #3 fails -> retries exhausted once, state becomes failed.
  await act(async () => {
    pc.emitConnectionState("failed");
    pc.emitIceConnectionState("failed");
  });
  expect(exhausted).toEqual(["Bob"]);
  expect(result.current.state.peers).toEqual([
    { name: "Bob", connectionState: "failed" },
  ]);
  // Still the single original RTCPeerConnection.
  expect(FakePeerConnection.made).toHaveLength(1);
});

it("persists self and peer mute toggles and tracks remote mute_state signals", async () => {
  const { stream, track } = createFakeStream();
  stubVoiceBrowser(async () => stream);

  const harness = createSignalHarness();
  const { result } = renderHook(() =>
    useVoiceChat(
      harness.sendFrom("Alice"),
      ["Bob"],
      "Alice",
      harness.inboxFor("Alice"),
    ),
  );

  await advance(0);
  await act(async () => {
    result.current.toggleSelfMute();
  });
  expect(track.enabled).toBe(false);
  expect(result.current.state.isMuted).toBe(true);
  expect(sessionStorage.getItem("mtb_voice_muted")).toBe("true");
  expect(
    harness.sent.some(
      (s) =>
        s.from === "Alice" &&
        s.to === "Bob" &&
        s.signalType === "mute_state" &&
        JSON.stringify(s.data) === JSON.stringify({ muted: true }),
    ),
  ).toBe(true);

  await act(async () => {
    result.current.togglePeerMute("Bob");
  });
  expect(result.current.state.mutedPeers.has("Bob")).toBe(true);
  expect(sessionStorage.getItem("mtb_voice_muted_peers")).toBe('["Bob"]');

  await act(async () => {
    harness.inboxFor("Alice").current?.({
      signal_type: "mute_state",
      data: { muted: true },
      from_player: "Bob",
    });
  });
  expect(result.current.state.remoteMutedPeers.has("Bob")).toBe(true);
});
