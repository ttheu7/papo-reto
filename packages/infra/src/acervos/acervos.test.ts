import { describe, expect, it } from 'vitest';
import { AcervoUnsplash } from './acervo-unsplash';

const json = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) => new Response(JSON.stringify(corpo), { status, headers: cabecalhos });

describe('AcervoUnsplash', () => {
  it('busca com filtro de conteúdo, avisa o uso pelo download_location e põe utm nos links de crédito', async () => {
    const urls: string[] = [];
    const acervo = new AcervoUnsplash({
      chave: 'chave-unsplash',
      buscar: async (url, init) => {
        urls.push(String(url));
        expect(new Headers(init?.headers).get('authorization')).toBe('Client-ID chave-unsplash');
        if (String(url).includes('/download')) return json({ url: 'ok' });
        return json({
          results: [
            {
              width: 3200, height: 2400, color: '#a0b0c0',
              urls: { raw: 'https://images.unsplash.com/photo-1?ixid=abc' },
              links: { html: 'https://unsplash.com/photos/1', download_location: 'https://api.unsplash.com/photos/1/download?ixid=abc' },
              user: { name: 'Bia', links: { html: 'https://unsplash.com/@bia' } },
            },
          ],
        });
      },
    });

    const imagem = await acervo.buscar('solar panels');

    expect(urls[0]).toBe('https://api.unsplash.com/search/photos?query=solar+panels&per_page=5&orientation=landscape&content_filter=high');
    expect(urls[1]).toBe('https://api.unsplash.com/photos/1/download?ixid=abc');
    expect(imagem).toEqual({
      provedor: 'Unsplash',
      url: 'https://images.unsplash.com/photo-1?ixid=abc&w=1600&q=75&auto=format&fit=max',
      largura: 1600,
      altura: 1200,
      cor: '#a0b0c0',
      autor: 'Bia',
      urlAutor: 'https://unsplash.com/@bia?utm_source=papo_reto&utm_medium=referral',
      urlPagina: 'https://unsplash.com/photos/1?utm_source=papo_reto&utm_medium=referral',
    });
  });

  it('403 sem cota restante e 429 viram ErroCotaIa; outro 403 vira ErroInfra', async () => {
    await expect(new AcervoUnsplash({ chave: 'k', buscar: async () => json({}, 403, { 'x-ratelimit-remaining': '0' }) }).buscar('x')).rejects.toMatchObject({ name: 'ErroCotaIa' });
    await expect(new AcervoUnsplash({ chave: 'k', buscar: async () => json({}, 429) }).buscar('x')).rejects.toMatchObject({ name: 'ErroCotaIa' });
    await expect(new AcervoUnsplash({ chave: 'k', buscar: async () => json({}, 403) }).buscar('x')).rejects.toMatchObject({ name: 'ErroInfra' });
  });
});
