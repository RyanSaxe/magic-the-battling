import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export interface VoicePeer {
  name: string
  connectionState: 'connecting' | 'connected' | 'failed' | 'disconnected'
}

export interface VoiceChatState {
  isAvailable: boolean
  isMuted: boolean
  isSpeaking: boolean
  peers: VoicePeer[]
  mutedPeers: Set<string>
  speakingPeers: Set<string>
  remoteMutedPeers: Set<string>
}

interface VoiceSignalPayload {
  signal_type: string
  data: unknown
  from_player: string
}

interface PeerState {
  pc: RTCPeerConnection
  audioEl: HTMLAudioElement
  iceBuffer: RTCIceCandidateInit[]
  hasRemoteDesc: boolean
}

const INITIAL_STATE: VoiceChatState = {
  isAvailable: true,
  isMuted: false,
  isSpeaking: false,
  peers: [],
  mutedPeers: new Set(),
  speakingPeers: new Set(),
  remoteMutedPeers: new Set(),
}

const SPEAKING_THRESHOLD = 15
const MAX_RETRIES = 3
const BASE_RETRY_DELAY = 1000
const DISCONNECTED_GRACE = 4000

function browserSupportsVoice(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof RTCPeerConnection !== 'undefined'
}

function createAudioLevelDetector(
  stream: MediaStream,
  onSpeakingChange: (speaking: boolean) => void,
): { stop: () => void } {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.3
  source.connect(analyser)

  const data = new Uint8Array(analyser.frequencyBinCount)
  let wasSpeaking = false
  let rafId = 0

  const tick = () => {
    rafId = requestAnimationFrame(tick)
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]
    const speaking = sum / data.length > SPEAKING_THRESHOLD
    if (speaking !== wasSpeaking) {
      wasSpeaking = speaking
      onSpeakingChange(speaking)
    }
  }
  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      cancelAnimationFrame(rafId)
      ctx.close()
    },
  }
}

export function useVoiceChat(
  send: (action: string, payload: Record<string, unknown>) => void,
  peerNames: string[],
  selfPlayerName: string | null,
  voiceSignalRef: MutableRefObject<((payload: VoiceSignalPayload) => void) | null>,
  onPermissionDenied?: () => void,
  onRetriesExhausted?: (peerName: string) => void,
): {
  state: VoiceChatState
  toggleSelfMute: () => void
  togglePeerMute: (peerName: string) => void
} {
  const [state, setState] = useState<VoiceChatState>(INITIAL_STATE)

  const peersRef = useRef<Map<string, PeerState>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const mutedPeersRef = useRef<Set<string>>(new Set())

  const retryCountRef = useRef<Map<string, number>>(new Map())
  const retryTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const selfPlayerNameRef = useRef(selfPlayerName)
  const createPeerConnectionRef = useRef<((peerName: string, stream: MediaStream, isOfferer: boolean) => void) | null>(null)
  const destroyPeerRef = useRef<((peerName: string) => void) | null>(null)
  const onRetriesExhaustedRef = useRef(onRetriesExhausted)
  const onPermissionDeniedRef = useRef(onPermissionDenied)

  const selfDetectorRef = useRef<{ stop: () => void } | null>(null)
  const peerDetectorsRef = useRef<Map<string, { stop: () => void }>>(new Map())

  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    selfDetectorRef.current?.stop()
    selfDetectorRef.current = createAudioLevelDetector(stream, (speaking) => {
      const track = localStreamRef.current?.getAudioTracks()[0]
      if (!track?.enabled) {
        setState(s => s.isSpeaking ? { ...s, isSpeaking: false } : s)
        return
      }
      setState(s => s.isSpeaking !== speaking ? { ...s, isSpeaking: speaking } : s)
    })
  }, [])

  const stopSpeakingDetection = useCallback(() => {
    selfDetectorRef.current?.stop()
    selfDetectorRef.current = null
  }, [])

  const sendSignalTo = useCallback((peerName: string, signalType: string, data: unknown) => {
    send('voice_signal', { signal_type: signalType, data, target_player: peerName })
  }, [send])

  const updatePeerStates = useCallback(() => {
    const peers: VoicePeer[] = []
    for (const [name, ps] of peersRef.current) {
      let connectionState: VoicePeer['connectionState'] = 'connecting'
      switch (ps.pc.connectionState) {
        case 'connected':
          connectionState = 'connected'
          break
        case 'failed':
          connectionState = 'failed'
          break
        case 'disconnected':
        case 'closed':
          connectionState = 'disconnected'
          break
      }
      peers.push({ name, connectionState })
    }
    setState(s => ({ ...s, peers }))
  }, [])

  const createPeerConnection = useCallback((peerName: string, stream: MediaStream, isOfferer: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    if (mutedPeersRef.current.has(peerName)) {
      audioEl.muted = true
    }

    const peerState: PeerState = { pc, audioEl, iceBuffer: [], hasRemoteDesc: false }
    peersRef.current.set(peerName, peerState)

    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendSignalTo(peerName, 'ice', ev.candidate.toJSON())
      }
    }

    pc.ontrack = (ev) => {
      const remoteStream = ev.streams[0] ?? new MediaStream([ev.track])
      audioEl.srcObject = remoteStream
      peerDetectorsRef.current.get(peerName)?.stop()
      const detector = createAudioLevelDetector(remoteStream, (speaking) => {
        setState(s => {
          const has = s.speakingPeers.has(peerName)
          if (speaking === has) return s
          const next = new Set(s.speakingPeers)
          if (speaking) { next.add(peerName) } else { next.delete(peerName) }
          return { ...s, speakingPeers: next }
        })
      })
      peerDetectorsRef.current.set(peerName, detector)
    }

    pc.onconnectionstatechange = () => {
      updatePeerStates()
      if (pc.connectionState === 'connected') {
        retryCountRef.current.delete(peerName)
        const timer = retryTimerRef.current.get(peerName)
        if (timer) { clearTimeout(timer); retryTimerRef.current.delete(peerName) }
        const track = localStreamRef.current?.getAudioTracks()[0]
        if (track && !track.enabled) {
          sendSignalTo(peerName, 'mute_state', { muted: true })
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        const delay = pc.connectionState === 'disconnected'
          ? DISCONNECTED_GRACE
          : BASE_RETRY_DELAY * Math.pow(2, retryCountRef.current.get(peerName) ?? 0)
        const existingTimer = retryTimerRef.current.get(peerName)
        if (existingTimer) clearTimeout(existingTimer)

        const timerId = setTimeout(() => {
          retryTimerRef.current.delete(peerName)
          if (!peersRef.current.has(peerName)) return
          const currentPc = peersRef.current.get(peerName)?.pc
          if (currentPc && currentPc.connectionState === 'connected') return
          const retryCount = retryCountRef.current.get(peerName) ?? 0
          if (retryCount >= MAX_RETRIES) {
            onRetriesExhaustedRef.current?.(peerName)
            return
          }
          retryCountRef.current.set(peerName, retryCount + 1)
          destroyPeerRef.current?.(peerName)
          const s = localStreamRef.current
          if (!s) return
          createPeerConnectionRef.current?.(peerName, s, selfPlayerNameRef.current! < peerName)
        }, delay)
        retryTimerRef.current.set(peerName, timerId)
      }
    }

    if (isOfferer) {
      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer).then(() => {
          sendSignalTo(peerName, 'offer', offer)
        })
      }).catch(err => console.error('Voice offer error:', err))
    }

    updatePeerStates()
  }, [sendSignalTo, updatePeerStates])

  const destroyPeer = useCallback((peerName: string) => {
    const timer = retryTimerRef.current.get(peerName)
    if (timer) { clearTimeout(timer); retryTimerRef.current.delete(peerName) }
    retryCountRef.current.delete(peerName)
    peerDetectorsRef.current.get(peerName)?.stop()
    peerDetectorsRef.current.delete(peerName)
    const ps = peersRef.current.get(peerName)
    if (!ps) return
    ps.pc.close()
    ps.audioEl.srcObject = null
    ps.audioEl.remove()
    peersRef.current.delete(peerName)
    updatePeerStates()
    setState(s => {
      const hasSpeaking = s.speakingPeers.has(peerName)
      const hasRemoteMuted = s.remoteMutedPeers.has(peerName)
      if (!hasSpeaking && !hasRemoteMuted) return s
      const nextSpeaking = hasSpeaking ? new Set(s.speakingPeers) : s.speakingPeers
      const nextRemoteMuted = hasRemoteMuted ? new Set(s.remoteMutedPeers) : s.remoteMutedPeers
      if (hasSpeaking) nextSpeaking.delete(peerName)
      if (hasRemoteMuted) nextRemoteMuted.delete(peerName)
      return { ...s, speakingPeers: nextSpeaking, remoteMutedPeers: nextRemoteMuted }
    })
  }, [updatePeerStates])

  useEffect(() => { selfPlayerNameRef.current = selfPlayerName }, [selfPlayerName])
  useEffect(() => { createPeerConnectionRef.current = createPeerConnection }, [createPeerConnection])
  useEffect(() => { destroyPeerRef.current = destroyPeer }, [destroyPeer])
  useEffect(() => { onRetriesExhaustedRef.current = onRetriesExhausted }, [onRetriesExhausted])
  useEffect(() => { onPermissionDeniedRef.current = onPermissionDenied }, [onPermissionDenied])

  const handleSignal = useCallback(async (payload: VoiceSignalPayload) => {
    const fromPeer = payload.from_player
    const ps = peersRef.current.get(fromPeer)
    if (!ps) return

    try {
      if (payload.signal_type === 'offer') {
        await ps.pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit))
        ps.hasRemoteDesc = true
        for (const candidate of ps.iceBuffer) {
          await ps.pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        ps.iceBuffer = []
        const answer = await ps.pc.createAnswer()
        await ps.pc.setLocalDescription(answer)
        sendSignalTo(fromPeer, 'answer', answer)
      } else if (payload.signal_type === 'answer') {
        await ps.pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit))
        ps.hasRemoteDesc = true
        for (const candidate of ps.iceBuffer) {
          await ps.pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        ps.iceBuffer = []
      } else if (payload.signal_type === 'ice') {
        if (ps.hasRemoteDesc) {
          await ps.pc.addIceCandidate(new RTCIceCandidate(payload.data as RTCIceCandidateInit))
        } else {
          ps.iceBuffer.push(payload.data as RTCIceCandidateInit)
        }
      } else if (payload.signal_type === 'mute_state') {
        const { muted } = payload.data as { muted: boolean }
        setState(s => {
          const next = new Set(s.remoteMutedPeers)
          if (muted) { next.add(fromPeer) } else { next.delete(fromPeer) }
          return { ...s, remoteMutedPeers: next }
        })
      }
    } catch (err) {
      console.error('Voice signal handling error:', err)
    }
  }, [sendSignalTo])

  useEffect(() => {
    voiceSignalRef.current = handleSignal
    return () => { voiceSignalRef.current = null }
  }, [handleSignal, voiceSignalRef])

  useEffect(() => {
    if (peerNames.length === 0 || !selfPlayerName) {
      for (const name of peersRef.current.keys()) {
        destroyPeer(name)
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      stopSpeakingDetection()
      setState(s => ({ ...s, peers: [], isMuted: false, isSpeaking: false }))
      return
    }

    if (!browserSupportsVoice()) {
      setState(s => ({ ...s, isAvailable: false }))
      return
    }

    let cancelled = false

    async function reconcile() {
      if (!localStreamRef.current) {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          })
        } catch {
          if (!cancelled) {
            setState(s => ({ ...s, isAvailable: false }))
            onPermissionDeniedRef.current?.()
          }
          return
        }
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        localStreamRef.current = stream
        startSpeakingDetection(stream)
      }

      const stream = localStreamRef.current!
      const currentNames = new Set(peersRef.current.keys())
      const desiredNames = new Set(peerNames)

      for (const name of currentNames) {
        if (!desiredNames.has(name)) {
          destroyPeer(name)
        }
      }

      for (const name of desiredNames) {
        if (!currentNames.has(name)) {
          const isOfferer = selfPlayerName! < name
          createPeerConnection(name, stream, isOfferer)
        }
      }
    }

    reconcile()

    return () => { cancelled = true }
  }, [peerNames, selfPlayerName, createPeerConnection, destroyPeer, startSpeakingDetection, stopSpeakingDetection])

  useEffect(() => {
    const timers = retryTimerRef.current
    const retryCounts = retryCountRef.current
    const peers = peersRef.current
    const detectors = peerDetectorsRef.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      retryCounts.clear()
      for (const d of detectors.values()) d.stop()
      detectors.clear()
      for (const name of peers.keys()) {
        const ps = peers.get(name)
        if (ps) {
          ps.pc.close()
          ps.audioEl.srcObject = null
          ps.audioEl.remove()
        }
      }
      peers.clear()
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      stopSpeakingDetection()
    }
  }, [stopSpeakingDetection])

  const toggleSelfMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    const muted = !track.enabled
    setState(s => ({ ...s, isMuted: muted, ...(muted && { isSpeaking: false }) }))
    for (const peerName of peersRef.current.keys()) {
      sendSignalTo(peerName, 'mute_state', { muted })
    }
  }, [sendSignalTo])

  const togglePeerMute = useCallback((peerName: string) => {
    const ps = peersRef.current.get(peerName)
    const next = new Set(mutedPeersRef.current)
    if (next.has(peerName)) {
      next.delete(peerName)
      if (ps) ps.audioEl.muted = false
    } else {
      next.add(peerName)
      if (ps) ps.audioEl.muted = true
    }
    mutedPeersRef.current = next
    setState(s => ({ ...s, mutedPeers: next }))
  }, [])

  return { state, toggleSelfMute, togglePeerMute }
}
