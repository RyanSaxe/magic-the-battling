// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceChat } from './useVoiceChat'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('asks for the microphone and says it was refused once, until Voice has been off', async () => {
  const prompts: (() => void)[] = []
  const getUserMedia = () => new Promise<MediaStream>((_, reject) => {
    prompts.push(() => reject(new DOMException('Permission denied', 'NotAllowedError')))
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('RTCPeerConnection', class {})
  let notices = 0
  const send = () => {}
  const signalRef = { current: null }
  const { rerender } = renderHook(
    ({ peers, self }: { peers: string[]; self: string | null }) =>
      useVoiceChat(send, peers, self, signalRef, () => { notices++ }),
    { initialProps: { peers: ['Bob'], self: 'Alice' as string | null } },
  )
  const update = (peers: string[], self: string | null = 'Alice') => act(async () => rerender({ peers, self }))

  await update(['Bob'])
  await update(['Bob', 'Cara'])
  expect(prompts).toHaveLength(1)

  await act(async () => prompts[0]())
  await update(['Bob', 'Cara'])
  await update(['Cara'])
  // A fight against a puppet has nobody to talk to, with Voice still on.
  await update([])
  await update(['Bob', 'Cara'])
  expect(prompts).toHaveLength(1)
  expect(notices).toBe(1)

  await update([], null)
  await update(['Bob'])
  expect(prompts).toHaveLength(2)
})

/** Just the offer and answer half of a connection. */
class FakePeerConnection {
  static made: FakePeerConnection[] = []
  signalingState: RTCSignalingState = 'stable'
  connectionState = 'new'
  localDescription: RTCSessionDescriptionInit | null = null
  constructor() {
    FakePeerConnection.made.push(this)
  }
  addTrack() {}
  async addIceCandidate() {}
  async createOffer() {
    return { type: 'offer', sdp: '' }
  }
  async createAnswer() {
    return { type: 'answer', sdp: '' }
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable'
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable'
  }
  close() {
    this.signalingState = 'closed'
  }
}

it('connects to a player who comes back, and allows the microphone, minutes after the offer', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  vi.stubGlobal('RTCSessionDescription', function (description: RTCSessionDescriptionInit) { return description })
  vi.stubGlobal('AudioContext', class {
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createAnalyser() { return { frequencyBinCount: 1 } }
    async close() {}
  })
  const stream = { getTracks: () => [], getAudioTracks: () => [] }
  let bobAllows = () => {}
  const getUserMedia = vi.fn()
    .mockResolvedValueOnce(stream)
    .mockReturnValueOnce(new Promise((resolve) => { bobAllows = () => resolve(stream) }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

  type Signals = Parameters<typeof useVoiceChat>[3]
  const inbox: Record<string, Signals> = { Alice: { current: null }, Bob: { current: null } }
  const sent: string[] = []
  const sendFrom = (from: string) => (_: string, { signal_type, data, target_player }: Record<string, unknown>) => {
    sent.push(`${from}: ${signal_type}`)
    // As the server does, this drops what is sent to a player whose socket isn't back.
    inbox[target_player as string].current?.({ signal_type: signal_type as string, data, from_player: from })
  }
  const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  const failed: string[] = []
  const join = (self: string, peers: string[]) => {
    const send = sendFrom(self)
    renderHook(() => useVoiceChat(send, peers, self, inbox[self], undefined, (peer) => failed.push(peer)))
  }
  const MINUTE = 60_000

  join('Alice', ['Bob'])
  await wait(5 * MINUTE)
  join('Bob', ['Alice'])
  await wait(5 * MINUTE)
  await act(async () => bobAllows())
  await wait(0)

  expect(sent.filter((signal) => signal === 'Bob: answer')).toHaveLength(1)
  expect(FakePeerConnection.made.map((pc) => pc.signalingState)).toEqual(['stable', 'stable'])
  expect(failed).toEqual([])
  expect(sent.length).toBeLessThan(80)
  const once = sent.length
  await wait(MINUTE)
  expect(sent).toHaveLength(once)
})
