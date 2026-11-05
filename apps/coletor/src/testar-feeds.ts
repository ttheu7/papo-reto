// Testa feeds candidatos antes de cadastrá-los na tabela fonte. Não grava nada e não precisa de chave.
//
//   npm run testar:feeds                      testa a lista de candidatos abaixo
//   npm run testar:feeds -- <url> [<url>...]  testa só os endereços passados
//
// Usa o mesmo leitor do coletor (User-Agent, timeout, codificação e interpretação de RSS/Atom),
// então o que passa aqui é o que a coleta vai conseguir ler.
import { ehTituloDePrograma, type ItemRss } from '@papo-reto/core';
import { LeitorRssHttp } from '@papo-reto/infra';

// Os feeds da migration fontes_esporte_e_games (1.0), escolhidos em 05/11/2026.
const CANDIDATOS: [nome: string, url: string][] = [
  ['UOL (notícias)', 'https://rss.uol.com.br/feed/noticias.xml'],
  ['UOL (esporte)', 'https://rss.uol.com.br/feed/esporte.xml'],
  ['ge', 'https://ge.globo.com/rss/ge/'],
  ['NPR (mundo)', 'https://feeds.npr.org/1004/rss.xml'],
  ['Fox News (mundo)', 'https://moxie.foxnews.com/google-publisher/world.xml'],
  ['HLTV (Counter-Strike)', 'https://www.hltv.org/rss/news'],
  ['VLR.gg (Valorant)', 'https://www.vlr.gg/rss'],
  ['Dot Esports', 'https://dotesports.com/feed'],
];

const HORA = 60 * 60 * 1000;

function resumo(itens: ItemRss[]) {
  const agora = Date.now();
  const datas = itens.map((i) => i.publicadaEm?.getTime()).filter((t): t is number => t != null);
  const descricoes = itens.map((i) => i.descricao?.trim() ?? '').filter(Boolean);
  const dominios = new Set(itens.map((i) => { try { return new URL(i.link).hostname; } catch { return '(link inválido)'; } }));
  const audio = itens.filter((i) => /\.(mp3|m4a|aac)(\?|$)/i.test(i.link)).length;
  return {
    itens: itens.length,
    comDescricao: `${descricoes.length}/${itens.length}`,
    tamanhoMedioDescricao: descricoes.length ? Math.round(descricoes.reduce((s, d) => s + d.length, 0) / descricoes.length) : 0,
    comData: `${datas.length}/${itens.length}`,
    maisNova: datas.length ? new Date(Math.max(...datas)).toISOString().slice(0, 16).replace('T', ' ') : '-',
    ultimas24h: datas.filter((t) => agora - t <= 24 * HORA).length,
    programas: itens.filter((i) => ehTituloDePrograma(i.titulo)).length,
    audio,
    dominios: [...dominios].slice(0, 3).join(', '),
    exemplos: itens.slice(0, 2).map((i) => i.titulo),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const lista: [string, string][] = args.length ? args.map((u) => [u, u]) : CANDIDATOS;
  const leitor = new LeitorRssHttp({ timeoutMs: 20_000 });
  const resultados = await Promise.all(
    lista.map(async ([nome, url]) => {
      try {
        return { nome, url, ok: true as const, ...resumo(await leitor.ler(url)) };
      } catch (erro) {
        return { nome, url, ok: false as const, erro: (erro as Error).message };
      }
    }),
  );
  for (const r of resultados) {
    console.log(`\n${r.ok ? 'OK  ' : 'FALHOU'} ${r.nome}\n     ${r.url}`);
    if (!r.ok) { console.log(`     ${r.erro}`); continue; }
    console.log(`     ${r.itens} itens · descrição ${r.comDescricao} (média ${r.tamanhoMedioDescricao} caracteres) · data ${r.comData}`);
    console.log(`     mais nova ${r.maisNova} UTC · ${r.ultimas24h} nas últimas 24 h · programas ${r.programas} · áudio ${r.audio}`);
    console.log(`     links: ${r.dominios}`);
    for (const t of r.exemplos) console.log(`     - ${t}`);
  }
  const falhas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - falhas} de ${resultados.length} feeds lidos.`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
