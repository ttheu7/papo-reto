-- =====================================================================
-- Papo Reto 1.0: editoria Rap e cinco portais de rap nacional
-- Pedido do grupo em 12/11/2026: batalhas de rima, lançamentos e shows de
-- rap, para o público jovem. Os cinco feeds foram testados com
-- `npm run testar:feeds` no mesmo dia. Os portais cobrem rap em geral,
-- então tudo o que eles publicam entra na editoria Rap (categoria do feed).
-- =====================================================================

insert into public.categoria (slug, nome) values
  ('rap', 'Rap')
on conflict (slug) do nothing;

insert into public.fonte (nome, url_feed, url_site, politica_uso, exige_assinatura) values
  ('Rap Dab',       'https://www.rapdab.com.br/feed',      'https://www.rapdab.com.br',      'resumo', false),
  ('Rap Mídia',     'https://rapmidia.com.br/feed',        'https://rapmidia.com.br',        'resumo', false),
  ('Rap na Net',    'https://rapnanet.com.br/feed',        'https://rapnanet.com.br',        'resumo', false),
  ('Jornal do Rap', 'https://www.jornaldorap.com.br/feed', 'https://www.jornaldorap.com.br', 'resumo', false),
  ('Trapground',    'https://www.trapground.com.br/feed',  'https://www.trapground.com.br',  'resumo', false)
on conflict (url_feed) do nothing;

-- Os acontecimentos criados por esses feeds já nascem na editoria Rap.
update public.fonte f
   set categoria_id = c.id
  from public.categoria c
 where c.slug = 'rap'
   and f.url_feed in (
     'https://www.rapdab.com.br/feed',
     'https://rapmidia.com.br/feed',
     'https://rapnanet.com.br/feed',
     'https://www.jornaldorap.com.br/feed',
     'https://www.trapground.com.br/feed'
   );
