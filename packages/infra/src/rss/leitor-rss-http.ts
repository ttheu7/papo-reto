import { ErroInfra, type ItemRss, type LeitorRss } from '@papo-reto/core';
import { interpretarFeed } from './interpretar-feed';

export const USER_AGENT = 'PapoRetoBot/0.1 (+https://github.com/ttheu7/papo-reto; projeto academico)';
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export interface OpcoesDoLeitor {
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Descobre a codificação pelo cabeçalho ou pela declaração XML (alguns feeds ainda usam ISO-8859-1). */
export function decodificar(bytes: Uint8Array, contentType: string | null): string {
  const doCabecalho = contentType?.match(/charset=["']?([\w-]+)/i)?.[1];
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const daDeclaracao = inicio.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  const rotulo = doCabecalho ?? daDeclaracao ?? 'utf-8';
  try {
    return new TextDecoder(rotulo).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export class LeitorRssHttp implements LeitorRss {
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(opcoes: OpcoesDoLeitor = {}) {
    this.timeoutMs = opcoes.timeoutMs ?? 15_000;
    this.fetch = opcoes.fetch ?? globalThis.fetch;
  }

  async ler(urlFeed: string): Promise<ItemRss[]> {
    let resposta: Response;
    try {
      resposta = await this.fetch(urlFeed, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
        redirect: 'follow',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      const tempo = erro instanceof Error && erro.name === 'TimeoutError';
      throw new ErroInfra(tempo ? `tempo esgotado (${this.timeoutMs} ms)` : `falha de rede: ${(erro as Error).message}`, { urlFeed }, { cause: erro });
    }
    if (!resposta.ok) throw new ErroInfra(`HTTP ${resposta.status}`, { urlFeed });

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.byteLength > TAMANHO_MAXIMO) throw new ErroInfra('feed grande demais', { urlFeed, bytes: bytes.byteLength });

    try {
      return interpretarFeed(decodificar(bytes, resposta.headers.get('content-type')));
    } catch (erro) {
      throw new ErroInfra(`feed inválido: ${(erro as Error).message}`, { urlFeed }, { cause: erro });
    }
  }
}
