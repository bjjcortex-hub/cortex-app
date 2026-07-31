import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_REF || 'lotgnyjyprbkhjejdetn'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''

function loadEnv(): Record<string, string> {
  const envPaths = ['.env.local', '.env']
  for (const p of envPaths) {
    const full = resolve(process.cwd(), p)
    if (existsSync(full)) {
      const lines = readFileSync(full, 'utf-8').split('\n')
      const env: Record<string, string> = {}
      for (const line of lines) {
        const match = line.match(/^([^#=]+)=(.*)$/)
        if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
      }
      return env
    }
  }
  return {}
}

async function executeSql(token: string, sql: string, name: string) {
  console.log(`⚡ Executando migration ${name}...`)

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Falha ao executar ${name}: ${res.status} ${res.statusText}\n${errorText}`)
  }

  console.log(`✅ Migration ${name} executada com sucesso!`)
}

async function main() {
  const env = loadEnv()
  const token = TOKEN || env['SUPABASE_ACCESS_TOKEN'] || process.argv[2]

  if (!token) {
    console.error('❌ Defina SUPABASE_ACCESS_TOKEN ou passe o token como argumento')
    process.exit(1)
  }

  const sql002 = readFileSync(resolve(process.cwd(), 'supabase/migrations/002_canonical_concept_schema.sql'), 'utf-8')
  const sql003 = readFileSync(resolve(process.cwd(), 'supabase/migrations/003_source_edges_canonical.sql'), 'utf-8')

  await executeSql(token, sql002, '002_canonical_concept_schema.sql')
  await executeSql(token, sql003, '003_source_edges_canonical.sql')

  console.log('\n🎉 Todas as migrations foram aplicadas no Supabase!')
}

main().catch(err => {
  console.error('\n❌ Erro:', err)
  process.exit(1)
})
