import { MultiDirectedGraph } from 'graphology'
import type { EdgeAttrs } from '../types'

function isSuccessEdge(attrs: EdgeAttrs): boolean {
  if (attrs.edge_type === 'counter') return false
  if (attrs.result_type === 'failure' || attrs.result_type === 'counter') return false
  return true
}

/** All nodes connected to root via active edges, minus hidden. Root included unless hidden. */
export function deriveVisibleNodes(
  rootId: string,
  activeEdgeIds: Set<string>,
  hiddenNodeIds: Set<string>,
  graph: MultiDirectedGraph,
): Set<string> {
  const visible = new Set<string>()
  if (!hiddenNodeIds.has(rootId)) visible.add(rootId)
  for (const eid of activeEdgeIds) {
    if (!graph.hasEdge(eid)) continue
    const src = graph.source(eid)
    const tgt = graph.target(eid)
    if (!hiddenNodeIds.has(src)) visible.add(src)
    if (!hiddenNodeIds.has(tgt)) visible.add(tgt)
  }
  return visible
}

/** Edges where both endpoints are visible and not already active. Always derived. */
export function deriveLatentEdges(
  visibleNodeIds: Set<string>,
  activeEdgeIds: Set<string>,
  graph: MultiDirectedGraph,
): Set<string> {
  const latent = new Set<string>()
  graph.forEachEdge((eid, attrs, src, tgt) => {
    if (activeEdgeIds.has(eid)) return
    if (!visibleNodeIds.has(src) || !visibleNodeIds.has(tgt)) return
    const ea = attrs as EdgeAttrs
    const srcIsTransition = graph.getNodeAttributes(src).node_type === 'transition'
    if (!isSuccessEdge(ea) && !(srcIsTransition && ea.result_type === 'failure')) return
    latent.add(eid)
  })
  return latent
}

/**
 * Cascade-hide every visible node that has no active incident edge with any
 * other still-visible node. rootId and anchorIds are permanent anchors.
 * Returns nodeIds to add to hiddenNodeIds.
 */
export function conservativeCollapse(
  visibleNodeIds: Set<string>,
  activeEdgeIds: Set<string>,
  rootId: string | null,
  graph: MultiDirectedGraph,
  anchorIds: Set<string> = new Set(),
): Set<string> {
  const toHide = new Set<string>()
  const current = new Set(visibleNodeIds)
  let changed = true
  while (changed) {
    changed = false
    for (const nodeId of current) {
      if (nodeId === rootId || toHide.has(nodeId) || anchorIds.has(nodeId)) continue
      const hasActive = graph.edges(nodeId).some((eid) => {
        if (!activeEdgeIds.has(eid)) return false
        const src = graph.source(eid)
        const tgt = graph.target(eid)
        const neighbor = src === nodeId ? tgt : src
        if (neighbor === rootId || anchorIds.has(neighbor)) return true
        return current.has(neighbor) && !toHide.has(neighbor)
      })
      if (!hasActive) {
        toHide.add(nodeId)
        current.delete(nodeId)
        changed = true
      }
    }
  }
  return toHide
}
