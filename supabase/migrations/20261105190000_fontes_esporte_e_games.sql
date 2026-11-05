-- =====================================================================
-- Papo Reto 1.0: editoria Games e novas fontes (esporte, e-sports e EUA)
-- Escolhidas pelo grupo em 05/11/2026. Os endereços foram levantados sem
-- teste daqui (a rede do ambiente bloqueava os portais): confira com
-- `npm run testar:feeds` antes de publicar. Feed que falhar só acumula
-- falhas_seguidas, sem quebrar a coleta.
-- =====================================================================

insert into public.categoria (slug, nome) values
  ('games', 'Games')
on conflict (slug) do nothing;

insert into public.fonte (nome, url_feed, url_site, politica_uso, exige_assinatura) values
  ('UOL',         'https://rss.uol.com.br/feed/noticias.xml',               'https://www.uol.com.br',        'resumo', false),
  ('UOL',         'https://rss.uol.com.br/feed/esporte.xml',                'https://www.uol.com.br/esporte', 'resumo', false),
  ('ge',          'https://ge.globo.com/rss/ge/',                           'https://ge.globo.com',          'resumo', false),
  ('NPR',         'https://feeds.npr.org/1004/rss.xml',                     'https://www.npr.org',           'resumo', false),
  ('Fox News',    'https://moxie.foxnews.com/google-publisher/world.xml',   'https://www.foxnews.com',       'resumo', false),
  ('HLTV',        'https://www.hltv.org/rss/news',                          'https://www.hltv.org',          'resumo', false),
  ('VLR.gg',      'https://www.vlr.gg/rss',                                 'https://www.vlr.gg',            'resumo', false),
  ('Dot Esports', 'https://dotesports.com/feed',                            'https://dotesports.com',        'resumo', false)
on conflict (url_feed) do nothing;

-- Feeds de seção já dizem a editoria: os acontecimentos criados por eles a herdam.
update public.fonte f
   set categoria_id = c.id
  from public.categoria c,
       (values
         ('https://rss.uol.com.br/feed/esporte.xml',               'esportes'),
         ('https://ge.globo.com/rss/ge/',                          'esportes'),
         ('https://feeds.npr.org/1004/rss.xml',                    'mundo'),
         ('https://moxie.foxnews.com/google-publisher/world.xml',  'mundo'),
         ('https://www.hltv.org/rss/news',                         'games'),
         ('https://www.vlr.gg/rss',                                'games'),
         ('https://dotesports.com/feed',                           'games')
       ) as m (url_feed, slug)
 where f.url_feed = m.url_feed
   and c.slug = m.slug;
