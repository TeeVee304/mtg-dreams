import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Menu entry: an action, or a submenu of more entries. */
export type MenuItem = (
  | {
      label: string
      onSelect: () => void
      /** Destructive: separated at the bottom, in red. */
      danger?: boolean
      /** An on/off setting: shown with a check mark when on. */
      checked?: boolean
      /** Shown at the right end, where submenus show their arrow. */
      icon?: IconName
    }
  | { label: string; items: MenuItem[]; danger?: undefined; checked?: undefined }
) & {
  /** Starts a group: a line above it, unless it comes first. */
  separated?: boolean
}

/** Props of {@link MenuButton}. */
interface MenuButtonProps {
  label: string
  items: MenuItem[]
  /** Content of the button opening the menu, with its classes; the ⋯ icon by default. */
  trigger?: { content: ReactNode; className: string }
}

/**
 * Overflow (⋯) menu. Closes on selection, outside click or Escape (without closing an enclosing
 * dialog); arrow keys navigate. A submenu replaces the entries, with a way back.
 */
export function MenuButton({ label, items, trigger }: MenuButtonProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className={`${trigger?.className ?? 'icon-btn'} menu-trigger${open ? ' open' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {trigger?.content ?? <Icon name="more" />}
      </button>
      {open && (
        <MenuList
          items={items}
          onClose={(refocus) => {
            setOpen(false)
            if (refocus) root.current?.querySelector<HTMLButtonElement>('.menu-trigger')?.focus()
          }}
        />
      )}
    </div>
  )
}

/** Props of {@link ContextMenu}. */
interface ContextMenuProps {
  /** Where it was opened, in viewport pixels. */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/**
 * Right-click menu at a point, kept inside the window. Closes like {@link MenuButton}'s, and on
 * the mouse wheel (the page would scroll away under it) or resizing.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const root = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: x, top: y })
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const box = root.current?.querySelector('.menu-list')?.getBoundingClientRect()
    if (!box) return
    setAt({ left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)) })
  }, [x, y])

  useEffect(() => {
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close.current()
    }
    const always = () => close.current()
    window.addEventListener('mousedown', outside)
    window.addEventListener('wheel', outside, { passive: true })
    window.addEventListener('resize', always)
    window.addEventListener('blur', always)
    return () => {
      window.removeEventListener('mousedown', outside)
      window.removeEventListener('wheel', outside)
      window.removeEventListener('resize', always)
      window.removeEventListener('blur', always)
    }
  }, [])

  return (
    <div className="menu context-menu" ref={root} style={at} onContextMenu={(event) => event.preventDefault()}>
      <MenuList items={items} onClose={onClose} />
    </div>
  )
}

/** Props of {@link MenuList}. */
interface MenuListProps {
  items: MenuItem[]
  /** Closes the menu; `refocus` after Escape, to give focus back to what opened it. */
  onClose: (refocus?: boolean) => void
}

/** The open menu's entries: arrow keys move between them; a submenu replaces them, with a way back. */
function MenuList({ items, onClose }: MenuListProps) {
  /** Open submenu entry; null for the top level. */
  const [sub, setSub] = useState<Extract<MenuItem, { items: MenuItem[] }> | null>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Without scrolling: a right-click menu closes when the page scrolls.
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [sub])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose(true)
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
    onClose()
    item.onSelect()
  }

  return (
    <div className="menu-list" role="menu" ref={menu} onKeyDown={onKey}>
      {sub && (
        <>
          <button type="button" role="menuitem" className="menu-back" onClick={() => setSub(null)}>
            <span aria-hidden="true">‹</span> {sub.label}
          </button>
          <div className="menu-separator" role="separator" />
        </>
      )}
      {regular.map((item, i) => (
        <Fragment key={item.label}>
          {item.separated && i > 0 && <div className="menu-separator" role="separator" />}
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            className={'items' in item || item.checked !== undefined ? 'menu-sub' : 'icon' in item && item.icon ? 'menu-icon' : undefined}
            aria-haspopup={'items' in item ? 'menu' : undefined}
            onClick={() => choose(item)}
          >
            {item.label}
            {'icon' in item && item.icon && <Icon name={item.icon} />}
            {'items' in item && <span aria-hidden="true">›</span>}
            {item.checked && <span aria-hidden="true">✓</span>}
          </button>
        </Fragment>
      ))}
      {dangerous.length > 0 && regular.length > 0 && <div className="menu-separator" role="separator" />}
      {dangerous.map((item) => (
        <button key={item.label} type="button" role="menuitem" className="danger" onClick={() => choose(item)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}
