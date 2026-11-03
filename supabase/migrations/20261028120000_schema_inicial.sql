-- =====================================================================
-- Papo Reto: schema inicial (MVP)
-- Rode uma vez: no SQL Editor do Supabase ou com `supabase db push`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------

create type public.politica_uso as enum ('so_link', 'resumo', 'republicacao_com_credito');
create type public.status_execucao as enum ('rodando', 'sucesso', 'parcial', 'falha');
create type public.status_doacao as enum ('pendente', 'confirmada', 'estornada');

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------

create table public.categoria (
  id    integer generated always as identity primary key,
  slug  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome  text not null
);
comment on table public.categoria is
  'Editorias do site. A lista de slugs é o que a IA recebe pra classificar.';

create table public.fonte (
  id                integer generated always as identity primary key,
  nome              text not null,
  url_feed          text not null unique check (url_feed ~ '^https?://'),
  url_site          text not null check (url_site ~ '^https?://'),
  politica_uso      public.politica_uso not null default 'so_link',
  exige_assinatura  boolean not null default false,
  ativa             boolean not null default true,
  ultima_coleta_em  timestamptz,
  falhas_seguidas   integer not null default 0 check (falhas_seguidas >= 0),
  ultimo_erro       text
);
comment on column public.fonte.nome is
  'Nome do portal no card. Feeds do mesmo portal usam o mesmo nome (a cobertura conta portais pelo nome).';

create table public.modelo_ia (
  id                integer generated always as identity primary key,
  provedor          text not null,
  modelo            text not null,
  custo_entrada_1m  numeric(10,4) not null default 0 check (custo_entrada_1m >= 0),
  custo_saida_1m    numeric(10,4) not null default 0 check (custo_saida_1m >= 0),
  ativo             boolean not null default false,
  unique (provedor, modelo)
);
comment on column public.modelo_ia.custo_entrada_1m is
  'Preço em dólar por 1 milhão de tokens de entrada.';

-- No máximo um modelo ativo por vez.
create unique index modelo_ia_um_ativo on public.modelo_ia (ativo) where ativo;

-- ---------------------------------------------------------------------
-- Núcleo: acontecimentos, notícias e resumos
-- ---------------------------------------------------------------------

create table public.evento (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   integer references public.categoria (id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table public.noticia (
  id                  uuid primary key default gen_random_uuid(),
  fonte_id            integer not null references public.fonte (id) on delete restrict,
  evento_id           uuid not null references public.evento (id) on delete cascade,
  titulo              text not null,
  url                 text not null unique check (url ~ '^https?://'),
  descricao_original  text,
  publicada_em        timestamptz not null,
  coletada_em         timestamptz not null default now()
);
comment on column public.noticia.url is
  'URL canônica (sem redirecionador nem parâmetros de rastreio). É a chave da deduplicação.';
comment on column public.noticia.descricao_original is
  'Texto do feed usado como entrada da IA. Uso interno: nunca vai pra JSON público, MCP ou view.';

create table public.resumo (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.evento (id) on delete cascade,
  modelo_ia_id    integer not null references public.modelo_ia (id) on delete restrict,
  titulo          text not null,
  texto           text not null,
  versao_prompt   text not null,
  tokens_entrada  integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida    integer not null default 0 check (tokens_saida >= 0),
  custo_estimado  numeric(12,6) not null default 0 check (custo_estimado >= 0),
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Operação e apoio
-- ---------------------------------------------------------------------

create table public.execucao (
  id               uuid primary key default gen_random_uuid(),
  iniciada_em      timestamptz not null default now(),
  finalizada_em    timestamptz,
  status           public.status_execucao not null default 'rodando',
  novas_noticias   integer not null default 0 check (novas_noticias >= 0),
  resumos_gerados  integer not null default 0 check (resumos_gerados >= 0),
  erros            jsonb not null default '[]'::jsonb check (jsonb_typeof(erros) = 'array')
);

create table public.doacao (
  id                 uuid primary key default gen_random_uuid(),
  nome_exibicao      text check (char_length(nome_exibicao) <= 60),
  email              text,
  valor              numeric(10,2) not null check (valor > 0),
  mensagem           text check (char_length(mensagem) <= 280),
  mensagem_aprovada  boolean not null default false,
  status             public.status_doacao not null default 'pendente',
  id_pagamento       text not null unique,
  criada_em          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Índices (o Postgres não cria índice automático pra chave estrangeira)
-- ---------------------------------------------------------------------

create index noticia_evento_idx     on public.noticia (evento_id);
create index noticia_fonte_data_idx on public.noticia (fonte_id, publicada_em desc);
create index evento_atualizado_idx  on public.evento (atualizado_em desc);
create index evento_categoria_idx   on public.evento (categoria_id, atualizado_em desc);
create index resumo_evento_idx      on public.resumo (evento_id, criado_em desc);
create index resumo_modelo_idx      on public.resumo (modelo_ia_id);
create index execucao_iniciada_idx  on public.execucao (iniciada_em desc);

-- ---------------------------------------------------------------------
-- Gatilho: notícia ou resumo novo atualiza o evento
-- ---------------------------------------------------------------------

create or replace function public.tocar_evento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.evento
     set atualizado_em = now()
   where id = new.evento_id;
  return new;
end;
$$;

create trigger noticia_toca_evento
after insert on public.noticia
for each row execute function public.tocar_evento();

create trigger resumo_toca_evento
after insert on public.resumo
for each row execute function public.tocar_evento();

-- ---------------------------------------------------------------------
-- View do card: título, resumo vigente, fontes e cobertura
-- (o que o gerador de JSON e o MCP público leem)
-- ---------------------------------------------------------------------

create or replace view public.vw_evento_card
with (security_invoker = true) as
select
  e.id,
  e.criado_em,
  e.atualizado_em,
  c.slug                             as categoria_slug,
  c.nome                             as categoria_nome,
  coalesce(r.titulo, p.titulo)       as titulo,
  r.texto                            as resumo,
  f.fontes,
  coalesce(cardinality(f.fontes), 0) as cobertura
from public.evento e
left join public.categoria c on c.id = e.categoria_id
left join lateral (
  select r2.titulo, r2.texto
    from public.resumo r2
   where r2.evento_id = e.id
   order by r2.criado_em desc
   limit 1
) r on true
left join lateral (
  select n2.titulo
    from public.noticia n2
   where n2.evento_id = e.id
   order by n2.publicada_em
   limit 1
) p on true
left join lateral (
  select array_agg(distinct fo.nome order by fo.nome) as fontes
    from public.noticia n3
    join public.fonte fo on fo.id = n3.fonte_id
   where n3.evento_id = e.id
) f on true;

-- ---------------------------------------------------------------------
-- Segurança: RLS ligado em todas as tabelas e nenhuma política.
-- Com a chave publicável ninguém lê nem escreve nada. O pipeline e os
-- MCPs usam a chave secreta (papel service_role), que ignora o RLS.
-- ---------------------------------------------------------------------

alter table public.categoria enable row level security;
alter table public.fonte     enable row level security;
alter table public.modelo_ia enable row level security;
alter table public.evento    enable row level security;
alter table public.noticia   enable row level security;
alter table public.resumo    enable row level security;
alter table public.execucao  enable row level security;
alter table public.doacao    enable row level security;
