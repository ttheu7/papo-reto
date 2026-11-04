-- =====================================================================
-- Papo Reto: troca o modelo ativo da IA
-- O gemini-2.5-flash-lite não está mais disponível para chaves novas
-- (a API devolve 404 e indica o gemini-3.5-flash-lite).
-- Custos em 0 até alguém copiar os valores da tabela de preços do Gemini.
-- =====================================================================

update public.modelo_ia set ativo = false where ativo;

insert into public.modelo_ia (provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo)
values ('Google', 'gemini-3.5-flash-lite', 0, 0, true)
on conflict (provedor, modelo) do update set ativo = true;
