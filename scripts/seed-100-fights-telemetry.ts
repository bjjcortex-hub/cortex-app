const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_REF || 'lotgnyjyprbkhjejdetn'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.argv[2] || ''

async function executeSql(sql: string) {
  if (!TOKEN) {
    console.log('Skipping Management API execution (no token provided).')
    return []
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`SQL Error: ${res.status} ${res.statusText}\n${errorText}`)
  }
  return res.json()
}

// ── 1. Dados de 100 Lutas do BJJ Cortex Cards ────────────────────────────────

const TR = [
 {id:"t01",t:"t",title:"Puxada de guarda",who:"A",n:16,from:"empe",to:"abe-b",cor:0,g:"Entradas"},
 {id:"t02",t:"t",title:"Puxada de guarda",who:"A",n:10,from:"empe",to:"dlr-b",cor:0,g:"Entradas"},
 {id:"t03",t:"t",title:"Puxada de guarda",who:"A",n:8,from:"empe",to:"fech-b",cor:0,g:"Entradas"},
 {id:"t04",t:"t",title:"Puxada de guarda",who:"B",n:14,from:"empe",to:"abe-c",cor:0,g:"Entradas"},
 {id:"t05",t:"t",title:"Puxada de guarda",who:"B",n:6,from:"empe",to:"fech-c",cor:0,g:"Entradas"},
 {id:"t06",t:"t",title:"Single leg",who:"A",n:10,from:"empe",to:"abe-c",cor:0,g:"Entradas"},
 {id:"t07",t:"t",title:"Single leg",who:"A",n:8,from:"empe",to:"meia-c",cor:0,g:"Entradas"},
 {id:"t08",t:"t",title:"Double leg",who:"A",n:6,from:"empe",to:"p100-c",cor:0,g:"Entradas"},
 {id:"t09",t:"t",title:"Queda sofrida",who:"B",n:7,from:"empe",to:"meia-b",cor:0,g:"Entradas"},
 {id:"t10",t:"t",title:"Disputa de pegada",who:"A",n:4,from:"joe",to:"abe-c",cor:0,g:"Entradas"},

 {id:"t11",t:"t",title:"Abertura de guarda",who:"A",n:6,from:"fech-c",to:"hq-c",cor:1,g:"Passagens"},
 {id:"t12",t:"t",title:"Entrada headquarters",who:"A",n:15,from:"abe-c",to:"hq-c",cor:1,g:"Passagens"},
 {id:"t13",t:"t",title:"Passagem de meia",who:"A",n:9,from:"meia-c",to:"p100-c",cor:1,g:"Passagens"},
 {id:"t14",t:"t",title:"Abertura de guarda",who:"B",n:6,from:"fech-b",to:"abe-b",cor:1,g:"Passagens"},
 {id:"t15",t:"t",title:"Entrada headquarters",who:"B",n:7,from:"abe-b",to:"hq-b",cor:1,g:"Passagens"},
 {id:"t16",t:"t",title:"Leg drag",who:"B",n:4,from:"dlr-b",to:"leg-b",cor:1,g:"Passagens"},
 {id:"t17",t:"t",title:"Toreando",who:"B",n:5,from:"ara-b",to:"p100-b",cor:1,g:"Passagens"},
 {id:"t18",t:"t",title:"Passagem knee cut",who:"A",n:10,from:"hq-c",to:"p100-c",cor:2,g:"Passagens"},
 {id:"t19",t:"t",title:"Leg drag",who:"A",n:9,from:"hq-c",to:"leg-c",cor:2,g:"Passagens"},
 {id:"t20",t:"t",title:"Forçou o casco",who:"A",n:6,from:"hq-c",to:"tur-c",cor:2,g:"Passagens"},

 {id:"t24",t:"t",title:"Raspagem tesoura",who:"A",n:6,from:"abe-b",to:"abe-c",fTo:"p100-b",fN:2,cor:1,g:"Raspagens"},
 {id:"t25",t:"t",title:"Raspagem De la Riva",who:"A",n:5,from:"dlr-b",to:"hq-c",fTo:"leg-b",fN:2,cor:1,g:"Raspagens"},
 {id:"t26",t:"t",title:"Raspagem de meia",who:"A",n:4,from:"meia-b",to:"meia-c",cor:1,g:"Raspagens"},
 {id:"t27",t:"t",title:"Flower sweep",who:"A",n:3,from:"fech-b",to:"mon-c",cor:1,g:"Raspagens"},
 {id:"t28",t:"t",title:"Raspagem SLX",who:"A",n:4,from:"slx-a",to:"hq-c",cor:2,g:"Raspagens"},

 {id:"t32",t:"t",title:"Reposição de guarda",who:"A",n:8,from:"p100-b",to:"abe-b",cor:2,g:"Escapes"},
 {id:"t33",t:"t",title:"Fuga de quadril",who:"A",n:4,from:"mon-b",to:"meia-b",cor:2,g:"Escapes"},
 {id:"t34",t:"t",title:"Fuga das costas",who:"A",n:3,from:"cos-b",to:"abe-b",cor:2,g:"Escapes"},

 {id:"t37",t:"t",title:"Progressão p/ montada",who:"A",n:9,from:"p100-c",to:"mon-c",cor:3,g:"Progressões"},
 {id:"t38",t:"t",title:"Joelho na barriga",who:"A",n:8,from:"p100-c",to:"jnb-c",cor:3,g:"Progressões"},
 {id:"t40",t:"t",title:"Pegada das costas",who:"A",n:5,from:"mon-c",to:"cos-c",cor:3,g:"Progressões"},

 {id:"t44",t:"s",title:"Armlock / estrang. da montada",who:"A",n:10,from:"mon-c",to:"fin-arm-estr",resultTo:"vit-fin",escTo:"abe-b",escN:5,cor:3,g:"Finalizações"},
 {id:"t45",t:"s",title:"Estrang. pelas costas",who:"A",n:8,from:"cos-c",to:"fin-estrang",resultTo:"vit-fin",escTo:"tur-c",escN:4,cor:3,g:"Finalizações"},
 {id:"t46",t:"s",title:"Americana / estrang. 100 kg",who:"A",n:5,from:"p100-c",to:"fin-amer-estr",resultTo:"vit-fin",escTo:"p100-c",escN:3,cor:3,g:"Finalizações"},
 {id:"t47",t:"s",title:"Triângulo da guarda aberta",who:"A",n:3,from:"abe-b",to:"fin-triangulo",resultTo:"vit-fin",escTo:"p100-b",escN:4,cor:1,g:"Finalizações"},
]

async function seed() {
  console.log('🌱 Seeding 100 Lutas do BJJ Cortex via Supabase Management API...')

  const userRes = await executeSql(`SELECT id FROM auth.users LIMIT 1;`)
  let userId = userRes && userRes.length > 0 ? userRes[0].id : null

  if (!userId) {
    const newUserRes = await executeSql(`
      INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, role, aud)
      VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000000',
        'cortex-seed@bjjcortex.com',
        'nopassword',
        now(),
        now(),
        now(),
        'authenticated',
        'authenticated'
      )
      RETURNING id;
    `)
    if (newUserRes && newUserRes.length > 0) userId = newUserRes[0].id
  }

  if (userId) {
    const docTitle = 'Mapa Canônico — Telemetria de 100 Lutas do BJJ Cortex'
    const insertDocSql = `
      INSERT INTO user_documents (type, title, owner_id, visibility, schema_version, data)
      VALUES (
        'fluxograma',
        '${docTitle}',
        '${userId}',
        'public',
        1,
        '{"nodes":[], "edges":[]}'::jsonb
      );
    `
    await executeSql(insertDocSql)
  }

  const maxN = 16.0
  let updatedCount = 0

  for (const t of TR) {
    const totalAttempts = (t.n || 0) + (t.escN || 0) + (t.fN || 0)
    const successRate = totalAttempts > 0 ? (t.n / totalAttempts) : (t.n / maxN)
    const weight = Math.round(Math.max(0.1, Math.min(1.0, successRate)) * 100) / 100

    const updateEdgeSql = `
      UPDATE source_edges
      SET weight = ${weight},
          weight_context = 'competition_100_fights',
          weight_source = 'bjj_cortex_cards_v1'
      WHERE label ILIKE '%${t.title.replace(/'/g, "''")}%';
    `
    await executeSql(updateEdgeSql)
    updatedCount++
  }

  console.log(`🎉 Telemetria populada com sucesso! ${updatedCount} transições atualizadas com probabilidades reais de uso ($0.10 \\rightarrow 1.00$).`)
}

seed().catch(console.error)
