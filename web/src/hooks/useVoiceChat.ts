import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export interface VoiceChatState {
  isAvailable: boolean
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  isMuted: boolean
}

interface VoiceSignalPayload {
  signal_type: string
  data: unknown
  from_player: string
}

const INITIAL_STATE: VoiceChatState = {
  isAvailable: true,
  connectionState: 'disconnected',
  isMuted: false,
}

function browserSupportsVoice(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof RTCPeerConnection !== 'undefined'
}

export function useVoiceChat(
  send: (action: string, payload: Record<string, unknown>) => void,
  battleOpponentName: string | null,
  selfPlayerName: string | null,
  voiceSignalRef: MutableRefObject<((payload: VoiceSignalPayload) => void) | null>,
): { state: VoiceChatState; toggleMute: () => void } {
  const [state, setState] = useState<VoiceChatState>(INITIAL_STATE)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([])
  const hasRemoteDescRef = useRef(false)

  const sendSignal = useCallback((signalType: string, data: unknown) => {
    send('voice_signal', { signal_type: signalType, data })
  }, [send])

  const handleSignal = useCallback(async (payload: VoiceSignalPayload) => {
    const pc = pcRef.current
    if (!pc) return

    try {
      if (payload.signal_type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit))
        hasRemoteDescRef.current = true
        for (const candidate of iceBufferRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        iceBufferRef.current = []
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendSignal('answer', answer)
      } else if (payload.signal_type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.data as RTCSessionDescriptionInit))
        hasRemoteDescRef.current = true
        for (const candidate of iceBufferRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        iceBufferRef.current = []
      } else if (payload.signal_type === 'ice') {
        if (hasRemoteDescRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.data as RTCIceCandidateInit))
        } else {
          iceBufferRef.current.push(payload.data as RTCIceCandidateInit)
        }
      }
    } catch (err) {
      console.error('Voice signal handling error:', err)
    }
  }, [sendSignal])

  useEffect(() => {
    voiceSignalRef.current = handleSignal
    return () => { voiceSignalRef.current = null }
  }, [handleSignal, voiceSignalRef])

  useEffect(() => {
    function cleanup() {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.srcObject = null
        audioRef.current.remove()
        audioRef.current = null
      }
      iceBufferRef.current = []
      hasRemoteDescRef.current = false
    }

    if (!battleOpponentName || !selfPlayerName) {
      cleanup()
      return () => { setState(INITIAL_STATE) }
    }

    if (!browserSupportsVoice()) {
      return () => { setState(s => ({ ...s, isAvailable: false })) }
    }

    let cancelled = false

    async function setup() {
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
      setState(s => ({ ...s, connectionState: 'connecting' }))

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignal('ice', ev.candidate.toJSON())
        }
      }

      pc.ontrack = (ev) => {
        if (!audioRef.current) {
          audioRef.current = document.createElement('audio')
          audioRef.current.autoplay = true
        }
        audioRef.current.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
      }

      pc.onconnectionstatechange = () => {
        if (cancelled) return
        switch (pc.connectionState) {
          case 'connected':
            setState(s => ({ ...s, connectionState: 'connected' }))
            break
          case 'failed':
            setState(s => ({ ...s, connectionState: 'failed' }))
            break
          case 'disconnected':
          case 'closed':
            setState(s => ({ ...s, connectionState: 'disconnected' }))
            break
        }
      }

      const isOfferer = selfPlayerName! < battleOpponentName!
      if (isOfferer) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendSignal('offer', offer)
      }
    }

    setup()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [battleOpponentName, selfPlayerName, sendSignal])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setState(s => ({ ...s, isMuted: !track.enabled }))
  }, [])

  return { state, toggleMute }
}
