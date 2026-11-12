// Diz se os JSONs recém-gerados (apps/web/public/dados) são diferentes dos que estão publicados no site.
// O workflow "Publicar site" usa a resposta para pular o build e a publicação quando nada mudou.
//
//   npm run dados:mudaram -- <endereço do site publicado>
//
// Escreve "mudou=true" ou "mudou=false" em $GITHUB_OUTPUT (e na tela). O horário de geração (geradoEm)
// não conta como mudança. Na dúvida (arquivo novo, site fora do ar, resposta estranha), responde que mudou.
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARQUIVOS = ['eventos.json', 'hoje.json', 'categorias.json', 'portais.json'];
const PASTA = resolve('apps/web/public/dados');

/** O conteúdo sem o horário de geração, para comparar duas edições. */
export function semHorario(texto: string): string {
  const { geradoEm: _, ...resto } = JSON.parse(texto) as Record<string, unknown>;
  return JSON.stringify(resto);
}

async function publicado(base: string, nome: string): Promise<string | null> {
  try {
    const resposta = await fetch(new URL(`dados/${nome}`, base.endsWith('/') ? base : `${base}/`), {
      signal: AbortSignal.timeout(15_000),
      headers: { 'Cache-Control': 'no-cache' },
    });
    return resposta.ok ? await resposta.text() : null;
  } catch {
    return null;
  }
}

async function main() {
  const base = process.argv[2];
  let mudou = true;
  let motivo = 'sem o endereço do site publicado';
  if (base) {
    mudou = false;
    motivo = 'os dados são os mesmos da edição publicada';
    for (const nome of ARQUIVOS) {
      const antes = await publicado(base, nome);
      if (antes === null) {
        mudou = true;
        motivo = `não deu para ler ${nome} no site publicado`;
        break;
      }
      try {
        if (semHorario(antes) !== semHorario(readFileSync(resolve(PASTA, nome), 'utf8'))) {
          mudou = true;
          motivo = `${nome} mudou`;
          break;
        }
      } catch {
        mudou = true;
        motivo = `não deu para comparar ${nome}`;
        break;
      }
    }
  }
  console.log(JSON.stringify({ mudou, motivo }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mudou=${mudou}\n`);
}

main().catch((erro) => {
  // Erro inesperado: melhor publicar do que deixar o site parado.
  console.error(erro);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'mudou=true\n');
});
