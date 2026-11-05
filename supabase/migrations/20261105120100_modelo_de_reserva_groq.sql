-- =====================================================================
-- Papo Reto: modelo de IA de reserva para os resumos
-- O Gemini continua o principal (ativo). Quando ele falha ou fica sem cota,
-- o coletor resume o resto da rodada com o modelo de reserva (Groq).
-- No máximo um modelo de reserva, como no máximo um ativo.
-- Custos em 0: o plano gratuito da Groq não cobra.
-- =====================================================================

alter table public.modelo_ia add column reserva boolean not null default false;

create unique index modelo_ia_uma_reserva on public.modelo_ia (reserva) where reserva;

insert into public.modelo_ia (provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo, reserva)
values ('Groq', 'llama-3.3-70b-versatile', 0, 0, false, true)
on conflict (provedor, modelo) do update set reserva = true;
