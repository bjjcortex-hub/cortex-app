# BJJ Explorer — Architecture

## Visão geral

O BJJ Explorer é um SPA (React + Vite + TypeScript) que permite criar e explorar dois tipos de documentos:

- **Mindmap** — grafo visual de posições, transições e finalizações do BJJ
- **Fluxograma** — registro sequencial de trocas entre dois lutadores

Todos os documentos criados pelo usuário são armazenados no Supabase com isolamento por `owner_id` via RLS.

---

## Princípios arquiteturais

### 1. Tudo é um documento (`BjjDoc`)

Cada mindmap e cada fluxograma é um `BjjDoc` independente. Nunca existe um "estado global único" do app — o estado de cada canvas vive dentro do seu documento.

```
BjjDoc {
  id, type, title, ownerId, forkedFrom, visibility,
  createdAt, updatedAt, schemaVersion, data: { nodes[], edges[] }
}
```

### 2. O canvas nunca toca storage

Componentes de canvas só recebem `data` como prop e emitem `onSave(data)`. Quem persiste é o `DocumentRepository`. Isso permite trocar o backend sem tocar no canvas.

```
Canvas → (onSave) → DocumentRepository → Supabase
Canvas ← (data)  ← DocumentRepository ← Supabase
```

### 3. Repository pattern

`DocumentRepository` é uma interface em `src/core/repository/types.ts`.  
A implementação atual é `SupabaseDocumentRepository` em `src/infra/`.  
Para trocar de backend: implementar a interface, trocar o singleton `documentRepository`.

### 4. Um motor de canvas, dois modos

O canvas é genérico. Comportamentos específicos de cada modo ficam em `src/modes/<modo>/config.ts`:
- Tipos de nó disponíveis, cores, ícones
- Regras de conexão
- Serializer: `ModoState ↔ DocumentData`

Adicionar um terceiro modo = criar `src/modes/<novo>/config.ts` + `serializer.ts` + `View.tsx`.

---

## Estrutura de pastas

```
src/
├── core/
│   ├── document/types.ts        # BjjDoc, DocumentSummary, CanvasNode, CanvasEdge
│   └── repository/types.ts     # interface DocumentRepository
│
├── infra/
│   ├── auth.ts                  # initAnonymousAuth(), getCurrentOwnerId()
│   └── SupabaseDocumentRepository.ts
│
├── modes/
│   ├── mindmap/
│   │   ├── config.ts            # NodeTypeConfig, cores
│   │   ├── serializer.ts        # MindmapState ↔ DocumentData
│   │   └── MindmapView.tsx
│   └── fluxograma/
│       ├── config.ts
│       ├── serializer.ts        # FluxogramaState ↔ DocumentData
│       └── FluxogramaView.tsx
│
├── pages/
│   ├── DocsListPage.tsx         # /docs
│   └── DocPage.tsx              # /docs/:id
│
├── components/                  # UI compartilhada (NodeIcon, NodePanel…)
├── lib/                         # Utilitários (graphLoader, i18n, positioning…)
├── types.ts                     # NodeAttrs, EdgeAttrs (grafo BJJ)
├── App.tsx                      # RouterProvider + initAnonymousAuth
└── main.tsx
```

---

## Supabase

### Clientes

| Variável | Chave | Uso |
|---|---|---|
| `VITE_SUPABASE_KEY` | service_role | Leitura do grafo BJJ (`source_nodes`, `source_edges`) |
| `VITE_SUPABASE_ANON_KEY` | anon public | Auth anônimo + `user_documents` com RLS |

### Tabelas relevantes

| Tabela | Dono | RLS |
|---|---|---|
| `source_nodes` | knowledge graph (read-only) | `select` público |
| `source_edges` | knowledge graph (read-only) | `select` público |
| `user_documents` | usuário | CRUD restrito a `owner_id = auth.uid()` |

### Auth

O app usa **anonymous sign-in** do Supabase. Na primeira visita, `initAnonymousAuth()` cria uma sessão anônima silenciosamente. O `auth.uid()` é o `owner_id` de todos os documentos do usuário.

Quando autenticação real for adicionada, `supabase.auth.linkIdentity()` migra a sessão anônima para a conta real sem perder documentos.

---

## Dados do canvas por modo

### Mindmap

`data.nodes` = nós do grafo BJJ visíveis + posições de tela  
`data.edges` = edges ativas do grafo BJJ

```json
{
  "nodes": [{ "id": "<graphNodeId>", "type": "position", "title": "Guarda Fechada",
              "data": { "hidden": false, "faded": false, "locked": false },
              "position": { "x": 0, "y": 0 } }],
  "edges": [{ "id": "<graphEdgeId>", "source": "...", "target": "...", "active": true }]
}
```

### Fluxograma

`data.nodes` = steps da luta (cada step = um card de posição)  
`data.edges` = tentativas (transitions/submissions entre steps)

```json
{
  "nodes": [{ "id": "<stepId>", "type": "step",
              "data": { "posA": {...}, "posB": {...}, "nameA": "...", "nameB": "..." } }],
  "edges": [{ "id": "<attemptId>", "source": "<stepId>", "target": "<stepId>",
              "active": true, "data": { "actor": "A", "result": "success", "transName": "..." } }]
}
```

---

## Fases de implementação

| Fase | Status | Descrição |
|---|---|---|
| 1 — Foundation | ✅ | Types, repository, auth, migration SQL, ARCHITECTURE.md |
| 2 — Rotas + Canvas | ✅ | react-router-dom, DocsListPage, DocPage, serializers |
| 1-B — Schema canônico | ✅ | Migrations 002 e 003: evolui source_nodes com Bloco 3 completo + concept_proposals |
| 1-C — GrappleMap seed | ⏳ | Script import-grapplemap.ts — executar após migrations no banco |
| 1-D — Curator UI | ✅ | CuratorPage (/curador) + ConceptEditorPage (/conceitos/:id) |
| 1-E — Tipos canônicos | ✅ | src/core/canonical/types.ts + infra/CanonicalConceptRepository.ts |
| 3 — Motor de grafo | 🔮 | Probabilidades nas arestas — depende de dado real da Fase 2 |
| 4 — IA interpretativa | 🔮 | Vídeo/imagem/áudio → concept_proposals |
| 5 — Camadas de app | 🔮 | Jogo, academia, atleta — vistas sobre o mesmo core |

---

## Camada de Conceito Canônico

Ver `src/core/canonical/types.ts` para os tipos completos do Bloco 3.

```
src/core/canonical/
└── types.ts      # CanonicalConcept, ConceptAlias, ConceptProposal, ReviewAction…

src/infra/
├── CanonicalConceptRepository.ts  # CRUD de source_nodes + proposals
└── SupabaseDocumentRepository.ts  # CRUD de user_documents (inalterado)

src/pages/
├── CuratorPage.tsx       # /curador — fila de governança por tier de confiança
└── ConceptEditorPage.tsx # /conceitos/:id — editor completo com 5 abas

supabase/migrations/
├── 001_user_documents.sql         # user_documents (original)
├── 002_canonical_concept_schema.sql # evolui source_nodes + cria concept_proposals
└── 003_source_edges_canonical.sql   # adiciona weight/* em source_edges (placeholder)

scripts/
└── import-grapplemap.ts  # npm run import:grapplemap / import:grapplemap:dry
```

### Fluxo de governança (Bloco 4)

```
IA propõe → concept_proposals (status: pending, confidence_tier: high|medium|low)
                   ↓
Curador abre /curador → triagem por aba
                   ↓
✅ Aprovar → cria source_nodes (status: approved)
✏️ Editar → ConceptEditorPage → salva → aprova
🔀 Fundir → atualiza source_node existente
❌ Rejeitar → concept_proposals (status: rejected)
```

---

## Convenções
- **Sem acesso direto a localStorage** fora de `infra/` ou `lib/persistence.ts` (deprecated)
- **Sem chamadas Supabase** fora de `infra/` e `lib/graphLoader.ts`
- **Canvas props**: sempre `data: DocumentData` + `onSave: (data: DocumentData) => void`
- `schemaVersion` começa em 1; migrações de formato em `src/modes/<modo>/migrations/`
- **Conceitos canônicos**: a IA nunca cria `source_nodes` diretamente — sempre via `concept_proposals`
- **Peso das arestas**: campo `weight` em `source_edges` fica NULL até Fase 3
