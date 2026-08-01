import { supabase, supabaseAnon } from '../lib/supabase'
import type {
  CanonicalConcept,
  ConceptProposal,
  ReviewAction,
  ReviewStatus,
  ConfidenceTier,
} from '../core/canonical/types'
import { toConfidenceTier } from '../core/canonical/types'

// ─── Mapeamento DB → domínio ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConcept(row: Record<string, any>): CanonicalConcept {
  return {
    id:                  row.id,
    canonical_id:        row.canonical_id ?? null,
    structural_signature: row.structural_signature ?? null,
    preferred_name:      row.preferred_name ?? null,
    aliases:             Array.isArray(row.aliases) ? row.aliases : [],
    hierarchy_level:     row.hierarchy_level ?? null,
    node_type:           row.node_type,
    gi_nogi:             row.gi_nogi ?? 'both',
    game_phase:          Array.isArray(row.game_phase) ? row.game_phase : [],
    media_refs:          Array.isArray(row.media_refs) ? row.media_refs : [],
    source_origin:       row.source_origin ?? 'human_curation',
    review_status:       row.review_status ?? 'approved',
    approved_by:         row.approved_by ?? null,
    approved_at:         row.approved_at ?? null,
    ai_confidence:       row.ai_confidence ?? null,
    risk_level:          row.risk_level ?? null,
    physical_demands:    row.physical_demands ?? null,
    prerequisites:       row.prerequisites ?? null,
    stats:               row.stats ?? {},
    game_asset_ref:      row.game_asset_ref ?? null,
    stamina_cost:        row.stamina_cost ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProposal(row: Record<string, any>): ConceptProposal {
  return {
    id:              row.id,
    proposed_by:     row.proposed_by,
    proposed_at:     row.proposed_at,
    node_data:       row.node_data ?? {},
    confidence:      row.confidence ?? null,
    confidence_tier: row.confidence_tier ?? null,
    match_candidate: row.match_candidate ?? null,
    review_status:   row.review_status,
    reviewed_by:     row.reviewed_by ?? null,
    reviewed_at:     row.reviewed_at ?? null,
    review_notes:    row.review_notes ?? null,
  }
}

// ─── CanonicalRepository ──────────────────────────────────────────────────────

export class CanonicalConceptRepository {

  // ── Leitura (cliente service_role — grafo is read-only public) ────────────────

  /** Busca conceito por UUID. */
  async get(id: string): Promise<CanonicalConcept> {
    const { data, error } = await supabase
      .from('source_nodes')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw new Error(`get: ${error.message}`)
    return rowToConcept(data)
  }

  /** Busca conceito por canonical_id (slug). */
  async getBySlug(slug: string): Promise<CanonicalConcept | null> {
    const { data, error } = await supabase
      .from('source_nodes')
      .select('*')
      .eq('canonical_id', slug)
      .maybeSingle()
    if (error) throw new Error(`getBySlug: ${error.message}`)
    return data ? rowToConcept(data) : null
  }

  /** Lista conceitos aprovados, com filtros opcionais. */
  async list(opts: {
    status?: ReviewStatus
    gi_nogi?: string
    node_type?: string
    limit?: number
    offset?: number
  } = {}): Promise<CanonicalConcept[]> {
    let q = supabase
      .from('source_nodes')
      .select('*')
      .order('name', { ascending: true })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 100) - 1)

    if (opts.status)    q = q.eq('review_status', opts.status)
    if (opts.gi_nogi)   q = q.eq('gi_nogi', opts.gi_nogi)
    if (opts.node_type) q = q.eq('node_type', opts.node_type)

    const { data, error } = await q
    if (error) throw new Error(`list: ${error.message}`)
    return (data ?? []).map(rowToConcept)
  }

  /** Busca full-text por nome (busca em name e preferred_name). */
  async search(query: string, limit = 20): Promise<CanonicalConcept[]> {
    const { data, error } = await supabase
      .from('source_nodes')
      .select('*')
      .or(`name.ilike.%${query}%,preferred_name.ilike.%${query}%`)
      .eq('review_status', 'approved')
      .limit(limit)
    if (error) throw new Error(`search: ${error.message}`)
    return (data ?? []).map(rowToConcept)
  }

  // ── Escrita (cliente anon com RLS — curadores autenticados) ───────────────────

  /** Atualiza campos editáveis de um conceito (apenas curadores). */
  async update(
    id: string,
    patch: Partial<Pick<CanonicalConcept,
      | 'canonical_id'
      | 'structural_signature'
      | 'preferred_name'
      | 'aliases'
      | 'hierarchy_level'
      | 'gi_nogi'
      | 'game_phase'
      | 'media_refs'
      | 'review_status'
      | 'approved_by'
      | 'approved_at'
      | 'risk_level'
      | 'physical_demands'
      | 'prerequisites'
    >>
  ): Promise<CanonicalConcept> {
    const { data, error } = await supabaseAnon
      .from('source_nodes')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(`update: ${error.message}`)
    return rowToConcept(data)
  }

  /** Cria um novo conceito canônico (apenas curadores). */
  async create(concept: Omit<CanonicalConcept, 'id'>): Promise<CanonicalConcept> {
    const { data, error } = await supabaseAnon
      .from('source_nodes')
      .insert(concept)
      .select('*')
      .single()
    if (error) throw new Error(`create: ${error.message}`)
    return rowToConcept(data)
  }

  /** Arquiva um conceito (soft delete). */
  async archive(id: string): Promise<void> {
    const { error } = await supabaseAnon
      .from('source_nodes')
      .update({ review_status: 'archived' })
      .eq('id', id)
    if (error) throw new Error(`archive: ${error.message}`)
  }
}

// ─── ProposalRepository ───────────────────────────────────────────────────────

export class ProposalRepository {

  /** Lista propostas pendentes, agrupadas por tier de confiança. */
  async listPending(tier?: ConfidenceTier): Promise<ConceptProposal[]> {
    let q = supabaseAnon
      .from('concept_proposals')
      .select('*')
      .eq('review_status', 'pending')
      .order('proposed_at', { ascending: true })

    if (tier) q = q.eq('confidence_tier', tier)

    const { data, error } = await q
    if (error) throw new Error(`listPending: ${error.message}`)
    return (data ?? []).map(rowToProposal)
  }

  /** Submete uma proposta da IA para revisão. */
  async propose(opts: {
    node_data: Partial<CanonicalConcept>
    confidence: number
    match_candidate?: string
  }): Promise<ConceptProposal> {
    const tier = toConfidenceTier(opts.confidence)
    const { data, error } = await supabaseAnon
      .from('concept_proposals')
      .insert({
        proposed_by:     'ai',
        node_data:       opts.node_data,
        confidence:      opts.confidence,
        confidence_tier: tier,
        match_candidate: opts.match_candidate ?? null,
        review_status:   'pending',
      })
      .select('*')
      .single()
    if (error) throw new Error(`propose: ${error.message}`)
    return rowToProposal(data)
  }

  /** Executa uma ação de revisão sobre uma proposta. */
  async review(
    proposalId: string,
    reviewerId: string,
    action: ReviewAction,
    conceptRepo: CanonicalConceptRepository,
  ): Promise<void> {
    const now = new Date().toISOString()

    if (action.type === 'approve') {
      const proposal = await this.getById(proposalId)
      await conceptRepo.create({
        ...(proposal.node_data as Omit<CanonicalConcept, 'id'>),
        review_status: 'approved',
        approved_by:   reviewerId,
        approved_at:   now,
        source_origin: proposal.node_data.source_origin ?? 'ai_proposed',
      })
      await this.markReviewed(proposalId, reviewerId, 'approved', 'Aprovado como está')

    } else if (action.type === 'approve_with_edit') {
      const proposal = await this.getById(proposalId)
      const merged: Omit<CanonicalConcept, 'id'> = {
        ...(proposal.node_data as Omit<CanonicalConcept, 'id'>),
        ...action.edits,
        review_status: 'approved',
        approved_by:   reviewerId,
        approved_at:   now,
      }
      await conceptRepo.create(merged)
      await this.markReviewed(proposalId, reviewerId, 'approved', 'Aprovado com edição')

    } else if (action.type === 'merge') {
      await conceptRepo.update(action.target_id, {
        review_status: 'approved',
        approved_by:   reviewerId,
        approved_at:   now,
      })
      await this.markReviewed(proposalId, reviewerId, 'merged', `Fundido com ${action.target_id}`)

    } else if (action.type === 'reject') {
      await this.markReviewed(proposalId, reviewerId, 'rejected', action.reason ?? '')
    }
  }

  private async getById(id: string): Promise<ConceptProposal> {
    const { data, error } = await supabaseAnon
      .from('concept_proposals')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw new Error(`getById: ${error.message}`)
    return rowToProposal(data)
  }

  private async markReviewed(
    id: string,
    reviewerId: string,
    status: ConceptProposal['review_status'],
    notes: string,
  ): Promise<void> {
    const { error } = await supabaseAnon
      .from('concept_proposals')
      .update({
        review_status: status,
        reviewed_by:   reviewerId,
        reviewed_at:   new Date().toISOString(),
        review_notes:  notes,
      })
      .eq('id', id)
    if (error) throw new Error(`markReviewed: ${error.message}`)
  }
}

// ─── CuratorProfileRepository ─────────────────────────────────────────────────
// Lê e grava a graduação real do curador a partir de curator_profiles no Supabase.
// A graduação é atribuída pelo admin via SQL — nunca vem de um seletor livre na tela.

export type BeltRank = 'preta' | 'marrom' | 'roxa' | 'azul' | 'branca'

export const BELT_WEIGHTS: Record<BeltRank, number> = {
  preta: 5, marrom: 4, roxa: 3, azul: 2, branca: 1,
}

export interface CuratorProfile {
  id: string
  user_id: string
  belt_rank: BeltRank
}

export class CuratorProfileRepository {
  /** Busca o perfil do curador autenticado. Retorna null se não for curador. */
  async getMyProfile(userId: string): Promise<CuratorProfile | null> {
    const { data, error } = await supabaseAnon
      .from('curator_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`getMyProfile: ${error.message}`)
    if (!data) return null
    return { id: data.id, user_id: data.user_id, belt_rank: data.belt_rank as BeltRank }
  }
}

// ─── CuratorVoteRepository ────────────────────────────────────────────────────
// Persiste votos na tabela curator_votes com constraint UNIQUE (proposal_id, curator_id).
// Garante que o mesmo curador não vota duas vezes na mesma proposta.

export interface CuratorVoteRecord {
  proposal_id: string
  curator_id: string
  belt_rank: BeltRank
  vote_weight: number
  is_veto: boolean
}

export interface ProposalVoteSummary {
  totalScore: number
  hasHighRankVote: boolean   // ao menos 1 voto de preta ou marrom
  userHasVoted: boolean      // o curador atual já votou
  userVoteIsVeto: boolean    // o curador atual vetou
  votes: CuratorVoteRecord[]
}

export class CuratorVoteRepository {
  /**
   * Carrega os votos persistidos de uma proposta e calcula o placar real.
   */
  async getSummary(proposalId: string, currentUserId: string): Promise<ProposalVoteSummary> {
    const { data, error } = await supabaseAnon
      .from('curator_votes')
      .select('*')
      .eq('proposal_id', proposalId)
    if (error) throw new Error(`getSummary: ${error.message}`)

    const votes = (data ?? []) as CuratorVoteRecord[]
    const totalScore = votes.reduce((acc, v) => acc + (v.is_veto ? -v.vote_weight : v.vote_weight), 0)
    const hasHighRankVote = votes.some(v => !v.is_veto && (v.belt_rank === 'preta' || v.belt_rank === 'marrom'))
    const myVote = votes.find(v => v.curator_id === currentUserId)

    return {
      totalScore,
      hasHighRankVote,
      userHasVoted: !!myVote,
      userVoteIsVeto: myVote?.is_veto ?? false,
      votes,
    }
  }

  /**
   * Registra um voto (ou veto) do curador no Supabase.
   *
   * NOTA DE SEGURANÇA: belt_rank e vote_weight NÃO são enviados ao banco.
   * O trigger `curator_votes_before_insert` (migration 005) sempre os deriva
   * de curator_profiles — independente do que o cliente envie.
   * O payload do cliente controla apenas: qual proposta, quem vota, é veto ou não.
   *
   * Se o curador já votou, a constraint UNIQUE (migration 004) retorna code 23505.
   * Se não for curador cadastrado, a RLS (migration 005) rejeita o insert.
   */
  async castVote(
    proposalId: string,
    curator: CuratorProfile,
    isVeto: boolean,
  ): Promise<CuratorVoteRecord> {
    const { data, error } = await supabaseAnon
      .from('curator_votes')
      .insert({
        proposal_id: proposalId,
        curator_id:  curator.user_id,
        is_veto:     isVeto,
        // belt_rank e vote_weight omitidos intencionalmente:
        // o trigger BEFORE INSERT os sobrescreve a partir de curator_profiles.
        // Enviar valores aqui não aumentaria a segurança e poderia criar confusão.
        belt_rank:   curator.belt_rank,  // enviado para compatibilidade; trigger sempre sobrescreve
        vote_weight: 0,                  // marcador explícito: DB decide o valor real
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new Error('Você já votou nesta proposta. Cada curador pode votar apenas uma vez.')
      }
      if (error.code === '42501' || error.message.includes('policy')) {
        throw new Error('Acesso negado: seu perfil de curador não está cadastrado ou não tem permissão para votar.')
      }
      throw new Error(`castVote: ${error.message}`)
    }
    return data as CuratorVoteRecord
  }
}

// Singletons
export const canonicalConceptRepository = new CanonicalConceptRepository()
export const proposalRepository = new ProposalRepository()
export const curatorProfileRepository = new CuratorProfileRepository()
export const curatorVoteRepository = new CuratorVoteRepository()
