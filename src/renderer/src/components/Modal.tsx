import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Props of {@link Modal}. */
interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** `wizard`: wide, with a fixed height so steps don't change its size. */
  size?: 'normal' | 'medium' | 'wide' | 'wizard'
  /** Shown before the title. */
  icon?: ReactNode
  /** Whether a click on the backdrop closes it; false where a stray click would lose work. */
  dismissable?: boolean
}

/** Modal dialog with title, body and optional footer; closes on Escape or, unless not `dismissable`, a backdrop click. */
export function Modal({ title, onClose, children, footer, size = 'normal', icon, dismissable = true }: ModalProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2 className={icon ? 'modal-title-icon' : undefined}>
            {icon}
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
