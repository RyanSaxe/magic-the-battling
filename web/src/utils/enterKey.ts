const PRESSED_BY_ENTER = 'button:not([disabled]), a[href], summary'

// :focus-visible matches a clicked button as soon as any key is down, so the outline a player saw is the one from
// before the key. This follows it for the whole app, because a dialog mounts after whatever moved the focus.
let outlined: Element | null = null
let outlinedBeforeKey: Element | null = null

function readOutline() {
  const focused = document.activeElement
  return focused?.matches(':focus-visible') ? focused : null
}

if (typeof window !== 'undefined') {
  window.addEventListener('focusin', () => {
    outlined = readOutline()
  }, true)
  window.addEventListener('keydown', (e) => {
    // A repeat is the same press, and its own first keydown drew the outline.
    if (!e.repeat) outlinedBeforeKey = outlined
    outlined = readOutline()
  }, true)
}

/**
 * Whether Enter presses the outlined control instead of running a shortcut. A layer over the page passes the
 * elements it lets players use, so that a control it covers doesn't take Enter from it.
 */
export function enterPressesControl(e: KeyboardEvent, ...usable: (Element | null)[]): boolean {
  const control = e.target
  if (e.key !== 'Enter' || !(control instanceof Element) || control !== outlinedBeforeKey) return false
  // A pill that shows on hover can keep focus unseen, and its outline with it.
  if (!control.matches(PRESSED_BY_ENTER) || getComputedStyle(control).opacity === '0') return false
  return usable.length === 0 || usable.some((element) => element?.contains(control))
}
