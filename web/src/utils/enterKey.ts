const PRESSED_BY_ENTER = 'button:not([disabled]), a[href], summary'

// A clicked button can keep focus, and :focus-visible matches it once any key is down, so it can't tell a click from
// a Tab. This follows them for the whole app, because a dialog mounts after the press or Tab that moved the focus.
let pressedSinceTab = false

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    pressedSinceTab = true
  }, true)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') pressedSinceTab = false
  }, true)
}

/**
 * Whether Enter presses the focused control instead of running a shortcut. A layer over the page passes the
 * elements it lets players use, so that a control it covers doesn't take Enter from it.
 */
export function enterPressesControl(e: KeyboardEvent, ...usable: (Element | null)[]): boolean {
  if (e.key !== 'Enter' || pressedSinceTab) return false
  const control = e.target
  if (!(control instanceof Element) || !control.matches(PRESSED_BY_ENTER)) return false
  return usable.length === 0 || usable.some((element) => element?.contains(control))
}
