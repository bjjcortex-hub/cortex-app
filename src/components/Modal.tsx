import { useEffect } from 'react'

interface Props {
  title: string
  subtitle?: string
  description: string | null
  onClose: () => void
}

export default function Modal({ title, subtitle, description, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {description ? (
            <p className="modal-description">{description}</p>
          ) : (
            <p className="panel-empty">Descricao do movimento ainda nao cadastrada.</p>
          )}
        </div>
      </div>
    </div>
  )
}
