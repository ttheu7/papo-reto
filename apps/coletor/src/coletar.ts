// Ponto de entrada da coleta: monta as dependências e chama os casos de uso.
// Uso: npm run coletar (lê SUPABASE_DB_URL e, se houver, GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY,
// PEXELS_API_KEY e UNSPLASH_API_KEY).
import { ColetarNoticias, IlustrarEventos, mensagemDe, ResumirEventos, type AcervoDeImagens } from '@papo-reto/core';
import {
  AcervoPexels,
  AcervoUnsplash,
  conectar,
  LeitorRssHttp,
  lerConfiguracao,
  RegistroJson,
  RepositorioExecucoesPg,
  RepositorioFontesPg,
  RepositorioImagensPg,
  RepositorioNoticiasPg,
  RepositorioResumosPg,
  ServicoDeVetoresMistral,
  ServicoIaGemini,
  ServicoIaGroq,
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
      // Sem a chave da Mistral, o agrupamento compara só as palavras dos títulos.
      vetores: config.chaveMistral ? new ServicoDeVetoresMistral({ chave: config.chaveMistral }) : null,
    }).executar();
    if (!config.chaveMistral) registro.info('MISTRAL_API_KEY ausente; agrupamento só por palavras', { execucaoId: coleta.execucaoId });

    // Os resumos rodam mesmo se a coleta falhar: pode haver eventos pendentes.
    // Gemini é o principal; a Groq assume quando ele falha ou fica sem cota.
    if (config.chaveGemini || config.chaveGroq) {
      try {
        await new ResumirEventos({
          resumos: new RepositorioResumosPg(sql),
          execucoes,
          ia: config.chaveGemini ? new ServicoIaGemini({ chave: config.chaveGemini }) : null,
          reserva: config.chaveGroq ? new ServicoIaGroq({ chave: config.chaveGroq }) : null,
          registro,
          agora: () => new Date(),
        }).executar(coleta.execucaoId);
      } catch (erro) {
        // Falha nos resumos nunca derruba a execução: o site mostra a manchete original.
        registro.erro('etapa de resumos falhou', { execucaoId: coleta.execucaoId, erro: mensagemDe(erro) });
      }
    } else {
      registro.info('GEMINI_API_KEY e GROQ_API_KEY ausentes; resumos pulados', { execucaoId: coleta.execucaoId });
    }

    // Imagens ilustrativas dos acontecimentos já resumidos: a Pexels primeiro, o Unsplash de reserva.
    const acervos: AcervoDeImagens[] = [
      ...(config.chavePexels ? [new AcervoPexels({ chave: config.chavePexels })] : []),
      ...(config.chaveUnsplash ? [new AcervoUnsplash({ chave: config.chaveUnsplash })] : []),
    ];
    if (acervos.length > 0) {
      try {
        // Só com o Unsplash (50 chamadas por hora no modo de teste, e cada imagem usada gasta duas: a busca e o
        // aviso de uso), 8 por rodada mantêm as duas rodadas da hora abaixo do limite. Com a Pexels, 15.
        const limite = config.chavePexels ? 15 : 8;
        await new IlustrarEventos({ imagens: new RepositorioImagensPg(sql), acervos, registro, agora: () => new Date() }, { limite }).executar(
          coleta.execucaoId,
        );
      } catch (erro) {
        // Sem imagem, o site mostra a notícia só com texto, como sempre.
        registro.erro('etapa de imagens falhou', { execucaoId: coleta.execucaoId, erro: mensagemDe(erro) });
      }
    } else {
      registro.info('PEXELS_API_KEY e UNSPLASH_API_KEY ausentes; imagens puladas', { execucaoId: coleta.execucaoId });
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
