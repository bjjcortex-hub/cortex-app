import { supabaseAnon } from './supabase'
import type { DocumentSummary, DocumentData, BjjDoc } from '../core/document/types'

async function getOwnerId(): Promise<string> {
  const { data: { session } } = await supabaseAnon.auth.getSession()
  const uid = session?.user?.id
  if (!uid) throw new Error('Not authenticated')
  return uid
}

type SummaryRow = {
  id:         string
  type:       string
  title:      string
  visibility: string
  created_at: string
  updated_at: string
}

function rowToSummary(row: SummaryRow): DocumentSummary {
  return {
    id:         row.id,
    type:       row.type       as BjjDoc['type'],
    title:      row.title,
    visibility: row.visibility as BjjDoc['visibility'],
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

export async function listMindmaps(): Promise<DocumentSummary[]> {
  const ownerId = await getOwnerId()
  const { data, error } = await supabaseAnon
    .from('user_documents')
    .select('id, type, title, visibility, created_at, updated_at')
    .eq('owner_id', ownerId)
    .eq('type', 'mindmap')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as SummaryRow[]).map(rowToSummary)
}

export async function saveMindmap(title: string, docData: DocumentData): Promise<DocumentSummary> {
  const ownerId = await getOwnerId()
  const { data, error } = await supabaseAnon
    .from('user_documents')
    .insert({
      type:       'mindmap',
      title,
      owner_id:   ownerId,
      visibility: 'private',
      data:       docData,
    })
    .select('id, type, title, visibility, created_at, updated_at')
    .single()
  if (error) throw error
  return rowToSummary(data as SummaryRow)
}

export async function getMindmapData(id: string): Promise<DocumentData> {
  const { data, error } = await supabaseAnon
    .from('user_documents')
    .select('data')
    .eq('id', id)
    .single()
  if (error) throw error
  return (data as { data: DocumentData }).data
}

export async function deleteMindmap(id: string): Promise<void> {
  const { error } = await supabaseAnon
    .from('user_documents')
    .delete()
    .eq('id', id)
  if (error) throw error
}
