-- ─── user_documents ──────────────────────────────────────────────────────────
-- Armazena mindmaps e fluxogramas criados pelos usuários.
-- owner_id referencia auth.users — funciona com sessões anônimas e contas reais.

create table if not exists user_documents (
  id             uuid        primary key default gen_random_uuid(),
  type           text        not null check (type in ('mindmap', 'fluxograma')),
  title          text        not null default 'Sem título',
  owner_id       uuid        references auth.users(id) on delete cascade,
  forked_from    uuid        references user_documents(id) on delete set null,
  visibility     text        not null default 'private'
                               check (visibility in ('private', 'public')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  schema_version int         not null default 1,
  data           jsonb       not null default '{}'::jsonb
);

-- Índices para listagem pessoal e futura galeria pública
create index if not exists user_documents_owner_updated
  on user_documents (owner_id, updated_at desc);

create index if not exists user_documents_public_gallery
  on user_documents (visibility, type, updated_at desc);

-- updated_at automático
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_documents_updated_at on user_documents;
create trigger user_documents_updated_at
  before update on user_documents
  for each row execute function touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table user_documents enable row level security;

-- Dono tem acesso total (funciona com uid anônimo e uid real)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_documents' and policyname = 'owner full access'
  ) then
    create policy "owner full access"
      on user_documents for all
      using  (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end $$;

-- Documentos públicos são legíveis por qualquer um (galeria futura)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_documents' and policyname = 'public docs readable'
  ) then
    create policy "public docs readable"
      on user_documents for select
      using (visibility = 'public');
  end if;
end $$;

-- ─── knowledge graph: leitura pública ────────────────────────────────────────
-- Necessário para trocar do service_role para o anon key no frontend.
-- Se as tabelas já têm RLS desabilitado, estas policies são ignoradas.

alter table if exists source_nodes  enable row level security;
alter table if exists source_edges  enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'source_nodes' and policyname = 'source_nodes public read'
  ) then
    create policy "source_nodes public read"
      on source_nodes for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'source_edges' and policyname = 'source_edges public read'
  ) then
    create policy "source_edges public read"
      on source_edges for select using (true);
  end if;
end $$;
