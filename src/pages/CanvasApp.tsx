import {
  useEffect, useState, useMemo, useCallback, useRef,
} from 'react'
import { useNavigate } from 'react-router-dom'
import dagre from '@dagrejs/dagre'
import type { Connection } from '@xyflow/react'
import { MultiDirectedGraph } from 'graphology'
import { loadGraph } from '../lib/graphLoader'
import { deriveVisibleNodes, deriveLatentEdges, conservativeCollapse } from '../lib/graphState'
import { seedPosition } from '../lib/positioning'
import { saveToStorage, loadFromStorage, type ManualEdge } from '../lib/persistence'
import { listMindmaps, saveMindmap, getMindmapData, deleteMindmap } from '../lib/mindmapStorage'
import type { DocumentSummary } from '../core/document/types'
import type { NodeAttrs, EdgeAttrs } from '../types'
import type { DocumentData } from '../core/document/types'
import { LangContext, type Lang, t, tNodeType, useLang, nodeName } from '../lib/i18n'
import FlowCanvas, { type CyNodeDef, type CyEdgeDef, type GraphCanvasHandle } from '../components/FlowCanvas'
import NodePanel from '../components/NodePanel'
import Modal from '../components/Modal'
import DebugPanel from '../components/DebugPanel'
import FlowBuilder from '../components/FlowBuilder'
import Admin from '../components/Admin'
import { NodeIcon, iconColor } from '../components/NodeIcon'
import { serializeMindmap, deserializeMindmap } from '../modes/mindmap/serializer'
import { resolveToParent } from '../lib/graphUtils'

// ── Search ────────────────────────────────────────────────────────────────────

type SearchResult = { id: string; name: string; type: string }

function SearchBox({
  graph, onSelect,
}: {
  graph: MultiDirectedGraph | null
  onSelect: (id: string) => void
}) {
  const lang = useLang()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current) }, [])

  const results = useMemo((): SearchResult[] => {
    if (!graph || q.length < 2) return []
    const lq = q.toLowerCase()
    const out: SearchResult[] = []
    const typeOrder: Record<string, number> = { position: 0, submission: 1, transition: 2 }
    const matched: Array<{ id: string; a: NodeAttrs }> = []
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      if (a.parent_external_id) return
      if (nodeName(a, lang).toLowerCase().includes(lq)) matched.push({ id, a })
    })
    matched.sort((x, y) => (typeOrder[x.a.node_type] ?? 3) - (typeOrder[y.a.node_type] ?? 3))
    for (const { id, a } of matched) {
      out.push({ id, name: nodeName(a, lang), type: a.node_type })
      if (out.length >= 20) break
    }
    return out
  }, [q, graph, lang])

  return (
    <div className="search-wrap">
      <input
        className="search-input"
        placeholder={t('app.search_placeholder', lang)}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true) }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 160) }}
      />
      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map((r) => (
            <li key={r.id} className="search-group">
              <span onMouseDown={() => { onSelect(r.id); setQ(''); setOpen(false) }} className="search-result-item">
                <span className="search-type-icon" style={{ background: iconColor(r.type) }}>
                  <NodeIcon type={r.type} size={12} />
                </span>
                <span className="search-item-info">
                  <span className="search-item-name">{r.name}</span>
                  <span className="search-item-type">{tNodeType(r.type, lang)}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Hidden chips ──────────────────────────────────────────────────────────────

function HiddenBar({
  hiddenNodeIds, graph, onRestore,
}: {
  hiddenNodeIds: Set<string>
  graph: MultiDirectedGraph | null
  onRestore: (id: string) => void
}) {
  const lang = useLang()
  if (!graph || hiddenNodeIds.size === 0) return null
  return (
    <div className="hidden-bar">
      <span className="hidden-label">{t('app.hidden', lang)}:</span>
      {[...hiddenNodeIds].map((id) => {
        const attrs = graph.hasNode(id) ? (graph.getNodeAttributes(id) as NodeAttrs) : null
        const name = attrs ? nodeName(attrs, lang) : id
        return (
          <button key={id} className="hidden-chip" onClick={() => onRestore(id)}>
            {name}
          </button>
        )
      })}
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

interface CanvasAppProps {
  /** Quando fornecido, o canvas opera em modo-documento: carrega deste data e emite alterações via onDataChange */
  initialData?:   DocumentData
  onDataChange?:  (data: DocumentData) => void
  docTitle?:      string
}

export default function CanvasApp({ initialData, onDataChange, docTitle }: CanvasAppProps = {}) {
  const navigate = useNavigate()
  const [graph, setGraph] = useState<MultiDirectedGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Curated state (persisted)
  const [rootNodeId, setRootNodeId] = useState<string | null>(null)
  const [activeEdgeIds, setActiveEdgeIds] = useState<Set<string>>(new Set())
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set())
  const [lockedNodes, setLockedNodes] = useState<Set<string>>(new Set())
  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const revealedBy = useRef<Map<string, string>>(new Map())
  const restoredRef = useRef(false)

  // UI state (not persisted)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [modalNodeId, setModalNodeId] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('pt')
  const [appMode, setAppMode] = useState<'mapa' | 'fluxo' | 'admin'>('mapa')
  const [viewMode, setViewMode] = useState<'completo' | 'simples' | 'tudo'>('completo')
  const [fadedNodeIds, setFadedNodeIds] = useState<Set<string>>(new Set())
  const [ctxMenu, setCtxMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [showOnlyActiveChildren, setShowOnlyActiveChildren] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [extraNodeIds, setExtraNodeIds] = useState<Set<string>>(new Set())
  const [manualEdges, setManualEdges] = useState<ManualEdge[]>([])

  // Cloud mindmap save/load (scratch-pad mode only)
  const [savedMindmaps, setSavedMindmaps] = useState<DocumentSummary[]>([])
  const [showMindmapList, setShowMindmapList] = useState(false)
  const [showSaveName, setShowSaveName] = useState(false)
  const [savingMindmapName, setSavingMindmapName] = useState('')

  const canvasRef = useRef<GraphCanvasHandle>(null)

  // ── load graph ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadGraph()
      .then(setGraph)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // ── cloud mindmap list (scratch-pad mode) ──────────────────────────────

  const refreshMindmapList = useCallback(() => {
    if (onDataChange) return  // doc mode: no cloud list needed
    listMindmaps().then(setSavedMindmaps).catch(console.error)
  }, [onDataChange])

  useEffect(() => { refreshMindmapList() }, [refreshMindmapList])

  const handleSaveMindmap = useCallback(() => {
    const title = savingMindmapName.trim()
    if (!title || !graph) return
    const docData = serializeMindmap({
      rootNodeId, activeEdgeIds, hiddenNodeIds, lockedNodes,
      fadedNodeIds, extraNodeIds, nodePositions: nodePositions.current, manualEdges,
    }, graph)
    saveMindmap(title, docData)
      .then(summary => {
        setSavedMindmaps(prev => [summary, ...prev])
        setSavingMindmapName('')
        setShowSaveName(false)
      })
      .catch(console.error)
  }, [savingMindmapName, graph, rootNodeId, activeEdgeIds, hiddenNodeIds, lockedNodes, fadedNodeIds, extraNodeIds, manualEdges])

  const handleLoadMindmap = useCallback((id: string) => {
    if (!graph) return
    getMindmapData(id)
      .then(docData => {
        const s = deserializeMindmap(docData)
        nodePositions.current = s.nodePositions
        setRootNodeId(s.rootNodeId && graph.hasNode(s.rootNodeId) ? s.rootNodeId : null)
        setExtraNodeIds(new Set([...s.extraNodeIds].filter(nid => graph.hasNode(nid))))
        setFadedNodeIds(new Set([...s.fadedNodeIds].filter(nid => graph.hasNode(nid))))
        setActiveEdgeIds(new Set([...s.activeEdgeIds].filter(eid => graph.hasEdge(eid))))
        setHiddenNodeIds(new Set([...s.hiddenNodeIds].filter(nid => graph.hasNode(nid))))
        setLockedNodes(new Set([...s.lockedNodes].filter(nid => graph.hasNode(nid))))
        setManualEdges(s.manualEdges)
        setLayoutVersion(v => v + 1)
        setShowMindmapList(false)
      })
      .catch(console.error)
  }, [graph])

  const handleDeleteMindmap = useCallback((id: string) => {
    deleteMindmap(id)
      .then(() => setSavedMindmaps(prev => prev.filter(m => m.id !== id)))
      .catch(console.error)
  }, [])

  // ── restore persisted state after graph loads ───────────────────────────

  useEffect(() => {
    if (!graph || restoredRef.current) return
    restoredRef.current = true

    if (initialData) {
      // Doc mode: restore from Supabase DocumentData
      const s = deserializeMindmap(initialData)
      nodePositions.current = s.nodePositions
      if (s.rootNodeId && graph.hasNode(s.rootNodeId)) setRootNodeId(s.rootNodeId)
      setExtraNodeIds(new Set([...s.extraNodeIds].filter(id => graph.hasNode(id))))
      setFadedNodeIds(new Set([...s.fadedNodeIds].filter(id => graph.hasNode(id))))
      setActiveEdgeIds(new Set([...s.activeEdgeIds].filter(id => graph.hasEdge(id))))
      setHiddenNodeIds(new Set([...s.hiddenNodeIds].filter(id => graph.hasNode(id))))
      setLockedNodes(new Set([...s.lockedNodes].filter(id => graph.hasNode(id))))
      if (s.manualEdges.length > 0) setManualEdges(s.manualEdges)
      return
    }

    // Scratch-pad mode: restore from localStorage / URL hash
    const saved = loadFromStorage()
    if (!saved) return
    nodePositions.current = new Map(
      saved.positions.map(([id, x, y]) => [id, { x, y }])
    )
    if (saved.root && graph.hasNode(saved.root)) setRootNodeId(saved.root)
    const validExtra = (saved.extra ?? []).filter(id => graph.hasNode(id))
    if (validExtra.length > 0) setExtraNodeIds(new Set(validExtra))
    const validFaded = (saved.faded ?? []).filter(id => graph.hasNode(id))
    if (validFaded.length > 0) setFadedNodeIds(new Set(validFaded))
    setActiveEdgeIds(new Set(saved.active.filter(id => graph.hasEdge(id))))
    setHiddenNodeIds(new Set(saved.hidden.filter(id => graph.hasNode(id))))
    setLockedNodes(new Set(saved.locked.filter(id => graph.hasNode(id))))
    if ((saved.manualEdges ?? []).length > 0) setManualEdges(saved.manualEdges)
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── persist on state change ─────────────────────────────────────────────

  useEffect(() => {
    if (onDataChange) return  // doc mode: DocPage handles persistence
    if (!rootNodeId && extraNodeIds.size === 0) return
    saveToStorage({
      root: rootNodeId,
      extra: [...extraNodeIds],
      faded: [...fadedNodeIds],
      active: [...activeEdgeIds],
      hidden: [...hiddenNodeIds],
      locked: [...lockedNodes],
      positions: [...nodePositions.current.entries()].map(([id, p]) => [id, p.x, p.y]),
      manualEdges,
    })
  }, [onDataChange, rootNodeId, extraNodeIds, fadedNodeIds, activeEdgeIds, hiddenNodeIds, lockedNodes, manualEdges])

  // ── emit DocumentData changes to parent (doc mode only) ─────────────────

  useEffect(() => {
    if (!graph || !onDataChange) return
    onDataChange(serializeMindmap({
      rootNodeId, activeEdgeIds, hiddenNodeIds, lockedNodes,
      fadedNodeIds, extraNodeIds, nodePositions: nodePositions.current, manualEdges,
    }, graph))
  }, [graph, onDataChange, rootNodeId, activeEdgeIds, hiddenNodeIds, lockedNodes, fadedNodeIds, extraNodeIds, manualEdges, layoutVersion])

  // ── parent-child maps ──────────────────────────────────────────────────

  const { childrenByParentId, parentByChildId } = useMemo(() => {
    const childrenByParentId = new Map<string, string[]>()
    const parentByChildId = new Map<string, string>()
    if (!graph) return { childrenByParentId, parentByChildId }
    const extToId = new Map<string, string>()
    graph.forEachNode((id, attrs) => extToId.set((attrs as NodeAttrs).external_id, id))
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      if (a.parent_external_id) {
        const parentId = extToId.get(a.parent_external_id)
        if (parentId) {
          parentByChildId.set(id, parentId)
          const list = childrenByParentId.get(parentId) ?? []
          list.push(id)
          childrenByParentId.set(parentId, list)
        }
      }
    })
    return { childrenByParentId, parentByChildId }
  }, [graph])

  // ── derived state ───────────────────────────────────────────────────────

  const visibleNodeIds = useMemo(() => {
    if (!graph) return new Set<string>()
    const base = rootNodeId
      ? deriveVisibleNodes(rootNodeId, activeEdgeIds, hiddenNodeIds, graph)
      : new Set<string>()
    for (const id of extraNodeIds) {
      if (graph.hasNode(id) && !hiddenNodeIds.has(id)) base.add(id)
    }
    // Invariante: se um filho está visível, seu pai também deve estar (para renderizar o group card)
    for (const id of [...base]) {
      const parentId = parentByChildId.get(id)
      if (parentId && !hiddenNodeIds.has(parentId)) base.add(parentId)
    }
    return base
  }, [graph, rootNodeId, activeEdgeIds, hiddenNodeIds, extraNodeIds, parentByChildId])

  // ── actions ─────────────────────────────────────────────────────────────

  const startAt = useCallback((nodeId: string) => {
    if (!graph) return
    // Se for um filho, resolver para o pai (group card)
    const resolvedId = resolveToParent(nodeId, parentByChildId)
    nodeId = resolvedId
    nodePositions.current.clear()
    nodePositions.current.set(nodeId, { x: 0, y: 0 })
    revealedBy.current.clear()
    setRootNodeId(nodeId)
    setActiveEdgeIds(new Set())
    setHiddenNodeIds(new Set())
    setLockedNodes(new Set())
    setFadedNodeIds(new Set())
    setExtraNodeIds(new Set())
    setSelectedNodeId(nodeId)
    setPanelOpen(true)

    const attrs = graph.getNodeAttributes(nodeId) as NodeAttrs
    if (attrs.node_type === 'system') {
      const edgesToActivate: string[] = []
      const seenTargets = new Set<string>()
      graph.forEachOutEdge(nodeId, (edgeId, eAttrs) => {
        const ea = eAttrs as EdgeAttrs
        if (ea.edge_type === 'counter') return
        if (ea.result_type === 'failure' || ea.result_type === 'counter') return
        edgesToActivate.push(edgeId)
      })
      const n = edgesToActivate.length
      const radius = Math.max(380, (n * 260) / (2 * Math.PI))
      edgesToActivate.forEach((edgeId, i) => {
        const tgt = graph.target(edgeId)
        if (seenTargets.has(tgt)) return
        seenTargets.add(tgt)
        const angle = (2 * Math.PI * i) / n - Math.PI / 2
        nodePositions.current.set(tgt, {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius),
        })
        revealedBy.current.set(tgt, nodeId)
      })
      nodePositions.current.delete(nodeId)
      setHiddenNodeIds(new Set([nodeId]))
      setActiveEdgeIds(new Set(edgesToActivate))
    } else {
      setActiveEdgeIds(new Set())
    }
  }, [graph])

  const openFlowAsMindmap = useCallback((rootId: string, activeEdges: Set<string>, extraNodes: Set<string>, flowManualEdges: ManualEdge[] = []) => {
    nodePositions.current.clear()
    revealedBy.current.clear()
    setRootNodeId(rootId)
    setActiveEdgeIds(activeEdges)
    setExtraNodeIds(extraNodes)
    setHiddenNodeIds(new Set())
    setLockedNodes(new Set())
    setFadedNodeIds(new Set())
    setManualEdges(flowManualEdges)
    setSelectedNodeId(null)
    setPanelOpen(false)
    setViewMode('completo')
    setAppMode('mapa')
  }, [])

  const addNodeToCanvas = useCallback((nodeId: string) => {
    // Se for um filho, adicionar o pai (que exibe ambos os filhos como group card)
    nodeId = resolveToParent(nodeId, parentByChildId)
    if (!graph || !graph.hasNode(nodeId)) return
    if (!nodePositions.current.has(nodeId)) {
      const positions = [...nodePositions.current.values()]
      const x = positions.length > 0 ? Math.max(...positions.map(p => p.x)) + 350 : 0
      const y = positions.length > 0 ? Math.round(positions.reduce((s, p) => s + p.y, 0) / positions.length) : 0
      nodePositions.current.set(nodeId, { x, y })
    }
    setExtraNodeIds(prev => new Set([...prev, nodeId]))
  }, [graph])

  const autoLayout = useCallback(() => {
    if (!graph) return

    const hiddenChildren = new Set<string>()
    for (const nodeId of visibleNodeIds) {
      for (const cid of (childrenByParentId.get(nodeId) ?? [])) {
        if (!childrenByParentId.has(cid)) hiddenChildren.add(cid)
      }
    }

    const renderedNodes = [...visibleNodeIds].filter((id) => !hiddenChildren.has(id))
    if (renderedNodes.length === 0) return

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 130, marginx: 40, marginy: 40 })

    const estimateH = (nodeId: string): number => {
      const childIds = childrenByParentId.get(nodeId)
      if (childIds) {
        const children = childIds.filter(cid => !childrenByParentId.has(cid))
        const n = showOnlyActiveChildren
          ? children.filter(cid => graph.edges(cid).some(eid => {
              if (activeEdgeIds.has(eid)) return true
              const other = graph.source(eid) === cid ? graph.target(eid) : graph.source(eid)
              return visibleNodeIds.has(other)
            })).length
          : children.length
        return 80 + Math.max(n, 1) * 52
      }
      return 80
    }

    for (const id of renderedNodes) {
      g.setNode(id, { width: 260, height: estimateH(id) })
    }

    const renderedSet = new Set(renderedNodes)
    activeEdgeIds.forEach((eid) => {
      if (!graph.hasEdge(eid)) return
      const src = graph.source(eid)
      const tgt = graph.target(eid)
      const s = hiddenChildren.has(src) ? (parentByChildId.get(src) ?? src) : src
      const dst = hiddenChildren.has(tgt) ? (parentByChildId.get(tgt) ?? tgt) : tgt
      if (s !== dst && renderedSet.has(s) && renderedSet.has(dst)) g.setEdge(s, dst)
    })

    dagre.layout(g)

    for (const id of g.nodes()) {
      if (lockedNodes.has(id)) continue
      const { x, y, width, height } = g.node(id)
      nodePositions.current.set(id, { x: x - width / 2, y: y - height / 2 })
    }

    setLayoutVersion((v) => v + 1)
  }, [graph, visibleNodeIds, activeEdgeIds, childrenByParentId, parentByChildId, showOnlyActiveChildren, lockedNodes])

  const activateEdge = useCallback((edgeId: string, targetNodeId: string) => {
    if (!graph) return
    if (!nodePositions.current.has(targetNodeId)) {
      const edgeSrc = graph.source(edgeId)
      const parentNodeId = nodePositions.current.has(edgeSrc)
        ? edgeSrc
        : graph.target(edgeId)
      const parentPos = nodePositions.current.get(parentNodeId) ?? { x: 0, y: 0 }
      const grandparentId = revealedBy.current.get(parentNodeId)
      const grandparentPos = grandparentId ? nodePositions.current.get(grandparentId) : null

      const siblings = graph.edges(parentNodeId).filter((eid) => {
        const other = graph.source(eid) === parentNodeId
          ? graph.target(eid) : graph.source(eid)
        return !nodePositions.current.has(other)
      })
      const sibIdx = Math.max(siblings.indexOf(edgeId), 0)
      const sibCount = Math.max(siblings.length, 1)

      const pos = seedPosition(parentPos, grandparentPos ?? null, sibIdx, sibCount)
      nodePositions.current.set(targetNodeId, pos)
      revealedBy.current.set(targetNodeId, parentNodeId)
    }

    setHiddenNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(targetNodeId)
      return next
    })
    setActiveEdgeIds((prev) => new Set(prev).add(edgeId))
  }, [graph])

  const deactivateEdge = useCallback((edgeId: string) => {
    if (!graph) return
    const next = new Set(activeEdgeIds)
    next.delete(edgeId)
    const toHide = conservativeCollapse(visibleNodeIds, next, rootNodeId, graph, extraNodeIds)
    setActiveEdgeIds(next)
    if (toHide.size > 0) {
      setHiddenNodeIds((prev) => {
        const h = new Set(prev)
        toHide.forEach((id) => h.add(id))
        return h
      })
    }
  }, [graph, rootNodeId, activeEdgeIds, visibleNodeIds, extraNodeIds])

  const hideNode = useCallback((nodeId: string) => {
    if (!graph || nodeId === rootNodeId) return
    setHiddenNodeIds((prev) => {
      const next = new Set(prev)
      next.add(nodeId)
      // Hide leaf children so the parent-invariant doesn't re-add this node to visibleNodeIds
      for (const cid of (childrenByParentId.get(nodeId) ?? [])) {
        if (!childrenByParentId.has(cid)) next.add(cid)
      }
      if (rootNodeId) {
        const nowVisible = deriveVisibleNodes(rootNodeId, activeEdgeIds, next, graph)
        const orphans = conservativeCollapse(nowVisible, activeEdgeIds, rootNodeId, graph, extraNodeIds)
        orphans.forEach((id) => next.add(id))
      }
      return next
    })
    if (selectedNodeId === nodeId) { setSelectedNodeId(null); setPanelOpen(false) }
  }, [graph, rootNodeId, activeEdgeIds, selectedNodeId, extraNodeIds, childrenByParentId])

  const restoreNode = useCallback((nodeId: string) => {
    setHiddenNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
  }, [])

  const handleNodeDragMove = useCallback((nodeId: string, pos: { x: number; y: number }) => {
    nodePositions.current.set(nodeId, pos)
  }, [])

  const handleNodeDragEnd = useCallback((nodeId: string, pos: { x: number; y: number }) => {
    nodePositions.current.set(nodeId, pos)
    setLockedNodes((prev) => new Set(prev).add(nodeId))
  }, [])

  const handleNodeClick = useCallback((nodeId: string) => {
    setCtxMenu(null)
    setSelectedNodeId(nodeId)
    setPanelOpen(true)
  }, [])

  const handleNodeRightClick = useCallback((nodeId: string, x: number, y: number) => {
    setCtxMenu({ nodeId, x, y })
  }, [])

  const disableNode = useCallback((nodeId: string) => {
    if (!graph) return
    setFadedNodeIds((prev) => {
      const next = new Set(prev)
      const queue = [nodeId]
      while (queue.length) {
        const curr = queue.pop()!
        if (next.has(curr) && curr !== nodeId) continue
        next.add(curr)
        graph.forEachOutEdge(curr, (eid, _a, _s, tgt) => {
          if (activeEdgeIds.has(eid) && !next.has(tgt)) queue.push(tgt)
        })
      }
      return next
    })
  }, [graph, activeEdgeIds])

  const enableNode = useCallback((nodeId: string) => {
    setFadedNodeIds((prev) => {
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
  }, [])

  const handleEdgeClick = useCallback((edgeId: string) => {
    if (edgeId.startsWith('flow-manual-')) {
      // Arestas derivadas do fluxo: toggle latente em vez de remover
      setManualEdges(prev => prev.map(e => e.id === edgeId ? { ...e, latent: !e.latent } : e))
      return
    }
    if (edgeId.startsWith('manual-')) {
      setManualEdges(prev => prev.filter(e => e.id !== edgeId))
      return
    }
    if (!graph) return

    if (edgeId.startsWith('flat:')) {
      const [, inEdgeId, outEdgeId] = edgeId.split(':')
      const bothActive = activeEdgeIds.has(inEdgeId) && activeEdgeIds.has(outEdgeId)
      if (bothActive) {
        const next = new Set(activeEdgeIds)
        next.delete(inEdgeId)
        next.delete(outEdgeId)
        const toHide = conservativeCollapse(visibleNodeIds, next, rootNodeId, graph, extraNodeIds)
        setActiveEdgeIds(next)
        setHiddenNodeIds((prev) => {
          const h = new Set(prev)
          toHide.forEach((id) => h.add(id))
          return h
        })
      } else {
        activateEdge(inEdgeId, graph.target(inEdgeId))
        activateEdge(outEdgeId, graph.target(outEdgeId))
      }
      return
    }

    if (activeEdgeIds.has(edgeId)) {
      deactivateEdge(edgeId)
    } else {
      const tgt = graph.target(edgeId)
      activateEdge(edgeId, tgt)
      if (viewMode === 'simples' && graph.hasNode(tgt)) {
        const attrs = graph.getNodeAttributes(tgt) as NodeAttrs
        if (attrs.node_type === 'transition') {
          graph.forEachOutEdge(tgt, (outEdgeId, outEAttrs, _s, dstId) => {
            if ((outEAttrs as EdgeAttrs).result_type === 'success') activateEdge(outEdgeId, dstId)
          })
        }
      }
    }
  }, [graph, rootNodeId, activeEdgeIds, visibleNodeIds, extraNodeIds, activateEdge, deactivateEdge, viewMode])

  const onActivateEdge = useCallback((edgeId: string, nodeId: string) => {
    activateEdge(edgeId, nodeId)
    if (viewMode !== 'simples' || !graph) return
    const attrs = graph.hasNode(nodeId) ? (graph.getNodeAttributes(nodeId) as NodeAttrs) : null
    if (attrs?.node_type !== 'transition') return
    graph.forEachOutEdge(nodeId, (outEdgeId, outEAttrs, _s, dstId) => {
      if ((outEAttrs as EdgeAttrs).result_type === 'success') activateEdge(outEdgeId, dstId)
    })
  }, [viewMode, graph, activateEdge])

  const handleConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setManualEdges(prev => [
      ...prev,
      {
        id,
        source: conn.source!,
        target: conn.target!,
        sourceHandle: conn.sourceHandle ?? undefined,
        targetHandle: conn.targetHandle ?? undefined,
      },
    ])
  }, [])

  // ── cytoscape element lists ─────────────────────────────────────────────

  const { cyNodes, cyEdges } = useMemo(() => {
    if (!graph) return { cyNodes: [] as CyNodeDef[], cyEdges: [] as CyEdgeDef[] }
    const cyNodes: CyNodeDef[] = []
    const cyEdges: CyEdgeDef[] = []

    if (viewMode === 'tudo') {
      const typeOrder: Record<string, number> = { position: 0, submission: 1, transition: 2 }
      const all: Array<{ id: string; a: NodeAttrs }> = []
      graph.forEachNode((id, attrs) => all.push({ id, a: attrs as NodeAttrs }))
      all.sort((x, y) => (typeOrder[x.a.node_type] ?? 3) - (typeOrder[y.a.node_type] ?? 3))

      const COLS = 42
      all.forEach(({ id, a }, i) => {
        cyNodes.push({
          id, label: nodeName(a, lang), nodeType: a.node_type,
          x: (i % COLS) * 190,
          y: Math.floor(i / COLS) * 90,
          locked: false,
        })
      })

      graph.forEachEdge((id, attrs, src, tgt) => {
        const ea = attrs as EdgeAttrs
        if (ea.edge_type === 'counter') return
        if (ea.result_type === 'failure' || ea.result_type === 'counter') return
        cyEdges.push({ id, source: src, target: tgt, state: 'active', edgeLabel: '', isSubmission: ea.is_submission, edgeType: ea.edge_type })
      })

      return { cyNodes, cyEdges }
    }

    if (viewMode === 'simples') {
      const addedNodes = new Map<string, { name: string; nodeType: string; pos: { x: number; y: number } }>()
      const latentDstsBySrc = new Map<string, Array<{ id: string; name: string; nodeType: string }>>()

      for (const srcId of visibleNodeIds) {
        if (!graph.hasNode(srcId)) continue
        const srcA = graph.getNodeAttributes(srcId) as NodeAttrs
        if (srcA.node_type === 'transition') continue
        if (hiddenNodeIds.has(srcId)) continue
        const srcPos = nodePositions.current.get(srcId) ?? { x: 0, y: 0 }
        addedNodes.set(srcId, { name: nodeName(srcA, lang), nodeType: srcA.node_type, pos: srcPos })

        graph.forEachOutEdge(srcId, (inEdgeId, inEAttrs, _s, transId) => {
          const ie = inEAttrs as EdgeAttrs
          if (ie.edge_type === 'counter' || ie.result_type === 'failure' || ie.result_type === 'counter') return
          if (!graph.hasNode(transId)) return
          const ta = graph.getNodeAttributes(transId) as NodeAttrs
          if (ta.node_type !== 'transition') return

          const inActive = activeEdgeIds.has(inEdgeId)

          graph.forEachOutEdge(transId, (outEdgeId, outEAttrs, _s2, dstId) => {
            const oe = outEAttrs as EdgeAttrs
            if (oe.result_type !== 'success') return
            if (!graph.hasNode(dstId)) return
            if (hiddenNodeIds.has(dstId)) return
            const da = graph.getNodeAttributes(dstId) as NodeAttrs
            if (da.node_type === 'transition') return

            const bothActive = inActive && activeEdgeIds.has(outEdgeId)
            const dstPos = nodePositions.current.get(dstId)

            if (!addedNodes.has(dstId)) {
              if (dstPos) {
                addedNodes.set(dstId, { name: nodeName(da, lang), nodeType: da.node_type, pos: dstPos })
              } else {
                const list = latentDstsBySrc.get(srcId) ?? []
                if (!list.find((x) => x.id === dstId)) list.push({ id: dstId, name: nodeName(da, lang), nodeType: da.node_type })
                latentDstsBySrc.set(srcId, list)
              }
            }

            cyEdges.push({
              id: `flat:${inEdgeId}:${outEdgeId}`,
              source: srcId, target: dstId,
              state: bothActive ? 'active' : 'latent',
              edgeLabel: nodeName(ta, lang),
              isSubmission: oe.is_submission,
            })
          })
        })
      }

      for (const [srcId, dsts] of latentDstsBySrc) {
        const srcPos = nodePositions.current.get(srcId) ?? { x: 0, y: 0 }
        const gpId = revealedBy.current.get(srcId)
        const gpPos = gpId ? (nodePositions.current.get(gpId) ?? null) : null
        dsts.forEach(({ id, name, nodeType }, i) => {
          if (addedNodes.has(id)) return
          const pos = seedPosition(srcPos, gpPos, i, dsts.length)
          addedNodes.set(id, { name, nodeType, pos })
        })
      }

      for (const [nodeId, { name, nodeType, pos }] of addedNodes) {
        cyNodes.push({ id: nodeId, label: name, nodeType, x: pos.x, y: pos.y, locked: lockedNodes.has(nodeId) })
      }

      const seenFlatIds = new Set<string>()
      return {
        cyNodes,
        cyEdges: cyEdges.filter((e) => {
          if (seenFlatIds.has(e.id)) return false
          if (!addedNodes.has(e.source) || !addedNodes.has(e.target)) return false
          seenFlatIds.add(e.id)
          return true
        }),
      }
    }

    // Completo mode
    const hiddenChildren = new Set<string>()
    for (const nodeId of visibleNodeIds) {
      for (const cid of (childrenByParentId.get(nodeId) ?? [])) {
        if (!childrenByParentId.has(cid)) hiddenChildren.add(cid)
      }
    }

    const rerouteId = (id: string): string =>
      hiddenChildren.has(id) ? (parentByChildId.get(id) ?? id) : id

    const effectiveVisForLatent = new Set(visibleNodeIds)
    hiddenChildren.forEach((cid) => effectiveVisForLatent.add(cid))
    const effectiveLatent = deriveLatentEdges(effectiveVisForLatent, activeEdgeIds, graph)

    const renderedNodeIds = new Set<string>()
    for (const nodeId of visibleNodeIds) {
      if (!hiddenChildren.has(nodeId)) renderedNodeIds.add(nodeId)
    }

    for (const nodeId of renderedNodeIds) {
      if (!graph.hasNode(nodeId)) continue
      const a = graph.getNodeAttributes(nodeId) as NodeAttrs
      const pos = nodePositions.current.get(nodeId) ?? { x: 0, y: 0 }
      const childIds = childrenByParentId.get(nodeId)
      const isGroup = childIds !== undefined
      cyNodes.push({
        id: nodeId, label: nodeName(a, lang), nodeType: a.node_type,
        x: pos.x, y: pos.y, locked: lockedNodes.has(nodeId),
        isGroupCollapsed: isGroup,
        hasChildren: isGroup,
        childrenSummary: isGroup
          ? childIds!
              .filter((cid) => !childrenByParentId.has(cid))
              .filter((cid) => {
                if (!showOnlyActiveChildren) return true
                if (graph.edges(cid).some(eid => activeEdgeIds.has(eid))) return true
                // Also consider manual edges (flow-derived and user-created) that connect via child handles
                return manualEdges.some(e =>
                  (e.source === nodeId && e.sourceHandle?.startsWith(`child-${cid}-`)) ||
                  (e.target === nodeId && e.targetHandle === `child-${cid}-in`)
                )
              })
              .map((cid) => {
                const ca = graph.getNodeAttributes(cid) as NodeAttrs
                return { id: cid, label: nodeName(ca, lang), nodeType: ca.node_type }
              })
          : undefined,
      })
    }

    const addEdge = (edgeId: string, state: 'active' | 'latent') => {
      if (!graph.hasEdge(edgeId)) return
      const ea = graph.getEdgeAttributes(edgeId) as EdgeAttrs
      if (ea.edge_type === 'counter') return
      if (ea.result_type === 'counter') return
      const rawSrc = graph.source(edgeId)
      const rawTgt = graph.target(edgeId)
      const srcNodeType = graph.hasNode(rawSrc) ? (graph.getNodeAttributes(rawSrc) as NodeAttrs).node_type : null
      // Transitions AND submissions can have failure outgoing edges
      const srcIsTechNode = srcNodeType === 'transition' || srcNodeType === 'submission'
      if (ea.result_type === 'failure' && !srcIsTechNode) return
      const src = rerouteId(rawSrc)
      const tgt = rerouteId(rawTgt)
      if (src === tgt) return
      if (!renderedNodeIds.has(src) && !hiddenChildren.has(rawSrc)) return
      if (!renderedNodeIds.has(tgt) && !hiddenChildren.has(rawTgt)) return

      // Source handle: child mini-card handles or named tech-node handles
      let sourceHandle: string | undefined
      if (hiddenChildren.has(rawSrc)) {
        if (srcNodeType === 'submission') {
          sourceHandle = ea.result_type === 'failure' ? `child-${rawSrc}-falha` : `child-${rawSrc}-sucesso`
        } else {
          sourceHandle = `child-${rawSrc}-out`
        }
      } else if (srcIsTechNode) {
        sourceHandle = ea.result_type === 'failure' ? 'falha' : 'sucesso'
      }

      // Target handle: child mini-card handles or named "antes" for tech/position nodes
      let targetHandle: string | undefined
      if (hiddenChildren.has(rawTgt)) {
        targetHandle = `child-${rawTgt}-in`
      } else if (graph.hasNode(rawTgt)) {
        const tgtNodeType = (graph.getNodeAttributes(rawTgt) as NodeAttrs).node_type
        if (tgtNodeType === 'transition' || tgtNodeType === 'submission' || tgtNodeType === 'position') {
          targetHandle = 'antes'
        }
      }

      cyEdges.push({ id: edgeId, source: src, target: tgt, state, edgeLabel: '', isSubmission: ea.is_submission, edgeType: ea.edge_type, sourceHandle, targetHandle })
    }

    activeEdgeIds.forEach((eid) => addEdge(eid, 'active'))
    effectiveLatent.forEach((eid) => addEdge(eid, 'latent'))

    const seenEdgeKeys = new Set<string>()
    return {
      cyNodes,
      cyEdges: cyEdges.filter((e) => {
        const key = `${e.source}|${e.sourceHandle ?? ''}→${e.target}|${e.targetHandle ?? ''}`
        if (seenEdgeKeys.has(key)) return false
        seenEdgeKeys.add(key)
        return true
      }),
    }
  }, [
    graph, viewMode, visibleNodeIds, activeEdgeIds, hiddenNodeIds, lockedNodes, lang,
    childrenByParentId, parentByChildId, showOnlyActiveChildren, layoutVersion, manualEdges,
  ])

  // ── merge manual edges ─────────────────────────────────────────────────

  const cyEdgesAll = useMemo<CyEdgeDef[]>(() => {
    if (manualEdges.length === 0) return cyEdges
    const renderedIds = new Set(cyNodes.map(n => n.id))
    const validManual = manualEdges.filter(e => renderedIds.has(e.source) && renderedIds.has(e.target))
    if (validManual.length === 0) return cyEdges
    return [
      ...cyEdges,
      ...validManual.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        state: (e.latent ? 'latent' : 'active') as 'active' | 'latent',
        edgeLabel: '',
        isSubmission: false,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        isManual: true,
      })),
    ]
  }, [cyEdges, cyNodes, manualEdges])

  // ── modal data ─────────────────────────────────────────────────────────

  const modalNode = useMemo(() => {
    if (!modalNodeId || !graph || !graph.hasNode(modalNodeId)) return null
    return graph.getNodeAttributes(modalNodeId) as NodeAttrs
  }, [modalNodeId, graph])

  // ── render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="splash">
        <div className="spinner" />
        <p>Carregando grafo BJJ…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="splash error">
        <p>Erro ao carregar:</p>
        <pre>{error}</pre>
      </div>
    )
  }

  return (
    <LangContext.Provider value={lang}>
    <div className="app-layout">
      <header className="topbar">
        {onDataChange ? (
          <button className="logo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }} onClick={() => navigate('/docs')}>
            ← Docs
          </button>
        ) : (
          <span className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>BJJ Cortex</span>
        )}
        {docTitle && <span className="doc-title-inline" style={{ pointerEvents: 'none' }}>{docTitle}</span>}

        {/* ── Central Master Navigation Links ─────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn-reset" onClick={() => navigate('/analytics')} style={{ color: '#60a5fa', borderColor: '#3b82f6' }}>
            📊 Analítica & Teia
          </button>
          <button className="btn-reset" onClick={() => navigate('/rotas')} style={{ color: '#34d399', borderColor: '#10b981' }}>
            🧭 Rotas BJJ
          </button>
          <button className="btn-reset" onClick={() => navigate('/grafo')}>
            🌐 Grafo BJJ
          </button>
          <button className="btn-reset" onClick={() => navigate('/ia')}>
            🧠 IA
          </button>
          <button className="btn-reset" onClick={() => navigate('/galeria')}>
            🌍 Galeria
          </button>
          <button className="btn-reset" onClick={() => navigate('/curador')} style={{ color: '#f59e0b' }}>
            ⚖️ Curadoria
          </button>
        </div>

        <div className="app-mode-toggle">
          <button
            className={`app-mode-btn${appMode === 'mapa' ? ' active' : ''}`}
            onClick={() => setAppMode('mapa')}
          >{t('app.mode_map', lang)}</button>
          <button
            className={`app-mode-btn${appMode === 'fluxo' ? ' active' : ''}`}
            onClick={() => setAppMode('fluxo')}
          >{t('app.mode_flow', lang)}</button>
          <button
            className={`app-mode-btn${appMode === 'admin' ? ' active' : ''}`}
            onClick={() => setAppMode('admin')}
          >Admin</button>
        </div>

        {appMode === 'mapa' && (
          <>
            {graph && (
              <span className="graph-stats">
                {graph.order} {lang === 'pt' ? 'nós' : 'nodes'} · {graph.size} {lang === 'pt' ? 'arestas' : 'edges'}
              </span>
            )}
            {rootNodeId && graph && (
              <span className="root-label">
                {t('app.root_label', lang)}: {nodeName(graph.getNodeAttributes(rootNodeId) as NodeAttrs, lang)}
              </span>
            )}
            <div className="template-toggle">
              <button
                className={`btn-template ${viewMode === 'completo' ? 'active' : ''}`}
                onClick={() => setViewMode('completo')}
              >{t('app.view_full', lang)}</button>
              <button
                className={`btn-template ${viewMode === 'simples' ? 'active' : ''}`}
                onClick={() => setViewMode('simples')}
              >{t('app.view_simple', lang)}</button>
              <button
                className={`btn-template ${viewMode === 'tudo' ? 'active' : ''}`}
                onClick={() => setViewMode('tudo')}
              >{t('app.view_all', lang)}</button>
            </div>
            <div className="template-toggle">
              <button
                className={`btn-template ${!showOnlyActiveChildren ? 'active' : ''}`}
                onClick={() => setShowOnlyActiveChildren(false)}
              >{t('app.children_all', lang)}</button>
              <button
                className={`btn-template ${showOnlyActiveChildren ? 'active' : ''}`}
                onClick={() => setShowOnlyActiveChildren(true)}
              >{t('app.children_active', lang)}</button>
            </div>
          </>
        )}
        {appMode === 'mapa' && rootNodeId && (
          <>
            <button className="btn-reset" onClick={autoLayout}>
              {t('app.auto_layout', lang)}
            </button>
            <button
              className="btn-reset"
              onClick={() => {
                if (!rootNodeId) return
                const rootPos = nodePositions.current.get(rootNodeId) ?? { x: 0, y: 0 }
                nodePositions.current.clear()
                nodePositions.current.set(rootNodeId, rootPos)
                revealedBy.current.clear()
                setActiveEdgeIds(new Set())
                setHiddenNodeIds(new Set())
                setLockedNodes(new Set())
                setExtraNodeIds(new Set())
                setSelectedNodeId(null)
                setPanelOpen(false)
              }}
            >
              {t('app.clear', lang)}
            </button>
            <button
              className="btn-reset"
              onClick={() => {
                setRootNodeId(null)
                setActiveEdgeIds(new Set())
                setHiddenNodeIds(new Set())
                setLockedNodes(new Set())
                setExtraNodeIds(new Set())
                setSelectedNodeId(null)
                setPanelOpen(false)
                nodePositions.current.clear()
                revealedBy.current.clear()
                restoredRef.current = false
                window.history.replaceState(null, '', window.location.pathname)
                localStorage.removeItem('bjj-explorer-v1')
                localStorage.removeItem('bjj-explorer-v2')
              }}
            >
              {t('app.reset_btn', lang)}
            </button>
          </>
        )}

        {appMode === 'mapa' && !onDataChange && (
          <>
            {showSaveName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  className="flow-meta-input compact"
                  placeholder="Nome do mapa…"
                  value={savingMindmapName}
                  onChange={e => setSavingMindmapName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveMindmap(); if (e.key === 'Escape') setShowSaveName(false) }}
                  autoFocus
                />
                <button className="btn-reset" onClick={handleSaveMindmap} disabled={!savingMindmapName.trim()}>✓</button>
                <button className="btn-reset" onClick={() => { setShowSaveName(false); setSavingMindmapName('') }}>✕</button>
              </div>
            ) : (
              <button className="btn-reset" onClick={() => setShowSaveName(true)}>
                ☁ Salvar
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button className="btn-reset" onClick={() => setShowMindmapList(s => !s)}>
                ☁ Mapas ({savedMindmaps.length})
              </button>
              {showMindmapList && (
                <div className="flow2-saved-dropdown">
                  {savedMindmaps.length === 0
                    ? <div className="flow2-saved-item"><span className="flow2-saved-name" style={{ color: 'var(--muted)' }}>Nenhum salvo</span></div>
                    : savedMindmaps.map(m => (
                      <div key={m.id} className="flow2-saved-item">
                        <span onClick={() => handleLoadMindmap(m.id)} className="flow2-saved-name">{m.title}</span>
                        <span className="flow2-saved-date">{new Date(m.updatedAt).toLocaleDateString('pt-BR')}</span>
                        <button className="flow2-saved-del" onClick={() => handleDeleteMindmap(m.id)}>✕</button>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </>
        )}

        <button
          className="lang-toggle"
          onClick={() => setLang(l => l === 'pt' ? 'en' : 'pt')}
        >
          {lang === 'pt' ? 'EN' : 'PT'}
        </button>
      </header>

      {appMode === 'mapa' && (
        <HiddenBar hiddenNodeIds={hiddenNodeIds} graph={graph} onRestore={restoreNode} />
      )}

      {appMode === 'fluxo' && (
        <FlowBuilder graph={graph} onOpenAsMindmap={openFlowAsMindmap} />
      )}

      {appMode === 'admin' && (
        <Admin />
      )}

      <div className="main-area" style={appMode === 'fluxo' || appMode === 'admin' ? { display: 'none' } : undefined}>
        <div className={`canvas-wrap ${panelOpen ? 'panel-visible' : ''}`}>
          <div className="canvas-search-float">
            <SearchBox
              graph={graph}
              onSelect={(id) => {
                if (rootNodeId === null && extraNodeIds.size === 0) startAt(id)
                else addNodeToCanvas(id)
              }}
            />
          </div>
          {!rootNodeId && extraNodeIds.size === 0 && viewMode !== 'tudo' ? (
            <div className="empty-hint">{t('app.empty_hint', lang)}</div>
          ) : (
            <FlowCanvas
              ref={canvasRef}
              nodes={cyNodes}
              edges={cyEdgesAll}
              selectedNodeId={selectedNodeId}
              highlightedNodeId={hoveredNodeId}
              highlightedEdgeId={hoveredEdgeId}
              rootNodeId={rootNodeId}
              layoutVersion={layoutVersion}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onNodeDragMove={handleNodeDragMove}
              onNodeDragEnd={handleNodeDragEnd}
              onHideNode={hideNode}
              onNodeRightClick={handleNodeRightClick}
              fadedNodeIds={fadedNodeIds}
              onBgClick={() => { setCtxMenu(null); setSelectedNodeId(null); setPanelOpen(false); setHoveredNodeId(null); setHoveredEdgeId(null) }}
              onConnect={handleConnect}
            />
          )}
        </div>

        {panelOpen && graph && (
          <div className="side-panel-wrap">
            <NodePanel
              nodeId={selectedNodeId}
              graph={graph}
              activeEdgeIds={activeEdgeIds}
              visibleNodeIds={visibleNodeIds}
              hiddenNodeIds={hiddenNodeIds}
              onClose={() => { setPanelOpen(false); setHoveredNodeId(null); setHoveredEdgeId(null) }}
              onActivateEdge={onActivateEdge}
              onDeactivateEdge={deactivateEdge}
              onHoverItem={(nid, eid) => { setHoveredNodeId(nid ?? null); setHoveredEdgeId(eid ?? null) }}
              onOpenModal={(nid) => setModalNodeId(nid)}
              onAddNode={addNodeToCanvas}
            />
            {selectedNodeId && selectedNodeId !== rootNodeId && (
              <button
                className="hide-node-btn"
                onClick={() => hideNode(selectedNodeId)}
              >
                {t('app.hide_node', lang)}
              </button>
            )}
          </div>
        )}
      </div>

      <DebugPanel graph={graph} />

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          {fadedNodeIds.has(ctxMenu.nodeId) ? (
            <button onClick={() => { enableNode(ctxMenu.nodeId); setCtxMenu(null) }}>
              {t('app.enable', lang)}
            </button>
          ) : (
            <button onClick={() => { disableNode(ctxMenu.nodeId); setCtxMenu(null) }}>
              {t('app.disable', lang)}
            </button>
          )}
          {ctxMenu.nodeId !== rootNodeId && (
            <button className="ctx-danger" onClick={() => { hideNode(ctxMenu.nodeId); setCtxMenu(null) }}>
              {t('app.delete', lang)}
            </button>
          )}
        </div>
      )}

      {modalNodeId && modalNode && (
        <Modal
          title={nodeName(modalNode, lang)}
          subtitle={modalNode.node_type === 'transition' || modalNode.node_type === 'submission'
            ? tNodeType(modalNode.node_type, lang)
            : undefined}
          description={modalNode.description}
          onClose={() => setModalNodeId(null)}
        />
      )}

    </div>
    </LangContext.Provider>
  )
}
