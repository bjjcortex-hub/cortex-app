import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { canonicalConceptRepository } from '../infra/CanonicalConceptRepository'
import { getCurrentOwnerId } from '../infra/auth'
import type {
  CanonicalConcept,
  ConceptAlias,
  HierarchyLevel,
  NodeType,
  GiNogi,
  GamePhase,
} from '../core/canonical/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const HIERARCHY_OPTIONS: { value: HierarchyLevel | ''; label: string }[] = [
  { value: '',          label: '— não definido —' },
  { value: 'family',    label: 'Família' },
  { value: 'technique', label: 'Técnica' },
  { value: 'variant',   label: 'Variante' },
]

const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'position',   label: 'Posição' },
  { value: 'transition', label: 'Transição' },
  { value: 'submission', label: 'Finalização' },
  { value: 'principle',  label: 'Princípio' },
  { value: 'system',     label: 'Sistema' },
]

const GI_NOGI_OPTIONS: { value: GiNogi; label: string }[] = [
  { value: 'both',  label: 'Gi e No-gi' },
  { value: 'gi',    label: 'Somente Gi' },
  { value: 'nogi',  label: 'Somente No-gi' },
]

const GAME_PHASE_OPTIONS: { value: GamePhase; label: string }[] = [
  { value: 'standing', label: 'Em pé' },
  { value: 'guard',    label: 'Guarda' },
  { value: 'passing',  label: 'Passagem' },
  { value: 'control',  label: 'Controle posicional' },
  { value: 'finish',   label: 'Finalização' },
  { value: 'escape',   label: 'Escape' },
]

type EditorTab = 'identity' | 'classification' | 'relations' | 'media' | 'provenance'

const EDITOR_TABS: { id: EditorTab; label: string }[] = [
  { id: 'identity',       label: 'Identidade' },
  { id: 'classification', label: 'Classificação' },
  { id: 'relations',      label: 'Relações' },
  { id: 'media',          label: 'Mídia' },
  { id: 'provenance',     label: 'Proveniência' },
]

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ConceptEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [concept, setConcept] = useState<CanonicalConcept | null>(null)
  const [draft, setDraft]     = useState<Partial<CanonicalConcept>>({})
  const [activeTab, setActiveTab] = useState<EditorTab>('identity')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError]         = useState<string | null>(null)

  // Carrega conceito
  useEffect(() => {
    if (!id) return
    setLoading(true)
    canonicalConceptRepository.get(id)
      .then(c => { setConcept(c); setDraft(c) })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  // Helper para atualizar draft
  const patch = useCallback(<K extends keyof CanonicalConcept>(key: K, value: CanonicalConcept[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }, [])

  // Salva
  async function handleSave() {
    if (!id || !draft) return
    setSaving(true)
    try {
      const updated = await canonicalConceptRepository.update(id, draft)
      setConcept(updated)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (e) {
      setError(String(e))
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Aprova diretamente
  async function handleApprove() {
    if (!id) return
    setSaving(true)
    try {
      const reviewerId = getCurrentOwnerId()
      await canonicalConceptRepository.update(id, {
        review_status: 'approved',
        approved_by:   reviewerId,
        approved_at:   new Date().toISOString(),
      })
      navigate('/curador')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="splash"><div className="spinner" /><p>Carregando…</p></div>
  if (error)   return <div className="splash error"><p>{error}</p><Link to="/curador">← Curadoria</Link></div>
  if (!concept || !draft) return null

  const displayName = draft.preferred_name ?? concept.preferred_name ?? (concept as unknown as Record<string, unknown>)['name'] as string ?? concept.id

  return (
    <div className="concept-editor">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <Link to="/curador" className="logo">← Curadoria</Link>
        <span className="topbar-title" title={displayName}>{displayName}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`save-indicator status-${saveStatus}`}>
            {saving ? 'Salvando…' : saveStatus === 'saved' ? 'Salvo ✓' : saveStatus === 'error' ? 'Erro ✗' : ''}
          </span>
          <button className="btn-reset" onClick={handleSave} disabled={saving}>
            Salvar
          </button>
          {draft.review_status !== 'approved' && (
            <button className="btn-reset btn-approve-inline" onClick={handleApprove} disabled={saving}>
              ✅ Aprovar
            </button>
          )}
        </div>
      </header>

      {/* ─── Abas ───────────────────────────────────────────────────────────── */}
      <div className="editor-tabs">
        {EDITOR_TABS.map(tab => (
          <button
            key={tab.id}
            className={`editor-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Conteúdo das abas ──────────────────────────────────────────────── */}
      <div className="editor-body">

        {/* ── Identidade ────────────────────────────────────────────────────── */}
        {activeTab === 'identity' && (
          <section className="editor-section">
            <h2>Identidade</h2>

            <label className="field-label">
              Nome preferido (exibição)
              <input
                className="field-input"
                value={draft.preferred_name ?? ''}
                onChange={e => patch('preferred_name', e.target.value || null)}
                placeholder="Ex: Guarda Fechada"
              />
            </label>

            <label className="field-label">
              Canonical ID (slug único)
              <input
                className="field-input monospace"
                value={draft.canonical_id ?? ''}
                onChange={e => patch('canonical_id', e.target.value || null)}
                placeholder="Ex: guarda-fechada"
              />
            </label>

            <fieldset className="field-group">
              <legend className="field-label">Assinatura estrutural</legend>
              <div className="sig-row">
                <label>
                  Postura inicial
                  <input
                    className="field-input"
                    value={draft.structural_signature?.from_posture ?? ''}
                    onChange={e => patch('structural_signature', {
                      ...draft.structural_signature,
                      from_posture: e.target.value,
                      mechanism:    draft.structural_signature?.mechanism ?? '',
                      to_posture:   draft.structural_signature?.to_posture ?? '',
                    })}
                    placeholder="Ex: Posição em pé"
                  />
                </label>
                <span className="sig-sep">→</span>
                <label>
                  Mecanismo-chave
                  <input
                    className="field-input"
                    value={draft.structural_signature?.mechanism ?? ''}
                    onChange={e => patch('structural_signature', {
                      ...draft.structural_signature,
                      from_posture: draft.structural_signature?.from_posture ?? '',
                      mechanism:    e.target.value,
                      to_posture:   draft.structural_signature?.to_posture ?? '',
                    })}
                    placeholder="Ex: Clinch + projeção de quadril"
                  />
                </label>
                <span className="sig-sep">→</span>
                <label>
                  Postura final
                  <input
                    className="field-input"
                    value={draft.structural_signature?.to_posture ?? ''}
                    onChange={e => patch('structural_signature', {
                      ...draft.structural_signature,
                      from_posture: draft.structural_signature?.from_posture ?? '',
                      mechanism:    draft.structural_signature?.mechanism ?? '',
                      to_posture:   e.target.value,
                    })}
                    placeholder="Ex: Guarda fechada"
                  />
                </label>
              </div>
            </fieldset>

            {/* Aliases */}
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">Aliases</span>
                <button
                  className="btn-add-small"
                  onClick={() => patch('aliases', [
                    ...(draft.aliases ?? []),
                    { name: '', lang: 'pt-BR', lineage: 'traditional', type: 'technical', popularity: 0.5 },
                  ])}
                >
                  + Adicionar
                </button>
              </div>
              {(draft.aliases ?? []).map((alias, i) => (
                <AliasRow
                  key={i}
                  alias={alias}
                  onUpdate={updated => {
                    const next = [...(draft.aliases ?? [])]
                    next[i] = updated
                    patch('aliases', next)
                  }}
                  onRemove={() => {
                    const next = (draft.aliases ?? []).filter((_, j) => j !== i)
                    patch('aliases', next)
                  }}
                />
              ))}
              {(draft.aliases ?? []).length === 0 && (
                <p className="field-hint">Nenhum alias. Use + Adicionar para criar.</p>
              )}
            </div>
          </section>
        )}

        {/* ── Classificação ─────────────────────────────────────────────────── */}
        {activeTab === 'classification' && (
          <section className="editor-section">
            <h2>Classificação</h2>

            <label className="field-label">
              Nível hierárquico
              <p className="field-hint">Obrigatório. Três níveis fixos — sem intermediários (ver spec Bloco 2).</p>
              <select
                className="field-select"
                value={draft.hierarchy_level ?? ''}
                onChange={e => patch('hierarchy_level', (e.target.value || null) as HierarchyLevel | null)}
              >
                {HIERARCHY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Tipo de nó
              <select
                className="field-select"
                value={draft.node_type ?? 'position'}
                onChange={e => patch('node_type', e.target.value as NodeType)}
              >
                {NODE_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="field-label">
              Gi / No-gi
              <p className="field-hint">Obrigatório desde o dia 1.</p>
              <select
                className="field-select"
                value={draft.gi_nogi ?? 'both'}
                onChange={e => patch('gi_nogi', e.target.value as GiNogi)}
              >
                {GI_NOGI_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <div className="field-label">
              Fases do jogo
              <p className="field-hint">Pode ser múltiplas.</p>
              <div className="checkbox-group">
                {GAME_PHASE_OPTIONS.map(o => (
                  <label key={o.value} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(draft.game_phase ?? []).includes(o.value)}
                      onChange={e => {
                        const current = draft.game_phase ?? []
                        patch('game_phase',
                          e.target.checked
                            ? [...current, o.value] as GamePhase[]
                            : current.filter(p => p !== o.value) as GamePhase[]
                        )
                      }}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Relações ──────────────────────────────────────────────────────── */}
        {activeTab === 'relations' && (
          <section className="editor-section">
            <h2>Relações no grafo</h2>
            <div className="placeholder-notice">
              <span>⚡</span>
              <div>
                <strong>Campo placeholder — Fase 3</strong>
                <p>
                  As arestas do grafo (origem/destino e pesos de probabilidade)
                  estão na tabela <code>source_edges</code>.
                  O peso fica NULL até haver dados reais de uso.
                  Esta aba será expandida na Fase 3 (Motor de grafo probabilístico).
                </p>
              </div>
            </div>

            {concept.prerequisites && concept.prerequisites.length > 0 && (
              <div className="field-group">
                <span className="field-label">Pré-requisitos (canonical_ids)</span>
                <ul className="prereq-list">
                  {concept.prerequisites.map(p => (
                    <li key={p}>
                      <Link to={`/conceitos/${p}`}>{p}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ── Mídia ─────────────────────────────────────────────────────────── */}
        {activeTab === 'media' && (
          <section className="editor-section">
            <h2>Mídia e referências</h2>
            <div className="field-label-row">
              <span className="field-label">Links de referência</span>
              <button
                className="btn-add-small"
                onClick={() => patch('media_refs', [
                  ...(draft.media_refs ?? []),
                  { url: '', type: 'video', source: '' },
                ])}
              >
                + Adicionar
              </button>
            </div>
            {(draft.media_refs ?? []).length === 0 && (
              <p className="field-hint">Nenhuma referência de mídia ainda.</p>
            )}
            {(draft.media_refs ?? []).map((ref, i) => (
              <div key={i} className="media-ref-row">
                <input
                  className="field-input"
                  placeholder="URL (vídeo, imagem, pose 3D…)"
                  value={ref.url}
                  onChange={e => {
                    const next = [...(draft.media_refs ?? [])]
                    next[i] = { ...ref, url: e.target.value }
                    patch('media_refs', next)
                  }}
                />
                <select
                  className="field-select-small"
                  value={ref.type}
                  onChange={e => {
                    const next = [...(draft.media_refs ?? [])]
                    next[i] = { ...ref, type: e.target.value as 'video' | 'image' | 'pose3d' }
                    patch('media_refs', next)
                  }}
                >
                  <option value="video">Vídeo</option>
                  <option value="image">Imagem</option>
                  <option value="pose3d">Pose 3D</option>
                </select>
                <button
                  className="btn-remove-small"
                  onClick={() => patch('media_refs', (draft.media_refs ?? []).filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── Proveniência ──────────────────────────────────────────────────── */}
        {activeTab === 'provenance' && (
          <section className="editor-section">
            <h2>Proveniência e confiança</h2>

            <div className="field-group">
              <span className="field-label">Origem</span>
              <input
                className="field-input"
                value={draft.source_origin ?? ''}
                onChange={e => patch('source_origin', e.target.value)}
                placeholder="human_curation | ai_proposed | grapplemap | bjjdata | …"
              />
            </div>

            <div className="field-group">
              <span className="field-label">Status de revisão</span>
              <select
                className="field-select"
                value={draft.review_status ?? 'proposed'}
                onChange={e => patch('review_status', e.target.value as CanonicalConcept['review_status'])}
              >
                <option value="proposed">Proposto</option>
                <option value="reviewed">Revisado</option>
                <option value="approved">Aprovado</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>

            <div className="field-group provenance-meta">
              <div>
                <span className="field-label">Aprovado por</span>
                <code>{draft.approved_by ?? '—'}</code>
              </div>
              <div>
                <span className="field-label">Aprovado em</span>
                <code>{draft.approved_at ? new Date(draft.approved_at).toLocaleString('pt-BR') : '—'}</code>
              </div>
              <div>
                <span className="field-label">Confiança da IA</span>
                <code>{draft.ai_confidence !== null ? `${Math.round((draft.ai_confidence ?? 0) * 100)}%` : '— (origem humana)'}</code>
              </div>
            </div>

            <div className="placeholder-notice">
              <span>ℹ️</span>
              <div>
                <strong>Campos placeholder (Fase 2)</strong>
                <p>
                  Nível de risco, exigência física e pré-requisitos dependem
                  de avaliação de autoridade técnica humana. Serão editáveis
                  na interface de curadoria especializada da Fase 2.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── AliasRow ─────────────────────────────────────────────────────────────────

interface AliasRowProps {
  alias: ConceptAlias
  onUpdate: (updated: ConceptAlias) => void
  onRemove: () => void
}

function AliasRow({ alias, onUpdate, onRemove }: AliasRowProps) {
  return (
    <div className="alias-row">
      <input
        className="field-input alias-name"
        placeholder="Nome"
        value={alias.name}
        onChange={e => onUpdate({ ...alias, name: e.target.value })}
      />
      <input
        className="field-input alias-lang"
        placeholder="Idioma (pt-BR, en…)"
        value={alias.lang}
        onChange={e => onUpdate({ ...alias, lang: e.target.value })}
      />
      <input
        className="field-input alias-lineage"
        placeholder="Linhagem / fonte"
        value={alias.lineage}
        onChange={e => onUpdate({ ...alias, lineage: e.target.value })}
      />
      <select
        className="field-select-small"
        value={alias.type}
        onChange={e => onUpdate({ ...alias, type: e.target.value as ConceptAlias['type'] })}
      >
        <option value="technical">Técnico</option>
        <option value="commercial">Comercial</option>
        <option value="translation">Tradução</option>
      </select>
      <input
        className="field-input alias-pop"
        type="number"
        min={0}
        max={1}
        step={0.1}
        title="Popularidade (0–1)"
        value={alias.popularity}
        onChange={e => onUpdate({ ...alias, popularity: parseFloat(e.target.value) || 0 })}
      />
      <button className="btn-remove-small" onClick={onRemove} title="Remover alias">✕</button>
    </div>
  )
}
