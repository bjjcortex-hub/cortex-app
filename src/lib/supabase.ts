import { createClient } from '@supabase/supabase-js'

const url     = import.meta.env.VITE_SUPABASE_URL  as string
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY) as string

// Cliente para leitura de nós/arestas e dados públicos
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// Cliente para autenticação anônima do usuário e user_documents
export const supabaseAnon = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
