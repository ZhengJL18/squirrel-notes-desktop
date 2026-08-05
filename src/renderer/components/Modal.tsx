import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  onCancel: () => void
  onOk: () => void
  okText?: string
  danger?: boolean
}

export function Modal({
  title,
  children,
  onCancel,
  onOk,
  okText = '确定',
  danger = false
}: Props): React.JSX.Element {
  return (
    <div className="modal-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onCancel()
    }}>
      <div className="modal">
        <h3>{title}</h3>
        {children}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn primary"
            style={danger ? { background: 'var(--error)', color: '#fff', borderColor: 'var(--error)' } : undefined}
            onClick={onOk}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  )
}
