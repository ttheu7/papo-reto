/** Parâmetros de rastreio removidos antes de deduplicar. */
const PARAMETROS_DE_RASTREIO = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|cmpid$|xtor$|ref$|ref_src$)/i;

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
