import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { documentRepository } from '../infra/SupabaseDocumentRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type { DocumentSummary } from '../core/document/types'

const TYPE_LABEL: Record<string, string> = {
  mindmap: 'Mindmap',
  fluxograma: 'Fluxograma',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function DocsListPage() {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let ownerId: string
    try {
      ownerId = getCurrentOwnerId()
    } catch {
      setError('Sessão não inicializada. Recarregue a página.')
      setLoading(false)
      return
    }
    documentRepository.list(ownerId)
      .then(setDocs)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function createDoc(type: 'mindmap' | 'fluxograma') {
    setCreating(true)
    try {
      const ownerId = getCurrentOwnerId()
      const title = type === 'mindmap' ? 'Novo Mindmap' : 'Novo Fluxograma'
      const doc = await documentRepository.create({
        type,
        title,
        ownerId,
        forkedFrom: null,
        visibility: 'private',
        schemaVersion: 1,
        data: { nodes: [], edges: [] },
      })
      navigate(`/docs/${doc.id}`)
    } catch (e) {
      setError(String(e))
      setCreating(false)
    }
  }

  async function removeDoc(id: string) {
    if (!confirm('Remover este documento?')) return
    try {
      await documentRepository.remove(id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="docs-page">
      <header className="topbar">
        <Link to="/" className="logo">BJJ Explorer</Link>
        <span className="topbar-title">Meus Documentos</span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <Link to="/grafo" className="btn-reset">
            🌐 Grafo BJJ
          </Link>
          <Link to="/ia" className="btn-reset">
            🧠 IA Analisador
          </Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>
            ⚖️ Curadoria
          </Link>
          <button
            className="btn-reset"
            onClick={() => createDoc('mindmap')}
            disabled={creating}
          >+ Mindmap</button>
          <button
            className="btn-reset"
            onClick={() => createDoc('fluxograma')}
            disabled={creating}
          >+ Fluxograma</button>
        </div>
      </header>

      <div className="docs-list-wrap">
        {loading && <p className="docs-empty">Carregando…</p>}
        {error && <p className="docs-empty" style={{ color: 'var(--submission)' }}>{error}</p>}

        {!loading && !error && docs.length === 0 && (
          <p className="docs-empty">Nenhum documento ainda. Crie seu primeiro mindmap ou fluxograma.</p>
        )}

        {docs.map(doc => (
          <div key={doc.id} className="doc-card">
            <Link to={`/docs/${doc.id}`} className="doc-card-link">
              <span className="doc-type-badge" data-type={doc.type}>
                {TYPE_LABEL[doc.type] ?? doc.type}
              </span>
              <span className="doc-title">{doc.title}</span>
              <span className="doc-date">{formatDate(doc.updatedAt)}</span>
            </Link>
            <button
              className="doc-remove-btn"
              onClick={() => removeDoc(doc.id)}
              title="Remover"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
