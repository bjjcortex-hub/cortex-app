import type { DocumentData, CanvasNode, CanvasEdge } from '../../core/document/types'
import type { FightStep, Attempt, FightPos, Actor, SavedFlow } from '../../components/FlowBuilder'

import type { FlowGiNogi, FlowContext, FlowOutcome } from '../../lib/flowStorage'

export interface FluxogramaState {
  steps:        FightStep[]
  nameA:        string
  nameB:        string
  flowName:     string
  date?:        string
  description?: string
  videoLink?:   string
  gi_nogi:      FlowGiNogi   // 'gi' | 'nogi' | 'both'
  context:      FlowContext  // 'competition' | 'training' | 'sparring'
  outcome:      FlowOutcome  // 'win' | 'loss' | 'draw' | 'unfinished'
}

export function serializeFluxograma(
  steps: FightStep[],
  nameA: string,
  nameB: string,
  flowName: string,
  date?: string,
  description?: string,
  videoLink?: string,
  gi_nogi: FlowGiNogi = 'both',
  context: FlowContext = 'training',
  outcome: FlowOutcome = 'unfinished',
): DocumentData {
  const nodes: CanvasNode[] = steps.map(step => ({
    id:    step.id,
    type:  'step',
    title: flowName,
    data: {
      posA:  step.posA,
      posB:  step.posB,
      nameA,
      nameB,
      date,
      description,
      videoLink,
      gi_nogi,
      context,
      outcome,
    },
  }))

  const edges: CanvasEdge[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    for (const att of step.attempts) {
      const nextStep = att.result === 'success' && i + 1 < steps.length ? steps[i + 1] : null
      edges.push({
        id:     att.id,
        source: step.id,
        target: nextStep ? nextStep.id : step.id,
        active: true,
        data: {
          actor:       att.actor,
          transNodeId: att.transNodeId,
          transName:   att.transName,
          result:      att.result,
          note:        att.note,
        },
      })
    }
  }

  return { nodes, edges }
}

export function deserializeFluxograma(data: DocumentData): FluxogramaState {
  const stepNodes   = data.nodes.filter(n => n.type === 'step')
  const firstMeta   = stepNodes[0]?.data ?? {}
  const nameA       = (firstMeta.nameA       as string | undefined) ?? 'Lutador A'
  const nameB       = (firstMeta.nameB       as string | undefined) ?? 'Lutador B'
  const flowName    = stepNodes[0]?.title ?? 'Fluxograma'
  const date        = (firstMeta.date        as string | undefined)
  const description = (firstMeta.description as string | undefined)
  const videoLink   = (firstMeta.videoLink   as string | undefined)
  // Contexto — retrocompat: dados antigos usam os defaults
  const gi_nogi     = (firstMeta.gi_nogi as FlowGiNogi | undefined) ?? 'both'
  const context     = (firstMeta.context as FlowContext | undefined) ?? 'training'
  const outcome     = (firstMeta.outcome as FlowOutcome | undefined) ?? 'unfinished'

  const stepIdx = new Map<string, number>(stepNodes.map((n, i) => [n.id, i]))

  const steps: FightStep[] = stepNodes.map(n => ({
    id:       n.id,
    posA:     n.data.posA as FightPos,
    posB:     (n.data.posB as FightPos | null) ?? null,
    attempts: [] as Attempt[],
  }))

  for (const edge of data.edges) {
    const si = stepIdx.get(edge.source)
    if (si === undefined) continue
    const d = edge.data ?? {}
    steps[si].attempts.push({
      id:          edge.id,
      actor:       (d.actor       as Actor)                  ?? 'A',
      transNodeId: (d.transNodeId as string | null)          ?? null,
      transName:   (d.transName   as string)                 ?? '',
      result:      (d.result      as 'success' | 'failure')  ?? 'success',
      note:        d.note as string | undefined,
    })
  }

  return { steps, nameA, nameB, flowName, date, description, videoLink, gi_nogi, context, outcome }
}

// Convert a FluxogramaState to a SavedFlow shape (for use with extractMindmap)
export function stateToSavedFlow(state: FluxogramaState): SavedFlow {
  return {
    id:          'doc',
    name:        state.flowName,
    nameA:       state.nameA,
    nameB:       state.nameB,
    steps:       state.steps,
    savedAt:     new Date().toISOString(),
    date:        state.date,
    description: state.description,
    videoLink:   state.videoLink,
    gi_nogi:     state.gi_nogi,
    context:     state.context,
    outcome:     state.outcome,
  }
}
