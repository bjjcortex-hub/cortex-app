// ─── Tipos centrais de documento ─────────────────────────────────────────────
// Toda a aplicação conversa com estes tipos.
// O canvas nunca importa de infra/ ou de lib/persistence.

export type DocumentType       = 'mindmap' | 'fluxograma'
export type DocumentVisibility = 'private' | 'public'

// ── Formato unificado do canvas ───────────────────────────────────────────────

export interface CanvasNode {
  id:         string
  type:       string                      // 'position' | 'transition' | 'step' | …
  title:      string
  children?:  string[]                    // filhos agrupados
  data:       Record<string, unknown>     // payload específico do modo
  position?:  { x: number; y: number }   // presente nos modos de canvas livre
}

export interface CanvasEdge {
  id:            string
  source:        string
  sourceHandle?: string                   // 'success' | 'failure' | porta nomeada
  target:        string
  color?:        string
  active:        boolean
  data?:         Record<string, unknown>
}

export interface DocumentData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// ── Documento completo ────────────────────────────────────────────────────────

export interface BjjDoc {
  id:            string
  type:          DocumentType
  title:         string
  ownerId:       string
  forkedFrom:    string | null           // null enquanto galeria não existir
  visibility:    DocumentVisibility      // 'private' por padrão
  createdAt:     string                  // ISO-8601
  updatedAt:     string                  // ISO-8601
  schemaVersion: number                  // começa em 1; permite migrações futuras
  data:          DocumentData
}

// ── Sumário leve para listagem ────────────────────────────────────────────────
// Não carrega data (nodes/edges) — evita transferir payloads pesados na lista.

export interface DocumentSummary
  extends Pick<BjjDoc, 'id' | 'type' | 'title' | 'visibility' | 'createdAt' | 'updatedAt'> {}

// ── Helper para criação ───────────────────────────────────────────────────────

export type NewDocument = Omit<BjjDoc, 'id' | 'createdAt' | 'updatedAt'>
