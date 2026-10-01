import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type ToastKind = 'info' | 'error'
type PushToast = (message: string, kind?: ToastKind) => void

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

const ToastContext = createContext<PushToast>(() => undefined)
let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const push = useCallback<PushToast>(
    (message, kind = 'info') => {
      const id = ++nextId
      setToasts((all) => [...all.slice(-3), { id, message, kind }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3000)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
