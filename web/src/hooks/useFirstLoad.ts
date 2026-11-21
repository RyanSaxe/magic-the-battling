import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/** A list's first load: running, failed, or done with what it loaded. */
export type FirstLoad<T> = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; value: T }

/**
 * Loads once `enabled` is true and again on each retry. `load` must keep its identity between renders.
 * `update` changes what has loaded, such as when a record is added or removed.
 */
export function useFirstLoad<T>(
  load: () => Promise<T>,
  enabled: boolean,
): { state: FirstLoad<T>; update: Dispatch<SetStateAction<FirstLoad<T>>>; retry: () => void } {
  const [state, setState] = useState<FirstLoad<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    load().then(
      (value) => {
        if (!cancelled) setState({ status: 'loaded', value })
      },
      () => {
        if (!cancelled) setState({ status: 'failed' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, enabled, attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return { state, update: setState, retry }
}
