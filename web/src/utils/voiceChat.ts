/**
 * Pure voice-chat helpers, signaling wire parsers, ICE configuration, and the
 * explicit per-peer WebRTC connection state machine.
 */
import type { GameState } from "../types";

export const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const MAX_RETRIES = 3;
export const BASE_RETRY_DELAY_MS = 1000;
export const DISCONNECTED_GRACE_MS = 4000;
export const BASE_OFFER_REPEAT_DELAY_MS = 2000;
export const MAX_OFFER_REPEAT_DELAY_MS = 10000;
export const MAX_PENDING_SIGNALS = 50;

export interface VoiceSignalPayload {
  signal_type: string;
  data: unknown;
  from_player: string;
}

export type PeerUiConnectionState =
  | "connecting"
  | "connected"
  | "failed"
  | "disconnected";

export type ReconnectReason = "disconnected" | "failed";

export type PeerConnectionPhase =
  | { kind: "awaiting_offer"; retryAttempt: number }
  | { kind: "offering"; retryAttempt: number; offerResendDelayMs: number }
  | { kind: "connecting"; retryAttempt: number }
  | { kind: "connected" }
  | { kind: "reconnecting"; reason: ReconnectReason; retryAttempt: number }
  | { kind: "failed" }
  | { kind: "closed" };

export function peerPhaseToUiState(
  phase: PeerConnectionPhase,
): PeerUiConnectionState {
  switch (phase.kind) {
    case "awaiting_offer":
    case "offering":
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "reconnecting":
      return phase.reason;
    case "failed":
      return "failed";
    case "closed":
      return "disconnected";
  }
}

export function retryDelayForAttempt(
  reason: ReconnectReason,
  retryAttempt: number,
): number {
  if (reason === "disconnected") return DISCONNECTED_GRACE_MS;
  return BASE_RETRY_DELAY_MS * 2 ** retryAttempt;
}

export function queuePendingSignal(
  waiting: readonly VoiceSignalPayload[],
  incoming: VoiceSignalPayload,
): VoiceSignalPayload[] {
  // Offers repeat while this player's microphone prompt waits, and only the newest needs an answer.
  const kept =
    incoming.signal_type === "offer"
      ? waiting.filter((signal) => signal.signal_type === "mute_state")
      : [...waiting];
  if (kept.length < MAX_PENDING_SIGNALS) {
    kept.push(incoming);
  }
  return kept;
}

function readField(data: object, key: string): unknown {
  if (!(key in data)) return undefined;
  const value: unknown = Reflect.get(data, key);
  return value;
}

function isSdpType(value: unknown): value is RTCSdpType {
  return (
    value === "offer" ||
    value === "answer" ||
    value === "pranswer" ||
    value === "rollback"
  );
}

export function parseSessionDescription(
  data: unknown,
): RTCSessionDescriptionInit | null {
  if (typeof data !== "object" || data === null) return null;
  const type = readField(data, "type");
  if (!isSdpType(type)) return null;
  const sdp = readField(data, "sdp");
  if (sdp !== undefined && typeof sdp !== "string") return null;
  return sdp === undefined ? { type } : { type, sdp };
}

function readOptionalStringOrNull(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function readOptionalNumberOrNull(value: unknown): number | null | undefined {
  return typeof value === "number" || value === null ? value : undefined;
}

export function parseIceCandidate(data: unknown): RTCIceCandidateInit | null {
  if (typeof data !== "object" || data === null) return null;
  const rawCandidate = readField(data, "candidate");
  const candidate = typeof rawCandidate === "string" ? rawCandidate : undefined;
  const sdpMid = readOptionalStringOrNull(readField(data, "sdpMid"));
  const sdpMLineIndex = readOptionalNumberOrNull(
    readField(data, "sdpMLineIndex"),
  );
  const usernameFragment = readOptionalStringOrNull(
    readField(data, "usernameFragment"),
  );
  if (
    candidate === undefined &&
    sdpMid === undefined &&
    sdpMLineIndex === undefined
  ) {
    return null;
  }
  return { candidate, sdpMid, sdpMLineIndex, usernameFragment };
}

export function parseMuteState(data: unknown): boolean | null {
  if (typeof data !== "object" || data === null || !("muted" in data)) {
    return null;
  }
  return typeof data.muted === "boolean" ? data.muted : null;
}

export function parseStringList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function getVoicePeerNames(gameState: GameState | null): string[] {
  if (!gameState) return [];

  const { self_player, current_battle, players } = gameState;
  if (self_player.phase === "battle" && current_battle) {
    if (current_battle.can_manipulate_opponent) {
      return [];
    }

    const opponent = players.find(
      (player) => player.name === current_battle.opponent_name,
    );
    return opponent && !opponent.is_puppet ? [opponent.name] : [];
  }

  return players
    .filter((player) => player.name !== self_player.name && !player.is_puppet)
    .map((player) => player.name);
}

export function isVoiceMicBlocked(
  voiceOn: boolean,
  state: { isAvailable: boolean; peers: readonly unknown[] },
): boolean {
  if (!voiceOn || state.isAvailable || state.peers.length > 0) return false;
  // Plain HTTP has no getUserMedia; don't call the mic blocked where the browser doesn't support it.
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export interface AudioDetector {
  stop: () => void;
}

export interface PeerCallbacks {
  sendSignal: (peerName: string, signalType: string, data: unknown) => void;
  isSelfMuted: () => boolean;
  onPeerStateChange: () => void;
  onAudioLevel: (peerName: string, level: number, speaking: boolean) => void;
  onClearAudioLevel: (peerName: string) => void;
  onRemoteMuteChange: (peerName: string, muted: boolean) => void;
  onRetriesExhausted: (peerName: string) => void;
  createAudioDetector: (
    stream: MediaStream,
    onLevel: (level: number, speaking: boolean) => void,
  ) => AudioDetector;
}

function retryAttemptOf(phase: PeerConnectionPhase): number {
  if (
    phase.kind === "connected" ||
    phase.kind === "failed" ||
    phase.kind === "closed"
  ) {
    return 0;
  }
  return phase.retryAttempt;
}

export class PeerConnectionController {
  readonly peerName: string;
  private readonly polite: boolean;
  private readonly localStream: MediaStream;
  private readonly callbacks: PeerCallbacks;
  private readonly pc: RTCPeerConnection;
  private readonly audioEl: HTMLAudioElement;
  private readonly senders: RTCRtpSender[] = [];
  private phase: PeerConnectionPhase = {
    kind: "awaiting_offer",
    retryAttempt: 0,
  };
  private active = true;
  private peerMuted: boolean;
  private detector: AudioDetector | null = null;
  private iceBuffer: RTCIceCandidateInit[] = [];
  private hasRemoteDesc = false;
  private makingOffer = false;
  private negotiationEpoch = 0;
  private offerTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private signalQueue: Promise<void> = Promise.resolve();

  constructor(
    peerName: string,
    selfPlayerName: string,
    localStream: MediaStream,
    peerMuted: boolean,
    callbacks: PeerCallbacks,
    iceServers: readonly RTCIceServer[] = DEFAULT_ICE_SERVERS,
  ) {
    this.peerName = peerName;
    this.polite = selfPlayerName > peerName;
    this.localStream = localStream;
    this.peerMuted = peerMuted;
    this.callbacks = callbacks;

    this.pc = new RTCPeerConnection({ iceServers: [...iceServers] });
    this.audioEl = document.createElement("audio");
    this.audioEl.autoplay = true;
    this.audioEl.muted = peerMuted;

    for (const track of localStream.getTracks()) {
      const sender = this.pc.addTrack(track, localStream);
      if (sender && typeof sender.replaceTrack === "function") {
        this.senders.push(sender);
      }
    }

    this.pc.onicecandidate = (event) => {
      if (event.candidate && !this.isClosed()) {
        this.callbacks.sendSignal(
          this.peerName,
          "ice",
          event.candidate.toJSON(),
        );
      }
    };
    this.pc.ontrack = (event) => this.handleRemoteTrack(event);
    this.pc.onconnectionstatechange = () => this.handleConnectionStateChange();
    this.pc.oniceconnectionstatechange = () =>
      this.handleIceConnectionStateChange();
  }

  start(bufferedSignals: readonly VoiceSignalPayload[]) {
    for (const signal of bufferedSignals) {
      this.enqueueSignal(signal);
    }
    if (!this.polite) {
      this.startOffer(false, 0);
    }
  }

  isActive(): boolean {
    return this.active && !this.isClosed();
  }

  getUiConnectionState(): PeerUiConnectionState {
    return peerPhaseToUiState(this.phase);
  }

  setPeerMuted(muted: boolean) {
    this.peerMuted = muted;
    this.audioEl.muted = !this.active || muted;
  }

  setActive(nextActive: boolean) {
    if (this.isClosed() || this.active === nextActive) return;
    this.active = nextActive;
    if (!nextActive) {
      this.park();
      return;
    }
    this.unpark();
  }

  enqueueSignal(payload: VoiceSignalPayload) {
    if (this.isClosed()) return;
    if (payload.signal_type === "mute_state") {
      const muted = parseMuteState(payload.data);
      if (muted !== null) {
        this.callbacks.onRemoteMuteChange(this.peerName, muted);
      }
      return;
    }
    this.signalQueue = this.signalQueue
      .then(() => this.processSignal(payload))
      .catch((err) => {
        console.error("Voice signal handling error:", err);
      });
  }

  close() {
    if (this.isClosed()) return;
    this.phase = { kind: "closed" };
    this.active = false;
    this.negotiationEpoch++;
    this.clearOfferTimer();
    this.clearReconnectTimer();
    this.detector?.stop();
    this.detector = null;
    this.callbacks.onClearAudioLevel(this.peerName);
    this.pc.close();
    this.audioEl.srcObject = null;
    this.audioEl.remove();
  }

  private isClosed(): boolean {
    return this.phase.kind === "closed";
  }

  private park() {
    this.clearOfferTimer();
    this.clearReconnectTimer();
    this.audioEl.muted = true;
    this.replaceOutgoingTrack(null);
    this.callbacks.onAudioLevel(this.peerName, 0, false);
    this.callbacks.onPeerStateChange();
  }

  private unpark() {
    this.audioEl.muted = this.peerMuted;
    const audioTrack = this.localStream.getAudioTracks()[0] ?? null;
    this.replaceOutgoingTrack(audioTrack);

    if (this.pc.connectionState === "connected") {
      this.phase = { kind: "connected" };
      this.callbacks.sendSignal(this.peerName, "mute_state", {
        muted: this.callbacks.isSelfMuted(),
      });
      this.callbacks.onPeerStateChange();
      return;
    }

    if (
      this.pc.connectionState === "failed" ||
      this.pc.connectionState === "disconnected"
    ) {
      this.startOffer(true, 0);
      return;
    }

    if (!this.polite) {
      if (this.phase.kind === "offering" && !this.makingOffer) {
        this.phase = {
          ...this.phase,
          offerResendDelayMs: BASE_OFFER_REPEAT_DELAY_MS,
        };
        this.sendCurrentOfferAndScheduleResend(this.negotiationEpoch);
      } else if (this.phase.kind !== "offering") {
        this.startOffer(this.hasRemoteDesc, 0);
      }
    }
    this.callbacks.onPeerStateChange();
  }

  private replaceOutgoingTrack(track: MediaStreamTrack | null) {
    for (const sender of this.senders) {
      void sender.replaceTrack(track).catch(() => {});
    }
  }

  private handleRemoteTrack(event: RTCTrackEvent) {
    if (this.isClosed()) return;
    const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
    this.audioEl.srcObject = remoteStream;
    this.detector?.stop();
    this.detector = this.callbacks.createAudioDetector(
      remoteStream,
      (level, speaking) => {
        if (!this.active) {
          this.callbacks.onAudioLevel(this.peerName, 0, false);
          return;
        }
        this.callbacks.onAudioLevel(this.peerName, level, speaking);
      },
    );
  }

  private startOffer(iceRestart: boolean, retryAttempt: number) {
    if (this.isClosed()) return;
    this.clearOfferTimer();
    this.clearReconnectTimer();

    const epoch = ++this.negotiationEpoch;
    this.makingOffer = true;
    this.phase = {
      kind: "offering",
      retryAttempt,
      offerResendDelayMs: BASE_OFFER_REPEAT_DELAY_MS,
    };
    this.callbacks.onPeerStateChange();

    void this.runOffer(epoch, iceRestart);
  }

  private async runOffer(epoch: number, iceRestart: boolean) {
    try {
      const offer = iceRestart
        ? await this.pc.createOffer({ iceRestart: true })
        : await this.pc.createOffer();
      if (this.isOfferSuperseded(epoch)) return;
      await this.pc.setLocalDescription(offer);
      if (this.isOfferSuperseded(epoch)) return;
      this.makingOffer = false;
      this.sendCurrentOfferAndScheduleResend(epoch);
    } catch (err) {
      if (this.negotiationEpoch === epoch) {
        this.makingOffer = false;
      }
      if (this.isClosed() || this.negotiationEpoch !== epoch) return;
      console.error("Voice offer error:", err);
      this.handleTransportDegraded("failed");
    }
  }

  private isOfferSuperseded(epoch: number): boolean {
    return this.phase.kind !== "offering" || this.negotiationEpoch !== epoch;
  }

  private sendCurrentOfferAndScheduleResend(epoch: number) {
    if (this.isOfferSuperseded(epoch)) return;
    if (this.pc.signalingState !== "have-local-offer") return;
    const description = this.pc.localDescription;
    if (!description || this.phase.kind !== "offering") return;

    // The server drops signals to a player whose socket isn't back yet, as after a restart.
    // The local description gains candidates as they're found, so resending also replaces dropped ones.
    this.callbacks.sendSignal(this.peerName, "offer", description);
    const delay = this.phase.offerResendDelayMs;
    this.phase = {
      kind: "offering",
      retryAttempt: this.phase.retryAttempt,
      offerResendDelayMs: Math.min(delay * 2, MAX_OFFER_REPEAT_DELAY_MS),
    };
    this.clearOfferTimer();
    this.offerTimer = setTimeout(() => {
      this.offerTimer = null;
      this.sendCurrentOfferAndScheduleResend(epoch);
    }, delay);
  }

  private async processSignal(payload: VoiceSignalPayload) {
    if (this.isClosed()) return;
    if (payload.signal_type === "offer") {
      await this.handleIncomingOffer(payload.data);
    } else if (payload.signal_type === "answer") {
      await this.handleIncomingAnswer(payload.data);
    } else if (payload.signal_type === "ice") {
      await this.handleIncomingIce(payload.data);
    }
  }

  private async handleIncomingOffer(data: unknown) {
    const description = parseSessionDescription(data);
    if (!description || description.type !== "offer") return;

    const offerCollision =
      this.makingOffer || this.pc.signalingState !== "stable";
    if (!this.polite && offerCollision) return;

    const preservedRetryAttempt = retryAttemptOf(this.phase);
    this.negotiationEpoch++;
    this.makingOffer = false;
    this.clearOfferTimer();
    this.clearReconnectTimer();

    if (this.pc.signalingState === "have-local-offer") {
      await this.pc.setLocalDescription({ type: "rollback" });
      if (this.isClosed()) return;
    }

    await this.applyRemoteOfferAndAnswer(description, preservedRetryAttempt);
  }

  private async applyRemoteOfferAndAnswer(
    description: RTCSessionDescriptionInit,
    preservedRetryAttempt: number,
  ) {
    await this.pc.setRemoteDescription(description);
    if (this.isClosed()) return;
    this.hasRemoteDesc = true;
    await this.drainIceBuffer();
    if (this.isClosed()) return;

    const answer = await this.pc.createAnswer();
    if (this.isClosed()) return;
    await this.pc.setLocalDescription(answer);
    if (this.isClosed()) return;

    this.callbacks.sendSignal(
      this.peerName,
      "answer",
      this.pc.localDescription ?? answer,
    );
    this.phase =
      this.pc.connectionState === "connected"
        ? { kind: "connected" }
        : { kind: "connecting", retryAttempt: preservedRetryAttempt };
    this.callbacks.onPeerStateChange();
  }

  private async handleIncomingAnswer(data: unknown) {
    const description = parseSessionDescription(data);
    if (!description || description.type !== "answer") return;
    if (this.pc.signalingState !== "have-local-offer") return;

    this.clearOfferTimer();
    await this.pc.setRemoteDescription(description);
    if (this.isClosed()) return;
    this.hasRemoteDesc = true;
    await this.drainIceBuffer();
    if (this.isClosed()) return;

    if (this.pc.connectionState === "connected") {
      this.phase = { kind: "connected" };
    } else if (this.phase.kind === "offering") {
      this.phase = {
        kind: "connecting",
        retryAttempt: this.phase.retryAttempt,
      };
    }
    this.callbacks.onPeerStateChange();
  }

  private async handleIncomingIce(data: unknown) {
    const candidate = parseIceCandidate(data);
    if (!candidate) return;
    if (this.hasRemoteDesc) {
      await this.pc.addIceCandidate(candidate);
      return;
    }
    if (this.iceBuffer.length < MAX_PENDING_SIGNALS) {
      this.iceBuffer.push(candidate);
    }
  }

  private async drainIceBuffer() {
    const queued = this.iceBuffer;
    this.iceBuffer = [];
    for (const candidate of queued) {
      if (this.isClosed()) return;
      await this.pc.addIceCandidate(candidate);
    }
  }

  private handleConnectionStateChange() {
    if (this.isClosed()) return;
    const state = this.pc.connectionState;
    if (state === "connected") {
      this.clearOfferTimer();
      this.clearReconnectTimer();
      this.phase = { kind: "connected" };
      this.callbacks.onPeerStateChange();
      if (this.active && this.callbacks.isSelfMuted()) {
        this.callbacks.sendSignal(this.peerName, "mute_state", { muted: true });
      }
      return;
    }
    if (state === "disconnected" || state === "failed") {
      this.handleTransportDegraded(state);
      return;
    }
    if (this.phase.kind === "connected") {
      this.phase = { kind: "connecting", retryAttempt: 0 };
    }
    this.callbacks.onPeerStateChange();
  }

  private handleIceConnectionStateChange() {
    if (this.isClosed()) return;
    if (
      this.pc.connectionState === "connected" ||
      this.pc.connectionState === "closed"
    ) {
      return;
    }
    const iceState = this.pc.iceConnectionState;
    if (iceState === "failed" || iceState === "disconnected") {
      this.handleTransportDegraded(iceState);
    }
  }

  private handleTransportDegraded(reason: ReconnectReason) {
    if (this.phase.kind === "closed" || this.phase.kind === "failed") return;
    if (!this.active) {
      this.clearOfferTimer();
      this.clearReconnectTimer();
      this.phase = { kind: "awaiting_offer", retryAttempt: 0 };
      this.callbacks.onPeerStateChange();
      return;
    }
    if (this.makingOffer) return;

    if (this.phase.kind === "reconnecting") {
      if (this.phase.reason === "disconnected" && reason === "failed") {
        this.scheduleReconnectTimer("failed", this.phase.retryAttempt);
      }
      return;
    }

    const retryAttempt = retryAttemptOf(this.phase);
    this.clearOfferTimer();

    if (retryAttempt >= MAX_RETRIES) {
      this.phase = { kind: "failed" };
      this.callbacks.onPeerStateChange();
      this.callbacks.onRetriesExhausted(this.peerName);
      return;
    }

    this.scheduleReconnectTimer(reason, retryAttempt);
  }

  private scheduleReconnectTimer(
    reason: ReconnectReason,
    retryAttempt: number,
  ) {
    this.clearReconnectTimer();
    this.phase = { kind: "reconnecting", reason, retryAttempt };
    this.callbacks.onPeerStateChange();

    const delay = retryDelayForAttempt(reason, retryAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.phase.kind !== "reconnecting") return;
      if (this.pc.connectionState === "connected") {
        this.handleConnectionStateChange();
        return;
      }
      if (!this.active) return;
      this.startOffer(true, this.phase.retryAttempt + 1);
    }, delay);
  }

  private clearOfferTimer() {
    if (this.offerTimer) {
      clearTimeout(this.offerTimer);
      this.offerTimer = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
