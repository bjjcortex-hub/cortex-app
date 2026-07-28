import { supabaseAnon } from '../lib/supabase'

// ─── Auth anônimo ─────────────────────────────────────────────────────────────
// Garante que o usuário tem um auth.uid() real desde a primeira visita.
// Quando auth real for adicionado: supabase.auth.linkIdentity() migra a sessão
// anônima para a conta do usuário sem perder os documentos.

let _ownerId: string | null = null

export async function initAnonymousAuth(): Promise<string> {
  // Sessão já existe (reload normal)
  const { data: { session } } = await supabaseAnon.auth.getSession()
  if (session?.user) {
    _ownerId = session.user.id
    return _ownerId
  }

  // Primeira visita: cria sessão anônima
  const { data, error } = await supabaseAnon.auth.signInAnonymously()
  if (error || !data.user) {
    throw new Error(`Falha ao criar sessão anônima: ${error?.message}`)
  }

  _ownerId = data.user.id
  return _ownerId
}

// Retorna o ownerId da sessão ativa.
// Chamado pelos componentes e pelo SupabaseDocumentRepository.
// Lança se initAnonymousAuth() não foi chamado ainda.
export function getCurrentOwnerId(): string {
  if (!_ownerId) throw new Error('initAnonymousAuth() não foi chamado')
  return _ownerId
}

// Ouve mudanças de sessão (ex.: quando auth real for adicionado no futuro)
export function onAuthChange(cb: (ownerId: string | null) => void): () => void {
  const { data: { subscription } } = supabaseAnon.auth.onAuthStateChange((_event, session) => {
    _ownerId = session?.user?.id ?? null
    cb(_ownerId)
  })
  return () => subscription.unsubscribe()
}
