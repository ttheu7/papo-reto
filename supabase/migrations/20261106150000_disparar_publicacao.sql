-- =====================================================================
-- Papo Reto: o banco dispara a publicação a cada 30 minutos
-- O agendamento do GitHub Actions atrasa e pula execuções em repositórios
-- com pouco movimento: na beta, com "a cada 30 minutos", as rodadas saíram
-- de 4 em 4 a 8 em 8 horas. O pg_cron do Supabase, que já roda a limpeza
-- diária, é pontual. A cada 30 minutos ele chama a API do GitHub (pg_net)
-- e pede uma execução do workflow "Publicar site" (workflow_dispatch).
--
-- O token NÃO fica nesta migration. É um token fine-grained do GitHub, só
-- deste repositório e só com "Actions: Read and write", guardado no Vault do
-- Supabase com o nome github_token_publicar. Cadastro e renovação: README,
-- seção Deploy. Sem o token, a função só avisa e não faz nada; o
-- agendamento do próprio GitHub (a cada 3 horas) segue como reserva.
--
-- Resposta de cada chamada: net._http_response (o pg_net apaga depois de
-- 6 horas). Status 204 = o GitHub aceitou.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.disparar_publicacao()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token
    from vault.decrypted_secrets
   where name = 'github_token_publicar'
   limit 1;

  if token is null or token = '' then
    raise notice 'github_token_publicar não está no Vault: a publicação não foi disparada';
    return;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/ttheu7/papo-reto/actions/workflows/publicar.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'papo-reto-agendador',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

comment on function public.disparar_publicacao() is
  'Pede ao GitHub uma execução do workflow Publicar site. Chamada pelo pg_cron a cada 30 minutos. Token no Vault: github_token_publicar.';

-- Só o banco chama estas funções. Sem isto, a API do Supabase deixaria
-- qualquer visitante disparar o workflow (ou a limpeza) pela rota /rpc.
revoke execute on function public.disparar_publicacao() from public, anon, authenticated;
revoke execute on function public.limpeza_diaria() from public, anon, authenticated;

-- Nos minutos 17 e 47 (UTC), fora da hora cheia e da meia hora.
select cron.schedule('disparar-publicacao', '17,47 * * * *', 'select public.disparar_publicacao()');
