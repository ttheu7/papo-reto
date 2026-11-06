-- =====================================================================
-- Papo Reto 1.0: acontecimentos parados saem depois de 90 dias (eram 180)
-- Medição de 06/11/2026: cerca de 1.100 notícias por dia só com os feeds da
-- beta, e uns 1.400 com os da 1.0. Guardando 180 dias, a estimativa de
-- equilíbrio chegava perto dos 500 MB do plano gratuito, e acima disso o
-- banco fica só leitura. Com 90 dias, fica perto de 290 MB, mesmo com a
-- coleta a cada 30 minutos. Para um portal de notícias do dia, três meses de
-- arquivo bastam.
-- O resto da limpeza continua igual.
-- =====================================================================

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

  -- O vetor da notícia só serve para agrupar nas primeiras 48 horas.
  update public.noticia
     set vetor = null
   where vetor is not null
     and coletada_em < now() - interval '3 days';

  -- Acontecimentos parados há mais de 90 dias saem do banco.
  -- As notícias, os resumos e a imagem deles vão junto (on delete cascade).
  delete from public.evento
   where atualizado_em < now() - interval '90 days';

  -- Eventos que ficaram sem nenhuma notícia (sobra de erro no pipeline).
  delete from public.evento e
   where e.criado_em < now() - interval '1 day'
     and not exists (select 1 from public.noticia n where n.evento_id = e.id);

  -- Histórico das rodadas do pipeline: 30 dias bastam.
  delete from public.execucao
   where iniciada_em < now() - interval '30 days';
end;
$$;
