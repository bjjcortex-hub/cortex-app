import { supabaseAnon } from '../lib/supabase'
import type { DocumentRepository } from '../core/repository/types'
import type { BjjDoc, DocumentSummary, NewDocument } from '../core/document/types'

// ─── mapeamento DB → domínio ──────────────────────────────────────────────────

interface DbRow {
  id:             string
  type:           string
  title:          string
  owner_id:       string
  forked_from:    string | null
  visibility:     string
  created_at:     string
  updated_at:     string
  schema_version: number
  data:           Record<string, unknown>
}

function rowToDoc(row: DbRow): BjjDoc {
  return {
    id:            row.id,
    type:          row.type          as BjjDoc['type'],
    title:         row.title,
    ownerId:       row.owner_id,
    forkedFrom:    row.forked_from,
    visibility:    row.visibility    as BjjDoc['visibility'],
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
    schemaVersion: row.schema_version,
    data:          row.data          as unknown as BjjDoc['data'],
  }
}

function rowToSummary(row: DbRow): DocumentSummary {
  return {
    id:         row.id,
    type:       row.type       as BjjDoc['type'],
    title:      row.title,
    visibility: row.visibility as BjjDoc['visibility'],
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

// ─── implementação ────────────────────────────────────────────────────────────

export class SupabaseDocumentRepository implements DocumentRepository {

  async list(ownerId: string): Promise<DocumentSummary[]> {
    const { data, error } = await supabaseAnon
      .from('user_documents')
      .select('id, type, title, visibility, created_at, updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })

    if (error) throw new Error(`list: ${error.message}`)
    return (data as DbRow[]).map(rowToSummary)
  }

  async listPublic(): Promise<DocumentSummary[]> {
    const { data, error } = await supabaseAnon
      .from('user_documents')
      .select('id, type, title, visibility, created_at, updated_at')
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })

    if (error) throw new Error(`listPublic: ${error.message}`)
    return (data as DbRow[]).map(rowToSummary)
  }

  async get(id: string): Promise<BjjDoc> {
    const { data, error } = await supabaseAnon
      .from('user_documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw new Error(`get: ${error.message}`)
    return rowToDoc(data as DbRow)
  }

  async create(doc: NewDocument): Promise<BjjDoc> {
    const { data, error } = await supabaseAnon
      .from('user_documents')
      .insert({
        type:           doc.type,
        title:          doc.title,
        owner_id:       doc.ownerId,
        forked_from:    doc.forkedFrom,
        visibility:     doc.visibility,
        schema_version: doc.schemaVersion,
        data:           doc.data,
      })
      .select('*')
      .single()

    if (error) throw new Error(`create: ${error.message}`)
    return rowToDoc(data as DbRow)
  }

  async update(
    id: string,
    patch: Partial<Pick<BjjDoc, 'title' | 'visibility' | 'data'>>
  ): Promise<BjjDoc> {
    const dbPatch: Record<string, unknown> = {}
    if (patch.title      !== undefined) dbPatch.title      = patch.title
    if (patch.visibility !== undefined) dbPatch.visibility = patch.visibility
    if (patch.data       !== undefined) dbPatch.data       = patch.data

    const { data, error } = await supabaseAnon
      .from('user_documents')
      .update(dbPatch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw new Error(`update: ${error.message}`)
    return rowToDoc(data as DbRow)
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabaseAnon
      .from('user_documents')
      .delete()
      .eq('id', id)

    if (error) throw new Error(`remove: ${error.message}`)
  }

  async fork(id: string, newOwnerId: string): Promise<BjjDoc> {
    const original = await this.get(id)
    return this.create({
      type:          original.type,
      title:         `${original.title} (cópia)`,
      ownerId:       newOwnerId,
      forkedFrom:    original.id,
      visibility:    'private',
      schemaVersion: original.schemaVersion,
      data:          original.data,
    })
  }
}

// Singleton — a aplicação usa esta instância em toda parte
export const documentRepository = new SupabaseDocumentRepository()
