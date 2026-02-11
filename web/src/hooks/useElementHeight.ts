import { useState, useCallback, useRef, useEffect } from 'react'

export function useElementHeight(): [React.RefCallback<HTMLElement>, number] {
  const [height, setHeight] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)

  const refCallback = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (!node) {
      setHeight(0)
      return
    }

    setHeight(Math.round(node.getBoundingClientRect().height))

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setHeight(Math.round(entry.borderBoxSize[0].blockSize))
    })

    observer.observe(node, { box: 'border-box' })
    observerRef.current = observer
  }, [])

  useEffect(() => {
    return () => observerRef.current?.disconnect()
  }, [])

  return [refCallback, height]
}
