-- ─── 004_curator_governance.sql ───────────────────────────────────────────────
-- Tabelas de Governança Real Multi-Curador e Perfis Autenticados com Constraint

-- ── 4.1 Perfis de Curadores (Vínculo com auth.users) ──────────────────────────
CREATE TABLE IF NOT EXISTS curator_profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  belt_rank   text        NOT NULL DEFAULT 'branca'
    CHECK (belt_rank IN ('preta', 'marrom', 'roxa', 'azul', 'branca')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE curator_profiles IS 'Perfil e graduação oficial do curador vinculado ao auth.users';
COMMENT ON COLUMN curator_profiles.belt_rank IS 'preta (5) | marrom (4) | roxa (3) | azul (2) | branca (1)';

CREATE INDEX IF NOT EXISTS idx_curator_profiles_user ON curator_profiles (user_id);

-- ── 4.2 Tabela de Votos Persistidos (Constraint 1 Voto Por Curador Por Proposta) ─
CREATE TABLE IF NOT EXISTS curator_votes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid        NOT NULL REFERENCES concept_proposals(id) ON DELETE CASCADE,
  curator_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  belt_rank    text        NOT NULL,
  vote_weight  int         NOT NULL,
  is_veto      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- CONSTRAINT CRÍTICA: Impedir múltiplos votos do mesmo curador na mesma proposta
  CONSTRAINT unique_curator_vote_per_proposal UNIQUE (proposal_id, curator_id)
);

COMMENT ON TABLE curator_votes IS 'Votos persistidos do conselho técnico com restrição de 1 voto por curador por proposta';

CREATE INDEX IF NOT EXISTS idx_curator_votes_proposal ON curator_votes (proposal_id);
CREATE INDEX IF NOT EXISTS idx_curator_votes_curator  ON curator_votes (curator_id);
