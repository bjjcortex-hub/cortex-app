import { supabase } from '../src/lib/supabase'
import type { FlowGiNogi, FlowContext } from '../src/lib/flowStorage'

const MIN_SAMPLE_SIZE = 5

// ── Tipos internos ────────────────────────────────────────────────────────────

type WeightContext = `${FlowGiNogi}_${FlowContext}` | 'unspecified'

interface EdgeStat {
  success: number
  failure: number
  label:   string
}

// Chave de segmentação: label + contexto (gi/nogi × competition/training/sparring)
type StatKey = string  // `${transName}::${weight_context}`

// ── Função principal ──────────────────────────────────────────────────────────

export async function runTelemetryAggregation() {
  console.log('🔄 Agregação de Telemetria (fórmula N ≥ 5, segmentado por gi_nogi × context)...')

  // 1. Busca todos os fluxogramas
  const { data: docs, error: docError } = await supabase
    .from('user_documents')
    .select('id, data')
    .eq('type', 'fluxograma')

  if (docError) {
    console.error('Erro ao buscar fluxogramas:', docError.message)
    return
  }

  if (!docs || docs.length === 0) {
    console.log('Nenhum fluxograma encontrado para agregação.')
    return
  }

  // 2. Mapeia tentativas por (transName × weight_context)
  const edgeStats = new Map<StatKey, EdgeStat>()

  for (const doc of docs) {
    const data = doc.data as {
      edges?: Array<{ data?: { transName?: string; result?: string } }>
      gi_nogi?: FlowGiNogi
      context?: FlowContext
    }
    if (!data.edges) continue

    // Resolve o contexto do fluxograma completo
    const gi_nogi: FlowGiNogi = data.gi_nogi ?? 'both'
    const context: FlowContext = data.context ?? 'training'

    // Quando gi_nogi = 'both', o fluxo contribui para os dois segmentos gi e nogi
    const giNogiVariants: FlowGiNogi[] = gi_nogi === 'both' ? ['gi', 'nogi'] : [gi_nogi]

    for (const edge of data.edges) {
      const label = edge.data?.transName
      if (!label) continue

      const result = edge.data?.result

      for (const variant of giNogiVariants) {
        const wctx: WeightContext = `${variant}_${context}`
        const key: StatKey = `${label}::${wctx}`

        const current = edgeStats.get(key) ?? { success: 0, failure: 0, label }
        if (result === 'failure') current.failure++
        else current.success++
        edgeStats.set(key, current)
      }
    }
  }

  // 3. Atualiza source_edges por (label × weight_context) com regra N ≥ 5
  let updatedCount = 0
  let skippedCount = 0

  for (const [key, stat] of edgeStats.entries()) {
    const [label, weightContext] = key.split('::')
    const total = stat.success + stat.failure

    if (total < MIN_SAMPLE_SIZE) {
      console.log(`⚠️  "${label}" [${weightContext}] N=${total} < 5 — weight mantido NULL`)
      skippedCount++
      continue
    }

    const successRate = stat.success / total
    const weight = Math.round(Math.max(0.1, Math.min(1.0, successRate)) * 100) / 100

    const { error: updateError } = await supabase
      .from('source_edges')
      .update({
        weight,
        weight_context: weightContext,
        weight_source:  'community_telemetry_v2',
      })
      .ilike('label', `%${label}%`)
      .or(`weight_context.is.null,weight_context.eq.${weightContext}`)

    if (updateError) {
      console.warn(`Erro ao atualizar "${label}" [${weightContext}]:`, updateError.message)
    } else {
      updatedCount++
      console.log(`✅ "${label}" [${weightContext}] → weight=${weight} (N=${total}, S=${stat.success}, F=${stat.failure})`)
    }
  }

  console.log(`\n🎉 Concluído: ${updatedCount} arestas atualizadas, ${skippedCount} mantidas NULL (N < 5).`)
  console.log(`   Total de segmentos processados: ${edgeStats.size}`)
}

// Executa se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTelemetryAggregation().catch(console.error)
}
