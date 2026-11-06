// Ajuda a calibrar o agrupamento por vetores (SEMELHANCA_MINIMA_VETOR). Não grava nada.
//
// Dois modos:
//   npm run calibrar:agrupamento
//       Manchetes dos dados de exemplo (ou de um eventos.json passado depois de --). Só títulos.
//   npm run calibrar:agrupamento -- --banco [--horas 48] [--limite 120]
//       Notícias recentes do banco (lê SUPABASE_DB_URL, só leitura). Compara lado a lado o vetor
//       só do título e o vetor do título com a descrição do feed.
//
// Precisa de MISTRAL_API_KEY. A descrição do feed é de uso interno: aparece só neste terminal.
import {
  cosseno,
  palavrasDoTitulo,
  semelhanca,
  SEMELHANCA_MINIMA,
  SEMELHANCA_MINIMA_VETOR,
  textoParaVetor,
  type EventosJson,
} from '@papo-reto/core';
import { conectar, lerConfiguracao, RepositorioCalibragemPg, ServicoDeVetoresMistral } from '@papo-reto/infra';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Materia {
  portal: string;
  titulo: string;
  descricao: string | null;
  /** Acontecimento em que a notícia está hoje (agrupada pelas palavras), quando vem do banco. */
  eventoId: string | null;
}

const argumentos = process.argv.slice(2);
const opcao = (nome: string, padrao: number) => {
  const i = argumentos.indexOf(nome);
  const valor = i >= 0 ? Number(argumentos[i + 1]) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
};

const chave = process.env.MISTRAL_API_KEY?.trim();
if (!chave) {
  console.error('Defina MISTRAL_API_KEY no .env.');
  process.exit(1);
}
const mistral = new ServicoDeVetoresMistral({ chave });

async function doBanco(): Promise<Materia[]> {
  const horas = opcao('--horas', 48);
  const limite = opcao('--limite', 120);
  const sql = conectar(lerConfiguracao().urlDoBanco, 'papo-reto-calibragem');
  try {
    const noticias = await new RepositorioCalibragemPg(sql).noticiasRecentes(new Date(Date.now() - horas * 3_600_000), limite);
    console.log(`${noticias.length} notícias das últimas ${horas} horas (limite ${limite})`);
    return noticias;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function doArquivo(): Materia[] {
  const arquivo = resolve(argumentos.find((a) => !a.startsWith('--')) ?? 'apps/web/src/dados-exemplo/eventos.json');
  const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as EventosJson;
  console.log(`manchetes de ${arquivo} (sem descrição: os JSONs públicos não têm)`);
  return dados.eventos.flatMap((e) => e.materias.map((m) => ({ portal: m.portal, titulo: m.titulo, descricao: null, eventoId: null })));
}

const doBancoDeDados = argumentos.includes('--banco');
const materias = doBancoDeDados ? await doBanco() : doArquivo();
const comDescricao = materias.filter((m) => m.descricao?.trim()).length;
console.log(`${materias.length} manchetes, ${comDescricao} com descrição. Limite atual: ${SEMELHANCA_MINIMA_VETOR}.\n`);

const soTitulo = await mistral.vetorizar(materias.map((m) => textoParaVetor(m.titulo)));
const tituloDescricao = comDescricao > 0 ? await mistral.vetorizar(materias.map((m) => textoParaVetor(m.titulo, m.descricao))) : null;

interface Par {
  a: Materia;
  b: Materia;
  titulo: number;
  completo: number | null;
  palavras: boolean;
}
const pares: Par[] = [];
for (let i = 0; i < materias.length; i++)
  for (let j = i + 1; j < materias.length; j++) {
    const titulo = cosseno(soTitulo[i]!, soTitulo[j]!);
    const completo = tituloDescricao ? cosseno(tituloDescricao[i]!, tituloDescricao[j]!) : null;
    if (Math.max(titulo, completo ?? 0) < SEMELHANCA_MINIMA_VETOR - 0.1) continue;
    const palavras = semelhanca(palavrasDoTitulo(materias[i]!.titulo), palavrasDoTitulo(materias[j]!.titulo)) >= SEMELHANCA_MINIMA;
    pares.push({ a: materias[i]!, b: materias[j]!, titulo, completo, palavras });
  }

const ordem = (p: Par) => p.completo ?? p.titulo;
pares.sort((x, y) => ordem(y) - ordem(x));

console.log(
  tituloDescricao
    ? 'Colunas: título = vetor só do título; tít+desc = vetor do título com a descrição. Ordenado por tít+desc.'
    : 'Coluna: vetor só do título.',
);
console.log('Marcas: "palavras" = as palavras já juntam; "mesmo evento" = já estão juntas hoje no banco.');
console.log('Confira de cima para baixo onde os pares deixam de ser o mesmo fato.\n');
for (const p of pares.slice(0, opcao('--pares', 60))) {
  const notas = `título ${p.titulo.toFixed(3)}${p.completo !== null ? `   tít+desc ${p.completo.toFixed(3)}` : ''}`;
  const marcas = [p.palavras && 'palavras', p.a.eventoId && p.a.eventoId === p.b.eventoId && 'mesmo evento'].filter(Boolean).join(', ');
  console.log(`${notas}${marcas ? `   (${marcas})` : ''}`);
  console.log(`   [${p.a.portal}] ${p.a.titulo}\n   [${p.b.portal}] ${p.b.titulo}`);
}
