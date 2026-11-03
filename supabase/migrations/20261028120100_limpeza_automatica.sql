-- =====================================================================
-- Papo Reto: limpeza automática pra manter o banco abaixo de 500 MB
-- Usa o pg_cron (Database > Extensions no painel, ou a linha abaixo).
-- Os horários do pg_cron são em UTC: 6h UTC = 3h em Brasília.
-- Ajuste os prazos (30 e 180 dias) conforme o volume real.
-- =====================================================================

create extension if not exists pg_cron;

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

-- Todo dia às 6h UTC.
select cron.schedule('limpeza-diaria', '0 6 * * *', 'select public.limpeza_diaria()');

-- O pg_cron registra cada execução numa tabela própria, que também cresce.
-- Todo domingo às 6h30 UTC, apaga o registro com mais de 7 dias.
select cron.schedule(
  'limpar-log-do-cron',
  '30 6 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
