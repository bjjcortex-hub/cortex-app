import { MultiDirectedGraph } from 'graphology'
import type { DocumentData, CanvasNode, CanvasEdge } from '../../core/document/types'
import type { ManualEdge } from '../../lib/persistence'
import type { NodeAttrs } from '../../types'

export interface MindmapState {
  rootNodeId:    string | null
  activeEdgeIds: Set<string>
  hiddenNodeIds: Set<string>
  lockedNodes:   Set<string>
  fadedNodeIds:  Set<string>
  extraNodeIds:  Set<string>
  nodePositions: Map<string, { x: number; y: number }>
  manualEdges:   ManualEdge[]
}

export function serializeMindmap(state: MindmapState, graph: MultiDirectedGraph): DocumentData {
  const nodes: CanvasNode[] = []

  for (const [id, { x, y }] of state.nodePositions) {
    if (!graph.hasNode(id)) continue
    const a = graph.getNodeAttributes(id) as NodeAttrs
    nodes.push({
      id,
      type:  a.node_type,
      title: a.name,
      position: { x, y },
      data: {
        root:   id === state.rootNodeId,
        extra:  state.extraNodeIds.has(id),
        hidden: state.hiddenNodeIds.has(id),
        faded:  state.fadedNodeIds.has(id),
        locked: state.lockedNodes.has(id),
      },
    })
  }

  const edges: CanvasEdge[] = []

  for (const eid of state.activeEdgeIds) {
    if (!graph.hasEdge(eid)) continue
    edges.push({
      id:     eid,
      source: graph.source(eid),
      target: graph.target(eid),
      active: true,
    })
  }

  for (const e of state.manualEdges) {
    edges.push({
      id:           e.id,
      source:       e.source,
      sourceHandle: e.sourceHandle,
      target:       e.target,
      active:       true,
      data: {
        isManual:     true,
        targetHandle: e.targetHandle,
      },
    })
  }

  return { nodes, edges }
}

export function deserializeMindmap(data: DocumentData): MindmapState {
  const rootNodeId    = data.nodes.find(n => n.data.root === true)?.id ?? null
  const nodePositions = new Map<string, { x: number; y: number }>()
  const hiddenNodeIds = new Set<string>()
  const lockedNodes   = new Set<string>()
  const fadedNodeIds  = new Set<string>()
  const extraNodeIds  = new Set<string>()

  for (const n of data.nodes) {
    if (n.position) nodePositions.set(n.id, { x: n.position.x, y: n.position.y })
    if (n.data.hidden === true) hiddenNodeIds.add(n.id)
    if (n.data.locked === true) lockedNodes.add(n.id)
    if (n.data.faded  === true) fadedNodeIds.add(n.id)
    if (n.data.extra  === true) extraNodeIds.add(n.id)
  }

  const manualEdges: ManualEdge[] = data.edges
    .filter(e => e.data?.isManual === true)
    .map(e => ({
      id:           e.id,
      source:       e.source,
      target:       e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.data?.targetHandle as string | undefined,
    }))

  const activeEdgeIds = new Set(
    data.edges.filter(e => e.active && !e.data?.isManual).map(e => e.id)
  )

  return { rootNodeId, activeEdgeIds, hiddenNodeIds, lockedNodes, fadedNodeIds, extraNodeIds, nodePositions, manualEdges }
}
