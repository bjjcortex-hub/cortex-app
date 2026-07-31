import { createClient } from '@supabase/supabase-js'

const url = 'https://lotgnyjyprbkhjejdetn.supabase.co'
const key = 'sb_publishable_pdYyVGZeOlgaLwQK3EBNgw_9LtplI6A'

const supabase = createClient(url, key)

async function checkDocs() {
  const { data, error, count } = await supabase
    .from('user_documents')
    .select('id, type, title, visibility', { count: 'exact' })

  if (error) {
    console.error('Error fetching documents:', error)
    return
  }

  const fluxogramas = data?.filter(d => d.type === 'fluxograma') || []
  const mindmaps    = data?.filter(d => d.type === 'mindmap') || []

  console.log(`Total documentos no Supabase: ${count ?? data?.length}`)
  console.log(`- Fluxogramas: ${fluxogramas.length}`)
  console.log(`- Mindmaps: ${mindmaps.length}`)
  if (fluxogramas.length > 0) {
    console.log('Exemplos de fluxogramas:', fluxogramas.map(f => f.title))
  }
}

checkDocs()
