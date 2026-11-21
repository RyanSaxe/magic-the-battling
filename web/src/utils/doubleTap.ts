export const DOUBLE_TAP_WINDOW_MS = 300

export interface TapResult {
  isDoubleTap: boolean
  lastTapAt: number | null
}

export function registerTap(lastTapAt: number | null, tapAt: number): TapResult {
  if (lastTapAt !== null && tapAt - lastTapAt <= DOUBLE_TAP_WINDOW_MS) {
    return { isDoubleTap: true, lastTapAt: null }
  }
  return { isDoubleTap: false, lastTapAt: tapAt }
}
