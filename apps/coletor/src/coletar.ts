// Ponto de entrada da coleta: monta as dependências e chama os casos de uso.
// Uso: npm run coletar (lê SUPABASE_DB_URL e, se houver, GEMINI_API_KEY).
import { ColetarNoticias, mensagemDe, ResumirEventos } from '@papo-reto/core';
import {
  conectar,
  LeitorRssHttp,
  lerConfiguracao,
  RegistroJson,
  RepositorioExecucoesPg,
  RepositorioFontesPg,
  RepositorioNoticiasPg,
  RepositorioResumosPg,
  ServicoIaGemini,
} from '@papo-reto/infra';

const registro = new RegistroJson({ app: 'coletor' });

async function principal(): Promise<number> {
  const config = lerConfiguracao();
  const sql = conectar(config.urlDoBanco, 'papo-reto-coletor');
  try {
    const execucoes = new RepositorioExecucoesPg(sql);
    const coleta = await new ColetarNoticias({
      fontes: new RepositorioFontesPg(sql),
      noticias: new RepositorioNoticiasPg(sql),
      execucoes,
      leitor: new LeitorRssHttp(),
      registro,
      agora: () => new Date(),
    }).executar();

    // Os resumos rodam mesmo se a coleta falhar: pode haver eventos pendentes.
    if (config.chaveGemini) {
      try {
        await new ResumirEventos({
          resumos: new RepositorioResumosPg(sql),
          execucoes,
          ia: new ServicoIaGemini({ chave: config.chaveGemini }),
          registro,
          agora: () => new Date(),
        }).executar(coleta.execucaoId);
      } catch (erro) {
        // Falha nos resumos nunca derruba a execução: o site mostra a manchete original.
        registro.erro('etapa de resumos falhou', { execucaoId: coleta.execucaoId, erro: mensagemDe(erro) });
      }
    } else {
      registro.info('GEMINI_API_KEY ausente; resumos pulados', { execucaoId: coleta.execucaoId });
    }

    return coleta.status === 'falha' ? 1 : 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

principal()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((erro: unknown) => {
    registro.erro('coletor parou com erro', { erro: mensagemDe(erro), tipo: erro instanceof Error ? erro.name : typeof erro });
    process.exitCode = 1;
  });
