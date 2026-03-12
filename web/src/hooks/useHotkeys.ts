import { useEffect, useRef } from 'react'

type HotkeyMap = Record<string, () => void>

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

      const key = e.key === 'Enter' ? 'Enter' : e.key.toLowerCase()
      const action = hotkeysRef.current[key]
      if (action) {
        e.preventDefault()
        action()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
