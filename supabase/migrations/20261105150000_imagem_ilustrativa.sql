-- =====================================================================
-- Papo Reto: imagem ilustrativa de acervo gratuito (Pexels e Unsplash)
-- A IA que escreve o resumo devolve palavras-chave genéricas para buscar a
-- imagem (resumo.busca_imagem), ou null quando não deve haver imagem (crimes,
-- mortes, tragédias com vítimas, pessoas reais). O coletor busca nos acervos e
-- grava só o endereço e o crédito: a imagem é exibida direto do acervo.
-- Uma linha com url nula marca "procurou e não achou", para não buscar de novo.
-- =====================================================================

alter table public.resumo add column busca_imagem text;

comment on column public.resumo.busca_imagem is
  'Palavras-chave em inglês para buscar a imagem ilustrativa, ou null para não ter imagem.';

create table public.imagem (
  evento_id   uuid primary key references public.evento (id) on delete cascade,
  provedor    text,
  url         text,
  largura     integer,
  altura      integer,
  cor         text,
  autor       text,
  url_autor   text,
  url_pagina  text,
  busca       text not null,
  criado_em   timestamptz not null default now(),
  check (url is null or (provedor is not null and autor is not null and url_pagina is not null))
);

comment on table public.imagem is
  'Imagem ilustrativa de acervo (não mostra o fato). Exibida direto do acervo, sempre com crédito.';

-- Como as outras tabelas: RLS ligado, sem políticas. O navegador nunca lê o banco.
alter table public.imagem enable row level security;
