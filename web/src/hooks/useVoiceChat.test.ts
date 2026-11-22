// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVoiceChat } from './useVoiceChat'

afterEach(() => {
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
