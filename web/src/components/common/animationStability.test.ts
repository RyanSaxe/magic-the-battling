import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Simulates the old pattern where onComplete is in the useEffect dependency
 * array. Every time onComplete changes (i.e. every parent re-render), the
 * effect re-runs: cleanup cancels the in-flight animation, then a fresh
 * animation starts from scratch.
 */
function createDepsBasedRunner(onComplete: () => void) {
  let cleanup: (() => void) | null = null

  function runEffect(cb: () => void) {
    cleanup?.()
    let cancelled = false

    const run = async () => {
      await wait(400)
      if (cancelled) return
      await wait(700)
      if (cancelled) return
      await wait(500)
      if (cancelled) return
      cb()
    }

    void run()
    cleanup = () => { cancelled = true }
  }

  runEffect(onComplete)

  return {
    simulateRerender: () => runEffect(onComplete),
    destroy: () => cleanup?.(),
  }
}

/**
 * Simulates the new pattern where onComplete is stored in a ref and the
 * effect has no dependencies (runs once on mount). Parent re-renders update
 * the ref but never restart the effect.
 */
function createRefBasedRunner(onComplete: () => void) {
  let cancelled = false
  const onCompleteRef = { current: onComplete }

  const run = async () => {
    await wait(400)
    if (cancelled) return
    await wait(700)
    if (cancelled) return
    await wait(500)
    if (cancelled) return
    onCompleteRef.current()
  }

  void run()

  return {
    updateRef: (cb: () => void) => { onCompleteRef.current = cb },
    destroy: () => { cancelled = true },
  }
}

const ANIMATION_DURATION = 1600

describe('overlay animation stability', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  describe('deps-based runner (old pattern)', () => {
    it('completes when uninterrupted', async () => {
      const onComplete = vi.fn()
      createDepsBasedRunner(onComplete)

      await vi.advanceTimersByTimeAsync(ANIMATION_DURATION)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('re-render mid-animation restarts and delays completion', async () => {
      const onComplete = vi.fn()
      const { simulateRerender } = createDepsBasedRunner(onComplete)

      await vi.advanceTimersByTimeAsync(200)
      simulateRerender()

      await vi.advanceTimersByTimeAsync(ANIMATION_DURATION - 200)
      expect(onComplete).not.toHaveBeenCalled()
    })
  })

  describe('ref-based runner (current pattern)', () => {
    it('completes when uninterrupted', async () => {
      const onComplete = vi.fn()
      createRefBasedRunner(onComplete)

      await vi.advanceTimersByTimeAsync(ANIMATION_DURATION)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('ref update mid-animation does not restart or delay completion', async () => {
      const onComplete = vi.fn()
      const { updateRef } = createRefBasedRunner(onComplete)

      await vi.advanceTimersByTimeAsync(200)
      updateRef(onComplete)

      await vi.advanceTimersByTimeAsync(ANIMATION_DURATION - 200)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })
})
