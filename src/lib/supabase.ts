import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const serviceKey = import.meta.env.VITE_SUPABASE_KEY      as string
const anonKey    = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente com service_role — usado exclusivamente para ler o grafo BJJ
// (source_nodes, source_edges). Nunca usado para user_documents.
// persistSession:false evita que este cliente use a sessão anônima do localStorage.
export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// Cliente com anon key — usado para auth anônimo + user_documents com RLS.
// A anon key é segura para expor no frontend; o RLS garante isolamento por uid.
export const supabaseAnon = createClient(url, anonKey ?? serviceKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
