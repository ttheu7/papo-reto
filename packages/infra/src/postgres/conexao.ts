import postgres from 'postgres';

export type Sql = postgres.Sql;

/**
 * Conecta pelo Session pooler do Supabase (IPv4, porta 5432), que aceita
 * transações e prepared statements. A URL leva a senha: nunca logue.
 */
export function conectar(url: string, nomeDaAplicacao = 'papo-reto'): Sql {
  return postgres(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { application_name: nomeDaAplicacao },
  });
}
