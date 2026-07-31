#!/usr/bin/env tsx
/**
 * scripts/import-grapplemap.ts
 *
 * Importa o grafo público do GrappleMap para o Supabase como semente
 * estrutural do banco de conhecimento BJJ Cortex.
 *
 * Fonte: https://raw.githubusercontent.com/Eelis/GrappleMap/master/GrappleMap.txt
 * GrappleMap: domínio público — https://github.com/Eelis/GrappleMap
 * ~580+ posições com tags e nomes.
 *
 * Uso:
 *   npm run import:grapplemap          — insere no banco
 *   npm run import:grapplemap:dry      — valida sem inserir
 *
 * Requer:
 *   .env.local com VITE_SUPABASE_URL e VITE_SUPABASE_KEY (service_role)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const GRAPPLEMAP_RAW_URL = 'https://raw.githubusercontent.com/Eelis/GrappleMap/master/GrappleMap.txt'
const BATCH_SIZE = 50

// Carrega .env.local manualmente
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

// ─── Parser de GrappleMap.txt ──────────────────────────────────────────────────

export interface GrappleMapParsedNode {
  id: string
  name: string
  tags: string[]
  poseData: string[]
}

function parseGrappleMapTxt(text: string): GrappleMapParsedNode[] {
  const lines = text.split('\n')
  const nodes: GrappleMapParsedNode[] = []

  let currentNameLines: string[] = []
  let currentTags: string[] = []
  let currentPoseData: string[] = []
  let readingPose = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')

    // Linha vazia indica separação ou inicio
    if (!line.trim()) {
      continue
    }

    // Se começa com 4 espaços ou tab, é dado da pose
    if (line.startsWith('    ') || line.startsWith('\t')) {
      readingPose = true
      currentPoseData.push(line.trim())
      continue
    }

    // Se estávamos lendo pose e agora vem texto não-indentado, salvamos o nó anterior
    if (readingPose) {
      if (currentNameLines.length > 0) {
        const name = currentNameLines.join(' ').replace(/\\n/g, ' ').trim()
        if (name) {
          nodes.push({
            id: `gm-${nodes.length + 1}`,
            name,
            tags: currentTags,
            poseData: currentPoseData,
          })
        }
      }
      // Reset
      currentNameLines = []
      currentTags = []
      currentPoseData = []
      readingPose = false
    }

    // Se é linha de tags
    if (line.startsWith('tags:')) {
      const tagsStr = line.substring(5).trim()
      currentTags = tagsStr ? tagsStr.split(/\s+/) : []
    } else {
      // É parte do nome do nó
      currentNameLines.push(line.trim())
    }
  }

  // Último nó caso o arquivo termine com ele
  if (currentNameLines.length > 0) {
    const name = currentNameLines.join(' ').replace(/\\n/g, ' ').trim()
    if (name) {
      nodes.push({
        id: `gm-${nodes.length + 1}`,
        name,
        tags: currentTags,
        poseData: currentPoseData,
      })
    }
  }

  return nodes
}

// ─── Mapeamento de tags GrappleMap → campos do schema canônico ────────────────

const TAG_TO_GAME_PHASE: Record<string, string> = {
  standing: 'standing',
  guard: 'guard',
  full_guard: 'guard',
  half_guard: 'guard',
  butterfly: 'guard',
  x_guard: 'guard',
  spider_guard: 'guard',
  de_la_riva: 'guard',
  passing: 'passing',
  knee_slice: 'passing',
  side_control: 'control',
  mount: 'control',
  back: 'control',
  submission: 'finish',
  kimura: 'finish',
  guillotine: 'finish',
  armbar: 'finish',
  triangle: 'finish',
  rnc: 'finish',
  rear_naked_choke: 'finish',
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

async function fetchGrappleMap(): Promise<GrappleMapParsedNode[]> {
  console.log(`📥 Baixando GrappleMap.txt de: ${GRAPPLEMAP_RAW_URL}`)
  const res = await fetch(GRAPPLEMAP_RAW_URL)
  if (!res.ok) throw new Error(`Falha ao baixar GrappleMap: ${res.status} ${res.statusText}`)
  const text = await res.text()
  return parseGrappleMapTxt(text)
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

  // Baixa e faz parse dos dados
  const nodes = await fetchGrappleMap()

  console.log(`\n✅ GrappleMap parsed: ${nodes.length} posições encontradas.\n`)

  if (nodes.length === 0) {
    console.warn('⚠️  Nenhuma posição encontrada no GrappleMap.txt.')
    process.exit(1)
  }

  // Obtém ou cria a fonte no banco
  let sourceId: string | null = null
  const { data: srcData } = await supabase.from('sources').select('id').eq('key', 'grapplemap').maybeSingle()
  if (srcData?.id) {
    sourceId = srcData.id
  } else {
    const { data: bjjData } = await supabase.from('sources').select('id').limit(1).maybeSingle()
    if (bjjData?.id) {
      sourceId = bjjData.id
    } else {
      const { data: newSrc, error: srcErr } = await supabase
        .from('sources')
        .insert({ key: 'grapplemap', name: 'GrappleMap Public' })
        .select('id')
        .single()
      if (srcErr) throw new Error(`Falha ao criar source 'grapplemap': ${srcErr.message}`)
      sourceId = newSrc.id
    }
  }

  // ── Prepara nós (source_nodes) ───────────────────────────────────────────────
  const seenSlugs = new Set<string>()
  const nodeRows = nodes.map((pos) => {
    let slug = `gm-${toSlug(pos.name)}`
    if (!slug || slug === 'gm-') slug = `gm-${pos.id}`

    if (seenSlugs.has(slug)) {
      let count = 2
      while (seenSlugs.has(`${slug}-${count}`)) count++
      slug = `${slug}-${count}`
    }
    seenSlugs.add(slug)

    const gamePhasesArr = tagsToGamePhases(pos.tags)
    const giNogiVal = tagsToGiNogi(pos.tags)

    return {
      source_id:       sourceId,
      external_id:     pos.id,
      node_type:       'position',
      name:            pos.name,
      description:     `Importado do GrappleMap. Tags: ${pos.tags.join(', ')}`,
      canonical_id:    slug,
      preferred_name:  pos.name,
      aliases: JSON.stringify([{
        name:       pos.name,
        lang:       'en',
        lineage:    'grapplemap',
        type:       'technical',
        popularity: 0.5,
      }]),
      hierarchy_level:  null,
      gi_nogi:          giNogiVal,
      game_phase:       gamePhasesArr,
      media_refs:       JSON.stringify([]),
      source_origin:    'grapplemap',
      review_status:    'approved',
      approved_by:      null,
      approved_at:      new Date().toISOString(),
      ai_confidence:    null,
      stats:            JSON.stringify({}),
      game_asset_ref:   null,
      stamina_cost:     null,
    }
  })

  if (DRY_RUN) {
    console.log('📋 PREVIEW — Primeiras 5 posições que serão inseridas:')
    nodeRows.slice(0, 5).forEach((n, idx) => {
      console.log(`  ${idx + 1}. [${n.external_id}] "${n.name}"`)
      console.log(`     Slug: ${n.canonical_id} | Gi/Nogi: ${n.gi_nogi} | Fases: ${n.game_phase.join(', ') || 'Nenhuma'}`)
    })
    console.log(`\n📋 Total a ser inserido: ${nodeRows.length} posições.`)
    console.log('\n✅ Dry-run concluído com sucesso. Nenhum dado inserido no banco.')
    return
  }

  // ── Inserção real ─────────────────────────────────────────────────────────────
  console.log(`\n📤 Inserindo ${nodeRows.length} posições em source_nodes...`)
  await upsertBatch(supabase, 'source_nodes', nodeRows, 'source_id,external_id')
  console.log(`✅ ${nodeRows.length} posições inseridas/atualizadas no Supabase!`)

  console.log('\n🎉 Importação do GrappleMap concluída com sucesso!')
  console.log(`   Verifique no Supabase: source_origin = 'grapplemap'`)
}

main().catch(e => {
  console.error('\n❌ Erro fatal:', e)
  process.exit(1)
})
