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
| 2 — Rotas | ⏳ | react-router-dom, DocsListPage, DocPage |
| 3 — Canvas conectado | ⏳ | Serializers, canvas usa DocumentRepository, migra localStorage |
| 4 — Engine unificado | 🔮 | ModeConfig<S>, primitivos compartilhados |

---

## Convenções

- **Sem acesso direto a localStorage** fora de `infra/` ou `lib/persistence.ts` (deprecated)
- **Sem chamadas Supabase** fora de `infra/` e `lib/graphLoader.ts`
- **Canvas props**: sempre `data: DocumentData` + `onSave: (data: DocumentData) => void`
- `schemaVersion` começa em 1; migrações de formato em `src/modes/<modo>/migrations/`
