/**
 * Migration: create parent nodes for submission groups and set parent_external_id.
 *
 * Logic:
 * - Group all submissions by base name (everything before "-from-" in external_id)
 * - Groups with 2+ members need a parent
 * - If a member with ext === base exists → it becomes the parent (no new node needed)
 * - If no standalone exists → create a new parent node
 * - Then update all non-parent members with parent_external_id = base
 */

import { createClient } from '@supabase/supabase-js'

const URL  = 'https://rjrzhjbnexxmogjftvqa.supabase.co'
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcnpoamJuZXh4bW9namZ0dnFhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg3MzMwMSwiZXhwIjoyMTAwNDQ5MzAxfQ.vt2OHR0Oclw2S76FJRq-x44DGVlMXwyKCTpX-DMyW58'
const DRY  = process.argv.includes('--dry-run')

const sb = createClient(URL, KEY)

// ── 1. Fetch source ID ──────────────────────────────────────────────────────
const { data: src } = await sb.from('sources').select('id').eq('key', 'bjjgraph').single()
const SOURCE_ID = src.id
console.log('Source ID:', SOURCE_ID)

// ── 2. Fetch all submissions ─────────────────────────────────────────────────
let all = []
let from = 0
while (true) {
  const { data } = await sb.from('source_nodes')
    .select('id, name, external_id, node_type, parent_external_id')
    .eq('source_id', SOURCE_ID)
    .eq('node_type', 'submission')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log('Total submissions fetched:', all.length)

// ── 3. Group by base name ────────────────────────────────────────────────────
const groups = {}
for (const n of all) {
  const base = n.external_id.includes('-from-')
    ? n.external_id.split('-from-')[0]
    : n.external_id
  if (!groups[base]) groups[base] = []
  groups[base].push(n)
}

// ── 4. Names for groups that need a new parent node ─────────────────────────
const NEW_PARENT_NAMES = {
  'anaconda-choke':   { name: 'Estrangulamento Anaconda', name_en: 'Anaconda Choke' },
  'aoki-lock':        { name: 'Chave Aoki',               name_en: 'Aoki Lock' },
  'arm-triangle':     { name: 'Triângulo de Braço',        name_en: 'Arm Triangle' },
  'buggy-choke':      { name: 'Estrangulamento Buggy',     name_en: 'Buggy Choke' },
  'clock-choke':      { name: 'Estrangulamento Relógio',   name_en: 'Clock Choke' },
  'darce-choke':      { name: 'Estrangulamento Darce',     name_en: 'Darce Choke' },
  'estima-lock':      { name: 'Chave Estima',              name_en: 'Estima Lock' },
  'guillotine-choke': { name: 'Estrangulamento Guillotine',name_en: 'Guillotine Choke' },
  'heel-hook':        { name: 'Heel Hook',                 name_en: 'Heel Hook' },
  'kneebar':          { name: 'Kneebar',                   name_en: 'Kneebar' },
  'north-south-choke':{ name: 'Estrangulamento Norte-Sul', name_en: 'North South Choke' },
  'outside-heel-hook':{ name: 'Heel Hook Externo',         name_en: 'Outside Heel Hook' },
}

// ── 5. Process each group ────────────────────────────────────────────────────
let createdParents = 0
let updatedChildren = 0

for (const [base, members] of Object.entries(groups)) {
  if (members.length < 2) continue

  const standalone = members.find(m => m.external_id === base)
  const children   = members.filter(m => m.external_id !== base)

  // Create parent node if needed
  if (!standalone) {
    const names = NEW_PARENT_NAMES[base]
    if (!names) {
      console.warn('⚠ No name mapping for base:', base, '— skipping')
      continue
    }
    console.log(`CREATE parent: ${base} → "${names.name}"`)
    if (!DRY) {
      const { error } = await sb.from('source_nodes').insert({
        source_id:          SOURCE_ID,
        external_id:        base,
        node_type:          'submission',
        name:               names.name,
        raw:                JSON.stringify({ name: names.name_en }),
        parent_external_id: null,
        description:        null,
      })
      if (error) { console.error('Insert error:', error); continue }
    }
    createdParents++
  }

  // Update all children (members whose ext ≠ base) to point to parent
  const toUpdate = children.filter(m => m.parent_external_id !== base)
  if (toUpdate.length === 0) continue

  console.log(`UPDATE ${toUpdate.length} children of ${base}`)
  if (!DRY) {
    const ids = toUpdate.map(m => m.id)
    const { error } = await sb.from('source_nodes')
      .update({ parent_external_id: base })
      .in('id', ids)
    if (error) { console.error('Update error:', error); continue }
  }
  updatedChildren += toUpdate.length
}

console.log('\n=== Summary ===')
console.log(`Parent nodes created: ${createdParents}`)
console.log(`Children updated:     ${updatedChildren}`)
if (DRY) console.log('(DRY RUN — no changes written)')
