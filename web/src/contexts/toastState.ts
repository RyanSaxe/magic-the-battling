import { createContext, useContext } from 'react'

export type ToastVariant = 'error' | 'success' | 'info' | 'warning'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

export interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
