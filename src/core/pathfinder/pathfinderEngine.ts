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
  weight?: number
}

export interface PathResult {
  steps: PathStep[]
  length: number
  overallProbability?: number
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
   * Encontra a rota de MAIOR PROBABILIDADE DE SUCESSO (Dijkstra Ponderado)
   * usando os pesos estatísticos das 100+ lutas e telemetria de combate.
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
        overallProbability: 1.0,
      }
    }

    // Dijkstra Priority Queue: menor custo = -log(weight)
    const dist = new Map<string, number>()
    const prev = new Map<string, { nodeId: string; edgeId: string; edgeLabel: string; weight: number }>()

    dist.set(sourceId, 0)

    const priorityQueue: Array<{ nodeId: string; cost: number }> = [{ nodeId: sourceId, cost: 0 }]
    const visited = new Set<string>()

    while (priorityQueue.length > 0) {
      // Ordena para pegar o nó de menor custo
      priorityQueue.sort((a, b) => a.cost - b.cost)
      const current = priorityQueue.shift()!

      if (visited.has(current.nodeId)) continue
      visited.add(current.nodeId)

      if (current.nodeId === targetId) break

      G.forEachOutEdge(current.nodeId, (edgeId, attrs, _src, tgt) => {
        const edgeData = attrs as Record<string, unknown>
        const weight = typeof edgeData.weight === 'number' ? edgeData.weight : 0.5
        const label  = (edgeData.label as string) || ''
        
        // Custo = -log(probabilidade) -> somar custos multiplica probabilidades
        const stepCost = -Math.log(Math.max(0.01, weight))
        const newDist = current.cost + stepCost

        if (newDist < (dist.get(tgt) ?? Infinity)) {
          dist.set(tgt, newDist)
          prev.set(tgt, { nodeId: current.nodeId, edgeId, edgeLabel: label, weight })
          priorityQueue.push({ nodeId: tgt, cost: newDist })
        }
      })
    }

    if (!dist.has(targetId)) {
      return null
    }

    // Reconstrói o caminho
    const steps: PathStep[] = []
    let curr = targetId
    let overallProb = 1.0

    while (curr !== sourceId) {
      const prevData = prev.get(curr)
      if (!prevData) break

      const currName = G.getNodeAttribute(curr, 'name') as string
      const currType = G.getNodeAttribute(curr, 'node_type') as string

      steps.unshift({
        nodeId: curr,
        nodeName: currName,
        nodeType: currType,
        edgeId: prevData.edgeId,
        edgeLabel: prevData.edgeLabel,
        weight: prevData.weight,
      })

      overallProb *= prevData.weight
      curr = prevData.nodeId
    }

    const startName = G.getNodeAttribute(sourceId, 'name') as string
    const startType = G.getNodeAttribute(sourceId, 'node_type') as string
    steps.unshift({
      nodeId: sourceId,
      nodeName: startName,
      nodeType: startType,
    })

    return {
      steps,
      length: steps.length - 1,
      overallProbability: Math.round(overallProb * 100) / 100,
    }
  }

  /**
   * Converte o caminho de transições encontrado em um novo documento do tipo Fluxograma
   */
  async exportPathToFlowchart(path: PathResult, title: string): Promise<BjjDoc> {
    const ownerId = getCurrentOwnerId()

    const nodes = path.steps.map((step, idx) => ({
      id: `step-${idx + 1}`,
      type: 'step',
      title: title || `Rota BJJ (Probabilidade ${path.overallProbability ? Math.round(path.overallProbability * 100) + '%' : 'Alta'}): ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
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
      title: title || `Rota (Probabilidade: ${path.overallProbability ? Math.round(path.overallProbability * 100) + '%' : 'Alta'}): ${path.steps[0].nodeName} ➔ ${path.steps[path.steps.length - 1].nodeName}`,
      ownerId,
      forkedFrom: null,
      visibility: 'private',
      schemaVersion: 1,
      data: { nodes, edges },
    })
  }
}

export const pathfinderEngine = new PathfinderEngine()
