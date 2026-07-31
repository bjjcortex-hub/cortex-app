// ─── Tipos do Conceito Canônico ───────────────────────────────────────────────
// Implementa o Bloco 2 e Bloco 3 completo da especificação estratégica do BJJ Cortex.
// Estes tipos descrevem os nós do grafo de conhecimento — não os documentos do usuário.

// ── 3.2 Classificação ─────────────────────────────────────────────────────────

/** Nível hierárquico fixo. Três níveis, sem intermediários (ver spec Bloco 2). */
export type HierarchyLevel = 'family' | 'technique' | 'variant'

/** Tipo de nó no grafo BJJ. */
export type NodeType = 'position' | 'transition' | 'submission' | 'principle' | 'system'

/** Cobertura de regras. 'both' desde o dia 1 como padrão. */
export type GiNogi = 'gi' | 'nogi' | 'both'

/** Fase do jogo onde o conceito ocorre. Um nó pode pertencer a mais de uma. */
export type GamePhase = 'standing' | 'guard' | 'passing' | 'control' | 'finish' | 'escape'

// ── 3.6 Proveniência e confiança ─────────────────────────────────────────────

/** Status de revisão no fluxo de governança (Bloco 4). */
export type ReviewStatus = 'proposed' | 'reviewed' | 'approved' | 'archived'

/**
 * Faixa de confiança da IA, derivada do score numérico:
 * - high   > 0.85  → fila de revisão rápida
 * - medium 0.5–0.85 → fila de revisão completa
 * - low    < 0.5   → candidato genuinamente novo, prioridade de revisão
 */
export type ConfidenceTier = 'high' | 'medium' | 'low'

// ── 3.1 Identidade ────────────────────────────────────────────────────────────

/**
 * Alias de um conceito canônico.
 * A identidade do conceito é a assinatura estrutural, não o nome.
 * O nome é um rótulo entre vários possíveis.
 */
export interface ConceptAlias {
  /** Nome alternativo. */
  name: string
  /** Código de idioma BCP-47, ex: 'pt-BR', 'en', 'ja'. */
  lang: string
  /**
   * Origem do alias: instructor name, 'traditional', 'grapplemap', etc.
   * Permite rastrear de onde vem o nome na linhagem do BJJ.
   */
  lineage: string
  /** Tipo do alias para exibição contextual. */
  type: 'technical' | 'commercial' | 'translation'
  /** 0–1. Quanto maior, mais aparece no topo dos resultados de busca. */
  popularity: number
}

/**
 * Assinatura estrutural de um conceito.
 * Dois conceitos com a mesma assinatura são o mesmo conceito (ver Bloco 2).
 * Se a postura final ou o mecanismo mudam → conceito diferente.
 */
export interface StructuralSignature {
  /** Posição ou estado de partida. */
  from_posture: string
  /** Mecanismo-chave que gera o movimento ou controle. */
  mechanism: string
  /** Posição ou estado resultante. */
  to_posture: string
}

// ── 3.5 Mídia ─────────────────────────────────────────────────────────────────

export interface MediaRef {
  url: string
  type: 'video' | 'image' | 'pose3d'
  source?: string
  title?: string
}

// ── Conceito Canônico completo ────────────────────────────────────────────────

/**
 * Nó do grafo de conhecimento BJJ — representa um conceito canônico.
 * Mapeado 1:1 para a tabela source_nodes após a migration 002.
 */
export interface CanonicalConcept {
  // ── 3.1 Identidade ──────────────────────────────────────────────────────────
  /** UUID primário da tabela source_nodes. */
  id: string
  /** Slug legível único, ex: 'guarda-fechada'. NULL se não atribuído. */
  canonical_id: string | null
  /**
   * Assinatura estrutural (postura inicial → mecanismo → postura final).
   * É a identidade real do conceito — o nome é rótulo.
   */
  structural_signature: StructuralSignature | null
  /**
   * Nome de exibição preferido.
   * NULL = usa o campo `name` existente (retrocompat com dados anteriores).
   */
  preferred_name: string | null
  /** Todos os nomes alternativos, com metadados de idioma e linhagem. */
  aliases: ConceptAlias[]

  // ── 3.2 Classificação ───────────────────────────────────────────────────────
  /**
   * Nível hierárquico obrigatório para qualquer conceito novo (ver Bloco 2).
   * Três níveis fixos — sem intermediários.
   */
  hierarchy_level: HierarchyLevel | null
  /** Tipo de nó. Determina como o conceito aparece no grafo. */
  node_type: NodeType
  /**
   * Cobertura gi/no-gi. Obrigatório desde o dia 1.
   * Default 'both'.
   */
  gi_nogi: GiNogi
  /** Fases do jogo onde o conceito ocorre. Pode ser múltiplas. */
  game_phase: GamePhase[]

  // ── 3.5 Mídia ───────────────────────────────────────────────────────────────
  /** Links de referência (vídeo, imagem, pose 3D). */
  media_refs: MediaRef[]

  // ── 3.6 Proveniência e confiança ────────────────────────────────────────────
  /**
   * Origem do conceito: 'human_curation' | 'ai_proposed' | 'grapplemap' | 'bjjdata' | custom.
   */
  source_origin: string
  /** Status no fluxo de governança (Bloco 4). */
  review_status: ReviewStatus
  /** UUID do usuário que aprovou. NULL se ainda não aprovado. */
  approved_by: string | null
  /** ISO-8601. NULL se ainda não aprovado. */
  approved_at: string | null
  /**
   * Score de confiança da IA, 0–1.
   * NULL quando a origem é humana.
   * Não é binário — reflete incerteza real da IA.
   */
  ai_confidence: number | null

  // ── 3.3 Risco e exigência física (Placeholder Fase 2) ───────────────────────
  /** NULL até avaliação de autoridade técnica humana. */
  risk_level: string | null
  /** NULL até avaliação de autoridade técnica humana. */
  physical_demands: string[] | null
  /** canonical_ids de conceitos pré-requisitos. NULL até Fase 2. */
  prerequisites: string[] | null

  // ── 3.7 Estatística real (100% Placeholder) ─────────────────────────────────
  /**
   * Sem fonte de dado real ainda. Nunca preencher por suposição.
   * Ex: { success_rate: null, usage_freq: null }
   */
  stats: Record<string, null | number>

  // ── 3.8 Aplicação futura (fora de escopo Fase 1) ────────────────────────────
  /** NULL — reservado para camada de jogo (Fase 5). */
  game_asset_ref: string | null
  /** NULL — reservado para camada de jogo (Fase 5). */
  stamina_cost: number | null
}

// ── Fila de governança ────────────────────────────────────────────────────────

/**
 * Proposta de conceito gerada pela IA, aguardando revisão humana.
 * Implementa o fluxo de triagem do Bloco 4.
 * A IA nunca cria um conceito canônico diretamente — sempre propõe.
 */
export interface ConceptProposal {
  id: string
  /** 'ai' ou UUID do usuário que criou manualmente. */
  proposed_by: string
  proposed_at: string
  /** Snapshot completo do nó proposto (schema CanonicalConcept). */
  node_data: Partial<CanonicalConcept>
  /** Score numérico de confiança da IA, 0–1. */
  confidence: number | null
  /** Faixa derivada do score. Determina a fila de triagem. */
  confidence_tier: ConfidenceTier | null
  /**
   * ID do source_node mais próximo identificado pela IA.
   * NULL se não há correspondência conhecida (candidato a conceito genuíno).
   */
  match_candidate: string | null
  review_status: 'pending' | 'approved' | 'merged' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
}

// ── Ação de revisão (para a Curator UI) ──────────────────────────────────────

export type ReviewAction =
  | { type: 'approve' }
  | { type: 'approve_with_edit'; edits: Partial<CanonicalConcept> }
  | { type: 'merge'; target_id: string }
  | { type: 'reject'; reason?: string }

// ── Helper: derivar ConfidenceTier de um score numérico ──────────────────────

export function toConfidenceTier(score: number): ConfidenceTier {
  if (score > 0.85) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}
