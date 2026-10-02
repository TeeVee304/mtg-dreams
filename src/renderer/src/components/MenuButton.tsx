import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/** Menu entry. */
export interface MenuItem {
  label: string
  onSelect: () => void
  /** Destructive: separated at the bottom, in red. */
  danger?: boolean
}

/** Overflow (⋯) menu. Closes on selection, outside click or Escape (without closing an enclosing dialog); arrow keys navigate. */
export function MenuButton({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

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

  const regular = items.filter((item) => !item.danger)
  const dangerous = items.filter((item) => item.danger)
  const choose = (item: MenuItem) => {
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
          {regular.map((item) => (
            <button key={item.label} type="button" role="menuitem" onClick={() => choose(item)}>
              {item.label}
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
