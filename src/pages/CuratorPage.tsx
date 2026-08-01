import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  proposalRepository,
  canonicalConceptRepository,
  curatorProfileRepository,
  curatorVoteRepository,
  BELT_WEIGHTS,
  type CuratorProfile,
  type ProposalVoteSummary,
} from '../infra/CanonicalConceptRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type { ConceptProposal, ConfidenceTier, ReviewAction } from '../core/canonical/types'

// ── Tipos internos ───────────────────────────────────────────────────────────

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

const BELT_LABEL: Record<string, string> = {
  preta: '🥋 Faixa Preta',
  marrom: '🥋 Faixa Marrom',
  roxa: '🥋 Faixa Roxa',
  azul: '🥋 Faixa Azul',
  branca: '🥋 Faixa Branca',
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function CuratorPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]       = useState<Tab>('high')
  const [proposals, setProposals]       = useState<ConceptProposal[]>([])
  const [voteSummaries, setVoteSummaries] = useState<Record<string, ProposalVoteSummary>>({})
  const [counts, setCounts]             = useState<Record<Tab, number>>({ high: 0, medium: 0, low: 0 })
  const [loading, setLoading]           = useState(true)
  const [curatorProfile, setCuratorProfile] = useState<CuratorProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<Record<string, string>>({})

  // ── Carrega perfil autenticado do curador ────────────────────────────────────
  useEffect(() => {
    async function loadProfile() {
      try {
        const userId = getCurrentOwnerId()
        const profile = await curatorProfileRepository.getMyProfile(userId)
        setCuratorProfile(profile)
      } catch {
        setCuratorProfile(null)
      } finally {
        setProfileLoading(false)
      }
    }
    loadProfile()
  }, [])

  // ── Carrega contagens para todas as abas ─────────────────────────────────────
  const loadCounts = useCallback(async () => {
    const tiers: ConfidenceTier[] = ['high', 'medium', 'low']
    const results = await Promise.all(
      tiers.map(t => proposalRepository.listPending(t).then(list => [t, list.length] as const))
    )
    setCounts(Object.fromEntries(results) as Record<Tab, number>)
  }, [])

  // ── Carrega propostas e placar real de cada proposta do Supabase ─────────────
  const loadProposals = useCallback(async (tier: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const list = await proposalRepository.listPending(tier as ConfidenceTier)
      setProposals(list)
      await loadCounts()

      // Carrega o placar persistido de cada proposta
      const userId = getCurrentOwnerId()
      const summaries = await Promise.all(
        list.map(p => curatorVoteRepository.getSummary(p.id, userId).then(s => [p.id, s] as const))
      )
      setVoteSummaries(Object.fromEntries(summaries))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [loadCounts])

  useEffect(() => { loadProposals(activeTab) }, [activeTab, loadProposals])

  // ── Voto persistido no Supabase (com constraint de 1 voto por curador) ───────
  async function handleVote(proposalId: string, isVeto: boolean) {
    if (!curatorProfile) {
      setError('Você não está cadastrado como curador. Contate o administrador para obter acesso.')
      return
    }

    const prev = voteSummaries[proposalId]
    if (prev?.userHasVoted) {
      setError('Você já votou nesta proposta. Cada curador pode votar apenas uma vez por proposta.')
      return
    }

    setActionLoading(proposalId + (isVeto ? '-veto' : '-vote'))
    try {
      await curatorVoteRepository.castVote(proposalId, curatorProfile, isVeto)

      // Recarrega o placar persistido atualizado
      const userId = getCurrentOwnerId()
      const updated = await curatorVoteRepository.getSummary(proposalId, userId)
      setVoteSummaries(prev => ({ ...prev, [proposalId]: updated }))

      // Quórum atingido: soma >= 10 E ao menos 1 voto de faixa-preta/marrom
      if (updated.totalScore >= 10 && updated.hasHighRankVote) {
        await handleAction(proposalId, { type: 'approve' })
      }

      // Rejeição automática por veto acumulado
      if (updated.totalScore <= -10) {
        await handleAction(proposalId, { type: 'reject', reason: 'Rejeitado por veto ponderado do conselho técnico.' })
      }

      // Avisa quando chegou em 10 pts mas falta o quórum de alta graduação
      if (updated.totalScore >= 10 && !updated.hasHighRankVote) {
        setError('Quórum Pendente: Os 10 pts foram atingidos, mas é necessário ao menos 1 voto de Faixa-Preta ou Faixa-Marrom para aprovar.')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setActionLoading(null)
    }
  }

  // ── Ação de revisão (aprovar, rejeitar, fundir) ──────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="curator-page">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/docs" className="logo">BJJ Cortex</Link>
        <span className="topbar-title">Governança & Conselho Técnico Multi-Curador</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
          {/* Perfil autenticado (somente leitura) */}
          {!profileLoading && (
            <div style={{
              background: curatorProfile ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${curatorProfile ? '#3b82f6' : '#ef4444'}`,
              borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700,
              color: curatorProfile ? '#93c5fd' : '#fca5a5',
            }}>
              {curatorProfile
                ? `${BELT_LABEL[curatorProfile.belt_rank]} — Curador Verificado (peso ${BELT_WEIGHTS[curatorProfile.belt_rank]})`
                : '⚠️ Não cadastrado como curador'}
            </div>
          )}
          <Link to="/docs" className="btn-reset">📁 Documentos</Link>
          <Link to="/grafo" className="btn-reset">🌐 Grafo BJJ</Link>
          <Link to="/ia" className="btn-reset">🧠 IA Analisador</Link>
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
            {counts[tab] > 0 && <span className="curator-tab-badge">{counts[tab]}</span>}
          </button>
        ))}
      </div>

      {/* ─── Regra de Governança ─────────────────────────────────────────────── */}
      <div className="curator-tab-desc" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {activeTab === 'high' && <p>Propostas com confiança &gt; 85%. Aprovação exige 10 pts E ao menos 1 voto de Faixa-Preta/Marrom.</p>}
          {activeTab === 'medium' && <p>Propostas com confiança 50–85% — parecem variante de conceito existente. Revisão completa recomendada.</p>}
          {activeTab === 'low' && <p>Propostas com confiança &lt; 50% — candidatos a conceito genuinamente novo. Prioridade alta.</p>}
        </div>
        <span style={{ fontSize: 11, background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid #3b82f6', padding: '4px 10px', borderRadius: 12, fontWeight: 700 }}>
          🛡️ Quórum: 10 pts + 1 voto Faixa-Preta/Marrom · 1 voto por curador por proposta
        </span>
      </div>

      {/* ─── Estado de Erro ──────────────────────────────────────────────────── */}
      {error && (
        <div className="curator-error">
          <strong>Aviso:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ─── Aviso de acesso sem cadastro ────────────────────────────────────── */}
      {!profileLoading && !curatorProfile && (
        <div style={{ margin: '0 16px 16px', padding: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid #ef4444', borderRadius: 10 }}>
          <strong style={{ color: '#fca5a5' }}>Acesso de Observação</strong>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>
            Você pode visualizar as propostas, mas não pode votar. Para ser cadastrado como curador, entre em contato com o administrador. Seu <code>user_id</code> será atribuído a uma graduação real na tabela <code>curator_profiles</code>.
          </p>
        </div>
      )}

      {/* ─── Lista de propostas ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="splash"><div className="spinner" /><p>Carregando placar persistido do conselho…</p></div>
      ) : proposals.length === 0 ? (
        <div className="curator-empty">
          <span>✅</span>
          <p>Nenhuma proposta pendente nesta fila de curadoria.</p>
        </div>
      ) : (
        <div className="proposals-list">
          {proposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              summary={voteSummaries[proposal.id] ?? { totalScore: 0, hasHighRankVote: false, userHasVoted: false, userVoteIsVeto: false, votes: [] }}
              curatorProfile={curatorProfile}
              voteLoading={actionLoading === proposal.id + '-vote'}
              vetoLoading={actionLoading === proposal.id + '-veto'}
              actionLoading={actionLoading === proposal.id}
              mergeTargetId={mergeTargetId[proposal.id] ?? ''}
              onMergeTargetChange={val => setMergeTargetId(prev => ({ ...prev, [proposal.id]: val }))}
              onVote={() => handleVote(proposal.id, false)}
              onVeto={() => handleVote(proposal.id, true)}
              onApprove={() => handleAction(proposal.id, { type: 'approve' })}
              onEdit={() => navigate(`/conceitos/proposta/${proposal.id}`)}
              onMerge={() => handleAction(proposal.id, { type: 'merge', target_id: mergeTargetId[proposal.id] ?? '' })}
              onReject={() => handleAction(proposal.id, { type: 'reject' })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Card de proposta ──────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ConceptProposal
  summary: ProposalVoteSummary
  curatorProfile: CuratorProfile | null
  voteLoading: boolean
  vetoLoading: boolean
  actionLoading: boolean
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
  proposal, summary, curatorProfile, voteLoading, vetoLoading, actionLoading,
  mergeTargetId, onMergeTargetChange, onVote, onVeto, onApprove, onEdit, onMerge, onReject,
}: ProposalCardProps) {
  const name = proposal.node_data.preferred_name
    ?? (proposal.node_data as Record<string, unknown>)['name'] as string
    ?? 'Sem nome'
  const sig = proposal.node_data.structural_signature
  const progressPct = Math.max(0, Math.min(100, Math.round((summary.totalScore / 10) * 100)))
  const canVote = !!curatorProfile && !summary.userHasVoted
  const isLoading = voteLoading || vetoLoading || actionLoading

  return (
    <div className={`proposal-card ${isLoading ? 'loading' : ''}`}>
      {/* Cabeçalho */}
      <div className="proposal-card-header">
        <div className="proposal-card-name">
          <span className="proposal-node-type">{proposal.node_data.node_type ?? '?'}</span>
          <strong>{name}</strong>
        </div>
        <div className="proposal-confidence">
          {proposal.confidence !== null && (
            <span className="confidence-score">{Math.round(proposal.confidence * 100)}%</span>
          )}
          {proposal.confidence_tier && (
            <span className={`confidence-tier tier-${proposal.confidence_tier}`}>{proposal.confidence_tier}</span>
          )}
        </div>
      </div>

      {/* Placar Persistido do Conselho Técnico */}
      <div style={{ margin: '10px 0', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
          <span>
            Placar do Conselho (persistido): {summary.totalScore} / 10 pts
            {summary.votes.length > 0 && <span style={{ color: '#64748b', fontWeight: 400 }}> · {summary.votes.length} votante{summary.votes.length !== 1 ? 's' : ''}</span>}
          </span>
          <span style={{ color: summary.hasHighRankVote ? '#34d399' : '#fbbf24' }}>
            {summary.hasHighRankVote ? '✓ Quórum Alta Graduação OK' : '⚠️ Quórum Alta Graduação Pendente'}
          </span>
        </div>
        <div style={{ height: 6, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: summary.totalScore < 0 ? '#ef4444' : (progressPct >= 100 && summary.hasHighRankVote ? '#10b981' : '#3b82f6'),
            transition: 'width 0.4s',
          }} />
        </div>
        {summary.userHasVoted && (
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
            {summary.userVoteIsVeto ? '⛔ Você vetou esta proposta.' : '✓ Você já votou nesta proposta.'}
          </div>
        )}
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
          disabled={!canVote || voteLoading}
          style={{ background: '#3b82f6', opacity: canVote ? 1 : 0.5 }}
          title={!curatorProfile ? 'Você não é curador cadastrado' : summary.userHasVoted ? 'Você já votou' : `Votar a favor (+${BELT_WEIGHTS[curatorProfile.belt_rank]} pts)`}
        >
          🥋 Votar {curatorProfile ? `(+${BELT_WEIGHTS[curatorProfile.belt_rank]} pts)` : ''}
        </button>

        <button
          className="btn-action"
          onClick={onVeto}
          disabled={!canVote || vetoLoading}
          style={{ background: 'rgba(239,68,68,0.8)', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 700, cursor: !canVote ? 'not-allowed' : 'pointer', opacity: canVote ? 1 : 0.5 }}
          title={!curatorProfile ? 'Você não é curador cadastrado' : summary.userHasVoted ? 'Você já votou' : `Veto ponderado (-${BELT_WEIGHTS[curatorProfile?.belt_rank ?? 'branca']} pts)`}
        >
          ⛔ Veto {curatorProfile ? `(-${BELT_WEIGHTS[curatorProfile.belt_rank]} pts)` : ''}
        </button>

        <button
          className="btn-action btn-approve"
          onClick={onApprove}
          disabled={actionLoading}
          title="Aprovação direta do curador"
        >
          ✅ Aprovar Direto
        </button>

        <button
          className="btn-action btn-edit"
          onClick={onEdit}
          disabled={actionLoading}
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
            disabled={actionLoading}
          />
          <button
            className="btn-action btn-merge"
            onClick={onMerge}
            disabled={actionLoading || !mergeTargetId}
            title="Fundir com conceito existente"
          >
            🔀 Fundir
          </button>
        </div>

        <button
          className="btn-action btn-reject"
          onClick={onReject}
          disabled={actionLoading}
          title="Rejeitar proposta"
        >
          ❌ Rejeitar
        </button>
      </div>

      {isLoading && <div className="proposal-loading-overlay" />}
    </div>
  )
}
