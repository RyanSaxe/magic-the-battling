import { useEffect } from 'react'

const PRESSED_BY_ENTER = 'button:not([disabled]), a[href], summary'
const ENDS_PHASE = '[data-ends-phase]'

// :focus-visible matches a clicked button as soon as any key is down, so the outline a player saw is the one from
// before the key. This follows it for the whole app, because a dialog mounts after whatever moved the focus.
let outlined: Element | null = null
let outlinedBeforeKey: Element | null = null
let openPanels = 0
let skipsNextEnter = false
let skipsThisEnter = false

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
    if (e.key !== 'Enter') return
    if (!e.repeat) {
      skipsThisEnter = skipsNextEnter
      skipsNextEnter = false
    }
    // An ended phase can't be taken back. So a button that ends one, even outlined, doesn't take Enter from a held
    // key or under an open panel.
    const endsPhase = e.target instanceof Element && e.target.matches(ENDS_PHASE)
    if (endsPhase && (openPanels > 0 || e.repeat)) e.preventDefault()
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

/** Whether this Enter may advance the page: not under an open panel, from a held key or when it's to be skipped. */
export function enterMayAdvance(e: KeyboardEvent): boolean {
  return !e.repeat && openPanels === 0 && !skipsThisEnter
}

/** While open, a panel over the page keeps Enter from advancing it. */
export function usePanelHoldsEnter(open = true) {
  useEffect(() => {
    if (!open) return
    openPanels += 1
    return () => {
      openPanels -= 1
    }
  }, [open])
}

/** The next Enter doesn't advance. Returns what calls that off. */
export function skipNextEnter(): () => void {
  skipsNextEnter = true
  return () => {
    skipsNextEnter = false
  }
}
