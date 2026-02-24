import { useState, useCallback, useRef, type ReactNode } from 'react'
import { ToastContext, type Toast, type ToastVariant } from './toastState'

const MAX_TOASTS = 5
const TOAST_DURATION = 5000

const variantConfig: Record<ToastVariant, { borderColor: string; iconColor: string; icon: ReactNode }> = {
  error: {
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-400',
    icon: (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    ),
  },
  success: {
    borderColor: 'border-l-green-500',
    iconColor: 'text-green-400',
    icon: (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  info: {
    borderColor: 'border-l-blue-500',
    iconColor: 'text-blue-400',
    icon: (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
    ),
  },
  warning: {
    borderColor: 'border-l-amber-500',
    iconColor: 'text-amber-400',
    icon: (
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
    ),
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = nextId.current++
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, variant }])
    setTimeout(() => removeToast(id), TOAST_DURATION)
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map(toast => {
          const config = variantConfig[toast.variant]
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto animate-toast-fade bg-gray-950/90 backdrop-blur-sm border border-gray-700/50 border-l-[3px] ${config.borderColor} rounded-lg shadow-xl px-4 py-2.5 max-w-md flex items-center gap-2.5`}
            >
              <span className={config.iconColor}>{config.icon}</span>
              <span className="text-sm text-gray-200 flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-1"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
