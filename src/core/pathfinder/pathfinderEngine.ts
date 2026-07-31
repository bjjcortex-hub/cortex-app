import { MultiDirectedGraph } from 'graphology'
import { loadGraph } from '../../lib/graphLoader'
import { documentRepository } from '../../infra/SupabaseDocumentRepository'
import { getCurrentOwnerId } from '../../infra/auth'
import type { BjjDoc } from '../document/types'

export interface PathStep {
  nodeId: string
  nodeName: string
  nodeType: string
  edgeId?: string
  edgeLabel?: string
}

export interface PathResult {
  steps: PathStep[]
  length: number
}

export class PathfinderEngine {
  private graph: MultiDirectedGraph | null = null

  async init(): Promise<MultiDirectedGraph> {
    if (!this.graph) {
      this.graph = await loadGraph()
    }
    return this.graph
  }

  /**
   * Encontra o menor caminho (BFS) entre a posição de origem e destino no grafo de BJJ.
   */
  async findShortestPath(sourceId: string, targetId: string): Promise<PathResult | null> {
    const G = await this.init()

    if (!G.hasNode(sourceId) || !G.hasNode(targetId)) {
      return null
    }

    if (sourceId === targetId) {
      const name = G.getNodeAttribute(sourceId, 'name') as string
      const type = G.getNodeAttribute(sourceId, 'node_type') as string
      return {
        steps: [{ nodeId: sourceId, nodeName: name, nodeType: type }],
        length: 0,
      }
    }

    // Fila BFS: [nodeId, pathArray]
    const queue: Array<[string, PathStep[]]> = []
    const visited = new Set<string>()

    const startName = G.getNodeAttribute(sourceId, 'name') as string
    const startType = G.getNodeAttribute(sourceId, 'node_type') as string

    queue.push([sourceId, [{ nodeId: sourceId, nodeName: startName, nodeType: startType }]])
    visited.add(sourceId)

    while (queue.length > 0) {
      const [currentId, currentPath] = queue.shift()!

      if (currentId === targetId) {
        return { steps: currentPath, length: currentPath.length - 1 }
      }

      // Evita caminhos excessivamente longos (> 8 passos)
      if (currentPath.length > 8) continue

      // Percorre arestas de saída
      G.forEachOutEdge(currentId, (edgeId, attrs, _src, tgt) => {
        if (!visited.has(tgt)) {
          visited.add(tgt)
          const tgtName = G.getNodeAttribute(tgt, 'name') as string
          const tgtType = G.getNodeAttribute(tgt, 'node_type') as string
          const label   = (attrs as Record<string, unknown>).label as string || ''

          const nextStep: PathStep = {
            nodeId: tgt,
            nodeName: tgtName,
            nodeType: tgtType,
            edgeId,
            edgeLabel: label,
          }

          queue.push([tgt, [...currentPath, nextStep]])
        }
      })
    }

    return null
  }

  /**
   * Converte o caminho de transições encontrado em um novo documento do tipo Fluxograma
   */
  async exportPathToFlowchart(path: PathResult, title: string): Promise<BjjDoc> {
    const ownerId = getCurrentOwnerId()

    const nodes = path.steps.map((step, idx) => ({
      id: `step-${idx + 1}`,
      type: 'step',
      title: title || `Rota BJJ: ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
      data: {
        posA: {
          nodeId: step.nodeId,
          name: step.nodeName,
          nodeType: step.nodeType,
        },
        posB: null,
      },
    }))

    const edges = []
    for (let i = 0; i < path.steps.length - 1; i++) {
      const next = path.steps[i + 1]
      edges.push({
        id: `edge-${i + 1}`,
        source: `step-${i + 1}`,
        target: `step-${i + 2}`,
        active: true,
        data: {
          actor: 'A',
          transName: next.edgeLabel || `Transição para ${next.nodeName}`,
          result: 'success',
        },
      })
    }

    return documentRepository.create({
      type: 'fluxograma',
      title: title || `Rota: ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
      ownerId,
      forkedFrom: null,
      visibility: 'private',
      schemaVersion: 1,
      data: { nodes, edges },
    })
  }
}

export const pathfinderEngine = new PathfinderEngine()
