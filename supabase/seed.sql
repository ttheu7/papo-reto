-- =====================================================================
-- Papo Reto: dados iniciais (rode depois das migrations)
-- =====================================================================

insert into public.categoria (slug, nome) values
  ('brasil',     'Brasil'),
  ('mundo',      'Mundo'),
  ('politica',   'Política'),
  ('economia',   'Economia'),
  ('tecnologia', 'Tecnologia'),
  ('ciencia',    'Ciência'),
  ('educacao',   'Educação'),
  ('pop',        'Pop'),
  ('esportes',   'Esportes');

-- Confira no AI Studio o nome exato de um modelo liberado no plano gratuito.
-- Custos em dólar por 1 milhão de tokens: ficam em 0 até você copiar os
-- valores da tabela de preços do Gemini.
insert into public.modelo_ia (provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo) values
  ('Google', 'gemini-2.5-flash-lite', 0, 0, true);

-- Feeds levantados em outubro de 2026: confira se ainda respondem antes de ativar.
-- Mais de um feed do mesmo portal? Use o mesmo nome em todos.
insert into public.fonte (nome, url_feed, url_site, politica_uso, exige_assinatura) values
  ('g1',              'https://g1.globo.com/rss/g1/',                                            'https://g1.globo.com',             'resumo',                   false),
  ('g1',              'https://g1.globo.com/dynamo/tecnologia/rss2.xml',                         'https://g1.globo.com',             'resumo',                   false),
  ('g1',              'https://g1.globo.com/rss/g1/pop-arte/',                                   'https://g1.globo.com',             'resumo',                   false),
  ('Folha',           'http://feeds.folha.uol.com.br/emcimadahora/rss091.xml',                   'https://www.folha.uol.com.br',     'resumo',                   true),
  ('Estadão',         'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/brasil/', 'https://www.estadao.com.br',       'resumo',                   true),
  ('CNN Brasil',      'https://www.cnnbrasil.com.br/feed/',                                      'https://www.cnnbrasil.com.br',     'resumo',                   false),
  ('BBC News Brasil', 'https://feeds.bbci.co.uk/portuguese/rss.xml',                             'https://www.bbc.com/portuguese',   'resumo',                   false),
  ('BBC News',        'https://feeds.bbci.co.uk/news/world/rss.xml',                             'https://www.bbc.com/news',         'resumo',                   false),
  ('Agência Brasil',  'https://agenciabrasil.ebc.com.br/feed/ultimasnoticias/feed.xml',          'https://agenciabrasil.ebc.com.br', 'republicacao_com_credito', false),
  ('Tecnoblog',       'https://tecnoblog.net/feed',                                              'https://tecnoblog.net',            'resumo',                   false);
