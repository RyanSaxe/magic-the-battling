import { useEffect, useRef } from 'react'

type HotkeyMap = Record<string, () => void>

const PRESSED_BY_ENTER = 'button, a[href], summary'

export function hotkeyFor(key: string): string {
  return key === 'Enter' ? 'Enter' : key.toLowerCase()
}

export function useHotkeys(hotkeys: HotkeyMap, enabled = true) {
  const hotkeysRef = useRef(hotkeys)
  // A clicked button can keep focus, and :focus-visible matches it once any key is down, so it can't tell a click
  // from a Tab. A press since the last Tab means Enter still runs the hotkey.
  const pressedSinceTabRef = useRef(false)

  useEffect(() => {
    hotkeysRef.current = hotkeys
  })

  // Followed while the hotkeys are off too, since focus can move while a panel is open over them.
  useEffect(() => {
    const onPointerDown = () => {
      pressedSinceTabRef.current = true
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') pressedSinceTabRef.current = false
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      if (e.key === 'Enter' && !pressedSinceTabRef.current && target?.matches?.(PRESSED_BY_ENTER)) return

      const action = hotkeysRef.current[hotkeyFor(e.key)]
      if (action) {
        e.preventDefault()
        action()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
