-- =====================================================================
-- Papo Reto: categoria padrão de cada feed
-- Feeds de seção (g1 tecnologia, g1 pop & arte...) já dizem a editoria.
-- Os eventos criados a partir deles herdam essa categoria; os de feeds
-- gerais ficam sem categoria até a IA classificar.
-- =====================================================================

alter table public.fonte
  add column categoria_id integer references public.categoria (id) on delete set null;

comment on column public.fonte.categoria_id is
  'Categoria padrão do feed (opcional). Os eventos criados a partir dele herdam esta categoria.';

update public.fonte f
   set categoria_id = c.id
  from public.categoria c,
       (values
         ('https://g1.globo.com/dynamo/tecnologia/rss2.xml',                         'tecnologia'),
         ('https://g1.globo.com/rss/g1/pop-arte/',                                   'pop'),
         ('https://tecnoblog.net/feed',                                              'tecnologia'),
         ('https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/brasil/', 'brasil'),
         ('https://feeds.bbci.co.uk/news/world/rss.xml',                             'mundo')
       ) as m (url_feed, slug)
 where f.url_feed = m.url_feed
   and c.slug = m.slug;
