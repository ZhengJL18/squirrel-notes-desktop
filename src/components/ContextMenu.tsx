import { useEffect, useRef } from 'react'

export interface MenuItem {
  label: string
  icon?: string
  danger?: boolean
  action: () => void
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [onClose])

  return (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }}>
      {items.map((it) => (
        <div
          key={it.label}
          className={`item${it.danger ? ' danger' : ''}`}
          onClick={() => {
            onClose()
            it.action()
          }}
        >
          {it.icon && <span className="menu-icon">{it.icon}</span>}
          {it.label}
        </div>
      ))}
    </div>
  )
}
