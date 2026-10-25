import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ui } from '@shared/text'

/** Props of {@link Modal}. */
interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /**
   * `wizard`: wide, with a fixed height so steps don't change its size. `stage`: no window, its
   * content free over a blurred backdrop, the footer a bar under it that ends with the close button.
   */
  size?: 'normal' | 'medium' | 'wide' | 'wizard' | 'stage'
  /** Shown before the title. */
  icon?: ReactNode
  /** Whether a click on the backdrop closes it; false where a stray click would lose work. */
  dismissable?: boolean
}

/** Modal dialog with title, body and optional footer; closes on Escape or, unless not `dismissable`, a backdrop click. */
export function Modal({ title, onClose, children, footer, size = 'normal', icon, dismissable = true }: ModalProps) {
  const stage = size === 'stage'
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

  const closeButton = (
    <button type="button" className="icon-btn" onClick={onClose} aria-label={ui.common.close}>
      ×
    </button>
  )

  return createPortal(
    <div
      className={`modal-backdrop${stage ? ' stage' : ''}`}
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        {!stage && (
          <header className="modal-head">
            <h2 className={icon ? 'modal-title-icon' : undefined}>
              {icon}
              {title}
            </h2>
            {closeButton}
          </header>
        )}
        <div className="modal-body">{children}</div>
        {(footer || stage) && (
          <footer className="modal-foot">
            {footer}
            {stage && closeButton}
          </footer>
        )}
      </div>
    </div>,
    document.body
  )
}
