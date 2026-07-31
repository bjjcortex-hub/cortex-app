import { MultiDirectedGraph } from 'graphology'
import { loadGraph } from '../../lib/graphLoader'
import { documentRepository } from '../../infra/SupabaseDocumentRepository'
import { getCurrentOwnerId } from '../../infra/auth'
import type { BjjDoc } from '../document/types'

export type PathfinderMode = 'dijkstra_weighted' | 'bfs_shortest'

export interface PathStep {
  nodeId: string
  nodeName: string
  nodeType: string
  edgeId?: string
  edgeLabel?: string
  weight?: number
  isUnsampled?: boolean
}

export interface PathResult {
  steps: PathStep[]
  length: number
  overallProbability?: number
  mode: PathfinderMode
  hasUnsampledEdges?: boolean
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
   * Encontra a rota entre Origem e Destino usando o modo selecionado:
   * - 'dijkstra_weighted': Maior probabilidade estatística de vitória (Dijkstra ponderado)
   * - 'bfs_shortest': Menor número de saltos/transições (BFS puro)
   */
  async findPath(sourceId: string, targetId: string, mode: PathfinderMode = 'dijkstra_weighted'): Promise<PathResult | null> {
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
        overallProbability: 1.0,
        mode,
      }
    }

    if (mode === 'bfs_shortest') {
      return this.findBfsPath(G, sourceId, targetId)
    } else {
      return this.findDijkstraPath(G, sourceId, targetId)
    }
  }

  /**
   * BFS Puro (Menor Número de Saltos)
   */
  private findBfsPath(G: MultiDirectedGraph, sourceId: string, targetId: string): PathResult | null {
    const queue: string[] = [sourceId]
    const visited = new Set<string>([sourceId])
    const prev = new Map<string, { nodeId: string; edgeId: string; edgeLabel: string; weight?: number }>()

    while (queue.length > 0) {
      const curr = queue.shift()!
      if (curr === targetId) break

      G.forEachOutEdge(curr, (edgeId, attrs, _src, tgt) => {
        if (!visited.has(tgt)) {
          visited.add(tgt)
          const edgeData = attrs as Record<string, unknown>
          const label = (edgeData.label as string) || ''
          const weight = typeof edgeData.weight === 'number' ? edgeData.weight : undefined
          prev.set(tgt, { nodeId: curr, edgeId, edgeLabel: label, weight })
          queue.push(tgt)
        }
      })
    }

    if (!visited.has(targetId)) return null

    const steps: PathStep[] = []
    let curr = targetId
    while (curr !== sourceId) {
      const pData = prev.get(curr)!
      const name = G.getNodeAttribute(curr, 'name') as string
      const type = G.getNodeAttribute(curr, 'node_type') as string
      steps.unshift({
        nodeId: curr,
        nodeName: name,
        nodeType: type,
        edgeId: pData.edgeId,
        edgeLabel: pData.edgeLabel,
        weight: pData.weight,
        isUnsampled: pData.weight === undefined,
      })
      curr = pData.nodeId
    }

    const startName = G.getNodeAttribute(sourceId, 'name') as string
    const startType = G.getNodeAttribute(sourceId, 'node_type') as string
    steps.unshift({ nodeId: sourceId, nodeName: startName, nodeType: startType })

    return { steps, length: steps.length - 1, mode: 'bfs_shortest' }
  }

  /**
   * Dijkstra Ponderado (Maior Probabilidade de Sucesso)
   */
  private findDijkstraPath(G: MultiDirectedGraph, sourceId: string, targetId: string): PathResult | null {
    const dist = new Map<string, number>()
    const prev = new Map<string, { nodeId: string; edgeId: string; edgeLabel: string; weight: number; isUnsampled: boolean }>()

    dist.set(sourceId, 0)
    const priorityQueue: Array<{ nodeId: string; cost: number }> = [{ nodeId: sourceId, cost: 0 }]
    const visited = new Set<string>()

    while (priorityQueue.length > 0) {
      priorityQueue.sort((a, b) => a.cost - b.cost)
      const current = priorityQueue.shift()!

      if (visited.has(current.nodeId)) continue
      visited.add(current.nodeId)

      if (current.nodeId === targetId) break

      G.forEachOutEdge(current.nodeId, (edgeId, attrs, _src, tgt) => {
        const edgeData = attrs as Record<string, unknown>
        const isUnsampled = edgeData.weight === null || edgeData.weight === undefined
        const weight = isUnsampled ? 0.50 : (edgeData.weight as number)
        const label  = (edgeData.label as string) || ''
        
        const stepCost = -Math.log(Math.max(0.01, weight))
        const newDist = current.cost + stepCost

        if (newDist < (dist.get(tgt) ?? Infinity)) {
          dist.set(tgt, newDist)
          prev.set(tgt, { nodeId: current.nodeId, edgeId, edgeLabel: label, weight, isUnsampled })
          priorityQueue.push({ nodeId: tgt, cost: newDist })
        }
      })
    }

    if (!dist.has(targetId)) return null

    const steps: PathStep[] = []
    let curr = targetId
    let overallProb = 1.0
    let hasUnsampledEdges = false

    while (curr !== sourceId) {
      const prevData = prev.get(curr)
      if (!prevData) break

      const currName = G.getNodeAttribute(curr, 'name') as string
      const currType = G.getNodeAttribute(curr, 'node_type') as string

      if (prevData.isUnsampled) hasUnsampledEdges = true

      steps.unshift({
        nodeId: curr,
        nodeName: currName,
        nodeType: currType,
        edgeId: prevData.edgeId,
        edgeLabel: prevData.edgeLabel,
        weight: prevData.weight,
        isUnsampled: prevData.isUnsampled,
      })

      overallProb *= prevData.weight
      curr = prevData.nodeId
    }

    const startName = G.getNodeAttribute(sourceId, 'name') as string
    const startType = G.getNodeAttribute(sourceId, 'node_type') as string
    steps.unshift({ nodeId: sourceId, nodeName: startName, nodeType: startType })

    return {
      steps,
      length: steps.length - 1,
      overallProbability: Math.round(overallProb * 100) / 100,
      mode: 'dijkstra_weighted',
      hasUnsampledEdges,
    }
  }

  /**
   * Exporta a rota calculada para um novo documento Fluxograma
   */
  async exportPathToFlowchart(path: PathResult, title: string): Promise<BjjDoc> {
    const ownerId = getCurrentOwnerId()

    const nodes = path.steps.map((step, idx) => ({
      id: `step-${idx + 1}`,
      type: 'step',
      title: title || `Rota BJJ (${path.mode === 'dijkstra_weighted' ? 'Dijkstra Probabilístico' : 'BFS Menor Caminho'}): ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
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
          weight: next.weight,
        },
      })
    }

    return documentRepository.create({
      type: 'fluxograma',
      title: title || `Rota (${path.mode === 'dijkstra_weighted' ? 'Probabilidade: ' + (path.overallProbability ? Math.round(path.overallProbability * 100) + '%' : 'Alta') : 'BFS ' + path.length + ' passos'}): ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
      ownerId,
      forkedFrom: null,
      visibility: 'private',
      schemaVersion: 1,
      data: { nodes, edges },
    })
  }
}

export const pathfinderEngine = new PathfinderEngine()
