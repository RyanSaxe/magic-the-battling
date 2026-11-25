/**
 * React hook and session controller for Pitfight WebRTC voice chat.
 * Owns microphone acquisition, audio-level metering, mute persistence, and per-opponent lifecycles.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { readMigratedItem, removeStorageKeys } from "../utils/storage";
import {
  PeerConnectionController,
  parseStringList,
  queuePendingSignal,
  type AudioDetector,
  type PeerCallbacks,
  type PeerUiConnectionState,
  type VoiceSignalPayload,
} from "../utils/voiceChat";

export interface VoicePeer {
  name: string;
  connectionState: PeerUiConnectionState;
}

export interface VoiceChatState {
  isAvailable: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  peers: VoicePeer[];
  mutedPeers: Set<string>;
  speakingPeers: Set<string>;
  remoteMutedPeers: Set<string>;
}

const SPEAKING_THRESHOLD = 15;
const ATTACK_ALPHA = 0.4;
const DECAY_ALPHA = 0.15;

const MUTE_STORAGE_KEY = "pitfight_voice_muted";
const LEGACY_MUTE_STORAGE_KEY = "mtb_voice_muted";
const MUTED_PEERS_STORAGE_KEY = "pitfight_voice_muted_peers";
const LEGACY_MUTED_PEERS_STORAGE_KEY = "mtb_voice_muted_peers";

function getPersistedMute(): boolean {
  return (
    readMigratedItem(
      sessionStorage,
      MUTE_STORAGE_KEY,
      LEGACY_MUTE_STORAGE_KEY,
    ) === "true"
  );
}

function setPersistedMute(muted: boolean): void {
  sessionStorage.setItem(MUTE_STORAGE_KEY, muted ? "true" : "false");
  removeStorageKeys(sessionStorage, [LEGACY_MUTE_STORAGE_KEY]);
}

function getPersistedMutedPeers(): Set<string> {
  return new Set(
    parseStringList(
      readMigratedItem(
        sessionStorage,
        MUTED_PEERS_STORAGE_KEY,
        LEGACY_MUTED_PEERS_STORAGE_KEY,
      ),
    ),
  );
}

function setPersistedMutedPeers(peers: Set<string>): void {
  sessionStorage.setItem(MUTED_PEERS_STORAGE_KEY, JSON.stringify([...peers]));
  removeStorageKeys(sessionStorage, [LEGACY_MUTED_PEERS_STORAGE_KEY]);
}

let sharedAudioContext: AudioContext | null = null;
let sharedAudioContextRefCount = 0;

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContext();
    sharedAudioContextRefCount = 0;
  }
  sharedAudioContextRefCount++;
  return sharedAudioContext;
}

function releaseSharedAudioContext(): void {
  sharedAudioContextRefCount--;
  if (sharedAudioContextRefCount <= 0) {
    void sharedAudioContext?.close();
    sharedAudioContext = null;
    sharedAudioContextRefCount = 0;
  }
}

const audioLevels: Record<string, number> = {};

export function getAudioLevel(key: string): number {
  return audioLevels[key] ?? 0;
}

function createAudioLevelDetector(
  stream: MediaStream,
  onLevel: (level: number, speaking: boolean) => void,
): AudioDetector {
  const ctx = getSharedAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let smoothed = 0;
  let rafId = 0;

  const tick = (): void => {
    rafId = requestAnimationFrame(tick);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    const raw = avg > SPEAKING_THRESHOLD ? avg / 255 : 0;
    const alpha = raw > smoothed ? ATTACK_ALPHA : DECAY_ALPHA;
    smoothed += alpha * (raw - smoothed);
    if (smoothed < 0.01) smoothed = 0;
    onLevel(smoothed, smoothed > 0);
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop(): void {
      cancelAnimationFrame(rafId);
      source.disconnect();
      releaseSharedAudioContext();
    },
  };
}

function browserSupportsVoice(): boolean {
  return (
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof RTCPeerConnection !== "undefined"
  );
}

interface MicrophoneReply {
  granted: (stream: MediaStream) => void;
  refused: () => void;
}

class MicrophoneRequest {
  private status: "unasked" | "asking" | "refused" = "unasked";
  private reply: MicrophoneReply | null = null;

  ask(reply: MicrophoneReply): void {
    if (this.status === "refused") return;
    this.reply = reply;
    if (this.status === "asking") return;
    this.status = "asking";
    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      .then(
        (stream) => {
          this.status = "unasked";
          if (this.reply) this.reply.granted(stream);
          else stream.getTracks().forEach((track) => track.stop());
        },
        () => {
          // A refusal nobody was waiting for was never shown, so the next need asks again.
          this.status = this.reply ? "refused" : "unasked";
          this.reply?.refused();
        },
      );
  }

  withdraw(): void {
    this.reply = null;
  }

  forgetRefusal(): void {
    if (this.status === "refused") this.status = "unasked";
  }
}

function samePeers(a: readonly VoicePeer[], b: readonly VoicePeer[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].connectionState !== b[i].connectionState
    ) {
      return false;
    }
  }
  return true;
}

function updateSetMembership(
  current: Set<string>,
  key: string,
  present: boolean,
): Set<string> {
  if (current.has(key) === present) return current;
  const next = new Set(current);
  if (present) next.add(key);
  else next.delete(key);
  return next;
}

interface SessionHostCallbacks {
  send: (action: string, payload: Record<string, unknown>) => void;
  onPermissionDenied: () => void;
  onRetriesExhausted: (peerName: string) => void;
}

class VoiceSessionController {
  private readonly peers = new Map<string, PeerConnectionController>();
  private readonly pendingSignals = new Map<string, VoiceSignalPayload[]>();
  private readonly microphone = new MicrophoneRequest();
  private readonly listeners = new Set<() => void>();
  private localStream: MediaStream | null = null;
  private selfDetector: AudioDetector | null = null;
  private selfPlayerName: string | null = null;
  private desiredPeers: string[] = [];
  private host: SessionHostCallbacks | null = null;
  private snapshot: VoiceChatState;

  constructor() {
    this.snapshot = {
      isAvailable: true,
      isMuted: getPersistedMute(),
      isSpeaking: false,
      peers: [],
      mutedPeers: getPersistedMutedPeers(),
      speakingPeers: new Set(),
      remoteMutedPeers: new Set(),
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VoiceChatState => this.snapshot;

  attach(host: SessionHostCallbacks): void {
    this.host = host;
  }

  syncTargets(
    selfPlayerName: string | null,
    peerNames: readonly string[],
  ): void {
    if (
      this.selfPlayerName !== null &&
      selfPlayerName !== null &&
      this.selfPlayerName !== selfPlayerName
    ) {
      this.teardownSession(true);
    }

    this.selfPlayerName = selfPlayerName;
    this.desiredPeers = [...peerNames];

    if (!selfPlayerName) {
      this.microphone.forgetRefusal();
      this.teardownSession(true);
      return;
    }

    if (peerNames.length === 0) {
      this.microphone.withdraw();
      this.parkAllPeers();
      return;
    }

    if (!browserSupportsVoice()) {
      this.updateAvailability(false);
      return;
    }

    if (this.localStream) {
      this.reconcilePeers(selfPlayerName, this.localStream);
      return;
    }

    this.microphone.ask({
      granted: (stream) => this.handleMicrophoneGranted(stream),
      refused: () => {
        this.updateAvailability(false);
        this.host?.onPermissionDenied();
      },
    });
  }

  handleSignal(payload: VoiceSignalPayload): void {
    const peer = this.peers.get(payload.from_player);
    if (peer) {
      peer.enqueueSignal(payload);
      return;
    }
    const waiting = this.pendingSignals.get(payload.from_player) ?? [];
    this.pendingSignals.set(
      payload.from_player,
      queuePendingSignal(waiting, payload),
    );
  }

  toggleSelfMute(
    send: (action: string, payload: Record<string, unknown>) => void,
  ): void {
    const stream = this.localStream;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    const muted = !track.enabled;
    setPersistedMute(muted);
    if (muted) audioLevels["__self__"] = 0;

    this.publish({
      ...this.snapshot,
      isMuted: muted,
      isSpeaking: muted ? false : this.snapshot.isSpeaking,
    });

    for (const [peerName, peer] of this.peers) {
      if (peer.isActive()) {
        send("voice_signal", {
          signal_type: "mute_state",
          data: { muted },
          target_player: peerName,
        });
      }
    }
  }

  togglePeerMute(peerName: string): void {
    const muted = !this.snapshot.mutedPeers.has(peerName);
    const nextMuted = updateSetMembership(
      this.snapshot.mutedPeers,
      peerName,
      muted,
    );
    this.peers.get(peerName)?.setPeerMuted(muted);
    setPersistedMutedPeers(nextMuted);
    this.publish({ ...this.snapshot, mutedPeers: nextMuted });
  }

  dispose(): void {
    this.host = null;
    this.microphone.withdraw();
    this.teardownSession(false);
  }

  private handleMicrophoneGranted(stream: MediaStream): void {
    if (!this.selfPlayerName || this.desiredPeers.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.localStream = stream;
    if (getPersistedMute()) {
      const track = stream.getAudioTracks()[0];
      if (track) track.enabled = false;
    }
    this.startSelfSpeakingDetection(stream);
    this.updateAvailability(true);
    this.reconcilePeers(this.selfPlayerName, stream);
  }

  private reconcilePeers(selfPlayerName: string, stream: MediaStream): void {
    const desired = new Set(this.desiredPeers);

    for (const [name, peer] of this.peers) {
      peer.setActive(desired.has(name));
    }

    for (const name of desired) {
      if (this.peers.has(name)) continue;
      const peer = new PeerConnectionController({
        peerName: name,
        selfPlayerName,
        localStream: stream,
        peerMuted: this.snapshot.mutedPeers.has(name),
        callbacks: this.createPeerCallbacks(),
      });
      this.peers.set(name, peer);
      const buffered = this.pendingSignals.get(name) ?? [];
      this.pendingSignals.delete(name);
      peer.start(buffered);
    }

    this.refreshPeerSnapshot();
  }

  private parkAllPeers(): void {
    for (const peer of this.peers.values()) {
      peer.setActive(false);
    }
    audioLevels["__self__"] = 0;
    if (
      this.snapshot.peers.length === 0 &&
      !this.snapshot.isSpeaking &&
      this.snapshot.speakingPeers.size === 0
    ) {
      return;
    }
    this.publish({
      ...this.snapshot,
      peers: [],
      isSpeaking: false,
      speakingPeers: new Set(),
    });
  }

  private teardownSession(resetAvailability: boolean): void {
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.pendingSignals.clear();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.selfDetector?.stop();
    this.selfDetector = null;
    audioLevels["__self__"] = 0;

    if (!resetAvailability) return;
    if (
      this.snapshot.isAvailable &&
      this.snapshot.peers.length === 0 &&
      !this.snapshot.isSpeaking &&
      this.snapshot.speakingPeers.size === 0 &&
      this.snapshot.remoteMutedPeers.size === 0
    ) {
      return;
    }
    this.publish({
      ...this.snapshot,
      isAvailable: true,
      peers: [],
      isSpeaking: false,
      speakingPeers: new Set(),
      remoteMutedPeers: new Set(),
    });
  }

  private startSelfSpeakingDetection(stream: MediaStream): void {
    this.selfDetector?.stop();
    this.selfDetector = createAudioLevelDetector(stream, (level, speaking) => {
      const track = this.localStream?.getAudioTracks()[0];
      const hasActivePeers = this.snapshot.peers.length > 0;
      if (!track?.enabled || !hasActivePeers) {
        audioLevels["__self__"] = 0;
        if (this.snapshot.isSpeaking) {
          this.publish({ ...this.snapshot, isSpeaking: false });
        }
        return;
      }
      audioLevels["__self__"] = level;
      if (this.snapshot.isSpeaking !== speaking) {
        this.publish({ ...this.snapshot, isSpeaking: speaking });
      }
    });
  }

  private createPeerCallbacks(): PeerCallbacks {
    return {
      sendSignal: (peerName, signalType, data): void => {
        this.host?.send("voice_signal", {
          signal_type: signalType,
          data,
          target_player: peerName,
        });
      },
      isSelfMuted: (): boolean => {
        const track = this.localStream?.getAudioTracks()[0];
        return Boolean(track && !track.enabled);
      },
      onPeerStateChange: (): void => {
        this.refreshPeerSnapshot();
      },
      onAudioLevel: (peerName, level, speaking): void => {
        audioLevels[peerName] = level;
        const nextSpeaking = updateSetMembership(
          this.snapshot.speakingPeers,
          peerName,
          speaking,
        );
        if (nextSpeaking !== this.snapshot.speakingPeers) {
          this.publish({ ...this.snapshot, speakingPeers: nextSpeaking });
        }
      },
      onClearAudioLevel: (peerName): void => {
        delete audioLevels[peerName];
      },
      onRemoteMuteChange: (peerName, muted): void => {
        const nextRemoteMuted = updateSetMembership(
          this.snapshot.remoteMutedPeers,
          peerName,
          muted,
        );
        if (nextRemoteMuted !== this.snapshot.remoteMutedPeers) {
          this.publish({ ...this.snapshot, remoteMutedPeers: nextRemoteMuted });
        }
      },
      onRetriesExhausted: (peerName): void => {
        this.host?.onRetriesExhausted(peerName);
      },
      createAudioDetector: createAudioLevelDetector,
    };
  }

  private refreshPeerSnapshot(): void {
    const nextPeers: VoicePeer[] = [];
    for (const peer of this.peers.values()) {
      if (peer.isActive()) {
        nextPeers.push({
          name: peer.peerName,
          connectionState: peer.getUiConnectionState(),
        });
      }
    }
    if (samePeers(this.snapshot.peers, nextPeers)) return;
    this.publish({ ...this.snapshot, peers: nextPeers });
  }

  private updateAvailability(isAvailable: boolean): void {
    if (this.snapshot.isAvailable === isAvailable) return;
    this.publish({ ...this.snapshot, isAvailable });
  }

  private publish(next: VoiceChatState): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export interface UseVoiceChatOptions {
  send: (action: string, payload: Record<string, unknown>) => void;
  peerNames: string[];
  selfPlayerName: string | null;
  voiceSignalRef: RefObject<((payload: VoiceSignalPayload) => void) | null>;
  onPermissionDenied?: () => void;
  onRetriesExhausted?: (peerName: string) => void;
}

export function useVoiceChat({
  send,
  peerNames,
  selfPlayerName,
  voiceSignalRef,
  onPermissionDenied,
  onRetriesExhausted,
}: UseVoiceChatOptions): {
  state: VoiceChatState;
  toggleSelfMute: () => void;
  togglePeerMute: (peerName: string) => void;
} {
  const [controller] = useState(() => new VoiceSessionController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  const onSend = useEffectEvent(
    (action: string, payload: Record<string, unknown>) => {
      send(action, payload);
    },
  );
  const onMicDenied = useEffectEvent(() => {
    onPermissionDenied?.();
  });
  const onPeerExhausted = useEffectEvent((peerName: string) => {
    onRetriesExhausted?.(peerName);
  });

  useEffect(() => {
    controller.attach({
      send: (action, payload) => onSend(action, payload),
      onPermissionDenied: () => onMicDenied(),
      onRetriesExhausted: (peerName) => onPeerExhausted(peerName),
    });
    voiceSignalRef.current = (payload): void =>
      controller.handleSignal(payload);
    return (): void => {
      voiceSignalRef.current = null;
      controller.dispose();
    };
  }, [controller, voiceSignalRef]);

  useEffect(() => {
    controller.syncTargets(selfPlayerName, peerNames);
  }, [controller, selfPlayerName, peerNames]);

  const toggleSelfMute = useCallback(() => {
    controller.toggleSelfMute(send);
  }, [controller, send]);

  const togglePeerMute = useCallback(
    (peerName: string) => {
      controller.togglePeerMute(peerName);
    },
    [controller],
  );

  return { state, toggleSelfMute, togglePeerMute };
}
