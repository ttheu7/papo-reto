// Imagens ilustrativas do Unsplash (unsplash.com/developers). Segue as regras da API: a imagem é
// exibida direto do Unsplash, o crédito leva ao fotógrafo e ao Unsplash com utm_source, e o uso é
// avisado pelo download_location.
import { ErroCotaIa, ErroInfra, type AcervoDeImagens, type ImagemDeAcervo } from '@papo-reto/core';

const ENDERECO = 'https://api.unsplash.com/search/photos';
const APLICATIVO = 'papo_reto';
const LARGURA = 1600;

interface FotoUnsplash {
  width?: number;
  height?: number;
  color?: string | null;
  urls?: { raw?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
}

/** Os links de volta ao Unsplash levam utm_source e utm_medium, como pedem as regras da API. */
const comUtm = (url: string) => `${url}${url.includes('?') ? '&' : '?'}utm_source=${APLICATIVO}&utm_medium=referral`;

export class AcervoUnsplash implements AcervoDeImagens {
  readonly nome = 'Unsplash';
  private readonly buscarHttp: typeof fetch;

  constructor(private readonly opcoes: { chave: string; buscar?: typeof fetch }) {
    this.buscarHttp = opcoes.buscar ?? fetch;
  }

  private cabecalhos() {
    return { Authorization: `Client-ID ${this.opcoes.chave}`, 'Accept-Version': 'v1' };
  }

  async buscar(termos: string): Promise<ImagemDeAcervo | null> {
    const url = `${ENDERECO}?${new URLSearchParams({ query: termos, per_page: '5', orientation: 'landscape', content_filter: 'high' })}`;
    let resposta: Response;
    try {
      resposta = await this.buscarHttp(url, { headers: this.cabecalhos(), signal: AbortSignal.timeout(15_000) });
    } catch (erro) {
      throw new ErroInfra('falha de rede ao chamar o Unsplash', {}, { cause: erro });
    }
    // Sem cota, o Unsplash responde 403 ("Rate Limit Exceeded") ou 429.
    if (resposta.status === 429 || (resposta.status === 403 && resposta.headers.get('x-ratelimit-remaining') === '0')) {
      throw new ErroCotaIa(`HTTP ${resposta.status} do Unsplash`);
    }
    if (!resposta.ok) throw new ErroInfra(`falha ao chamar o Unsplash (HTTP ${resposta.status})`);

    const corpo = (await resposta.json()) as { results?: FotoUnsplash[] };
    const foto = (corpo.results ?? []).find((f) => f.urls?.raw && f.links?.html && f.user?.name && f.width && f.height);
    if (!foto) return null;

    await this.avisarUso(foto.links?.download_location);
    const escala = Math.min(1, LARGURA / foto.width!);
    return {
      provedor: 'Unsplash',
      url: `${foto.urls!.raw!}&w=${LARGURA}&q=75&auto=format&fit=max`,
      largura: Math.round(foto.width! * escala),
      altura: Math.round(foto.height! * escala),
      cor: foto.color ?? null,
      autor: foto.user!.name!,
      urlAutor: comUtm(foto.user!.links?.html ?? foto.links!.html!),
      urlPagina: comUtm(foto.links!.html!),
    };
  }

  /** Regra da API: avisar quando a foto passa a ser usada. Falhar aqui não impede usar a imagem. */
  private async avisarUso(endereco: string | undefined) {
    if (!endereco) return;
    try {
      await this.buscarHttp(endereco, { headers: this.cabecalhos(), signal: AbortSignal.timeout(10_000) });
    } catch {
      // Sem rede para o aviso: a imagem segue valendo.
    }
  }
}
