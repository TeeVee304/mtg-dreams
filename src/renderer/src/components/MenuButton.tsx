import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/** Menu entry: an action, or a submenu of more entries. */
export type MenuItem =
  | {
      label: string
      onSelect: () => void
      /** Destructive: separated at the bottom, in red. */
      danger?: boolean
      /** An on/off setting: shown with a check mark when on. */
      checked?: boolean
    }
  | { label: string; items: MenuItem[]; danger?: undefined; checked?: undefined }

/**
 * Overflow (⋯) menu. Closes on selection, outside click or Escape (without closing an enclosing
 * dialog); arrow keys navigate. A submenu replaces the entries, with a way back.
 */
export function MenuButton({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  /** Open submenu entry; null for the top level. */
  const [sub, setSub] = useState<Extract<MenuItem, { items: MenuItem[] }> | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    else setSub(null)
  }, [open, sub])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('.menu-trigger')?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  const shown = sub?.items ?? items
  const regular = shown.filter((item) => !item.danger)
  const dangerous = shown.filter((item) => item.danger)
  const choose = (item: MenuItem) => {
    if ('items' in item) {
      setSub(item)
      return
    }
    setOpen(false)
    item.onSelect()
  }

  return (
    <div className="menu" ref={root} onKeyDown={onKey}>
      <button
        type="button"
        className={`icon-btn menu-trigger${open ? ' open' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-list" role="menu" ref={menu}>
          {sub && (
            <>
              <button type="button" role="menuitem" className="menu-back" onClick={() => setSub(null)}>
                <span aria-hidden="true">‹</span> {sub.label}
              </button>
              <div className="menu-separator" role="separator" />
            </>
          )}
          {regular.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              className={'items' in item || item.checked !== undefined ? 'menu-sub' : undefined}
              aria-haspopup={'items' in item ? 'menu' : undefined}
              onClick={() => choose(item)}
            >
              {item.label}
              {'items' in item && <span aria-hidden="true">›</span>}
              {item.checked && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          {dangerous.length > 0 && regular.length > 0 && <div className="menu-separator" role="separator" />}
          {dangerous.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="danger" onClick={() => choose(item)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
