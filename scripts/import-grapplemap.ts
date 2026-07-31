#!/usr/bin/env tsx
/**
 * scripts/import-grapplemap.ts
 *
 * Importa o grafo público do GrappleMap para o Supabase como semente
 * estrutural do banco de conhecimento BJJ Cortex.
 *
 * GrappleMap: domínio público — https://github.com/Eelis/GrappleMap
 * ~586 posições, ~330 transições, 161 tags.
 *
 * Uso:
 *   npm run import:grapplemap          — insere no banco
 *   npm run import:grapplemap --dry-run — valida sem inserir
 *
 * Requer:
 *   .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_KEY (service_role)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const GRAPPLEMAP_JSON_URL = 'https://raw.githubusercontent.com/Eelis/GrappleMap/master/doc/graph.json'
const BATCH_SIZE = 50

// Carrega .env.local manualmente (sem vite)
function loadEnv(): Record<string, string> {
  const envPaths = ['.env.local', '.env']
  for (const p of envPaths) {
    const full = resolve(process.cwd(), p)
    if (existsSync(full)) {
      const lines = readFileSync(full, 'utf-8').split('\n')
      const env: Record<string, string> = {}
      for (const line of lines) {
        const match = line.match(/^([^#=]+)=(.*)$/)
        if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
      }
      return env
    }
  }
  return {}
}

// ─── GrappleMap types (baseado no schema público) ────────────────────────────

interface GrappleMapNode {
  id: string
  description: string
  tags?: string[]
}

interface GrappleMapEdge {
  id: string
  from: string
  to: string
  description: string
  tags?: string[]
}

interface GrappleMapData {
  nodes?: GrappleMapNode[]
  positions?: GrappleMapNode[]
  edges?: GrappleMapEdge[]
  transitions?: GrappleMapEdge[]
}

// ─── Mapeamento de tags GrappleMap → campos do schema canônico ────────────────

const TAG_TO_GAME_PHASE: Record<string, string> = {
  standing: 'standing',
  guard: 'guard',
  'half guard': 'guard',
  passing: 'passing',
  control: 'control',
  submission: 'finish',
  escape: 'escape',
  takedown: 'standing',
  clinch: 'standing',
}

const TAG_TO_GI_NOGI: Record<string, string> = {
  gi: 'gi',
  nogi: 'nogi',
  'no-gi': 'nogi',
}

function tagsToGamePhases(tags: string[] = []): string[] {
  const phases = new Set<string>()
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    for (const [key, phase] of Object.entries(TAG_TO_GAME_PHASE)) {
      if (lower.includes(key)) phases.add(phase)
    }
  }
  return Array.from(phases)
}

function tagsToGiNogi(tags: string[] = []): string {
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    for (const [key, value] of Object.entries(TAG_TO_GI_NOGI)) {
      if (lower.includes(key)) return value
    }
  }
  return 'both'
}

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// ─── Fetch GrappleMap data ────────────────────────────────────────────────────

async function fetchGrappleMap(): Promise<GrappleMapData> {
  console.log(`📥 Baixando GrappleMap de: ${GRAPPLEMAP_JSON_URL}`)
  const res = await fetch(GRAPPLEMAP_JSON_URL)
  if (!res.ok) throw new Error(`Falha ao baixar GrappleMap: ${res.status} ${res.statusText}`)
  return res.json() as Promise<GrappleMapData>
}

// ─── Inserção em lotes ────────────────────────────────────────────────────────

async function upsertBatch<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  onConflict: string,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false })
    if (error) throw new Error(`Erro no lote ${i}–${i + batch.length}: ${error.message}`)
    process.stdout.write('.')
  }
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🥋 BJJ Cortex — Importação do GrappleMap')
  console.log(DRY_RUN ? '🔍 MODO DRY-RUN — nenhum dado será inserido\n' : '⚡ Modo real — inserindo no banco\n')

  // Carrega credenciais
  const env = loadEnv()
  const supabaseUrl = env['VITE_SUPABASE_URL']
  const serviceKey  = env['VITE_SUPABASE_KEY']

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_KEY são obrigatórios no .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Baixa dados
  const data = await fetchGrappleMap()

  const positions: GrappleMapNode[] = data.nodes ?? data.positions ?? []
  const transitions: GrappleMapEdge[] = data.edges ?? data.transitions ?? []

  console.log(`\n✅ GrappleMap carregado:`)
  console.log(`   Posições:   ${positions.length}`)
  console.log(`   Transições: ${transitions.length}\n`)

  if (positions.length === 0) {
    console.warn('⚠️  Nenhuma posição encontrada. Verifique o formato do JSON do GrappleMap.')
    console.warn('   O schema pode ter mudado. Inspecione:', GRAPPLEMAP_JSON_URL)
    process.exit(1)
  }

  // ── Prepara nós (source_nodes) ───────────────────────────────────────────────
  const nodeRows = positions.map((pos) => {
    const slug = `gm-${toSlug(pos.description)}`
    const gamePhasesArr = tagsToGamePhases(pos.tags)
    const giNogiVal = tagsToGiNogi(pos.tags)

    return {
      // Campos existentes no schema original
      external_id:   pos.id,
      node_type:     'position',
      name:          pos.description,
      description:   `Importado do GrappleMap. Tags: ${(pos.tags ?? []).join(', ')}`,

      // Campos do schema canônico (002 migration)
      canonical_id:  slug,
      preferred_name: pos.description,
      aliases: JSON.stringify([{
        name:       pos.description,
        lang:       'en',
        lineage:    'grapplemap',
        type:       'technical',
        popularity: 0.5,
      }]),
      hierarchy_level:  null,         // GrappleMap não categoriza família/técnica/variante
      gi_nogi:          giNogiVal,
      game_phase:       gamePhasesArr,
      media_refs:       JSON.stringify([]),
      source_origin:    'grapplemap',
      review_status:    'approved',   // Domínio público, confiança alta como semente
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      ai_confidence:    null,
      stats:            JSON.stringify({}),
      game_asset_ref:   null,
      stamina_cost:     null,
    }
  })

  // ── Prepara arestas (source_edges) ───────────────────────────────────────────
  // As arestas referenciam external_id; o banco usa UUIDs.
  // A strategy: salvar com external_id como chave e resolver depois via view/join.
  // Por ora, armazenamos as arestas com src_external_id/dst_external_id em metadata.
  const edgeRows = transitions.map((tr) => ({
    external_id:     tr.id,
    edge_type:       'transition',
    label:           tr.description,
    is_submission:   (tr.tags ?? []).some(t => t.toLowerCase().includes('submission')),
    // Referências por external_id — resolvidas na query via JOIN
    src_external_id: tr.from,
    dst_external_id: tr.to,
    // Campos canônicos
    weight:          null,
    weight_context:  null,
    weight_source:   null,
  }))

  if (DRY_RUN) {
    console.log('📋 PREVIEW — Primeiros 5 nós que seriam inseridos:')
    nodeRows.slice(0, 5).forEach(n => console.log('  -', n.name, '|', n.canonical_id, '|', n.gi_nogi))
    console.log(`\n📋 PREVIEW — Primeiras 5 arestas que seriam inseridas:`)
    edgeRows.slice(0, 5).forEach(e => console.log('  -', e.label, '|', e.src_external_id, '→', e.dst_external_id))
    console.log('\n✅ Dry-run concluído. Nenhum dado inserido.')
    return
  }

  // ── Inserção real ─────────────────────────────────────────────────────────────
  console.log(`\n📤 Inserindo ${nodeRows.length} posições em source_nodes...`)
  await upsertBatch(supabase, 'source_nodes', nodeRows, 'external_id')
  console.log(`✅ ${nodeRows.length} posições inseridas/atualizadas.`)

  console.log(`\n📤 Inserindo ${edgeRows.length} transições em source_edges...`)
  await upsertBatch(supabase, 'source_edges', edgeRows, 'external_id')
  console.log(`✅ ${edgeRows.length} transições inseridas/atualizadas.`)

  console.log('\n🎉 Importação do GrappleMap concluída!')
  console.log(`   Verifique no Supabase: source_origin = 'grapplemap'`)
}

main().catch(e => {
  console.error('\n❌ Erro fatal:', e)
  process.exit(1)
})
