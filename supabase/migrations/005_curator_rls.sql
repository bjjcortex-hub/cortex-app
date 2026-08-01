-- ─── 005_curator_rls.sql ──────────────────────────────────────────────────────
-- RLS e Trigger de Integridade para curator_profiles e curator_votes.
-- Garante que as regras de governança valem na camada do banco — não só na UI.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. curator_profiles — Somente service_role pode gravar
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE curator_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário autenticado pode ler perfis (necessário para calcular placar)
CREATE POLICY "curator_profiles: leitura para autenticados"
  ON curator_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT / UPDATE / DELETE: nenhuma policy para authenticated ou anon.
-- Resultado: somente service_role consegue criar ou alterar perfis.
-- Isso é intencional e é a barreira que impede autopromoção por qualquer caminho.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. curator_votes — Leitura livre, escrita validada
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE curator_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer autenticado pode ver todos os votos (placar público do conselho)
CREATE POLICY "curator_votes: leitura para autenticados"
  ON curator_votes
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: apenas se:
--   1. curator_id corresponde ao próprio auth.uid() (ninguém vota em nome de outro)
--   2. existe linha correspondente em curator_profiles (só curadores cadastrados votam)
CREATE POLICY "curator_votes: insert somente curador cadastrado"
  ON curator_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    curator_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM curator_profiles
      WHERE curator_profiles.user_id = auth.uid()
    )
  );

-- Sem UPDATE nem DELETE para authenticated/anon:
-- Votos são imutáveis por design. Ações administrativas usam service_role.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Trigger BEFORE INSERT em curator_votes
--    Garante que belt_rank e vote_weight sempre refletem curator_profiles,
--    ignorando completamente o que o cliente enviou no payload.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION curator_votes_set_rank_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_belt_rank  text;
  v_weight     int;
BEGIN
  -- Busca a graduação real do curador a partir do perfil autenticado
  SELECT belt_rank INTO v_belt_rank
  FROM curator_profiles
  WHERE user_id = NEW.curator_id;

  -- Rejeita o insert se não existir perfil (redundante com a RLS, mas defesa em profundidade)
  IF v_belt_rank IS NULL THEN
    RAISE EXCEPTION 'curator_votes: usuário % não possui curator_profile', NEW.curator_id;
  END IF;

  -- Calcula o peso real a partir da graduação (nunca a partir do payload do cliente)
  v_weight := CASE v_belt_rank
    WHEN 'preta'  THEN 5
    WHEN 'marrom' THEN 4
    WHEN 'roxa'   THEN 3
    WHEN 'azul'   THEN 2
    WHEN 'branca' THEN 1
    ELSE 1
  END;

  -- Sobrescreve os campos vindos do cliente com os valores reais do banco
  NEW.belt_rank   := v_belt_rank;
  NEW.vote_weight := v_weight;

  RETURN NEW;
END;
$$;

CREATE TRIGGER curator_votes_before_insert
  BEFORE INSERT ON curator_votes
  FOR EACH ROW
  EXECUTE FUNCTION curator_votes_set_rank_from_profile();

COMMENT ON FUNCTION curator_votes_set_rank_from_profile() IS
  'Trigger BEFORE INSERT: garante que belt_rank e vote_weight são sempre derivados de curator_profiles, nunca do payload do cliente.';
