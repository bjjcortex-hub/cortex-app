import { MultiDirectedGraph } from 'graphology'
import type { NodeAttrs } from '../types'

/** Resolve um child nodeId para seu pai. Se já for pai (ou não tiver pai), retorna o próprio id. */
export function resolveToParent(nodeId: string, parentByChildId: Map<string, string>): string {
  return parentByChildId.get(nodeId) ?? nodeId
}

/** Retorna true se o nó é uma posição sem filhos (card simples, ex: Standing, Training Roll). */
export function isStandalone(nodeId: string, childrenByParentId: Map<string, string[]>): boolean {
  return !childrenByParentId.has(nodeId)
}

/**
 * Constrói o mapa child → parent a partir do grafo.
 * Útil fora do CanvasApp (ex: FlowBuilder, extractMindmap).
 */
export function buildParentByChildId(graph: MultiDirectedGraph): Map<string, string> {
  const extToId = new Map<string, string>()
  graph.forEachNode((id, attrs) => extToId.set((attrs as NodeAttrs).external_id, id))

  const parentByChildId = new Map<string, string>()
  graph.forEachNode((id, attrs) => {
    const a = attrs as NodeAttrs
    if (a.parent_external_id) {
      const parentId = extToId.get(a.parent_external_id)
      if (parentId) parentByChildId.set(id, parentId)
    }
  })
  return parentByChildId
}
