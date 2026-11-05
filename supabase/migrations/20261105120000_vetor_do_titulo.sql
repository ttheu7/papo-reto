-- =====================================================================
-- Papo Reto: vetor do título (embedding da Mistral) para agrupar matérias
-- O coletor grava o vetor de cada notícia nova e pergunta ao banco qual
-- acontecimento recente tem o título mais parecido. A comparação roda aqui,
-- para os vetores não trafegarem (5 GB de tráfego por mês no plano gratuito).
-- O vetor só serve nas primeiras 48 horas: a limpeza apaga depois de 3 dias.
-- =====================================================================

create extension if not exists vector with schema extensions;

-- Sem dimensão fixa: se o modelo de vetores mudar, a coluna continua valendo.
alter table public.noticia add column vetor extensions.vector;

comment on column public.noticia.vetor is
  'Embedding do título (uso interno do agrupamento). Apagado depois de 3 dias pela limpeza_diaria.';

create or replace function public.limpeza_diaria()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- O texto do feed só serve de entrada pra IA: sai depois de 30 dias.
  update public.noticia
     set descricao_original = null
   where descricao_original is not null
     and coletada_em < now() - interval '30 days';

  -- O vetor do título só serve para agrupar nas primeiras 48 horas.
  update public.noticia
     set vetor = null
   where vetor is not null
     and coletada_em < now() - interval '3 days';

  -- Acontecimentos parados há mais de 180 dias saem do banco.
  -- As notícias e os resumos deles vão junto (on delete cascade).
  delete from public.evento
   where atualizado_em < now() - interval '180 days';

  -- Eventos que ficaram sem nenhuma notícia (sobra de erro no pipeline).
  delete from public.evento e
   where e.criado_em < now() - interval '1 day'
     and not exists (select 1 from public.noticia n where n.evento_id = e.id);

  -- Histórico das rodadas do pipeline: 30 dias bastam.
  delete from public.execucao
   where iniciada_em < now() - interval '30 days';
end;
$$;
