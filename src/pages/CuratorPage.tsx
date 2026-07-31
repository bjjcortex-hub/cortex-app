import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { proposalRepository, canonicalConceptRepository } from '../infra/CanonicalConceptRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type { ConceptProposal, ConfidenceTier, ReviewAction } from '../core/canonical/types'

// ─── Tipos internos ───────────────────────────────────────────────────────────

type Tab = 'high' | 'medium' | 'low'

const TIER_LABEL: Record<Tab, string> = {
  high:   'Alta confiança',
  medium: 'Média confiança',
  low:    'Baixa confiança (novo?)',
}

const TIER_COLOR: Record<Tab, string> = {
  high:   'var(--c-approved, #22c55e)',
  medium: 'var(--c-medium,   #f59e0b)',
  low:    'var(--c-proposed, #ef4444)',
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CuratorPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]       = useState<Tab>('high')
  const [proposals, setProposals]       = useState<ConceptProposal[]>([])
  const [counts, setCounts]             = useState<Record<Tab, number>>({ high: 0, medium: 0, low: 0 })
  const [loading, setLoading]           = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<Record<string, string>>({})

  // Carrega contagens para todas as abas
  const loadCounts = useCallback(async () => {
    const tiers: ConfidenceTier[] = ['high', 'medium', 'low']
    const results = await Promise.all(
      tiers.map(t => proposalRepository.listPending(t).then(list => [t, list.length] as const))
    )
    setCounts(Object.fromEntries(results) as Record<Tab, number>)
  }, [])

  // Carrega propostas da aba ativa
  const loadProposals = useCallback(async (tier: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const list = await proposalRepository.listPending(tier as ConfidenceTier)
      setProposals(list)
      await loadCounts()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [loadCounts])

  useEffect(() => { loadProposals(activeTab) }, [activeTab, loadProposals])

  // Executa uma ação de revisão
  async function handleAction(proposalId: string, action: ReviewAction) {
    setActionLoading(proposalId)
    try {
      const reviewerId = getCurrentOwnerId()
      await proposalRepository.review(proposalId, reviewerId, action, canonicalConceptRepository)
      // Remove da lista local
      setProposals(prev => prev.filter(p => p.id !== proposalId))
      await loadCounts()
    } catch (e) {
      setError(String(e))
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="curator-page">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Curadoria de Conceitos</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/ia" className="btn-reset">🧠 IA Analisador</Link>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
            {proposals.length} proposta{proposals.length !== 1 ? 's' : ''} pendente{proposals.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* ─── Abas de triagem ────────────────────────────────────────────────── */}
      <div className="curator-tabs">
        {(['high', 'medium', 'low'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`curator-tab ${activeTab === tab ? 'active' : ''}`}
            style={{ '--tab-color': TIER_COLOR[tab] } as React.CSSProperties}
            onClick={() => setActiveTab(tab)}
          >
            <span className="curator-tab-label">{TIER_LABEL[tab]}</span>
            {counts[tab] > 0 && (
              <span className="curator-tab-badge">{counts[tab]}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Descrição da aba ───────────────────────────────────────────────── */}
      <div className="curator-tab-desc">
        {activeTab === 'high' && (
          <p>Propostas com confiança &gt; 85% — já batem com um conceito existente. Revisão rápida.</p>
        )}
        {activeTab === 'medium' && (
          <p>Propostas com confiança 50–85% — parecem variante de X ou Y. Revisão completa recomendada.</p>
        )}
        {activeTab === 'low' && (
          <p>Propostas com confiança &lt; 50% — candidatos a conceito genuinamente novo. Prioridade alta de revisão.</p>
        )}
      </div>

      {/* ─── Estado de carregamento ─────────────────────────────────────────── */}
      {error && (
        <div className="curator-error">
          <strong>Erro:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="splash"><div className="spinner" /><p>Carregando…</p></div>
      ) : proposals.length === 0 ? (
        <div className="curator-empty">
          <span>✅</span>
          <p>Nenhuma proposta pendente nesta fila.</p>
        </div>
      ) : (
        /* ─── Lista de propostas ──────────────────────────────────────────── */
        <div className="proposals-list">
          {proposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              loading={actionLoading === proposal.id}
              mergeTargetId={mergeTargetId[proposal.id] ?? ''}
              onMergeTargetChange={val =>
                setMergeTargetId(prev => ({ ...prev, [proposal.id]: val }))
              }
              onApprove={() => handleAction(proposal.id, { type: 'approve' })}
              onEdit={() => navigate(`/conceitos/proposta/${proposal.id}`)}
              onMerge={() => handleAction(proposal.id, {
                type: 'merge',
                target_id: mergeTargetId[proposal.id] ?? '',
              })}
              onReject={() => handleAction(proposal.id, { type: 'reject' })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Card de proposta individual ──────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ConceptProposal
  loading: boolean
  mergeTargetId: string
  onMergeTargetChange: (val: string) => void
  onApprove: () => void
  onEdit: () => void
  onMerge: () => void
  onReject: () => void
}

function ProposalCard({
  proposal, loading, mergeTargetId, onMergeTargetChange,
  onApprove, onEdit, onMerge, onReject,
}: ProposalCardProps) {
  const name = proposal.node_data.preferred_name
    ?? (proposal.node_data as Record<string, unknown>)['name'] as string
    ?? 'Sem nome'

  const sig = proposal.node_data.structural_signature

  return (
    <div className={`proposal-card ${loading ? 'loading' : ''}`}>
      {/* Cabeçalho */}
      <div className="proposal-card-header">
        <div className="proposal-card-name">
          <span className="proposal-node-type">{proposal.node_data.node_type ?? '?'}</span>
          <strong>{name}</strong>
        </div>
        <div className="proposal-confidence">
          {proposal.confidence !== null && (
            <span className="confidence-score">
              {Math.round(proposal.confidence * 100)}%
            </span>
          )}
          {proposal.confidence_tier && (
            <span className={`confidence-tier tier-${proposal.confidence_tier}`}>
              {proposal.confidence_tier}
            </span>
          )}
        </div>
      </div>

      {/* Assinatura estrutural */}
      {sig && (
        <div className="proposal-signature">
          <span className="sig-part from">{sig.from_posture}</span>
          <span className="sig-arrow">→</span>
          <span className="sig-part mech">{sig.mechanism}</span>
          <span className="sig-arrow">→</span>
          <span className="sig-part to">{sig.to_posture}</span>
        </div>
      )}

      {/* Conceito mais próximo (match candidate) */}
      {proposal.match_candidate && (
        <div className="proposal-match">
          <span className="match-label">Mais próximo:</span>
          <Link to={`/conceitos/${proposal.match_candidate}`} className="match-link">
            {proposal.match_candidate}
          </Link>
        </div>
      )}

      {/* Metadados */}
      <div className="proposal-meta">
        <span>gi/no-gi: <strong>{proposal.node_data.gi_nogi ?? '—'}</strong></span>
        <span>fases: <strong>{proposal.node_data.game_phase?.join(', ') || '—'}</strong></span>
        <span>proposto: <strong>{new Date(proposal.proposed_at).toLocaleDateString('pt-BR')}</strong></span>
      </div>

      {/* Ações */}
      <div className="proposal-actions">
        <button
          className="btn-action btn-approve"
          onClick={onApprove}
          disabled={loading}
          title="Aprovar como está — cria nó canônico diretamente"
        >
          ✅ Aprovar
        </button>

        <button
          className="btn-action btn-edit"
          onClick={onEdit}
          disabled={loading}
          title="Abrir editor completo antes de aprovar"
        >
          ✏️ Editar e aprovar
        </button>

        <div className="btn-merge-group">
          <input
            className="merge-input"
            type="text"
            placeholder="ID do conceito alvo…"
            value={mergeTargetId}
            onChange={e => onMergeTargetChange(e.target.value)}
            disabled={loading}
          />
          <button
            className="btn-action btn-merge"
            onClick={onMerge}
            disabled={loading || !mergeTargetId}
            title="Fundir com conceito existente"
          >
            🔀 Fundir
          </button>
        </div>

        <button
          className="btn-action btn-reject"
          onClick={onReject}
          disabled={loading}
          title="Rejeitar proposta"
        >
          ❌ Rejeitar
        </button>
      </div>

      {loading && <div className="proposal-loading-overlay" />}
    </div>
  )
}
