// Gera os JSONs públicos do site em apps/web/public/dados/ a partir do banco.
// Uso: npm run dados:site (lê SUPABASE_DB_URL). Roda antes do build do site.
import { GerarDadosDoSite, mensagemDe } from '@papo-reto/core';
import { conectar, EscritorDeDadosEmPasta, lerConfiguracao, RegistroJson, RepositorioSitePg } from '@papo-reto/infra';
import { fileURLToPath } from 'node:url';

export const PASTA_DOS_DADOS = fileURLToPath(new URL('../../web/public/dados/', import.meta.url));

const registro = new RegistroJson({ app: 'dados-do-site' });

async function principal() {
  const config = lerConfiguracao();
  const sql = conectar(config.urlDoBanco, 'papo-reto-dados-do-site');
  try {
    await new GerarDadosDoSite({
      site: new RepositorioSitePg(sql),
      escritor: new EscritorDeDadosEmPasta(PASTA_DOS_DADOS),
      registro,
      agora: () => new Date(),
    }).executar();
  } finally {
    await sql.end({ timeout: 5 });
  }
}

principal().catch((erro: unknown) => {
  registro.erro('falha ao gerar os dados do site', { erro: mensagemDe(erro) });
  process.exitCode = 1;
});
