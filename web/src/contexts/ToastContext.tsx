import { useState, useCallback, useRef, type ReactNode } from 'react'
import { ToastContext, type Toast, type ToastVariant } from './toastState'

const MAX_TOASTS = 5
const TOAST_DURATION = 5000

const variantStyles: Record<ToastVariant, string> = {
  error: 'bg-red-900/90 text-red-100 border-red-700',
  success: 'bg-green-900/90 text-green-100 border-green-700',
  info: 'bg-gray-900/90 text-gray-100 border-gray-600',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const addToast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = nextId.current++
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, TOAST_DURATION)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto animate-toast-fade rounded-lg border px-4 py-2 shadow-lg text-sm max-w-md ${variantStyles[toast.variant]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
