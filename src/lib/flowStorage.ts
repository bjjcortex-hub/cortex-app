import { supabaseAnon } from './supabase'

export interface FlowRecord {
  id: string
  name: string
  nameA: string
  nameB: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: any[]
  savedAt: string
  date?: string
  description?: string
  videoLink?: string
}

async function getOwnerId(): Promise<string> {
  const { data: { session } } = await supabaseAnon.auth.getSession()
  const uid = session?.user?.id
  if (!uid) throw new Error('Not authenticated')
  return uid
}

type DbRow = { id: string; title: string; data: Record<string, unknown>; updated_at: string }

function rowToRecord(row: DbRow): FlowRecord {
  return {
    id:          row.id,
    name:        row.title,
    nameA:       (row.data.nameA       as string) ?? 'Lutador A',
    nameB:       (row.data.nameB       as string) ?? 'Lutador B',
    steps:       (row.data.steps       as unknown[]) ?? [],
    savedAt:     (row.data.savedAt     as string) ?? row.updated_at,
    date:        row.data.date         as string | undefined,
    description: row.data.description  as string | undefined,
    videoLink:   row.data.videoLink    as string | undefined,
  }
}

export async function loadFlows(): Promise<FlowRecord[]> {
  const ownerId = await getOwnerId()
  const { data, error } = await supabaseAnon
    .from('user_documents')
    .select('id, title, data, updated_at')
    .eq('owner_id', ownerId)
    .eq('type', 'fluxograma')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as DbRow[]).map(rowToRecord)
}

export async function saveFlowToDB(flow: Omit<FlowRecord, 'id'>): Promise<FlowRecord> {
  const ownerId = await getOwnerId()
  const { name, nameA, nameB, steps, savedAt, date, description, videoLink } = flow
  const { data, error } = await supabaseAnon
    .from('user_documents')
    .insert({
      type:       'fluxograma',
      title:      name,
      owner_id:   ownerId,
      visibility: 'private',
      data:       { nameA, nameB, steps, savedAt, date, description, videoLink },
    })
    .select('id, title, data, updated_at')
    .single()
  if (error) throw error
  return rowToRecord(data as DbRow)
}

export async function deleteFlowFromDB(id: string): Promise<void> {
  const { error } = await supabaseAnon
    .from('user_documents')
    .delete()
    .eq('id', id)
  if (error) throw error
}
