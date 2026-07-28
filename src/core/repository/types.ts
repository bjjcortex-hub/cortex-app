import type { BjjDoc, DocumentSummary, NewDocument } from '../document/types'

// ─── DocumentRepository ───────────────────────────────────────────────────────
// Interface única de persistência. O canvas nunca chama storage diretamente.
// Trocar a implementação (localStorage → Supabase → outra API) não exige
// nenhuma mudança nos componentes de canvas ou de UI.

export interface DocumentRepository {
  // Retorna sumários leves — sem data.nodes/edges — para a tela de listagem.
  list(ownerId: string): Promise<DocumentSummary[]>

  // Carrega o documento completo incluindo data.
  get(id: string): Promise<BjjDoc>

  // Cria e retorna o documento persistido (com id e timestamps preenchidos).
  create(doc: NewDocument): Promise<BjjDoc>

  // Atualiza campos permitidos. updatedAt é gerenciado pelo banco.
  update(
    id: string,
    patch: Partial<Pick<BjjDoc, 'title' | 'visibility' | 'data'>>
  ): Promise<BjjDoc>

  // Remove permanentemente.
  remove(id: string): Promise<void>

  // Copia um documento de outro usuário, preenchendo forkedFrom.
  // Stub por enquanto — implementação completa na fase de galeria.
  fork(id: string, newOwnerId: string): Promise<BjjDoc>
}
