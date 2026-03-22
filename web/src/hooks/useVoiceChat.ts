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
}

const SPEAKING_THRESHOLD = 15

function browserSupportsVoice(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof RTCPeerConnection !== 'undefined'
}

export function useVoiceChat(
  send: (action: string, payload: Record<string, unknown>) => void,
  peerNames: string[],
  selfPlayerName: string | null,
  voiceSignalRef: MutableRefObject<((payload: VoiceSignalPayload) => void) | null>,
): {
  state: VoiceChatState
  toggleSelfMute: () => void
  togglePeerMute: (peerName: string) => void
} {
  const [state, setState] = useState<VoiceChatState>(INITIAL_STATE)

  const peersRef = useRef<Map<string, PeerState>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const mutedPeersRef = useRef<Set<string>>(new Set())

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafIdRef = useRef(0)
  const isSpeakingRef = useRef(false)

  const startSpeakingDetection = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)
    audioContextRef.current = ctx
    analyserRef.current = analyser

    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      rafIdRef.current = requestAnimationFrame(tick)
      const track = localStreamRef.current?.getAudioTracks()[0]
      if (!track?.enabled) {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false
          setState(s => ({ ...s, isSpeaking: false }))
        }
        return
      }
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / data.length
      const speaking = avg > SPEAKING_THRESHOLD
      if (speaking !== isSpeakingRef.current) {
        isSpeakingRef.current = speaking
        setState(s => ({ ...s, isSpeaking: speaking }))
      }
    }
    rafIdRef.current = requestAnimationFrame(tick)
  }, [])

  const stopSpeakingDetection = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = 0
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    isSpeakingRef.current = false
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
      audioEl.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
    }

    pc.onconnectionstatechange = () => {
      updatePeerStates()
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
    const ps = peersRef.current.get(peerName)
    if (!ps) return
    ps.pc.close()
    ps.audioEl.srcObject = null
    ps.audioEl.remove()
    peersRef.current.delete(peerName)
    updatePeerStates()
  }, [updatePeerStates])

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
          if (!cancelled) setState(s => ({ ...s, isAvailable: false }))
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
    return () => {
      for (const name of peersRef.current.keys()) {
        const ps = peersRef.current.get(name)
        if (ps) {
          ps.pc.close()
          ps.audioEl.srcObject = null
          ps.audioEl.remove()
        }
      }
      peersRef.current.clear()
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
  }, [])

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
