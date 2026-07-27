import React, {
  memo, useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef,
} from 'react'
import {
  ReactFlow, ReactFlowProvider, ConnectionMode,
  Background, BackgroundVariant, Controls,
  Handle, Position,
  BaseEdge, EdgeLabelRenderer, MarkerType, getBezierPath,
  useNodesState, useEdgesState, useReactFlow, useStore,
  type Node, type Edge, type Connection, type NodeProps, type EdgeProps,
  type NodeTypes, type EdgeTypes, type InternalNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ─── exported types (same contract as GraphCanvas) ─────────────────────────

export interface ChildSummary {
  id: string; label: string; nodeType: string
}
export interface CyNodeDef {
  id: string; label: string; nodeType: string; x: number; y: number; locked: boolean
  isGroupCollapsed?: boolean
  hasChildren?: boolean
  childrenSummary?: ChildSummary[]
}
export interface CyEdgeDef {
  id: string; source: string; target: string
  state: 'active' | 'latent'; edgeLabel: string; isSubmission: boolean
  edgeType?: string
  sourceHandle?: string
  targetHandle?: string
  isManual?: boolean
}
export interface GraphCanvasHandle {
  fitToNode: (nodeId: string) => void
}

// ─── theme ────────────────────────────────────────────────────────────────

const dark = window.matchMedia('(prefers-color-scheme: dark)').matches

const C = dark ? {
  canvasBg: '#0d1117', dotColor: '#21262d',
  cardBg: '#161b22', cardBorder: '#30363d', cardBorderSelected: '#2E77FF',
  cardShadow: '0 2px 10px rgba(0,0,0,0.45)',
  titleText: '#e6edf3', typeText: '#6b7280',
  divider: '#21262d',
  miniCardBg: '#0d1117', miniCardBorder: '#21262d',
  outputLabel: '#94a3b8', outputBorder: '#21262d',
  edgeActive: '#6b7280', edgeLatent: '#d97706', edgeSubmission: '#ef4444', edgeSystem: '#7c3aed',
  highlight: '#2E77FF', highlightGlow: 'rgba(46,119,255,0.25)',
  muted: '#8b949e', mutedBg: '#21262d', closeColor: '#8b949e',
} : {
  canvasBg: '#F0F2F5', dotColor: '#d1d5db',
  cardBg: '#ffffff', cardBorder: '#E5E8ED', cardBorderSelected: '#2E77FF',
  cardShadow: '0 2px 8px rgba(0,0,0,0.06)',
  titleText: '#1F2937', typeText: '#9CA3AF',
  divider: '#F3F4F6',
  miniCardBg: '#F9FAFB', miniCardBorder: '#E5E8ED',
  outputLabel: '#374151', outputBorder: '#F3F4F6',
  edgeActive: '#94a3b8', edgeLatent: '#d97706', edgeSubmission: '#ef4444', edgeSystem: '#7c3aed',
  highlight: '#2E77FF', highlightGlow: 'rgba(46,119,255,0.12)',
  muted: '#64748b', mutedBg: '#e2e8f0', closeColor: '#94a3b8',
}

// icon color per node type
const ICON_COLOR: Record<string, string> = {
  position:   '#2E77FF',
  transition: '#8B5CF6',
  submission: '#EF4444',
  principle:  '#10B981',
  system:     '#7c3aed',
}
function iconColor(type: string) { return ICON_COLOR[type] ?? '#8B5CF6' }

// edge color helpers
function edgeColor(state: 'active' | 'latent', isSubmission: boolean, edgeType?: string): string {
  if (state === 'latent') return C.edgeLatent
  if (isSubmission) return C.edgeSubmission
  if (edgeType === 'part_of_system') return C.edgeSystem
  return C.edgeActive
}

// ─── node type icon ───────────────────────────────────────────────────────

function NodeIcon({ type, size = 12 }: { type: string; size?: number }) {
  const sw = size <= 10 ? 2.5 : 2
  const common = { stroke: '#fff', fill: 'none' as const, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (type === 'position') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
  if (type === 'submission') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
  if (type === 'principle') return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
    </svg>
  )
  // transition / system / default
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} {...common}>
      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )
}

// ─── BjjNode ─────────────────────────────────────────────────────────────

interface NodeOutput { id: string; label: string; active: boolean; isSubmission: boolean }

interface BjjNodeData extends Record<string, unknown> {
  label: string; nodeType: string
  isSelected: boolean; isHighlighted: boolean; isRoot: boolean; isFaded: boolean
  childrenSummary?: ChildSummary[]
  selectedChildId?: string | null
  onChildClick?: (id: string) => void
  onHide?: () => void
  onRightClick?: (x: number, y: number) => void
}

const H: React.CSSProperties = { opacity: 0, width: 6, height: 6 }

const BjjNode = memo(function BjjNode({ data }: NodeProps) {
  const d = data as BjjNodeData
  const [hov, setHov] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ic = iconColor(d.nodeType)
  const isGroup = (d.childrenSummary?.length ?? 0) > 0
  const sel = d.isSelected || d.isHighlighted

  const cardStyle: React.CSSProperties = {
    width: isGroup ? 268 : 240,
    background: C.cardBg,
    border: `${sel ? 2 : 1}px solid ${sel ? C.cardBorderSelected : C.cardBorder}`,
    borderRadius: 12,
    boxShadow: sel
      ? `0 0 0 4px ${C.highlightGlow}, ${C.cardShadow}`
      : C.cardShadow,
    opacity: d.isFaded ? 0.18 : 1,
    cursor: 'grab',
    position: 'relative',
    transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
    userSelect: 'none',
    overflow: 'visible',
    boxSizing: 'border-box',
  }

  return (
    <>
      <Handle type="target" position={Position.Left}   id="tl" style={H} />
      <Handle type="target" position={Position.Top}    id="tt" style={H} />
      <Handle type="target" position={Position.Right}  id="tr" style={H} />
      <Handle type="target" position={Position.Bottom} id="tb" style={H} />

      <div
        style={cardStyle}
        onMouseEnter={() => { if (leaveTimer.current) clearTimeout(leaveTimer.current); setHov(true) }}
        onMouseLeave={() => { leaveTimer.current = setTimeout(() => setHov(false), 150) }}
        onContextMenu={(e) => { e.preventDefault(); d.onRightClick?.(e.clientX, e.clientY) }}
      >
        {/* ── header ── */}
        <div style={{ padding: '12px 14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: ic,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <NodeIcon type={d.nodeType} size={12} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.typeText, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {d.nodeType}{isGroup ? ' · Grupo' : ''}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.titleText, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {d.label}
          </div>
        </div>

        {/* ── divider ── */}
        <div style={{ height: 1, background: C.divider, margin: '0 14px' }} />

        {/* ── transition border handles (antes/sucesso/falha) ── */}
        {d.nodeType === 'transition' && <>
          <Handle type="target" position={Position.Left} id="antes"
            style={{ top: '50%', left: -5, transform: 'translateY(-50%)',
              width: 10, height: 10,
              background: dark ? '#4b5563' : '#9CA3AF',
              border: `2px solid ${C.cardBg}`,
              boxShadow: `0 0 0 1px ${dark ? '#4b5563' : '#9CA3AF'}` }} />
          <Handle type="source" position={Position.Right} id="sucesso"
            style={{ top: '35%', right: -5, transform: 'translateY(-50%)',
              width: 10, height: 10,
              background: '#22c55e',
              border: `2px solid ${C.cardBg}`,
              boxShadow: '0 0 0 1px #22c55e' }} />
          <Handle type="source" position={Position.Right} id="falha"
            style={{ top: '65%', right: -5, transform: 'translateY(-50%)',
              width: 10, height: 10,
              background: '#ef4444',
              border: `2px solid ${C.cardBg}`,
              boxShadow: '0 0 0 1px #ef4444' }} />
        </>}

        {/* ── collapsed group mini-cards ── */}
        {isGroup && d.childrenSummary && d.childrenSummary.length > 0 && (
          <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.childrenSummary.map((child) => {
              const shortLabel = (child.label.startsWith(d.label)
                ? child.label.slice(d.label.length)
                : child.label).trim() || child.label
              const isChildSel = d.selectedChildId === child.id
              return (
                <div
                  key={child.id}
                  style={{
                    background: C.miniCardBg,
                    border: `${isChildSel ? 2 : 1}px solid ${isChildSel ? C.cardBorderSelected : C.miniCardBorder}`,
                    borderRadius: 8,
                    position: 'relative',
                    cursor: 'pointer',
                    boxShadow: isChildSel ? `0 0 0 3px ${C.highlightGlow}` : 'none',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); d.onChildClick?.(child.id) }}
                >
                  <Handle type="target" position={Position.Left} id={`child-${child.id}-in`}
                    style={{ top: '50%', left: -5, transform: 'translateY(-50%)',
                      width: 10, height: 10,
                      background: dark ? '#4b5563' : '#9CA3AF',
                      border: `2px solid ${C.cardBg}`,
                      boxShadow: `0 0 0 1px ${dark ? '#4b5563' : '#9CA3AF'}` }} />
                  <div style={{ padding: '9px 14px' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.titleText }}>{shortLabel}</span>
                  </div>
                  <Handle type="source" position={Position.Right} id={`child-${child.id}-out`}
                    style={{ top: '50%', right: -5, transform: 'translateY(-50%)',
                      width: 10, height: 10,
                      background: '#2E77FF',
                      border: `2px solid ${C.cardBg}`,
                      boxShadow: '0 0 0 1px #2E77FF' }} />
                </div>
              )
            })}
          </div>
        )}

        {/* ── × hide button ── */}
        {hov && d.onHide && (
          <button
            style={{
              position: 'absolute', top: -9, right: -9,
              width: 18, height: 18, borderRadius: '50%',
              background: C.mutedBg, border: `1.5px solid ${C.cardBorder}`,
              color: C.closeColor, cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            onPointerDown={(e) => { e.stopPropagation(); d.onHide?.() }}
            title="Ocultar nó"
          >×</button>
        )}
      </div>

      <Handle type="source" position={Position.Right}  id="sr" style={H} />
      <Handle type="source" position={Position.Bottom} id="sb" style={H} />
      <Handle type="source" position={Position.Left}   id="sl" style={H} />
      <Handle type="source" position={Position.Top}    id="st" style={H} />
    </>
  )
})

// ─── floating edge helpers ────────────────────────────────────────────────

function nodeCenter(n: InternalNode): { x: number; y: number } {
  const p = n.internals.positionAbsolute
  return {
    x: p.x + (n.measured?.width  ?? 200) / 2,
    y: p.y + (n.measured?.height ?? 52)  / 2,
  }
}

// Returns border intersection point AND which side was hit
function borderPt(
  cx: number, cy: number, hw: number, hh: number,
  toward: { x: number; y: number },
): { x: number; y: number; side: Position } {
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return { x: cx, y: cy, side: Position.Right }
  }
  const tx = Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity
  const ty = Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  const side: Position = t === tx
    ? (dx > 0 ? Position.Right : Position.Left)
    : (dy > 0 ? Position.Bottom : Position.Top)
  return { x: cx + dx * t, y: cy + dy * t, side }
}

// ─── BjjEdge ─────────────────────────────────────────────────────────────

interface BjjEdgeData extends Record<string, unknown> {
  state: 'active' | 'latent'; edgeLabel: string
  isSubmission: boolean; edgeType?: string; isHighlighted: boolean
  color: string; isManual?: boolean
}

const BjjEdge = memo(function BjjEdge({
  id, source, target, data, markerEnd,
  sourceX: rfSX, sourceY: rfSY, sourcePosition: rfSP,
  targetX: rfTX, targetY: rfTY, targetPosition: rfTP,
  sourceHandleId, targetHandleId,
}: EdgeProps) {
  const d = data as BjjEdgeData
  const nodeLookup = useStore((s) => s.nodeLookup)

  const srcN = nodeLookup.get(source) as InternalNode | undefined
  const tgtN = nodeLookup.get(target) as InternalNode | undefined
  if (!srcN || !tgtN) return null

  const sc = nodeCenter(srcN)
  const tc = nodeCenter(tgtN)
  const sHW = (srcN.measured?.width  ?? 200) / 2
  const sHH = (srcN.measured?.height ?? 52)  / 2
  const tHW = (tgtN.measured?.width  ?? 200) / 2
  const tHH = (tgtN.measured?.height ?? 52)  / 2

  let stub: { x1: number; y1: number; x2: number; y2: number } | null = null

  let sp: { x: number; y: number; side: Position }
  if (sourceHandleId?.startsWith('child-')) {
    const gPos = srcN.internals.positionAbsolute
    const gW = srcN.measured?.width ?? 268
    const bx = gPos.x + gW
    stub = { x1: rfSX, y1: rfSY, x2: bx, y2: rfSY }
    sp = { x: bx, y: rfSY, side: Position.Right }
  } else {
    sp = sourceHandleId ? { x: rfSX, y: rfSY, side: rfSP } : borderPt(sc.x, sc.y, sHW, sHH, tc)
  }

  let tp: { x: number; y: number; side: Position }
  if (targetHandleId?.startsWith('child-')) {
    const gPos = tgtN.internals.positionAbsolute
    const bx = gPos.x
    stub = { x1: bx, y1: rfTY, x2: rfTX, y2: rfTY }
    tp = { x: bx, y: rfTY, side: Position.Left }
  } else {
    tp = targetHandleId ? { x: rfTX, y: rfTY, side: rfTP } : borderPt(tc.x, tc.y, tHW, tHH, sc)
  }

  const [pathD, lx, ly] = getBezierPath({
    sourceX: sp.x, sourceY: sp.y, sourcePosition: sp.side,
    targetX: tp.x, targetY: tp.y, targetPosition: tp.side,
  })

  const opacity = d.state === 'latent' ? 0.55 : 1
  const strokeW = d.isHighlighted ? 2.5 : d.state === 'latent' ? 1.2 : 1.5
  const dash = d.state === 'latent' ? '6 4' : d.edgeType === 'part_of_system' ? '2 4' : undefined
  const stubHasArrow = targetHandleId?.startsWith('child-') ?? false

  return (
    <>
      <BaseEdge
        id={id}
        path={pathD}
        markerEnd={stubHasArrow ? undefined : markerEnd}
        style={{
          stroke: d.color, strokeWidth: strokeW,
          strokeDasharray: dash, opacity,
        }}
      />
      {stub && (
        <EdgeLabelRenderer>
          <svg style={{ position: 'absolute', overflow: 'visible', left: stub.x1, top: stub.y1, pointerEvents: 'none', zIndex: 6 }}>
            <line
              x1={0} y1={0} x2={stub.x2 - stub.x1} y2={stub.y2 - stub.y1}
              stroke={d.color} strokeWidth={strokeW} strokeDasharray={dash} opacity={opacity}
              markerEnd={stubHasArrow ? markerEnd : undefined}
            />
          </svg>
        </EdgeLabelRenderer>
      )}
      {d.edgeLabel && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
            background: C.mutedBg, color: C.muted,
            fontSize: 9, padding: '2px 5px', borderRadius: 3,
            fontWeight: 500, pointerEvents: 'none',
          }}>
            {d.edgeLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

const NODE_TYPES: NodeTypes = { bjjNode: BjjNode }
const EDGE_TYPES: EdgeTypes = { bjjEdge: BjjEdge }

// ─── Props (same interface as GraphCanvas) ────────────────────────────────

interface Props {
  nodes: CyNodeDef[]; edges: CyEdgeDef[]
  selectedNodeId: string | null; highlightedNodeId: string | null
  highlightedEdgeId: string | null; rootNodeId: string | null
  fadedNodeIds?: Set<string>
  layoutVersion: number
  onNodeClick: (id: string) => void
  onEdgeClick: (id: string) => void
  onNodeDragMove: (id: string, pos: { x: number; y: number }) => void
  onNodeDragEnd: (id: string, pos: { x: number; y: number }) => void
  onHideNode: (id: string) => void
  onNodeRightClick: (id: string, x: number, y: number) => void
  onBgClick: () => void
  onConnect: (connection: Connection) => void
}

// ─── inner component (uses RF hooks) ─────────────────────────────────────

const FlowCanvasInner = forwardRef<GraphCanvasHandle, Props>(function FlowCanvasInner(
  {
    nodes: propNodes, edges: propEdges,
    selectedNodeId, highlightedNodeId, highlightedEdgeId, rootNodeId,
    fadedNodeIds, layoutVersion,
    onNodeClick, onEdgeClick,
    onNodeDragMove, onNodeDragEnd, onHideNode, onNodeRightClick, onBgClick, onConnect,
  },
  ref,
) {
  const { fitView, getNode } = useReactFlow()
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Refs so lightweight highlight effects always read the latest value
  const highlightedNodeRef = useRef<string | null>(highlightedNodeId)
  highlightedNodeRef.current = highlightedNodeId
  const highlightedEdgeRef = useRef<string | null>(highlightedEdgeId)
  highlightedEdgeRef.current = highlightedEdgeId

  // Track layoutVersion to detect when autoLayout fires (bypass posMap)
  const prevLayoutVersionRef = useRef(layoutVersion)

  // outputs per source node: derived from propEdges + propNodes labels
  const nodeOutputs = useMemo(() => {
    const nodeLabel = new Map(propNodes.map(n => [n.id, n.label]))
    const map = new Map<string, NodeOutput[]>()
    for (const e of propEdges) {
      const label = e.edgeLabel || nodeLabel.get(e.target) || ''
      const list = map.get(e.source) ?? []
      list.push({ id: e.id, label, active: e.state === 'active', isSubmission: e.isSubmission })
      map.set(e.source, list)
    }
    return map
  }, [propEdges, propNodes])

  // sync nodes from props — preserve RF positions for existing nodes.
  // When layoutVersion changes (autoLayout fired), bypass posMap so the new
  // positions from propNodes are applied instead of RF's stale internal state.
  // highlightedNodeId intentionally excluded: handled by lightweight effect below.
  useEffect(() => {
    setRfNodes((prev) => {
      const layoutChanged = layoutVersion !== prevLayoutVersionRef.current
      prevLayoutVersionRef.current = layoutVersion
      const posMap = layoutChanged ? new Map<string, { x: number; y: number }>() : new Map(prev.map(n => [n.id, n.position]))
      return propNodes.map((n) => ({
        id: n.id, type: 'bjjNode',
        position: posMap.get(n.id) ?? { x: n.x, y: n.y },
        zIndex: 10,
        draggable: true, selectable: false,
        data: {
          label: n.label, nodeType: n.nodeType,
          isSelected:      n.id === selectedNodeId,
          isHighlighted:   n.id === highlightedNodeRef.current,
          isRoot:          n.id === rootNodeId,
          isFaded:         fadedNodeIds?.has(n.id) ?? false,
          outputs:         nodeOutputs.get(n.id) ?? [],
          childrenSummary: n.childrenSummary,
          selectedChildId: selectedNodeId,
          onChildClick:    (childId: string) => onNodeClick(childId),
          onHide:          () => onHideNode(n.id),
          onRightClick:    (x: number, y: number) => onNodeRightClick(n.id, x, y),
        } as BjjNodeData,
      }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propNodes, nodeOutputs, selectedNodeId, rootNodeId, fadedNodeIds, onHideNode, onNodeRightClick, onNodeClick, layoutVersion])

  // lightweight: update only isHighlighted without rebuilding the entire node array
  useEffect(() => {
    const id = highlightedNodeId
    setRfNodes((prev) =>
      prev.map((n) => {
        const should = n.id === id
        if ((n.data as BjjNodeData).isHighlighted === should) return n
        return { ...n, data: { ...n.data, isHighlighted: should } }
      })
    )
  }, [highlightedNodeId])

  // sync edges from props — highlightedEdgeId handled by lightweight effect below
  useEffect(() => {
    setRfEdges(propEdges.map((e) => {
      const color = edgeColor(e.state, e.isSubmission, e.edgeType)
      return {
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: 'bjjEdge',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        data: {
          state: e.state,
          edgeLabel: e.edgeLabel,
          isSubmission: e.isSubmission,
          edgeType: e.edgeType,
          isHighlighted: !e.isManual && e.id === highlightedEdgeRef.current,
          color,
          isManual: e.isManual,
        } as BjjEdgeData,
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propEdges])

  // lightweight: update only isHighlighted on edges
  useEffect(() => {
    const id = highlightedEdgeId
    setRfEdges((prev) =>
      prev.map((e) => {
        const should = e.id === id
        if ((e.data as BjjEdgeData).isHighlighted === should) return e
        return { ...e, data: { ...e.data, isHighlighted: should } }
      })
    )
  }, [highlightedEdgeId])

  useImperativeHandle(ref, () => ({
    fitToNode: (nodeId: string) => {
      const n = getNode(nodeId)
      if (n) fitView({ nodes: [n], padding: 0.3, duration: 350 })
      else fitView({ padding: 0.12, duration: 350 })
    },
  }))

  // fires every frame during drag — keeps nodePositions.current in sync with RF
  const onNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => onNodeDragMove(node.id, node.position),
    [onNodeDragMove],
  )

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => onNodeDragEnd(node.id, node.position),
    [onNodeDragEnd],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => onNodeClick(node.id),
    [onNodeClick],
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => { onEdgeClick(edge.id) },
    [onEdgeClick],
  )

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onBgClick}
      onConnect={onConnect}
      connectionMode={ConnectionMode.Loose}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      minZoom={0.08}
      maxZoom={4}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      deleteKeyCode={null}
      selectionKeyCode={null}
      style={{ background: C.canvasBg }}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24} size={1.5}
        color={C.dotColor}
      />
      <Controls showInteractive={false} style={{ background: C.mutedBg }} />
    </ReactFlow>
  )
})

// ─── exported wrapper (provides RF context) ───────────────────────────────

const FlowCanvas = forwardRef<GraphCanvasHandle, Props>(function FlowCanvas(props, ref) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <FlowCanvasInner {...props} ref={ref} />
      </ReactFlowProvider>
    </div>
  )
})

export default FlowCanvas
