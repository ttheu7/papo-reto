/** Parâmetros de rastreio removidos antes de deduplicar. */
const PARAMETROS_DE_RASTREIO = /^(utm_|at_|fbclid$|gclid$|mc_cid$|mc_eid$|cmpid$|xtor$|ref$|ref_src$)/i;

/**
 * Deixa a URL canônica: tira o redirecionador da Folha, os parâmetros de
 * rastreio e o fragmento. Devolve `null` se não for uma URL http(s) válida.
 */
export function normalizarUrl(bruta: string): string | null {
  let texto = bruta.trim();

  // Folha: redir.folha.com.br/redir/online/.../*https://www1.folha.uol.com.br/...
  const asterisco = texto.indexOf('*http');
  if (asterisco >= 0) texto = texto.slice(asterisco + 1);

  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  for (const nome of [...url.searchParams.keys()]) {
    if (PARAMETROS_DE_RASTREIO.test(nome)) url.searchParams.delete(nome);
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

/** O endereço do site de um portal, para reconhecer de quem é um link: host sem "www." e o caminho. */
function siteDoPortal(urlSite: string): { host: string; caminho: string } | null {
  try {
    const url = new URL(urlSite);
    return { host: url.hostname.toLowerCase().replace(/^www\d*\./, ''), caminho: url.pathname.replace(/\/+$/, '') };
  } catch {
    return null;
  }
}

/**
 * Verdadeiro quando o link é de outro portal acompanhado, e não do portal do feed: o UOL publica
 * links da Folha, por exemplo. A matéria fica para o feed do dono, com o nome e a etiqueta de
 * assinatura certos. Vale o site mais específico (host mais longo, depois caminho mais longo):
 * `folha.uol.com.br` ganha de `uol.com.br`, e `bbc.com/portuguese` ganha de `bbc.com`. Link de site
 * que nenhum portal acompanhado tem fica com o feed que o publicou.
 */
export function ehDeOutroPortal(link: string, portal: string, fontes: { nome: string; urlSite: string }[]): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  let melhor = -1;
  const donos = new Set<string>();
  for (const f of fontes) {
    const site = siteDoPortal(f.urlSite);
    if (!site || (host !== site.host && !host.endsWith(`.${site.host}`))) continue;
    if (site.caminho && url.pathname !== site.caminho && !url.pathname.startsWith(`${site.caminho}/`)) continue;
    const pontos = site.host.length * 1000 + site.caminho.length;
    if (pontos > melhor) {
      melhor = pontos;
      donos.clear();
    }
    if (pontos === melhor) donos.add(f.nome);
  }
  return donos.size > 0 && !donos.has(portal);
}
