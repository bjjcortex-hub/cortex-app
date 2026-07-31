import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { documentRepository } from '../infra/SupabaseDocumentRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type { DocumentSummary, DocumentType } from '../core/document/types'

export default function GalleryPage() {
  const navigate = useNavigate()

  const [docs, setDocs]           = useState<DocumentSummary[]>([])
  const [loading, setLoading]     = useState(true)
  const [forkingId, setForkingId] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<DocumentType | ''>('')

  useEffect(() => {
    documentRepository.listPublic()
      .then(setDocs)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const filteredDocs = useMemo(() => {
    return docs.filter(d => {
      if (searchQuery && !d.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (selectedType && d.type !== selectedType) return false
      return true
    })
  }, [docs, searchQuery, selectedType])

  async function handleFork(docId: string) {
    setForkingId(docId)
    setError(null)
    try {
      const ownerId = getCurrentOwnerId()
      const newDoc = await documentRepository.fork(docId, ownerId)
      navigate(`/docs/${newDoc.id}`)
    } catch (e) {
      setError(String(e))
      setForkingId(null)
    }
  }

  return (
    <div className="docs-page">
      {/* ─── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Galeria Pública da Comunidade</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/rotas" className="btn-reset">🧭 Rotas BJJ</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/ia" className="btn-reset">🧠 IA Analisador</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>
            ⚖️ Curadoria
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '24px auto', padding: '0 16px' }}>

        {/* ─── Título ─────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--fg)' }}>
            🌍 Galeria de Mapas & Fluxogramas Públicos
          </h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>
            Explore mapas mentais e fluxogramas compartilhados por outros praticantes. Clique em "Clonar" para copiar para sua conta e personalizar.
          </p>
        </div>

        {/* ─── Filtros ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Buscar mapa por título..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: '#0f172a',
              color: '#fff',
              fontSize: 13,
            }}
          />

          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value as DocumentType | '')}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#0f172a', color: '#fff', fontSize: 13 }}
          >
            <option value="">Todos os formatos</option>
            <option value="mindmap">Mindmap</option>
            <option value="fluxograma">Fluxograma</option>
          </select>
        </div>

        {error && (
          <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ─── Grid de Documentos Públicos ──────────────────────────────────── */}
        {loading ? (
          <div className="splash"><div className="spinner" /><p>Carregando galeria pública…</p></div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'var(--card-bg, #1e293b)', borderRadius: 10, color: 'var(--muted)' }}>
            Nenhum documento público encontrado. Você pode marcar seus documentos como públicos na página de edição.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--card-bg, #1e293b)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    background: doc.type === 'mindmap' ? '#3b82f6' : '#8b5cf6',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}>
                    {doc.type}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3 }}>
                  {doc.title}
                </div>

                <button
                  onClick={() => handleFork(doc.id)}
                  disabled={forkingId === doc.id}
                  style={{
                    marginTop: 'auto',
                    padding: '10px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: forkingId === doc.id ? 'wait' : 'pointer',
                  }}
                >
                  {forkingId === doc.id ? 'Clonando…' : '🍴 Clonar para Meus Documentos'}
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
