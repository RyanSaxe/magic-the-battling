import { useEffect, useRef } from 'react'
import { enterMayAdvance, enterPressesControl } from '../utils/enterKey'

type HotkeyMap = Record<string, () => void>

export function hotkeyFor(key: string): string {
  return key === 'Enter' ? 'Enter' : key.toLowerCase()
}

export function useHotkeys(hotkeys: HotkeyMap, enabled = true) {
  const hotkeysRef = useRef(hotkeys)

  useEffect(() => {
    hotkeysRef.current = hotkeys
  })

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }
      if (enterPressesControl(e)) return

      const action = hotkeysRef.current[hotkeyFor(e.key)]
      if (action) {
        e.preventDefault()
        if (e.key === 'Enter' && !enterMayAdvance(e)) return
        action()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
