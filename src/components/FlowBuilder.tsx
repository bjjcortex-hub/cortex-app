import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MultiDirectedGraph } from 'graphology'
import type { NodeAttrs, EdgeAttrs } from '../types'
import type { DocumentData } from '../core/document/types'
import type { ManualEdge } from '../lib/persistence'
import { useLang, t, type Lang } from '../lib/i18n'
import { NodeIcon, iconColor } from './NodeIcon'
import { serializeFluxograma, deserializeFluxograma } from '../modes/fluxograma/serializer'
import { resolveToParent, buildParentByChildId } from '../lib/graphUtils'
import { loadFlows, saveFlowToDB, deleteFlowFromDB, type FlowGiNogi, type FlowContext, type FlowOutcome } from '../lib/flowStorage'


function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ── types ─────────────────────────────────────────────────────────────────────

type Actor = 'A' | 'B'

interface FightPos {
  nodeId: string
  name: string
  name_en: string | null
  nodeType: string
  parentExtId: string | null
}

interface Attempt {
  id: string
  actor: Actor
  transNodeId: string | null
  transName: string
  result: 'success' | 'failure'
  note?: string
}

interface FightStep {
  id: string
  posA: FightPos
  posB: FightPos | null
  attempts: Attempt[]
}

interface SavedFlow {
  id: string
  name: string
  nameA: string
  nameB: string
  steps: FightStep[]
  savedAt: string
  date?: string
  description?: string
  videoLink?: string
  gi_nogi:  FlowGiNogi
  context:  FlowContext
  outcome:  FlowOutcome
}

type PanelPhase =
  | { type: 'idle' }
  | { type: 'insert-step'; idx: number }
  | { type: 'pick-trans'; actor: Actor }
  | { type: 'pick-result'; actor: Actor; trans: FightPos }
  | { type: 'pick-dest'; actor: Actor; trans: FightPos; dests: FightPos[] }
  | { type: 'after-failure'; actor: Actor }
  | { type: 'custom-success'; actor: Actor; trans: FightPos | null }

// ── graph helpers ─────────────────────────────────────────────────────────────

function nodePos(graph: MultiDirectedGraph, id: string): FightPos {
  const a = graph.getNodeAttributes(id) as NodeAttrs
  return { nodeId: id, name: a.name, name_en: a.name_en ?? null, nodeType: a.node_type, parentExtId: a.parent_external_id }
}

function posDisplayName(pos: FightPos, lang: Lang): string {
  return lang === 'en' ? (pos.name_en ?? pos.name) : pos.name
}

function findMirror(graph: MultiDirectedGraph, nodeId: string): FightPos | null {
  if (!graph.hasNode(nodeId)) return null
  const ext = (graph.getNodeAttributes(nodeId) as NodeAttrs).external_id
  if (!ext) return null
  const mirrorExt = ext.endsWith('/bottom')
    ? ext.slice(0, -7) + '/top'
    : ext.endsWith('/top')
    ? ext.slice(0, -4) + '/bottom'
    : null
  if (!mirrorExt) return null
  let found: FightPos | null = null
  graph.forEachNode((id, a) => {
    if ((a as NodeAttrs).external_id === mirrorExt) found = nodePos(graph, id)
  })
  return found
}

/** Para posições standalone (sem espelho), retorna a própria posição — ambos os lutadores compartilham o mesmo nó. */
function mirrorOrSelf(graph: MultiDirectedGraph, pos: FightPos): FightPos {
  return findMirror(graph, pos.nodeId) ?? pos
}

function splitPosName(name: string, lang: Lang = 'pt'): { base: string; side: string | null } {
  if (lang === 'en') {
    if (name.endsWith(' Top'))    return { base: name.slice(0, -4),  side: 'Top'    }
    if (name.endsWith(' Bottom')) return { base: name.slice(0, -7),  side: 'Bottom' }
    return { base: name, side: null }
  }
  if (name.endsWith(' por Baixo')) return { base: name.slice(0, -10), side: 'por Baixo' }
  if (name.endsWith(' por Cima'))  return { base: name.slice(0, -9),  side: 'por Cima'  }
  return { base: name, side: null }
}

function getTransitions(graph: MultiDirectedGraph, posNodeId: string): FightPos[] {
  if (!graph.hasNode(posNodeId)) return []
  const out: FightPos[] = []
  const seen = new Set<string>()
  graph.forEachOutEdge(posNodeId, (_e, _ea, _s, tgt) => {
    if (!seen.has(tgt)) { seen.add(tgt); out.push(nodePos(graph, tgt)) }
  })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function getSuccessDests(graph: MultiDirectedGraph, transNodeId: string): FightPos[] {
  const out: FightPos[] = []
  const seen = new Set<string>()
  graph.forEachOutEdge(transNodeId, (_e, ea, _s, tgt) => {
    if ((ea as EdgeAttrs).result_type === 'success' && !seen.has(tgt)) {
      seen.add(tgt); out.push(nodePos(graph, tgt))
    }
  })
  return out
}

// ── start position helpers ────────────────────────────────────────────────────

function findByExtId(graph: MultiDirectedGraph, extId: string): FightPos | null {
  let found: FightPos | null = null
  graph.forEachNode((id, a) => {
    if ((a as NodeAttrs).external_id === extId) found = nodePos(graph, id)
  })
  return found
}

// ── node search ───────────────────────────────────────────────────────────────

function NodeSearch({ graph, placeholder, onSelect, autoFocus }: {
  graph: MultiDirectedGraph
  placeholder: string
  onSelect: (pos: FightPos) => void
  autoFocus?: boolean
}) {
  const lang = useLang()
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  // external_ids que têm filhos (para resolver parent → /top ao selecionar)
  const parentExtIds = useMemo(() => {
    const s = new Set<string>()
    graph.forEachNode((_, a) => {
      const parentExtId = (a as NodeAttrs).parent_external_id
      if (parentExtId) s.add(parentExtId)
    })
    return s
  }, [graph])

  const results = useMemo(() => {
    if (q.length < 2) return []
    const lq = q.toLowerCase()
    const out: FightPos[] = []
    graph.forEachNode((id, a) => {
      const na = a as NodeAttrs
      if (na.node_type === 'transition') return
      const ext = na.external_id ?? ''
      if (na.node_type === 'position') {
        // Mostrar group parents e standalone; ocultar filhos (/top e /bottom)
        if (ext.endsWith('/top') || ext.endsWith('/bottom')) return
      }
      if (na.node_type === 'submission') {
        // Ocultar submission group parents — só filhos específicos e standalones são selecionáveis
        if (!na.parent_external_id && parentExtIds.has(ext)) return
      }
      const displayName = lang === 'en' ? (na.name_en ?? na.name) : na.name
      if (displayName.toLowerCase().includes(lq)) out.push(nodePos(graph, id))
    })
    return out.sort((a, b) => posDisplayName(a, lang).localeCompare(posDisplayName(b, lang))).slice(0, 20)
  }, [graph, q, parentExtIds])

  function handleSelect(pos: FightPos) {
    const ext = graph.hasNode(pos.nodeId)
      ? ((graph.getNodeAttributes(pos.nodeId) as NodeAttrs).external_id ?? '')
      : ''
    if (parentExtIds.has(ext)) {
      // Group parent → resolve para /top; mirrorOrSelf atribui /bottom ao outro lutador
      const topExt = ext + '/top'
      let topPos: FightPos | null = null
      graph.forEachNode((id, a) => {
        if ((a as NodeAttrs).external_id === topExt) topPos = nodePos(graph, id)
      })
      if (topPos) { onSelect(topPos); setQ(''); return }
    }
    onSelect(pos)
    setQ('')
  }

  return (
    <div className="flow-search-wrap">
      <input ref={ref} className="search-input" placeholder={placeholder}
        value={q} onChange={e => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="search-dropdown">
          {results.map(r => (
            <li key={r.nodeId}>
              <span onClick={() => handleSelect(r)}>
                <span className={`type-dot ${r.nodeType}`} />{posDisplayName(r, lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── grouped technique list ────────────────────────────────────────────────────

const TYPE_ORDER = ['submission', 'transition', 'position']
const TYPE_KEY: Record<string, string> = {
  submission: 'tech.submissions',
  transition: 'tech.transitions',
  position:   'tech.positions',
}

function GroupedTechList({ items, extIdToName, onPick }: {
  items: FightPos[]
  extIdToName: Record<string, string>
  onPick: (item: FightPos) => void
}) {
  const lang = useLang()
  const sections = useMemo(() => {
    const byType: Record<string, FightPos[]> = {}
    for (const item of items) {
      if (!byType[item.nodeType]) byType[item.nodeType] = []
      byType[item.nodeType].push(item)
    }
    return TYPE_ORDER.filter(typ => byType[typ]?.length).map(type => {
      const byParent: Record<string, { parentName: string; items: FightPos[] }> = {}
      for (const item of byType[type]) {
        const key = item.parentExtId ?? '__none__'
        if (!byParent[key]) {
          byParent[key] = {
            parentName: item.parentExtId ? (extIdToName[item.parentExtId] ?? '') : '',
            items: [],
          }
        }
        byParent[key].items.push(item)
      }
      return {
        type,
        label: t(TYPE_KEY[type], lang),
        groups: Object.values(byParent).sort((a, b) => a.parentName.localeCompare(b.parentName)),
      }
    })
  }, [items, extIdToName, lang])

  return (
    <div className="flow-grouped-list">
      {sections.map(section => (
        <div key={section.type} className="flow-type-section">
          <div className="flow-type-header">{section.label}</div>
          {section.groups.map(group => (
            <div key={group.parentName || '__none__'}>
              {group.parentName && <div className="flow-parent-header">{group.parentName}</div>}
              {group.items.map(item => (
                <div key={item.nodeId} className="flow-option" onClick={() => onPick(item)}>
                  <span className={`type-dot ${item.nodeType}`} />
                  <span className="flow-option-name">{posDisplayName(item, lang)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── GPT Import Modal ──────────────────────────────────────────────────────────

function GptImportModal({ text, err, onTextChange, onSubmit, onClose }: {
  text: string
  err: string | null
  onTextChange: (v: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }
  const box: React.CSSProperties = {
    background: '#1a1a2e', border: '1px solid #334155', borderRadius: 14,
    width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  }
  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={box}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9' }}>Importar Fluxo GPT</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cole o JSON gerado pelo GPT
          </label>
          <textarea
            value={text}
            onChange={e => onTextChange(e.target.value)}
            placeholder={'{\n  "lutador": "...",\n  "adversario": "...",\n  "fluxo": [...]\n}'}
            style={{
              width: '100%', height: 200, background: '#0f0f1a', border: `1px solid ${err ? '#991b1b' : '#334155'}`,
              borderRadius: 8, color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace',
              padding: '10px 12px', resize: 'vertical', boxSizing: 'border-box', outline: 'none',
            }}
          />
          {err && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: 13 }}>
              {err}
            </div>
          )}
          <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
            Cada etapa <strong style={{ color: '#94a3b8' }}>tipo: position</strong> cria um card de posição.
            Etapas <strong style={{ color: '#94a3b8' }}>submission</strong> e <strong style={{ color: '#94a3b8' }}>transition</strong> são registradas como tentativas no card anterior.
          </p>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #334155', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={!text.trim()}
            style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: text.trim() ? '#2E77FF' : '#1e293b', color: text.trim() ? '#fff' : '#475569', cursor: text.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 13 }}
          >
            Criar Fluxo
          </button>
        </div>
      </div>
    </div>
  )
}

// ── exported types ────────────────────────────────────────────────────────────

export type { SavedFlow, FightStep, FightPos, Attempt, Actor }

// ── extract mindmap from flow ─────────────────────────────────────────────────

function extractMindmap(
  flow: SavedFlow,
  actor: Actor,
  graph: MultiDirectedGraph
): { rootId: string | null; activeEdges: Set<string>; extraNodes: Set<string>; manualEdges: ManualEdge[] } {
  const activeEdges    = new Set<string>()
  const extraNodes     = new Set<string>()
  const manualEdges: ManualEdge[] = []
  const parentByChild  = buildParentByChildId(graph)

  // Mapa inverso: parent → [leaf children]  (para resolver group parents sem filho específico)
  const leafChildrenByParent = new Map<string, string[]>()
  graph.forEachNode((id, attrs) => {
    const parentExt = (attrs as NodeAttrs).parent_external_id
    if (!parentExt) return
    let parentId: string | undefined
    graph.forEachNode((pid, pa) => { if ((pa as NodeAttrs).external_id === parentExt) parentId = pid })
    if (!parentId) return
    if (!leafChildrenByParent.has(parentId)) leafChildrenByParent.set(parentId, [])
    leafChildrenByParent.get(parentId)!.push(id)
  })

  function nodeTypeOf(id: string): string {
    return graph.hasNode(id) ? (graph.getNodeAttributes(id) as NodeAttrs).node_type : ''
  }

  /**
   * Retorna o nó canvas (source) e o handle correto para uma aresta SAINDO de nodeId.
   * parentId = resolveToParent(nodeId) — já calculado pelo chamador.
   * isFailure: se true, usa handle de falha (apenas para técnicas).
   */
  function sourceFor(
    nodeId: string,
    parentId: string,
    isFailure = false,
  ): { source: string; sourceHandle?: string } {
    if (nodeId !== parentId) {
      // nodeId é filho dentro de um group card
      const nt = nodeTypeOf(nodeId)
      const suffix = nt === 'submission'
        ? (isFailure ? 'falha' : 'sucesso')
        : 'out'                           // position child → '-out'
      return { source: parentId, sourceHandle: `child-${nodeId}-${suffix}` }
    }
    // nodeId é o próprio nó canvas (standalone ou group parent)
    const nt = nodeTypeOf(nodeId)
    if (nt === 'transition' || nt === 'submission') {
      return { source: nodeId, sourceHandle: isFailure ? 'falha' : 'sucesso' }
    }
    if (nt === 'position') {
      const children = leafChildrenByParent.get(nodeId)
      if (children && children.length > 0) {
        // group parent de posição → sair pelo primeiro filho
        return { source: nodeId, sourceHandle: `child-${children[0]}-out` }
      }
      return { source: nodeId, sourceHandle: 'depois' }  // standalone position
    }
    return { source: nodeId }
  }

  /**
   * Retorna o nó canvas (target) e o handle correto para uma aresta CHEGANDO em nodeId.
   * parentId = resolveToParent(nodeId) — já calculado pelo chamador.
   */
  function targetFor(
    nodeId: string,
    parentId: string,
  ): { target: string; targetHandle?: string } {
    if (nodeId !== parentId) {
      // nodeId é filho dentro de um group card
      return { target: parentId, targetHandle: `child-${nodeId}-in` }
    }
    // nodeId é o próprio nó canvas (standalone ou group parent)
    const nt = nodeTypeOf(nodeId)
    if (nt === 'transition' || nt === 'submission' || nt === 'position') {
      const children = leafChildrenByParent.get(nodeId)
      if (children && children.length > 0) {
        // group parent → entrar pelo primeiro filho
        return { target: nodeId, targetHandle: `child-${children[0]}-in` }
      }
      return { target: nodeId, targetHandle: 'antes' }  // standalone → handle 'antes'
    }
    return { target: nodeId }
  }

  if (!flow.steps.length) return { rootId: null, activeEdges, extraNodes, manualEdges }

  const firstPos = actor === 'A' ? flow.steps[0].posA : flow.steps[0].posB
  const rawRoot  = firstPos && firstPos.nodeId !== 'custom' && graph.hasNode(firstPos.nodeId)
    ? firstPos.nodeId : null
  if (!rawRoot) return { rootId: null, activeEdges, extraNodes, manualEdges }

  // Sempre resolver para o group card pai
  const rootId = resolveToParent(rawRoot, parentByChild)

  for (let i = 0; i < flow.steps.length; i++) {
    const step    = flow.steps[i]
    const posNode = actor === 'A' ? step.posA : step.posB
    if (!posNode || posNode.nodeId === 'custom' || !graph.hasNode(posNode.nodeId)) continue

    const posParent = resolveToParent(posNode.nodeId, parentByChild)
    if (posParent !== rootId) extraNodes.add(posParent)

    for (const attempt of step.attempts) {
      if (attempt.actor !== actor) continue
      if (!attempt.transNodeId || attempt.transNodeId === 'custom' || !graph.hasNode(attempt.transNodeId)) continue

      const techParentId = parentByChild.get(attempt.transNodeId)

      // Sempre adicionar a técnica como extra node — mantém o card visível mesmo se a aresta for desativada
      extraNodes.add(techParentId ?? attempt.transNodeId)

      // position → technique (via aresta do grafo)
      let edgeFound = false
      graph.forEachOutEdge(posNode.nodeId, (edgeId, _a, _s, target) => {
        if (target === attempt.transNodeId) { activeEdges.add(edgeId); edgeFound = true }
      })

      if (!edgeFound) {
        // Sequência não prevista no banco: criar conexão manual posição→técnica
        const { source: posSrc, sourceHandle: posSrcHandle } =
          sourceFor(posNode.nodeId, posParent)
        const { target: techTgt, targetHandle: techTgtHandle } =
          targetFor(attempt.transNodeId, techParentId ?? attempt.transNodeId)
        manualEdges.push({
          id: `flow-manual-${attempt.id}`,
          source: posSrc,
          target: techTgt,
          ...(posSrcHandle  ? { sourceHandle: posSrcHandle  } : {}),
          ...(techTgtHandle ? { targetHandle: techTgtHandle } : {}),
        })
      }

      // technique → next position (if success)
      if (attempt.result === 'success' && i + 1 < flow.steps.length) {
        const nextPos = actor === 'A' ? flow.steps[i + 1].posA : flow.steps[i + 1].posB
        if (nextPos && nextPos.nodeId !== 'custom' && graph.hasNode(nextPos.nodeId)) {
          let foundTechToNext = false
          graph.forEachOutEdge(attempt.transNodeId, (edgeId, _a, _s, target) => {
            if (target === nextPos.nodeId) { activeEdges.add(edgeId); foundTechToNext = true }
          })
          const nextParent = resolveToParent(nextPos.nodeId, parentByChild)
          if (nextParent !== rootId) extraNodes.add(nextParent)

          if (!foundTechToNext) {
            // Aresta técnica→próxima posição não existe no grafo: criar conexão manual
            const { source: techSrc, sourceHandle: techSrcHandle } =
              sourceFor(attempt.transNodeId, techParentId ?? attempt.transNodeId, false)
            const { target: nextTgt, targetHandle: nextTgtHandle } =
              targetFor(nextPos.nodeId, nextParent)
            manualEdges.push({
              id: `flow-manual-dest-${attempt.id}`,
              source: techSrc,
              target: nextTgt,
              ...(techSrcHandle ? { sourceHandle: techSrcHandle } : {}),
              ...(nextTgtHandle ? { targetHandle: nextTgtHandle } : {}),
            })
          }
        }
      }
    }
  }

  return { rootId, activeEdges, extraNodes, manualEdges }
}

// ── main component ────────────────────────────────────────────────────────────

export default function FlowBuilder({
  graph,
  onOpenAsMindmap,
  initialData,
  onDataChange,
}: {
  graph:            MultiDirectedGraph | null
  onOpenAsMindmap?: (rootId: string, activeEdges: Set<string>, extraNodes: Set<string>, manualEdges: ManualEdge[]) => void
  initialData?:     DocumentData
  onDataChange?:    (data: DocumentData) => void
}) {
  const navigate = useNavigate()
  const lang = useLang()

  // Seed initial state from DocumentData when in doc mode
  const docInitial = initialData && initialData.nodes.length > 0
    ? deserializeFluxograma(initialData) : null

  const [steps, setSteps]           = useState<FightStep[]>(docInitial?.steps ?? [])
  const [nameA, setNameA]           = useState(docInitial?.nameA ?? 'Lutador A')
  const [nameB, setNameB]           = useState(docInitial?.nameB ?? 'Lutador B')
  const [flowName, setFlowName]     = useState(docInitial?.flowName ?? 'Novo fluxo')
  const [flowDate, setFlowDate]     = useState(docInitial?.date ?? '')
  const [flowDesc, setFlowDesc]     = useState(docInitial?.description ?? '')
  const [flowVideo, setFlowVideo]   = useState(docInitial?.videoLink ?? '')
  const [flowGiNogi, setFlowGiNogi] = useState<FlowGiNogi>(docInitial?.gi_nogi ?? 'both')
  const [flowContext, setFlowContext] = useState<FlowContext>(docInitial?.context ?? 'training')
  const [flowOutcome, setFlowOutcome] = useState<FlowOutcome>(docInitial?.outcome ?? 'unfinished')
  const [panel, setPanel]           = useState<PanelPhase>({ type: 'idle' })
  const [savedFlows, setSaved]      = useState<SavedFlow[]>([])
  const [flowsLoading, setFlowsLoading] = useState(true)
  const [showSaved, setShowSaved]   = useState(false)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; result: 'success' | 'failure' }>({ name: '', result: 'success' })
  const [customText, setCustomText] = useState('')
  const [successText, setSuccessText] = useState('')
  const [dragIdx, setDragIdx]     = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importErr, setImportErr]   = useState<string | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const currentStep = steps[steps.length - 1] ?? null

  // ── load saved flows from Supabase on mount ────────────────
  useEffect(() => {
    loadFlows()
      .then(flows => setSaved(flows as SavedFlow[]))
      .catch(console.error)
      .finally(() => setFlowsLoading(false))
  }, [])

  // ── ext_id → name lookup (for parent grouping) ────────────
  const extIdToName = useMemo(() => {
    if (!graph) return {}
    const map: Record<string, string> = {}
    graph.forEachNode((_, a) => {
      const na = a as NodeAttrs
      if (na.external_id) map[na.external_id] = na.name
    })
    return map
  }, [graph])

  // ── flow actions ──────────────────────────────────────────

  function startFlow(posA: FightPos) {
    const posB = graph ? mirrorOrSelf(graph, posA) : posA
    setSteps([{ id: uid(), posA, posB, attempts: [] }])
    setEditingCardId(null)
    setPanel({ type: 'idle' })
  }

  function handleStartStanding() {
    if (!graph) return
    const pos = findByExtId(graph, 'standing-position')
    if (pos) startFlow(pos)
  }

  function handleStartKneeling() {
    if (!graph) return
    const pos = findByExtId(graph, 'training-roll')
    if (!pos) return
    // Both sides start from Training Roll (neutral start)
    setSteps([{ id: uid(), posA: pos, posB: pos, attempts: [] }])
    setEditingCardId(null)
    setPanel({ type: 'idle' })
  }

  function changeStepPos(stepId: string, newPosA: FightPos) {
    if (!graph) return
    const posB = mirrorOrSelf(graph, newPosA)
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, posA: newPosA, posB } : s))
    setEditingCardId(null)
  }

  function insertStep(idx: number, posA: FightPos) {
    const posB = graph ? mirrorOrSelf(graph, posA) : posA
    const newStep: FightStep = { id: uid(), posA, posB, attempts: [] }
    setSteps(prev => { const a = [...prev]; a.splice(idx, 0, newStep); return a })
    setPanel({ type: 'idle' })
  }

  function deleteStep(stepId: string) {
    setSteps(prev => prev.filter(s => s.id !== stepId))
    setPanel({ type: 'idle' })
  }

  function deleteAttempt(stepId: string, attId: string) {
    setSteps(prev => prev.map(s =>
      s.id !== stepId ? s : { ...s, attempts: s.attempts.filter(a => a.id !== attId) }
    ))
  }

  function reorderSteps(from: number, to: number) {
    if (from === to) return
    setSteps(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return arr
    })
  }

  function updateAttempt(stepId: string, attId: string, name: string, result: 'success' | 'failure') {
    setSteps(prev => prev.map(s =>
      s.id !== stepId ? s : {
        ...s,
        attempts: s.attempts.map(a => a.id === attId ? { ...a, transName: name, result } : a),
      }
    ))
    setEditingCardId(null)
  }

  function appendAttempt(attempt: Attempt) {
    setSteps(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      return [...prev.slice(0, -1), { ...last, attempts: [...last.attempts, attempt] }]
    })
  }

  function commitSuccess(actor: Actor, trans: FightPos, dest: FightPos) {
    if (!graph) return
    const attempt: Attempt = {
      id: uid(), actor,
      transNodeId: trans.nodeId === 'custom' ? null : trans.nodeId,
      transName: posDisplayName(trans, lang), result: 'success',
    }
    const mirror = mirrorOrSelf(graph, dest)
    const newStep: FightStep = {
      id: uid(),
      posA: actor === 'A' ? dest  : mirror,
      posB: actor === 'A' ? mirror : dest,
      attempts: [],
    }
    setSteps(prev => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      return [...prev.slice(0, -1), { ...last, attempts: [...last.attempts, attempt] }, newStep]
    })
    setPanel({ type: 'idle' })
    setCustomText('')
    setTimeout(() => timelineRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
  }

  function handlePositionPick(pos: FightPos, actor: Actor) {
    if (!graph) return
    const mirror = mirrorOrSelf(graph, pos)
    const newStep: FightStep = {
      id: uid(),
      posA: actor === 'A' ? pos   : mirror,
      posB: actor === 'A' ? mirror : pos,
      attempts: [],
    }
    setSteps(prev => prev.length ? [...prev, newStep] : prev)
    setPanel({ type: 'idle' })
    setCustomText('')
    setTimeout(() => timelineRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 50)
  }

  function handleTransPick(trans: FightPos, actor: Actor) {
    setPanel({ type: 'pick-result', actor, trans })
  }

  function handleNodePick(item: FightPos, actor: Actor) {
    if (item.nodeType === 'position') handlePositionPick(item, actor)
    else handleTransPick(item, actor)
  }

  function handleResultPick(result: 'success' | 'failure', actor: Actor, trans: FightPos) {
    if (result === 'failure') {
      appendAttempt({ id: uid(), actor, transNodeId: trans.nodeId === 'custom' ? null : trans.nodeId, transName: posDisplayName(trans, lang), result: 'failure' })
      setPanel({ type: 'after-failure', actor })
      setCustomText('')
      return
    }
    if (!graph) return
    const dests = getSuccessDests(graph, trans.nodeId)
    if (dests.length === 1)     commitSuccess(actor, trans, dests[0])
    else if (dests.length > 1)  setPanel({ type: 'pick-dest', actor, trans, dests })
    else                        setPanel({ type: 'custom-success', actor, trans })
  }

  function handleCustomSubmit(actor: Actor) {
    if (!customText.trim()) return
    setPanel({ type: 'pick-result', actor, trans: { nodeId: 'custom', name: customText.trim(), name_en: null, nodeType: 'transition', parentExtId: null } })
  }

  function handleCustomFailAdd(actor: Actor) {
    if (!customText.trim()) return
    appendAttempt({ id: uid(), actor, transNodeId: null, transName: customText.trim(), result: 'failure' })
    setCustomText('')
  }

  // ── save / load ───────────────────────────────────────────

  function saveFlow() {
    if (!steps.length) return
    const record = {
      name: flowName, nameA, nameB,
      steps, savedAt: new Date().toISOString(),
      date: flowDate || undefined,
      description: flowDesc || undefined,
      videoLink: flowVideo || undefined,
      gi_nogi: flowGiNogi,
      context: flowContext,
      outcome: flowOutcome,
    }
    saveFlowToDB(record)
      .then(saved => setSaved(prev => [saved as SavedFlow, ...prev]))
      .catch(console.error)
  }

  function loadFlow(flow: SavedFlow) {
    setFlowName(flow.name); setNameA(flow.nameA); setNameB(flow.nameB)
    setFlowDate(flow.date ?? ''); setFlowDesc(flow.description ?? ''); setFlowVideo(flow.videoLink ?? '')
    setFlowGiNogi(flow.gi_nogi ?? 'both')
    setFlowContext(flow.context ?? 'training')
    setFlowOutcome(flow.outcome ?? 'unfinished')
    setSteps(flow.steps); setPanel({ type: 'idle' }); setShowSaved(false)
  }

  function deleteFlow(id: string) {
    deleteFlowFromDB(id)
      .then(() => setSaved(prev => prev.filter(f => f.id !== id)))
      .catch(console.error)
  }

  function openAsMindmap(flow: SavedFlow, actor: Actor) {
    if (!graph || !onOpenAsMindmap) return
    const { rootId, activeEdges, extraNodes, manualEdges } = extractMindmap(flow, actor, graph)
    if (!rootId) return
    onOpenAsMindmap(rootId, activeEdges, extraNodes, manualEdges)
  }

  // ── GPT import ───────────────────────────────────────────

  function importFromGpt(json: string): string | null {
    if (!graph) return 'Grafo não carregado'
    let parsed: { lutador?: string; adversario?: string; fluxo?: Array<{ tipo: string; nome: string; resultado: string }> }
    try { parsed = JSON.parse(json) } catch { return 'JSON inválido' }
    if (!Array.isArray(parsed?.fluxo) || parsed.fluxo.length === 0) return 'Campo "fluxo" ausente ou vazio'

    const nameToNode = new Map<string, FightPos>()
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      nameToNode.set(a.name, nodePos(graph, id))
      if (a.name_en) nameToNode.set(a.name_en, nodePos(graph, id))
    })

    const newSteps: FightStep[] = []
    for (const s of parsed.fluxo) {
      if (s.tipo === 'position') {
        const pos = nameToNode.get(s.nome) ?? { nodeId: `custom-${s.nome}`, name: s.nome, name_en: null, nodeType: 'position', parentExtId: null }
        const mirror = nameToNode.has(s.nome) ? findMirror(graph, pos.nodeId) : null
        newSteps.push({ id: uid(), posA: pos, posB: mirror, attempts: [] })
      } else if ((s.tipo === 'submission' || s.tipo === 'transition') && newSteps.length > 0) {
        newSteps[newSteps.length - 1].attempts.push({
          id: uid(),
          actor: 'A',
          transNodeId: nameToNode.get(s.nome)?.nodeId ?? null,
          transName: s.nome,
          result: s.resultado === 'sucesso' ? 'success' : 'failure',
        })
      }
    }

    if (newSteps.length === 0) return 'Nenhuma posição encontrada no fluxo'
    setNameA(parsed.lutador ?? 'Lutador A')
    setNameB(parsed.adversario ?? 'Lutador B')
    setSteps(newSteps)
    setPanel({ type: 'idle' })
    return null  // success
  }

  // ── derived ───────────────────────────────────────────────

  const transitions = useMemo(() => {
    if (!graph || !currentStep) return { A: [], B: [] }
    return {
      A: getTransitions(graph, currentStep.posA.nodeId),
      B: currentStep.posB ? getTransitions(graph, currentStep.posB.nodeId) : [],
    }
  }, [graph, currentStep])

  const allGraphNodes = useMemo<FightPos[]>(() => {
    if (!graph) return []
    // Detectar submission group parents (têm filhos submission)
    const submissionParentExtIds = new Set<string>()
    graph.forEachNode((_, a) => {
      const na = a as NodeAttrs
      if (na.node_type === 'submission' && na.parent_external_id) {
        submissionParentExtIds.add(na.parent_external_id)
      }
    })
    const out: FightPos[] = []
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      const ext = a.external_id ?? ''
      // Excluir filhos de posição (/top e /bottom)
      if (a.node_type === 'position' && (ext.endsWith('/top') || ext.endsWith('/bottom'))) return
      // Excluir submission group parents — apenas filhos específicos e standalones
      if (a.node_type === 'submission' && !a.parent_external_id && submissionParentExtIds.has(ext)) return
      out.push({ nodeId: id, name: a.name, name_en: a.name_en ?? null, nodeType: a.node_type, parentExtId: a.parent_external_id ?? null })
    })
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [graph])

  // ── doc mode: emit changes to parent ─────────────────────────
  const emitDocChange = useCallback(() => {
    if (!onDataChange) return
    onDataChange(serializeFluxograma(
      steps, nameA, nameB, flowName,
      flowDate || undefined, flowDesc || undefined, flowVideo || undefined,
      flowGiNogi, flowContext, flowOutcome,
    ))
  }, [onDataChange, steps, nameA, nameB, flowName, flowGiNogi, flowContext, flowOutcome])

  useEffect(() => { emitDocChange() }, [emitDocChange])

  const activeActor: Actor | null =
    panel.type === 'pick-trans' || panel.type === 'pick-result' ||
    panel.type === 'after-failure' || panel.type === 'custom-success' ||
    panel.type === 'pick-dest' ? panel.actor : null

  const actorName = (a: Actor) => a === 'A' ? nameA : nameB
  const transListFor = (actor: Actor) => actor === 'A' ? transitions.A : transitions.B

  // ── start screen ──────────────────────────────────────────

  if (steps.length === 0) {
    return (
      <>
      <div className="flow2-start">
        <div className="flow-names-row">
          <input className="flow-name-input" value={nameA} onChange={e => setNameA(e.target.value)} placeholder={t('flow.fighter_a', lang)} />
          <span className="flow2-vs" style={{ fontSize: 14 }}>{t('flow.vs', lang)}</span>
          <input className="flow-name-input" value={nameB} onChange={e => setNameB(e.target.value)} placeholder={t('flow.fighter_b', lang)} />
        </div>
        <div className="flow-meta-fields">
          <input className="flow-meta-input" type="date" value={flowDate} onChange={e => setFlowDate(e.target.value)} title={t('flow.date', lang)} />
          <input className="flow-meta-input" value={flowDesc} onChange={e => setFlowDesc(e.target.value)} placeholder={t('flow.description', lang)} />
          <input className="flow-meta-input" value={flowVideo} onChange={e => setFlowVideo(e.target.value)} placeholder={t('flow.video_link', lang)} />
          {/* ── Contexto de agregação ─────────────────────────────────── */}
          <select
            id="flow-gi-nogi"
            className="flow-meta-input"
            value={flowGiNogi}
            onChange={e => setFlowGiNogi(e.target.value as FlowGiNogi)}
            title="Gi / No-Gi"
          >
            <option value="both">Gi + No-Gi</option>
            <option value="gi">Gi</option>
            <option value="nogi">No-Gi</option>
          </select>
          <select
            id="flow-context"
            className="flow-meta-input"
            value={flowContext}
            onChange={e => setFlowContext(e.target.value as FlowContext)}
            title="Contexto"
          >
            <option value="training">Treino</option>
            <option value="sparring">Sparring</option>
            <option value="competition">Competição</option>
          </select>
          <select
            id="flow-outcome"
            className="flow-meta-input"
            value={flowOutcome}
            onChange={e => setFlowOutcome(e.target.value as FlowOutcome)}
            title="Resultado"
          >
            <option value="unfinished">Sem resultado</option>
            <option value="win">Vitória (A)</option>
            <option value="loss">Derrota (A)</option>
            <option value="draw">Empate</option>
          </select>
        </div>
        <h3 className="flow-start-title">{t('flow.how_start', lang)}</h3>
        {!graph && (
          <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Carregando grafo…</p>
        )}
        <div className="flow-start-btns">
          <button className="flow-start-type-btn" onClick={handleStartStanding} disabled={!graph} style={{ opacity: graph ? 1 : 0.4 }}>
            <span className="flow-start-type-label">{t('flow.standing', lang)}</span>
            <span className="flow-start-type-sub">{t('flow.standing_sub', lang)}</span>
          </button>
          <button className="flow-start-type-btn" onClick={handleStartKneeling} disabled={!graph} style={{ opacity: graph ? 1 : 0.4 }}>
            <span className="flow-start-type-label">{t('flow.kneeling', lang)}</span>
            <span className="flow-start-type-sub">{t('flow.kneeling_sub', lang)}</span>
          </button>
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="btn-reset" onClick={() => { setImportText(''); setImportErr(null); setShowImportModal(true) }}>
            Importar Fluxo GPT
          </button>
        </div>

        {(flowsLoading || savedFlows.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <button className="btn-reset" onClick={() => setShowSaved(s => !s)} disabled={flowsLoading}>
              {flowsLoading ? 'Carregando…' : `${t('flow.load_saved', lang)} (${savedFlows.length})`}
            </button>
            {showSaved && (
              <div className="flow2-saved-list">
                {savedFlows.map(f => (
                  <div key={f.id} className="flow2-saved-item" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <span onClick={() => loadFlow(f)} className="flow2-saved-name">{f.name}</span>
                    <span className="flow2-saved-date">{new Date(f.savedAt).toLocaleDateString('pt-BR')}</span>
                    {onOpenAsMindmap && (
                      <>
                        <button className="flow2-map-btn" onClick={() => openAsMindmap(f, 'A')} title={`Ver mapa de ${f.nameA}`}>⬡ {f.nameA}</button>
                        <button className="flow2-map-btn" onClick={() => openAsMindmap(f, 'B')} title={`Ver mapa de ${f.nameB}`}>⬡ {f.nameB}</button>
                      </>
                    )}
                    <button className="flow2-saved-del" onClick={() => deleteFlow(f.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showImportModal && (
        <GptImportModal
          text={importText}
          err={importErr}
          onTextChange={v => { setImportText(v); setImportErr(null) }}
          onSubmit={() => {
            const err = importFromGpt(importText)
            if (err) { setImportErr(err) } else { setShowImportModal(false) }
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}
      </>
    )
  }

  // ── main flow view ────────────────────────────────────────

  return (
    <div className="flow2-layout">

      {/* Header */}
      <div className="flow2-header">
        {onDataChange && (
          <button
            className="btn-reset"
            style={{ color: 'var(--muted)', fontSize: 12 }}
            onClick={() => navigate('/docs')}
          >← Docs</button>
        )}
        <input className="flow2-name-input" value={flowName} onChange={e => setFlowName(e.target.value)} />
        <div className="flow-names-row" style={{ gap: 6 }}>
          <input className="flow-name-input compact" value={nameA} onChange={e => setNameA(e.target.value)} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>vs</span>
          <input className="flow-name-input compact" value={nameB} onChange={e => setNameB(e.target.value)} />
        </div>
        <div className="flow-meta-row">
          <input className="flow-meta-input compact" type="date" value={flowDate} onChange={e => setFlowDate(e.target.value)} title={t('flow.date', lang)} />
          <input className="flow-meta-input compact" value={flowDesc} onChange={e => setFlowDesc(e.target.value)} placeholder={t('flow.description', lang)} />
          {flowVideo
            ? <a href={flowVideo} target="_blank" rel="noopener noreferrer" className="flow-meta-video-link">▶ {t('flow.video_link', lang)}</a>
            : <input className="flow-meta-input compact" value={flowVideo} onChange={e => setFlowVideo(e.target.value)} placeholder={t('flow.video_link', lang)} />
          }
        </div>
        {onDataChange
          ? <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>auto-save</span>
          : <button className="btn-reset" onClick={saveFlow}>{t('flow.save', lang)}</button>
        }
        <div style={{ position: 'relative' }}>
          <button className="btn-reset" onClick={() => setShowSaved(s => !s)}>
            {t('flow.saved', lang)} ({savedFlows.length})
          </button>
          {showSaved && (
            <div className="flow2-saved-dropdown">
              {savedFlows.length === 0
                ? <div className="flow2-saved-item"><span className="flow2-saved-name" style={{ color: 'var(--muted)' }}>{t('flow.none_saved', lang)}</span></div>
                : savedFlows.map(f => (
                  <div key={f.id} className="flow2-saved-item" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <span onClick={() => loadFlow(f)} className="flow2-saved-name">{f.name}</span>
                    <span className="flow2-saved-date">{new Date(f.savedAt).toLocaleDateString('pt-BR')}</span>
                    {onOpenAsMindmap && (
                      <>
                        <button className="flow2-map-btn" onClick={() => openAsMindmap(f, 'A')} title={`Ver mapa de ${f.nameA}`}>⬡ {f.nameA}</button>
                        <button className="flow2-map-btn" onClick={() => openAsMindmap(f, 'B')} title={`Ver mapa de ${f.nameB}`}>⬡ {f.nameB}</button>
                      </>
                    )}
                    <button className="flow2-saved-del" onClick={() => deleteFlow(f.id)}>✕</button>
                  </div>
                ))}
            </div>
          )}
        </div>
        <button className="btn-reset" onClick={() => { setImportText(''); setImportErr(null); setShowImportModal(true) }}>
          Importar GPT
        </button>
        <button className="btn-reset" onClick={() => { setSteps([]); setPanel({ type: 'idle' }) }}>
          {t('flow.restart', lang)}
        </button>
      </div>

      {/* Body */}
      <div className="flow2-main">

        {/* ── Canvas ────────────────────────────────────── */}
        <div className="mc-canvas" ref={timelineRef}>

          <div className="mc-start-pill">{t('flow.start_fight', lang)}</div>

          {steps.map((step, si) => {
            const isLast = si === steps.length - 1
            const stripe = step.posA.nodeType
            const isDragging = dragIdx === si
            const isDragOver = dragOverIdx === si && dragIdx !== null && dragIdx !== si

            const { base: posBase, side: sideA } = splitPosName(posDisplayName(step.posA, lang), lang)
            const { side: sideB } = step.posB ? splitPosName(posDisplayName(step.posB, lang), lang) : { side: null }

            return (
              <div key={step.id} className={`mc-step-wrap${isDragOver ? ' drag-over' : ''}`}>

                {/* Insert zone between steps */}
                <div className="mc-between-zone">
                  <div className="mc-arrow" />
                  <button
                    className="mc-insert-btn"
                    onClick={() => setPanel({ type: 'insert-step', idx: si })}
                    title={t('flow.insert_pos', lang)}
                  >+</button>
                </div>

                {/* Step */}
                <div
                  className={`mc-step${isDragging ? ' dragging' : ''}`}
                  draggable
                  onDragStart={e => { e.stopPropagation(); setDragIdx(si) }}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(si) }}
                  onDrop={e => { e.preventDefault(); if (dragIdx !== null) reorderSteps(dragIdx, si); setDragIdx(null); setDragOverIdx(null) }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                >
                  {/* Position card */}
                  <div className="mc-pos-card">
                    <div className={`mc-stripe ${stripe}`} />
                    <div className="mc-pos-body">
                      {editingCardId === step.id ? (
                        <div className="mc-edit-wrap">
                          <NodeSearch graph={graph!} placeholder={t('flow.new_pos', lang)} onSelect={pos => changeStepPos(step.id, pos)} autoFocus />
                          <button className="mc-cancel" onClick={() => setEditingCardId(null)}>{t('flow.cancel', lang)}</button>
                        </div>
                      ) : (
                        <>
                          <div className="mc-pos-header">
                            <span className="mc-drag-handle">⠿</span>
                            <span className="mc-pos-title">{posBase}</span>
                            <button className="mc-edit-btn" onClick={() => setEditingCardId(step.id)} title={t('flow.alter_pos', lang)}>✎</button>
                            <button className="mc-del-btn" onClick={e => { e.stopPropagation(); deleteStep(step.id) }} title={t('flow.remove', lang)}>🗑</button>
                          </div>
                          <div className="mc-pos-cols">
                            <div className="mc-pos-col">
                              <span className="mc-fighter-tag A">{nameA}</span>
                              <span className="mc-col-side">{sideA ?? posDisplayName(step.posA, lang)}</span>
                            </div>
                            <div className="mc-pos-col-divider" />
                            <div className="mc-pos-col">
                              <span className="mc-fighter-tag B">{nameB}</span>
                              <span className="mc-col-side">{step.posB ? (sideB ?? posDisplayName(step.posB, lang)) : posDisplayName(step.posA, lang)}</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Attempt event cards */}
                  {step.attempts.map((att) => (
                    <div key={att.id} className="mc-attempt-wrap">
                      <div className="mc-arrow short" />
                      {editingCardId === att.id ? (
                        <div className={`mc-event-card ${editDraft.result} editing`}>
                          <button
                            className={`mc-result-toggle ${editDraft.result}`}
                            onClick={() => setEditDraft(d => ({ ...d, result: d.result === 'success' ? 'failure' : 'success' }))}
                          >
                            {editDraft.result === 'success' ? '✓' : '✗'}
                          </button>
                          <input
                            className="mc-event-edit-input"
                            value={editDraft.name}
                            onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') updateAttempt(step.id, att.id, editDraft.name, editDraft.result) }}
                          />
                          <button className="mc-edit-save" onClick={() => updateAttempt(step.id, att.id, editDraft.name, editDraft.result)}>OK</button>
                          <button className="mc-edit-cancel" onClick={() => setEditingCardId(null)}>✕</button>
                        </div>
                      ) : (
                        <div className={`mc-event-card ${att.result}`}
                          onClick={() => { setEditingCardId(att.id); setEditDraft({ name: att.transName, result: att.result }) }}
                        >
                          <span className={`mc-actor-tag ${att.actor}`}>{actorName(att.actor)}</span>
                          <span className="mc-event-name">{att.transName}</span>
                          <span className={`mc-result-icon ${att.result}`}>
                            {att.result === 'success' ? '✓' : '✗'}
                          </span>
                          <button
                            className="mc-del-btn"
                            onClick={e => { e.stopPropagation(); deleteAttempt(step.id, att.id) }}
                            title={t('flow.remove', lang)}
                          >🗑</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add actions (last step only) */}
                  {isLast && (
                    <div className="mc-add-section">
                      <div className="mc-arrow" />
                      <div className="mc-add-row">
                        <button
                          className={`mc-add-btn${activeActor === 'A' ? ' active-A' : ''}`}
                          onClick={() => setPanel(activeActor === 'A' ? { type: 'idle' } : { type: 'pick-trans', actor: 'A' })}
                        >+ {nameA}</button>
                        <button
                          className={`mc-add-btn${activeActor === 'B' ? ' active-B' : ''}`}
                          onClick={() => setPanel(activeActor === 'B' ? { type: 'idle' } : { type: 'pick-trans', actor: 'B' })}
                        >+ {nameB}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Action / Insert panel ──────────────────────── */}
        {panel.type !== 'idle' && (
          <div className="flow2-action-panel">

            {/* Insert step panel */}
            {panel.type === 'insert-step' && (
              <>
                <div className="flow2-panel-header">
                  <span className="flow2-panel-title">{t('flow.insert_panel', lang)}</span>
                  <button className="close-btn" onClick={() => setPanel({ type: 'idle' })}>✕</button>
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <NodeSearch graph={graph!} placeholder={t('flow.search_insert', lang)} onSelect={pos => insertStep(panel.idx, pos)} autoFocus />
                </div>
              </>
            )}

            {/* Pick transition */}
            {currentStep && (panel.type === 'pick-trans' || panel.type === 'after-failure') && (() => {
              const actor = panel.actor
              const list = transListFor(actor)
              const fromPos = actor === 'A' ? currentStep.posA : currentStep.posB
              const q = customText.toLowerCase().trim()
              const searchResults = q.length > 0
                ? allGraphNodes.filter(n =>
                    n.name.toLowerCase().includes(q) ||
                    (n.name_en ?? '').toLowerCase().includes(q)
                  ).slice(0, 12)
                : []
              return (
                <>
                  <div className="flow2-panel-header">
                    <span className="flow2-panel-title">
                      {panel.type === 'after-failure' ? `${t('flow.next_action', lang)} — ${actorName(actor)}` : `${t('flow.tech_of', lang)} ${actorName(actor)}`}
                    </span>
                    <button className="close-btn" onClick={() => { setPanel({ type: 'idle' }); setCustomText('') }}>✕</button>
                  </div>
                  {panel.type === 'after-failure' && (
                    <p className="flow2-panel-sub" style={{ color: '#ef4444' }}>{t('flow.failed_next', lang)}</p>
                  )}
                  <p className="flow2-panel-sub">{t('flow.from', lang)} <strong>{fromPos ? posDisplayName(fromPos, lang) : '—'}</strong></p>

                  {/* Search input at top */}
                  <div className="flow2-panel-search">
                    <input
                      className="flow2-search-input"
                      placeholder={t('flow.tech_name', lang)}
                      value={customText}
                      autoFocus
                      onChange={e => setCustomText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && searchResults.length === 0) handleCustomSubmit(actor) }}
                    />
                    {customText.trim() && (
                      <div className="flow2-search-btns">
                        <button
                          className="flow2-result-btn success"
                          style={{ flexShrink: 0, padding: '4px 10px' }}
                          onClick={() => handleCustomSubmit(actor)}
                          title={t('flow.choose_result', lang)}
                        >→</button>
                        <button
                          className="flow2-result-btn failure"
                          style={{ flexShrink: 0, padding: '4px 10px' }}
                          onClick={() => handleCustomFailAdd(actor)}
                          title={t('flow.reg_failure', lang)}
                        >✗</button>
                      </div>
                    )}
                  </div>

                  {/* Search results or contextual list */}
                  {searchResults.length > 0 ? (
                    <div className="flow-grouped-list">
                      {searchResults.map(item => (
                        <div key={item.nodeId} className="flow-option flow-option-search" onClick={() => { setCustomText(''); handleNodePick(item, actor) }}>
                          <span className="search-type-icon" style={{ background: iconColor(item.nodeType), width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <NodeIcon type={item.nodeType} size={11} />
                          </span>
                          <span className="flow-option-name">{posDisplayName(item, lang)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <GroupedTechList items={list} extIdToName={extIdToName} onPick={item => handleNodePick(item, actor)} />
                  )}
                </>
              )
            })()}

            {/* Pick result */}
            {currentStep && panel.type === 'pick-result' && (
              <>
                <div className="flow2-panel-header">
                  <span className="flow2-panel-title">{posDisplayName(panel.trans, lang)}</span>
                  <button className="close-btn" onClick={() => { setPanel({ type: 'idle' }); setCustomText('') }}>✕</button>
                </div>
                <p className="flow2-panel-sub">
                  <strong>{actorName(panel.actor)}</strong> {t('flow.tried', lang)} <strong>{posDisplayName(panel.trans, lang)}</strong>
                </p>
                <div className="flow2-result-btns">
                  <button className="flow2-result-btn success" onClick={() => handleResultPick('success', panel.actor, panel.trans)}>
                    {t('flow.success_btn', lang)}
                  </button>
                  <button className="flow2-result-btn failure" onClick={() => handleResultPick('failure', panel.actor, panel.trans)}>
                    {t('flow.failure_btn', lang)}
                  </button>
                </div>
                <button className="flow2-back-btn" onClick={() => setPanel({ type: 'pick-trans', actor: panel.actor })}>
                  {t('flow.back', lang)}
                </button>
              </>
            )}

            {/* Multiple success destinations */}
            {currentStep && panel.type === 'pick-dest' && (
              <>
                <div className="flow2-panel-header">
                  <span className="flow2-panel-title">{t('flow.pick_dest', lang)}</span>
                  <button className="close-btn" onClick={() => setPanel({ type: 'idle' })}>✕</button>
                </div>
                <p className="flow2-panel-sub">{t('flow.success_with', lang)} <strong>{posDisplayName(panel.trans, lang)}</strong>. {t('flow.arrives_at', lang)}</p>
                <ul className="flow-options-list">
                  {panel.dests.map(d => (
                    <li key={d.nodeId} className="flow-option" onClick={() => commitSuccess(panel.actor, panel.trans, d)}>
                      <span className={`type-dot ${d.nodeType}`} />
                      <span className="flow-option-name">{posDisplayName(d, lang)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flow2-custom-section" style={{ marginTop: 8 }}>
                  <p className="flow2-custom-label">{t('flow.other_dest', lang)}</p>
                  <NodeSearch graph={graph!} placeholder={t('flow.search_dest', lang)}
                    onSelect={dest => commitSuccess(panel.actor, panel.trans, dest)} />
                </div>
              </>
            )}

            {/* No mapped dest → free search */}
            {currentStep && panel.type === 'custom-success' && (
              <>
                <div className="flow2-panel-header">
                  <span className="flow2-panel-title">{t('flow.where_arrived', lang)}</span>
                  <button className="close-btn" onClick={() => setPanel({ type: 'idle' })}>✕</button>
                </div>
                <p className="flow2-panel-sub">{t('flow.success_with', lang)} <strong>{panel.trans ? posDisplayName(panel.trans, lang) : ''}</strong>. {t('flow.dest_pos', lang)}</p>
                <NodeSearch graph={graph!} placeholder={t('flow.search_dest', lang)}
                  onSelect={dest => commitSuccess(panel.actor, panel.trans!, dest)} autoFocus />
                <div className="flow2-custom-section">
                  <p className="flow2-custom-label">{t('flow.free_name', lang)}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="search-input" placeholder="Posição..." value={successText} onChange={e => setSuccessText(e.target.value)} />
                    <button className="flow2-result-btn success" style={{ flexShrink: 0, padding: '4px 8px' }} onClick={() => {
                      if (!successText.trim() || !panel.trans) return
                      appendAttempt({ id: uid(), actor: panel.actor, transNodeId: panel.trans.nodeId === 'custom' ? null : panel.trans.nodeId, transName: posDisplayName(panel.trans, lang), result: 'success', note: `→ ${successText}` })
                      setPanel({ type: 'idle' }); setSuccessText('')
                    }}>OK</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showImportModal && (
        <GptImportModal
          text={importText}
          err={importErr}
          onTextChange={t => { setImportText(t); setImportErr(null) }}
          onSubmit={() => {
            const err = importFromGpt(importText)
            if (err) { setImportErr(err) } else { setShowImportModal(false) }
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  )
}
