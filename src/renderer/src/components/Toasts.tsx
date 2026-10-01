import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastKind = 'info' | 'error'

/** A button on the toast; for now always Undo, shown as its icon. */
export interface ToastAction {
  label: string
  run: () => void
}

type PushToast = (message: string, kind?: ToastKind, action?: ToastAction) => void

interface Toast {
  id: number
  message: string
  kind: ToastKind
  action?: ToastAction
}

const ToastContext = createContext<PushToast>(() => undefined)
let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const push = useCallback<PushToast>(
    (message, kind = 'info', action) => {
      const id = ++nextId
      setToasts((all) => [...all.slice(-3), { id, message, kind, action }])
      // Longer when there's something to click.
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : action ? 6000 : 3000)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)}>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="icon-btn toast-action"
                title={`${toast.action.label} (Ctrl+Z)`}
                aria-label={toast.action.label}
                onClick={(event) => {
                  event.stopPropagation()
                  dismiss(toast.id)
                  toast.action?.run()
                }}
              >
                <Icon name="undo" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
