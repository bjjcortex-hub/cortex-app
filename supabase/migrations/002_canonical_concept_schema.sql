-- ─── 002_canonical_concept_schema.sql ─────────────────────────────────────────
-- Evolui source_nodes para suportar o schema canônico completo (Blocos 2-3 da spec).
-- Compatível com a estrutura existente — usa ADD COLUMN IF NOT EXISTS em toda parte.

-- ── 3.1 Identidade ───────────────────────────────────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS canonical_id         text UNIQUE,
  ADD COLUMN IF NOT EXISTS structural_signature jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_name       text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS aliases              jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN source_nodes.canonical_id         IS 'Slug interno legível único, ex: guarda-fechada';
COMMENT ON COLUMN source_nodes.structural_signature IS 'JSON: { from_posture, mechanism, to_posture }';
COMMENT ON COLUMN source_nodes.preferred_name       IS 'Nome de exibição preferido. NULL = usa o campo name existente';
COMMENT ON COLUMN source_nodes.aliases              IS 'Array de { name, lang, lineage, type, popularity }';

-- ── 3.2 Classificação ────────────────────────────────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS hierarchy_level text DEFAULT NULL
    CHECK (hierarchy_level IS NULL OR hierarchy_level IN ('family', 'technique', 'variant')),
  ADD COLUMN IF NOT EXISTS gi_nogi        text NOT NULL DEFAULT 'both'
    CHECK (gi_nogi IN ('gi', 'nogi', 'both')),
  ADD COLUMN IF NOT EXISTS game_phase     text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN source_nodes.hierarchy_level IS 'family | technique | variant';
COMMENT ON COLUMN source_nodes.gi_nogi         IS 'gi | nogi | both';
COMMENT ON COLUMN source_nodes.game_phase      IS 'Array: standing | guard | passing | control | finish | escape';

-- ── 3.5 Mídia e referência ───────────────────────────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS media_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN source_nodes.media_refs IS 'Array de { url, type: video|image|pose3d, source, title? }';

-- ── 3.6 Proveniência e confiança ─────────────────────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS source_origin  text    DEFAULT 'human_curation',
  ADD COLUMN IF NOT EXISTS review_status  text    NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('proposed', 'reviewed', 'approved', 'archived')),
  ADD COLUMN IF NOT EXISTS approved_by    uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence  float   DEFAULT NULL
    CHECK (ai_confidence IS NULL OR ai_confidence BETWEEN 0 AND 1);

COMMENT ON COLUMN source_nodes.source_origin  IS 'human_curation | ai_proposed | grapplemap | bjjdata | custom';
COMMENT ON COLUMN source_nodes.review_status  IS 'proposed | reviewed | approved | archived';
COMMENT ON COLUMN source_nodes.ai_confidence  IS '0-1. NULL se origem humana';

-- ── 3.3 Risco/exigência física (placeholder — Fase 2) ───────────────────────
-- Campos existem no schema mas ficam NULL até avaliação de autoridade técnica.
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS risk_level       text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS physical_demands text[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prerequisites    text[]  DEFAULT NULL;

COMMENT ON COLUMN source_nodes.risk_level       IS 'PLACEHOLDER Fase 2: baixo | médio | alto';
COMMENT ON COLUMN source_nodes.physical_demands IS 'PLACEHOLDER Fase 2: flexibilidade | força | explosão | técnica';
COMMENT ON COLUMN source_nodes.prerequisites    IS 'PLACEHOLDER Fase 2: canonical_ids de pré-requisitos';

-- ── 3.7 Estatística real (100% placeholder) ──────────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN source_nodes.stats IS 'PLACEHOLDER: { success_rate: null, usage_freq: null }. Sem dado real até Fase 3';

-- ── 3.8 Aplicação futura (fora de escopo Fase 1) ─────────────────────────────
ALTER TABLE source_nodes
  ADD COLUMN IF NOT EXISTS game_asset_ref text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stamina_cost   int  DEFAULT NULL;

COMMENT ON COLUMN source_nodes.game_asset_ref IS 'FUTURO: referência de asset visual para camada de jogo';
COMMENT ON COLUMN source_nodes.stamina_cost   IS 'FUTURO: custo de stamina para camada de jogo';

-- ── Índices úteis ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_source_nodes_canonical_id   ON source_nodes (canonical_id);
CREATE INDEX IF NOT EXISTS idx_source_nodes_review_status  ON source_nodes (review_status);
CREATE INDEX IF NOT EXISTS idx_source_nodes_hierarchy      ON source_nodes (hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_source_nodes_gi_nogi        ON source_nodes (gi_nogi);
CREATE INDEX IF NOT EXISTS idx_source_nodes_source_origin  ON source_nodes (source_origin);

-- ── Fila de propostas da IA (Bloco 4 — Governança) ───────────────────────────
CREATE TABLE IF NOT EXISTS concept_proposals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by     text        NOT NULL DEFAULT 'ai',
  proposed_at     timestamptz NOT NULL DEFAULT now(),
  node_data       jsonb       NOT NULL,
  confidence      float       DEFAULT NULL
    CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  confidence_tier text        DEFAULT NULL
    CHECK (confidence_tier IS NULL OR confidence_tier IN ('high', 'medium', 'low')),
  match_candidate uuid        REFERENCES source_nodes(id) ON DELETE SET NULL,
  review_status   text        NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'merged', 'rejected')),
  reviewed_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz DEFAULT NULL,
  review_notes    text        DEFAULT NULL
);

COMMENT ON TABLE concept_proposals IS 'Fila de governança: propostas da IA aguardando revisão humana (Bloco 4)';
COMMENT ON COLUMN concept_proposals.confidence_tier IS 'high (>0.85) | medium (0.5-0.85) | low (<0.5)';
COMMENT ON COLUMN concept_proposals.match_candidate IS 'Conceito mais próximo identificado pela IA para triagem';

CREATE INDEX IF NOT EXISTS idx_proposals_status ON concept_proposals (review_status);
CREATE INDEX IF NOT EXISTS idx_proposals_tier   ON concept_proposals (confidence_tier);
CREATE INDEX IF NOT EXISTS idx_proposals_match  ON concept_proposals (match_candidate);
