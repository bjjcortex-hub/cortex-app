import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { canonicalConceptRepository } from '../infra/CanonicalConceptRepository'
import type { CanonicalConcept, NodeType, GiNogi, GamePhase } from '../core/canonical/types'

// ─── Opções de Filtro ─────────────────────────────────────────────────────────

const NODE_TYPES: { value: NodeType | ''; label: string; color: string }[] = [
  { value: '',            label: 'Todos os tipos', color: '#64748b' },
  { value: 'position',   label: 'Posição',        color: '#3b82f6' },
  { value: 'transition', label: 'Transição',      color: '#8b5cf6' },
  { value: 'submission', label: 'Finalização',    color: '#ef4444' },
  { value: 'principle',  label: 'Princípio',      color: '#10b981' },
  { value: 'system',     label: 'Sistema',        color: '#f59e0b' },
]

const GI_NOGI_OPTIONS: { value: GiNogi | ''; label: string }[] = [
  { value: '',     label: 'Gi & No-Gi' },
  { value: 'both', label: 'Ambos' },
  { value: 'gi',   label: 'Somente Gi' },
  { value: 'nogi', label: 'Somente No-Gi' },
]

const GAME_PHASES: { value: GamePhase; label: string }[] = [
  { value: 'standing', label: 'Em pé' },
  { value: 'guard',    label: 'Guarda' },
  { value: 'passing',  label: 'Passagem' },
  { value: 'control',  label: 'Controle' },
  { value: 'finish',   label: 'Finalização' },
  { value: 'escape',   label: 'Escape' },
]

const PAGE_SIZE = 48

export default function GraphExplorerPage() {
  const navigate = useNavigate()

  // Estados de dados e carregamento
  const [concepts, setConcepts]     = useState<CanonicalConcept[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType]   = useState<NodeType | ''>('')
  const [selectedGiNogi, setSelectedGiNogi] = useState<GiNogi | ''>('')
  const [selectedPhases, setSelectedPhases] = useState<Set<GamePhase>>(new Set())
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE)

  // Conceito Selecionado no Drawer
  const [selectedConcept, setSelectedConcept] = useState<CanonicalConcept | null>(null)

  // Carrega dados do repositório
  const loadConcepts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await canonicalConceptRepository.list({ limit: 1000 })
      setConcepts(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConcepts() }, [loadConcepts])

  // Toggle de fases do jogo
  const togglePhase = (phase: GamePhase) => {
    setSelectedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phase)) next.delete(phase)
      else next.add(phase)
      return next
    })
  }

  // Filtragem local dos conceitos
  const filteredConcepts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return concepts.filter(c => {
      // Filtro de Busca por Nome ou Aliases
      if (q) {
        const nameMatch = (c.preferred_name || (c as unknown as Record<string, unknown>).name as string || '').toLowerCase().includes(q)
        const slugMatch = (c.canonical_id || '').toLowerCase().includes(q)
        const aliasMatch = c.aliases?.some(a => a.name.toLowerCase().includes(q) || a.lineage?.toLowerCase().includes(q))
        if (!nameMatch && !slugMatch && !aliasMatch) return false
      }

      // Filtro de Tipo
      if (selectedType && c.node_type !== selectedType) return false

      // Filtro de Gi/NoGi
      if (selectedGiNogi && c.gi_nogi !== selectedGiNogi) return false

      // Filtro de Fases
      if (selectedPhases.size > 0) {
        const hasPhase = c.game_phase?.some(p => selectedPhases.has(p))
        if (!hasPhase) return false
      }

      return true
    })
  }, [concepts, searchQuery, selectedType, selectedGiNogi, selectedPhases])

  const displayedConcepts = useMemo(() => {
    return filteredConcepts.slice(0, visibleCount)
  }, [filteredConcepts, visibleCount])

  return (
    <div className="docs-page">

      {/* ─── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Grafo Explorer de BJJ (2.086 Posições)</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/ia" className="btn-reset">🧠 IA Analisador</Link>
          <Link to="/curador" className="btn-reset" style={{ borderColor: 'var(--accent)' }}>
            ⚖️ Curadoria
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '20px auto', padding: '0 16px' }}>

        {/* ─── Painel de Controle e Filtros ─────────────────────────────────── */}
        <div style={{ background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>

          {/* Busca por Nome / Alias */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nome, alias ou linhagem (ex: guarda fechada, armbar, grapplemap...)"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE) }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--input-bg, #0f172a)',
                color: '#fff',
                fontSize: 14,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '0 14px', borderRadius: 8, cursor: 'pointer' }}
              >
                Limpar
              </button>
            )}
          </div>

          {/* Linha 2 de Filtros: Tipos e Gi/NoGi */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>TIPO:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {NODE_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => { setSelectedType(t.value); setVisibleCount(PAGE_SIZE) }}
                  style={{
                    background: selectedType === t.value ? t.color : 'rgba(255,255,255,0.05)',
                    color: selectedType === t.value ? '#fff' : 'var(--fg)',
                    border: `1px solid ${selectedType === t.value ? t.color : 'var(--border)'}`,
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: selectedType === t.value ? 700 : 400,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginLeft: 10 }}>REGRAS:</span>
            <select
              value={selectedGiNogi}
              onChange={e => { setSelectedGiNogi(e.target.value as GiNogi | ''); setVisibleCount(PAGE_SIZE) }}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#0f172a', color: '#fff', fontSize: 12 }}
            >
              {GI_NOGI_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Linha 3 de Filtros: Fases do Jogo */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>FASES DO JOGO:</span>
            {GAME_PHASES.map(p => {
              const active = selectedPhases.has(p.value)
              return (
                <button
                  key={p.value}
                  onClick={() => { togglePhase(p.value); setVisibleCount(PAGE_SIZE) }}
                  style={{
                    background: active ? '#3b82f6' : 'transparent',
                    color: active ? '#fff' : 'var(--muted)',
                    border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                    padding: '3px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {active ? '✓ ' : ''}{p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Status do Contador ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Exibindo <strong>{displayedConcepts.length}</strong> de <strong>{filteredConcepts.length}</strong> conceitos encontrados ({concepts.length} no banco)
          </span>
        </div>

        {/* ─── Grid de Cards de Conceito ───────────────────────────────────── */}
        {loading ? (
          <div className="splash"><div className="spinner" /><p>Carregando Grafo BJJ…</p></div>
        ) : error ? (
          <div style={{ color: '#ef4444', padding: 20 }}>⚠️ Erro: {error}</div>
        ) : filteredConcepts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'var(--card-bg)', borderRadius: 10, color: 'var(--muted)' }}>
            Nenhum conceito atende aos filtros selecionados.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
            {displayedConcepts.map(concept => (
              <ConceptCard
                key={concept.id}
                concept={concept}
                onClick={() => setSelectedConcept(concept)}
              />
            ))}
          </div>
        )}

        {/* ─── Botão Carregar Mais ─────────────────────────────────────────── */}
        {displayedConcepts.length < filteredConcepts.length && (
          <button
            onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            style={{
              display: 'block',
              margin: '0 auto 40px auto',
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--card-bg, #1e293b)',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Carregar mais posições (+{PAGE_SIZE})
          </button>
        )}
      </div>

      {/* ─── Drawer Expansível de Detalhes do Conceito ─────────────────────── */}
      {selectedConcept && (
        <ConceptDrawer
          concept={selectedConcept}
          onClose={() => setSelectedConcept(null)}
          onEdit={() => navigate(`/conceitos/${selectedConcept.id}`)}
        />
      )}
    </div>
  )
}

// ─── Componente Card Individual ───────────────────────────────────────────────

function ConceptCard({ concept, onClick }: { concept: CanonicalConcept; onClick: () => void }) {
  const name = concept.preferred_name || (concept as unknown as Record<string, unknown>).name as string || concept.canonical_id || concept.id
  const typeObj = NODE_TYPES.find(t => t.value === concept.node_type) || NODE_TYPES[1]
  const sig = concept.structural_signature

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card-bg, #1e293b)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 14,
        cursor: 'pointer',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ background: typeObj.color, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
          {typeObj.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {concept.gi_nogi === 'both' ? 'Gi/NoGi' : concept.gi_nogi}
        </span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--fg)', lineHeight: 1.3 }}>
        {name}
      </div>

      {sig ? (
        <div style={{ fontSize: 11, color: 'var(--muted)', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sig.from_posture} ➔ {sig.mechanism} ➔ {sig.to_posture}
        </div>
      ) : concept.aliases && concept.aliases.length > 0 ? (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Aliases: {concept.aliases.map(a => a.name).join(', ')}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 4 }}>
        {concept.game_phase?.map(p => (
          <span key={p} style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, color: 'var(--muted)' }}>
            {p}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Componente Drawer de Detalhes ─────────────────────────────────────────────

function ConceptDrawer({ concept, onClose, onEdit }: { concept: CanonicalConcept; onClose: () => void; onEdit: () => void }) {
  const name = concept.preferred_name || (concept as unknown as Record<string, unknown>).name as string || concept.canonical_id || concept.id
  const sig = concept.structural_signature

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 450, maxWidth: '90vw', background: 'var(--bg, #0f172a)', height: '100%', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
            Detalhes do Conceito Canônico
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--fg)' }}>{name}</h2>

        {concept.canonical_id && (
          <code style={{ fontSize: 12, color: 'var(--muted)', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4 }}>
            {concept.canonical_id}
          </code>
        )}

        {/* Assinatura Estrutural */}
        {sig && (
          <div style={{ background: 'var(--card-bg, #1e293b)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
              Assinatura Biomecânica:
            </span>
            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>De: <span style={{ color: '#93c5fd' }}>{sig.from_posture}</span></div>
              <div>Mecanismo: <span style={{ color: '#c084fc' }}>{sig.mechanism}</span></div>
              <div>Para: <span style={{ color: '#4ade80' }}>{sig.to_posture}</span></div>
            </div>
          </div>
        )}

        {/* Aliases & Nomenclaturas */}
        {concept.aliases && concept.aliases.length > 0 && (
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
              ALIASES & LINHAGEM:
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {concept.aliases.map((a, i) => (
                <div key={i} style={{ background: 'var(--card-bg)', padding: '8px 10px', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{a.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{a.lang} | {a.lineage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div>Origem: <strong>{concept.source_origin || 'grapplemap'}</strong></div>
          <div>Status de Revisão: <strong>{concept.review_status}</strong></div>
          <div>Fases: <strong>{concept.game_phase?.join(', ') || 'Todas'}</strong></div>
          <div>Regras: <strong>{concept.gi_nogi}</strong></div>
        </div>

        {/* Botão de Edição */}
        <button
          onClick={onEdit}
          style={{
            marginTop: 'auto',
            padding: '12px',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent, #3b82f6)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          ✏️ Editar Conceito Canônico
        </button>

      </div>
    </div>
  )
}
