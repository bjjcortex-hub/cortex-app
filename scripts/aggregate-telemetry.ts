import { supabase } from '../src/lib/supabase'

const MIN_SAMPLE_SIZE = 5

export async function runTelemetryAggregation() {
  console.log('🔄 Executando Agregação de Telemetria (Fórmula N >= 5)...')

  // 1. Busca documentos públicos de fluxograma
  const { data: docs, error: docError } = await supabase
    .from('user_documents')
    .select('id, data')
    .eq('type', 'fluxograma')

  if (docError) {
    console.error('Erro ao buscar fluxogramas para telemetria:', docError.message)
    return
  }

  if (!docs || docs.length === 0) {
    console.log('Nenhum fluxograma aprovado encontrado para agregação.')
    return
  }

  // 2. Mapeia tentativas de transições (sucessos e falhas)
  const edgeStats = new Map<string, { success: number; failure: number; label: string }>()

  for (const doc of docs) {
    const data = doc.data as { edges?: Array<{ data?: { transName?: string; result?: string } }> }
    if (!data.edges) continue

    for (const edge of data.edges) {
      const label = edge.data?.transName
      if (!label) continue

      const current = edgeStats.get(label) || { success: 0, failure: 0, label }
      if (edge.data?.result === 'failure') {
        current.failure++
      } else {
        current.success++
      }
      edgeStats.set(label, current)
    }
  }

  // 3. Atualiza source_edges no banco de dados com a regra de amostragem N >= 5
  let updatedCount = 0
  let skippedCount = 0

  for (const [label, stat] of edgeStats.entries()) {
    const totalAttempts = stat.success + stat.failure

    if (totalAttempts < MIN_SAMPLE_SIZE) {
      console.log(`⚠️ Transição "${label}" possui N=${totalAttempts} (< 5). Mantendo weight = NULL.`)
      skippedCount++
      continue
    }

    const successRate = stat.success / totalAttempts
    const weight = Math.round(Math.max(0.1, Math.min(1.0, successRate)) * 100) / 100

    const { error: updateError } = await supabase
      .from('source_edges')
      .update({
        weight,
        weight_context: 'community_competition',
        weight_source: 'community_telemetry_v1',
      })
      .ilike('label', `%${label}%`)

    if (updateError) {
      console.warn(`Erro ao atualizar aresta "${label}":`, updateError.message)
    } else {
      updatedCount++
      console.log(`✅ Aresta "${label}" atualizada com weight=${weight} (N=${totalAttempts}).`)
    }
  }

  console.log(`🎉 Agregação Concluída! ${updatedCount} arestas populadas ($N \\ge 5$) e ${skippedCount} mantidas em NULL ($N < 5$).`)
}

// Executa se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runTelemetryAggregation().catch(console.error)
}
