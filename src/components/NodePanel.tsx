import { useMemo, useState, useEffect } from 'react'
import { MultiDirectedGraph } from 'graphology'
import type { NodeAttrs, EdgeAttrs } from '../types'
import { tNodeType, useLang, t, nodeName } from '../lib/i18n'
import { supabase } from '../lib/supabase'

// ── types ─────────────────────────────────────────────────────────────────────

interface VideoRow {
  url: string
  title: string | null
  channel: string | null
  duration: string | null
  rank: number
}

interface PathItem {
  edgeId: string
  nodeId: string
  originalTargetId?: string // set when remapped to parent group
  nodeName: string
  nodeType: string
  edgeType: string
  resultType: string | null
  attemptPct: number | null
  successRate: number | null
  isSubmission: boolean
  status: 'active' | 'latent' | 'hidden' | 'unrevealed'
}

interface Props {
  nodeId: string | null
  graph: MultiDirectedGraph | null
  activeEdgeIds: Set<string>
  visibleNodeIds: Set<string>
  hiddenNodeIds: Set<string>
  onClose: () => void
  onActivateEdge: (edgeId: string, targetNodeId: string) => void
  onDeactivateEdge: (edgeId: string) => void
  onHoverItem: (nodeId: string | null, edgeId: string | null) => void
  onOpenModal: (nodeId: string) => void
  onAddNode: (nodeId: string) => void
}

// ── helpers ───────────────────────────────────────────────────────────────────

function itemStatus(
  edgeId: string,
  otherNodeId: string,
  activeEdgeIds: Set<string>,
  visibleNodeIds: Set<string>,
  hiddenNodeIds: Set<string>,
): PathItem['status'] {
  if (activeEdgeIds.has(edgeId)) return 'active'
  if (hiddenNodeIds.has(otherNodeId)) return 'hidden'
  if (visibleNodeIds.has(otherNodeId)) return 'latent'
  return 'unrevealed'
}

const STATUS_MARK: Record<PathItem['status'], string> = {
  active: '✓',
  latent: '◌',
  hidden: '↩',
  unrevealed: '+',
}
const STATUS_COLOR: Record<PathItem['status'], string> = {
  active: '#10b981',
  latent: '#d97706',
  hidden: '#6b7280',
  unrevealed: '#94a3b8',
}
const STATUS_PRIORITY: Record<PathItem['status'], number> = {
  active: 0, latent: 1, hidden: 2, unrevealed: 3,
}

// ── sub-components ────────────────────────────────────────────────────────────

function PathList({
  items,
  onHoverItem,
  onItemClick,
}: {
  items: PathItem[]
  onHoverItem: (nodeId: string | null, edgeId: string | null) => void
  onItemClick: (item: PathItem) => void
}) {
  if (items.length === 0) return null
  return (
    <ul className="path-list">
      {items.map((item) => (
        <li
          key={item.edgeId}
          className={`path-item status-${item.status}`}
          onMouseEnter={() => onHoverItem(item.nodeId, item.edgeId)}
          onMouseLeave={() => onHoverItem(null, null)}
          onClick={() => onItemClick(item)}
        >
          <span className="path-status" style={{ color: STATUS_COLOR[item.status] }}>
            {STATUS_MARK[item.status]}
          </span>
          <span className={`type-dot ${item.nodeType}`} />
          <span className="path-name">{item.nodeName}</span>
        </li>
      ))}
    </ul>
  )
}

function GroupedPathList({
  items,
  onHoverItem,
  onItemClick,
}: {
  items: PathItem[]
  onHoverItem: (nodeId: string | null, edgeId: string | null) => void
  onItemClick: (item: PathItem) => void
}) {
  if (items.length === 0) return null
  const TYPE_ORDER: Record<string, number> = { position: 0, transition: 1, submission: 2 }
  const TYPE_LABEL: Record<string, string> = {
    position: 'Posição', transition: 'Transição', submission: 'Finalização',
  }
  const sorted = [...items].sort((a, b) => {
    const td = (TYPE_ORDER[a.nodeType] ?? 3) - (TYPE_ORDER[b.nodeType] ?? 3)
    if (td !== 0) return td
    return (b.attemptPct ?? 0) - (a.attemptPct ?? 0)
  })
  const groups: Array<{ type: string; items: PathItem[] }> = []
  for (const item of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.type === item.nodeType) last.items.push(item)
    else groups.push({ type: item.nodeType, items: [item] })
  }
  const multiGroup = groups.length > 1
  return (
    <>
      {groups.map((g) => (
        <div key={g.type}>
          {multiGroup && (
            <div className="path-type-header">{TYPE_LABEL[g.type] ?? tNodeType(g.type, 'pt')}</div>
          )}
          <PathList items={g.items} onHoverItem={onHoverItem} onItemClick={onItemClick} />
        </div>
      ))}
    </>
  )
}

function VideoList({ videos }: { videos: VideoRow[] }) {
  if (videos.length === 0) return null
  return (
    <ul className="video-list">
      {videos.map((v) => (
        <li key={v.url} className="video-item">
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="video-title">
            {v.title ?? v.url}
          </a>
          {(v.channel || v.duration) && (
            <span className="video-meta">
              {v.channel}{v.channel && v.duration ? ' · ' : ''}{v.duration}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Section({
  title,
  count,
  children,
  emptyMsg,
}: {
  title: string
  count: number
  children?: React.ReactNode
  emptyMsg?: string
}) {
  return (
    <section className="panel-section">
      <h4>
        {title} <span className="section-count">({count})</span>
      </h4>
      {count === 0 ? (
        <p className="panel-empty">{emptyMsg ?? 'Nenhum'}</p>
      ) : (
        children
      )}
    </section>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function NodePanel({
  nodeId,
  graph,
  activeEdgeIds,
  visibleNodeIds,
  hiddenNodeIds,
  onClose,
  onActivateEdge,
  onDeactivateEdge,
  onHoverItem,
  onOpenModal,
  onAddNode,
}: Props) {
  const lang = useLang()

  const node = useMemo(() => {
    if (!nodeId || !graph || !graph.hasNode(nodeId)) return null
    return graph.getNodeAttributes(nodeId) as NodeAttrs
  }, [nodeId, graph])

  // Map: child node UUID → parent group UUID
  const childToParentId = useMemo(() => {
    const extToId = new Map<string, string>()
    const map = new Map<string, string>()
    if (!graph) return map
    graph.forEachNode((id, attrs) => extToId.set((attrs as NodeAttrs).external_id, id))
    graph.forEachNode((id, attrs) => {
      const a = attrs as NodeAttrs
      if (a.parent_external_id) {
        const parentId = extToId.get(a.parent_external_id)
        if (parentId) map.set(id, parentId)
      }
    })
    return map
  }, [graph])

  function buildItems(
    iterFn: (cb: (edgeId: string, eAttrs: object, src: string, tgt: string, sA: object, tA: object) => void) => void,
    useTarget: boolean, // true = target is "other", false = source is "other"
  ): PathItem[] {
    const raw: PathItem[] = []
    iterFn((edgeId, eAttrs, src, tgt, _sA, tA) => {
      const ea = eAttrs as EdgeAttrs
      if (ea.edge_type === 'counter') return
      if (ea.result_type === 'failure' || ea.result_type === 'counter') return
      const otherId = useTarget ? tgt : src
      const otherAttrsRaw = useTarget ? tA : _sA
      const parentId = childToParentId.get(otherId)
      const effectiveId = parentId ?? otherId
      const effectiveAttrs = parentId
        ? (graph!.getNodeAttributes(parentId) as NodeAttrs)
        : (otherAttrsRaw as NodeAttrs)
      raw.push({
        edgeId,
        nodeId: effectiveId,
        originalTargetId: parentId ? otherId : undefined,
        nodeName: nodeName(effectiveAttrs, lang),
        nodeType: effectiveAttrs.node_type,
        edgeType: ea.edge_type,
        resultType: ea.result_type,
        attemptPct: ea.attempt_pct,
        successRate: ea.success_rate,
        isSubmission: ea.is_submission,
        status: itemStatus(edgeId, otherId, activeEdgeIds, visibleNodeIds, hiddenNodeIds),
      })
    })
    // Deduplicate by effective nodeId — keep item with best status, then highest attemptPct
    const grouped = new Map<string, PathItem[]>()
    for (const item of raw) {
      const list = grouped.get(item.nodeId) ?? []
      list.push(item)
      grouped.set(item.nodeId, list)
    }
    const result: PathItem[] = []
    for (const candidates of grouped.values()) {
      candidates.sort((a, b) => {
        const sp = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
        return sp !== 0 ? sp : (b.attemptPct ?? 0) - (a.attemptPct ?? 0)
      })
      result.push(candidates[0])
    }
    return result
  }

  // Out-edges: current node → other
  const outItems = useMemo((): PathItem[] => {
    if (!nodeId || !graph) return []
    return buildItems(
      (cb) => graph.forEachOutEdge(nodeId, cb),
      true,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, graph, activeEdgeIds, visibleNodeIds, hiddenNodeIds, lang, childToParentId])

  // Success out-edges (for transition nodes)
  const successOutItems = useMemo(
    () => outItems.filter((item) => item.resultType === 'success'),
    [outItems],
  )

  // In-edges: other → current node
  const inItems = useMemo((): PathItem[] => {
    if (!nodeId || !graph) return []
    return buildItems(
      (cb) => graph.forEachInEdge(nodeId, cb),
      false,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, graph, activeEdgeIds, visibleNodeIds, hiddenNodeIds, lang, childToParentId])

  const [activeTab, setActiveTab] = useState<'ataque' | 'defesa'>('ataque')

  // Opponent node: same position from the other side (top↔bottom swap)
  const opponentNodeId = useMemo((): string | null => {
    if (!node?.external_id || !graph || node.node_type === 'transition') return null
    const extId = node.external_id
    let opponentExtId: string | null = null
    if (extId.endsWith('/bottom')) {
      opponentExtId = extId.slice(0, -7) + '/top'
    } else if (extId.endsWith('/top')) {
      opponentExtId = extId.slice(0, -4) + '/bottom'
    }
    if (!opponentExtId) return null
    let found: string | null = null
    graph.forEachNode((nId, attrs) => {
      if ((attrs as NodeAttrs).external_id === opponentExtId) found = nId
    })
    return found
  }, [node, graph])

  // Defesa: what the opponent can do from their mirror position
  const defesaItems = useMemo((): PathItem[] => {
    if (!opponentNodeId || !graph) return []
    return buildItems(
      (cb) => graph.forEachOutEdge(opponentNodeId, cb),
      true,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentNodeId, graph, lang, childToParentId, activeEdgeIds, visibleNodeIds, hiddenNodeIds])

  const [videosPt, setVideosPt] = useState<VideoRow[]>([])
  const [videosEn, setVideosEn] = useState<VideoRow[]>([])

  useEffect(() => {
    if (!nodeId) { setVideosPt([]); setVideosEn([]); return }
    supabase
      .from('source_node_videos')
      .select('url, title, channel, duration, lang, rank')
      .eq('node_id', nodeId)
      .order('rank')
      .then(({ data }) => {
        const rows = (data ?? []) as (VideoRow & { lang: string })[]
        setVideosPt(rows.filter((v) => v.lang === 'pt'))
        setVideosEn(rows.filter((v) => v.lang === 'en'))
      })
  }, [nodeId])

  if (!node || !nodeId) return null

  function handleItemClick(item: PathItem) {
    if (item.status === 'active') {
      onDeactivateEdge(item.edgeId)
    } else {
      onActivateEdge(item.edgeId, item.nodeId)
      if (item.originalTargetId) {
        onAddNode(item.nodeId) // add parent group to canvas
      }
    }
  }

  const isTransition = node.node_type === 'transition'

  return (
    <div className="node-panel">
      <div className="panel-header">
        <div className="panel-title-row">
          <span className={`type-badge ${node.node_type}`}>{tNodeType(node.node_type, lang)}</span>
          <span className="panel-title">{nodeName(node, lang)}</span>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {node.role && <div className="panel-meta">{t('panel.role', lang)}: <strong>{node.role}</strong></div>}
      {node.position_type && <div className="panel-meta">{t('panel.type', lang)}: <strong>{node.position_type}</strong></div>}
      {node.dominance_score != null && (
        <div className="panel-meta">{t('panel.dominance', lang)}: <strong>{node.dominance_score}</strong></div>
      )}
      {nodeId && (
        <button className="details-btn" onClick={() => onOpenModal(nodeId)}>
          {t('panel.see_desc', lang)}
        </button>
      )}

      {isTransition ? (
        <>
          <Section
            title={t('panel.available_from', lang)}
            count={inItems.length}
            emptyMsg={t('panel.none_origin', lang)}
          >
            <GroupedPathList items={inItems} onHoverItem={onHoverItem} onItemClick={handleItemClick} />
          </Section>

          <Section
            title={t('panel.dest_success', lang)}
            count={successOutItems.length}
            emptyMsg={t('panel.none_dest', lang)}
          >
            <GroupedPathList items={successOutItems} onHoverItem={onHoverItem} onItemClick={handleItemClick} />
          </Section>
        </>
      ) : (
        <>
          {opponentNodeId && (
            <div className="panel-tabs">
              <button
                className={`panel-tab${activeTab === 'ataque' ? ' active' : ''}`}
                onClick={() => setActiveTab('ataque')}
              >
                {t('panel.attack', lang)}
              </button>
              <button
                className={`panel-tab${activeTab === 'defesa' ? ' active' : ''}`}
                onClick={() => setActiveTab('defesa')}
              >
                {t('panel.defense', lang)}
              </button>
            </div>
          )}

          {activeTab === 'ataque' || !opponentNodeId ? (
            <>
              <Section
                title={t('panel.tech_from', lang)}
                count={outItems.length}
                emptyMsg={t('panel.none_tech', lang)}
              >
                <GroupedPathList items={outItems} onHoverItem={onHoverItem} onItemClick={handleItemClick} />
              </Section>

              <Section
                title={t('panel.how_to_get', lang)}
                count={inItems.length}
                emptyMsg={t('panel.none_pos', lang)}
              >
                <GroupedPathList items={inItems} onHoverItem={onHoverItem} onItemClick={handleItemClick} />
              </Section>
            </>
          ) : (
            <Section
              title={t('panel.opponent_tech', lang)}
              count={defesaItems.length}
              emptyMsg={t('panel.none_opponent', lang)}
            >
              <GroupedPathList items={defesaItems} onHoverItem={onHoverItem} onItemClick={() => {}} />
            </Section>
          )}
        </>
      )}
      {videosPt.length > 0 && (
        <section className="panel-section">
          <h4>{t('panel.videos', lang)} <span className="video-lang-tag">PT</span></h4>
          <VideoList videos={videosPt} />
        </section>
      )}

      {videosEn.length > 0 && (
        <section className="panel-section">
          <h4>{t('panel.videos', lang)} <span className="video-lang-tag">EN</span></h4>
          <VideoList videos={videosEn} />
        </section>
      )}
    </div>
  )
}
