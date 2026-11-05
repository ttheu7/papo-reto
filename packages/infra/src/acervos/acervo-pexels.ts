// Imagens ilustrativas da Pexels (pexels.com/api). A imagem é exibida direto da Pexels, com crédito.
import { ErroCotaIa, ErroInfra, type AcervoDeImagens, type ImagemDeAcervo } from '@papo-reto/core';

const ENDERECO = 'https://api.pexels.com/v1/search';
const LARGURA = 1600;

interface FotoPexels {
  width?: number;
  height?: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  avg_color?: string | null;
  src?: { original?: string };
}

export class AcervoPexels implements AcervoDeImagens {
  readonly nome = 'Pexels';
  private readonly buscarHttp: typeof fetch;

  constructor(private readonly opcoes: { chave: string; buscar?: typeof fetch }) {
    this.buscarHttp = opcoes.buscar ?? fetch;
  }

  async buscar(termos: string): Promise<ImagemDeAcervo | null> {
    const url = `${ENDERECO}?${new URLSearchParams({ query: termos, per_page: '5', orientation: 'landscape' })}`;
    let resposta: Response;
    try {
      resposta = await this.buscarHttp(url, { headers: { Authorization: this.opcoes.chave }, signal: AbortSignal.timeout(15_000) });
    } catch (erro) {
      throw new ErroInfra('falha de rede ao chamar a Pexels', {}, { cause: erro });
    }
    if (resposta.status === 429) throw new ErroCotaIa('HTTP 429 da Pexels');
    if (!resposta.ok) throw new ErroInfra(`falha ao chamar a Pexels (HTTP ${resposta.status})`);

    const corpo = (await resposta.json()) as { photos?: FotoPexels[] };
    const foto = (corpo.photos ?? []).find((f) => f.src?.original && f.url && f.photographer && f.width && f.height);
    if (!foto) return null;
    const escala = Math.min(1, LARGURA / foto.width!);
    return {
      provedor: 'Pexels',
      url: `${foto.src!.original!}?auto=compress&cs=tinysrgb&w=${LARGURA}`,
      largura: Math.round(foto.width! * escala),
      altura: Math.round(foto.height! * escala),
      cor: foto.avg_color ?? null,
      autor: foto.photographer!,
      urlAutor: foto.photographer_url ?? foto.url!,
      urlPagina: foto.url!,
    };
  }
}
