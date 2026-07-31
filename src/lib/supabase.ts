import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://lotgnyjyprbkhjejdetn.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_pdYyVGZeOlgaLwQK3EBNgw_9LtplI6A'

// Cliente para leitura de nós/arestas e dados públicos
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// Cliente para autenticação anônima do usuário e user_documents
export const supabaseAnon = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
