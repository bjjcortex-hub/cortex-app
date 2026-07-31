-- ─── 003_source_edges_canonical.sql ───────────────────────────────────────────
-- Adiciona suporte a pesos probabilísticos nas arestas do grafo.
-- Campos ficam NULL (placeholder) até haver dados reais de uso (Fase 3).

ALTER TABLE source_edges
  ADD COLUMN IF NOT EXISTS weight         float   DEFAULT NULL
    CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1)),
  ADD COLUMN IF NOT EXISTS weight_context text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weight_source  text    DEFAULT NULL;

COMMENT ON COLUMN source_edges.weight         IS 'PLACEHOLDER Fase 3: probabilidade 0-1. NULL até dado real de uso';
COMMENT ON COLUMN source_edges.weight_context IS 'Contexto do peso: gi | nogi | competition | academy';
COMMENT ON COLUMN source_edges.weight_source  IS 'Origem do peso quando preenchido: ex: crawl_bjjhero_2025';
