import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { proposalRepository, canonicalConceptRepository } from '../infra/CanonicalConceptRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type { ConceptProposal, ConfidenceTier, ReviewAction } from '../core/canonical/types'

// ── Tipos internos ───────────────────────────────────────────────────────────

type Tab = 'high' | 'medium' | 'low'
type BeltRank = 'preta' | 'marrom' | 'roxa' | 'azul' | 'branca'

const BELT_WEIGHTS: Record<BeltRank, number> = {
  preta: 5,
  marrom: 4,
  roxa: 3,
  azul: 2,
  branca: 1,
}

const BELT_LABELS: Record<BeltRank, string> = {
  preta: '🥋 Faixa Preta (+5 pts / Veto -5)',
  marrom: '🥋 Faixa Marrom (+4 pts / Veto -4)',
  roxa: '🥋 Faixa Roxa (+3 pts / Veto -3)',
  azul: '🥋 Faixa Azul (+2 pts / Veto -2)',
  branca: '🥋 Faixa Branca (+1 pt / Veto -1)',
}

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

// ── Componente principal ─────────────────────────────────────────────────────

export default function CuratorPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]             = useState<Tab>('high')
  const [curatorRank, setCuratorRank]         = useState<BeltRank>('preta')
  const [proposals, setProposals]             = useState<ConceptProposal[]>([])
  const [proposalScores, setProposalScores]   = useState<Record<string, number>>({})
  const [highRankVotes, setHighRankVotes]     = useState<Record<string, boolean>>({})
  const [counts, setCounts]                   = useState<Record<Tab, number>>({ high: 0, medium: 0, low: 0 })
  const [loading, setLoading]                 = useState(true)
  const [actionLoading, setActionLoading]     = useState<string | null>(null)
  const [error, setError]                     = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId]     = useState<Record<string, string>>({})

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

  // Votação Ponderada do Conselho Técnico Multi-Curador (com Quórum e Veto)
  async function handleVote(proposalId: string, isVeto: boolean = false) {
    const currentScore = proposalScores[proposalId] || 0
    const weight = BELT_WEIGHTS[curatorRank]
    const delta = isVeto ? -weight : weight
    const newScore = currentScore + delta

    const isHighRank = curatorRank === 'preta' || curatorRank === 'marrom'
    const hasHighRank = highRankVotes[proposalId] || isHighRank

    setProposalScores(prev => ({ ...prev, [proposalId]: newScore }))
    if (isHighRank) {
      setHighRankVotes(prev => ({ ...prev, [proposalId]: true }))
    }

    // Regra 1: Rejeição por Veto Ponderado acumulado (<= -10 pts)
    if (newScore <= -10) {
      await handleAction(proposalId, { type: 'reject', reason: 'Rejeitado por veto ponderado do conselho técnico' })
      return
    }

    // Regra 2: Quórum Mínimo Obriga a presença de pelo menos 1 Faixa-Preta ou Marrom entre os 10 pts
    if (newScore >= 10) {
      if (hasHighRank) {
        await handleAction(proposalId, { type: 'approve' })
      } else {
        setError('Quórum Pendente: Para aprovar, a soma de 10 pts exige pelo menos 1 voto de Faixa-Preta ou Faixa-Marrom.')
      }
    }
  }

  // Executa uma ação de revisão
  async function handleAction(proposalId: string, action: ReviewAction) {
    setActionLoading(proposalId)
    try {
      const reviewerId = getCurrentOwnerId()
      await proposalRepository.review(proposalId, reviewerId, action, canonicalConceptRepository)
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
        <span className="topbar-title">Governança & Conselho Técnico Multi-Curador</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          
          {/* Seletor de Faixa do Curador */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
            <span>Sua Graduação:</span>
            <select
              value={curatorRank}
              onChange={e => setCuratorRank(e.target.value as BeltRank)}
              style={{ background: '#0f172a', color: '#fff', border: '1px solid #3b82f6', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 700 }}
            >
              {(Object.keys(BELT_LABELS) as BeltRank[]).map(b => (
                <option key={b} value={b}>{BELT_LABELS[b]}</option>
              ))}
            </select>
          </label>

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
      <div className="curator-tab-desc" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {activeTab === 'high' && (
            <p>Propostas com confiança &gt; 85% — quórum de 10 pts exige ao menos 1 voto de Faixa-Preta/Marrom e permite veto negativo.</p>
          )}
          {activeTab === 'medium' && (
            <p>Propostas com confiança 50–85% — parecem variante de X ou Y. Revisão completa pelo conselho recomendada.</p>
          )}
          {activeTab === 'low' && (
            <p>Propostas com confiança &lt; 50% — candidatos a conceito genuinamente novo. Prioridade alta de avaliação técnica.</p>
          )}
        </div>

        <span style={{ fontSize: 11, background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid #3b82f6', padding: '4px 10px', borderRadius: 12, fontWeight: 700 }}>
          🛡️ Quórum: 10 pts + 1 Voto Faixa-Preta/Marrom Obrigatório
        </span>
      </div>

      {/* ─── Estado de carregamento ─────────────────────────────────────────── */}
      {error && (
        <div className="curator-error">
          <strong>Erro:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="splash"><div className="spinner" /><p>Carregando propostas de governança…</p></div>
      ) : proposals.length === 0 ? (
        <div className="curator-empty">
          <span>✅</span>
          <p>Nenhuma proposta pendente nesta fila de curadoria.</p>
        </div>
      ) : (
        /* ─── Lista de propostas ──────────────────────────────────────────── */
        <div className="proposals-list">
          {proposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              score={proposalScores[proposal.id] || 0}
              hasHighRankVote={highRankVotes[proposal.id] || false}
              curatorRank={curatorRank}
              loading={actionLoading === proposal.id}
              mergeTargetId={mergeTargetId[proposal.id] ?? ''}
              onMergeTargetChange={val =>
                setMergeTargetId(prev => ({ ...prev, [proposal.id]: val }))
              }
              onVote={() => handleVote(proposal.id, false)}
              onVeto={() => handleVote(proposal.id, true)}
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
  score: number
  hasHighRankVote: boolean
  curatorRank: BeltRank
  loading: boolean
  mergeTargetId: string
  onMergeTargetChange: (val: string) => void
  onVote: () => void
  onVeto: () => void
  onApprove: () => void
  onEdit: () => void
  onMerge: () => void
  onReject: () => void
}

function ProposalCard({
  proposal, score, hasHighRankVote, curatorRank, loading, mergeTargetId, onMergeTargetChange,
  onVote, onVeto, onApprove, onEdit, onMerge, onReject,
}: ProposalCardProps) {
  const name = proposal.node_data.preferred_name
    ?? (proposal.node_data as Record<string, unknown>)['name'] as string
    ?? 'Sem nome'

  const sig = proposal.node_data.structural_signature
  const progressPct = Math.min(100, Math.max(0, Math.round((score / 10) * 100)))

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

      {/* Barra de Progresso de Curadoria Multi-Curador */}
      <div style={{ margin: '10px 0', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
          <span>Votação do Conselho Técnico: {score} / 10 pts</span>
          <span style={{ color: hasHighRankVote ? '#34d399' : '#fbbf24' }}>
            {hasHighRankVote ? '✓ Quórum Alta Graduação OK' : '⚠️ Quórum Alta Graduação Pendente'}
          </span>
        </div>
        <div style={{ height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: score < 0 ? '#ef4444' : progressPct >= 100 && hasHighRankVote ? '#10b981' : '#3b82f6', transition: 'width 0.3s' }} />
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

      {/* Ações */}
      <div className="proposal-actions">
        <button
          className="btn-action btn-approve"
          onClick={onVote}
          disabled={loading}
          style={{ background: '#3b82f6' }}
          title={`Votar a favor (+${BELT_WEIGHTS[curatorRank]} pts)`}
        >
          🥋 Votar (+{BELT_WEIGHTS[curatorRank]} pts)
        </button>

        <button
          className="btn-action btn-reject"
          onClick={onVeto}
          disabled={loading}
          style={{ background: 'rgba(239,68,68,0.8)' }}
          title={`Veto ponderado (-${BELT_WEIGHTS[curatorRank]} pts)`}
        >
          ⛔ Veto (-{BELT_WEIGHTS[curatorRank]} pts)
        </button>

        <button
          className="btn-action btn-approve"
          onClick={onApprove}
          disabled={loading}
          title="Aprovação direta — cria nó canônico e libera telemetria"
        >
          ✅ Aprovar Direto
        </button>

        <button
          className="btn-action btn-edit"
          onClick={onEdit}
          disabled={loading}
          title="Abrir editor completo antes de aprovar"
        >
          ✏️ Editar
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
