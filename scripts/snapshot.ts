/**
 * npm run snapshot
 * Downloads the full bjjgraph dataset from Supabase to public/graph-snapshot.json.
 * Set VITE_OFFLINE=true in .env.local to load from the snapshot instead of Supabase.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

config({ path: '.env.local' })

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_KEY
if (!url || !key) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_KEY must be set in .env.local')
  process.exit(1)
}

const sb = createClient(url, key)
const PAGE = 2000

async function fetchAll<T>(
  queryFn: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const results: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    results.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return results
}

async function main() {
  console.log('Fetching bjjgraph source ID…')
  const { data: src, error: srcErr } = await sb.from('sources').select('id').eq('key', 'bjjgraph').single()
  if (srcErr || !src) throw new Error('Source not found: ' + String(srcErr))
  const sourceId = (src as { id: string }).id

  console.log('Fetching nodes…')
  const nodes = await fetchAll((from, to) =>
    sb
      .from('source_nodes')
      .select('id, external_id, node_type, name, parent_external_id, source_node_roles(role, position_type), position_dominance(score)')
      .eq('source_id', sourceId)
      .range(from, to) as Promise<{ data: unknown[] | null; error: unknown }>
  )
  console.log(`  ${nodes.length} nodes`)

  console.log('Fetching edges…')
  const edges = await fetchAll((from, to) =>
    sb
      .from('source_edges')
      .select('id, src_node_id, dst_node_id, edge_type, role, attempt_pct, success_rate, is_submission, label')
      .eq('source_id', sourceId)
      .not('dst_node_id', 'is', null)
      .range(from, to) as Promise<{ data: unknown[] | null; error: unknown }>
  )
  console.log(`  ${edges.length} edges`)

  const snapshot = { nodes, edges, generated_at: new Date().toISOString() }
  const outPath = resolve('public', 'graph-snapshot.json')
  mkdirSync(resolve('public'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(snapshot))
  console.log(`Snapshot written to ${outPath} (${Math.round(JSON.stringify(snapshot).length / 1024)} KB)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
