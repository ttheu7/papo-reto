import { describe, expect, it } from 'vitest';
import { interpretarFeed } from './interpretar-feed';
import { decodificar, LeitorRssHttp } from './leitor-rss-http';

describe('interpretarFeed', () => {
  it('lê RSS 2.0 com CDATA e HTML na descrição', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>g1</title>
      <item><title><![CDATA[Chuva forte &amp; alerta]]></title><link>https://g1.globo.com/a.ghtml</link>
      <description><![CDATA[<img src="x.jpg"/><br/>A Defesa Civil emitiu alerta&nbsp;hoje. <b>Veja</b>]]></description>
      <pubDate>Wed, 04 Nov 2026 10:30:00 -0300</pubDate></item>
      </channel></rss>`;
    expect(interpretarFeed(xml)).toEqual([
      {
        titulo: 'Chuva forte & alerta',
        link: 'https://g1.globo.com/a.ghtml',
        descricao: 'A Defesa Civil emitiu alerta hoje. Veja',
        publicadaEm: new Date('2026-11-04T13:30:00Z'),
      },
    ]);
  });

  it('lê Atom, preferindo o link alternate', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Teste</title>
      <link rel="self" href="https://x.exemplo/self"/><link rel="alternate" href="https://x.exemplo/post"/>
      <summary>Resumo</summary><published>2026-11-04T12:00:00Z</published></entry></feed>`;
    expect(interpretarFeed(xml)[0]).toMatchObject({ titulo: 'Teste', link: 'https://x.exemplo/post', publicadaEm: new Date('2026-11-04T12:00:00Z') });
  });

  it('aceita feed com um único item, sem data e com entidades portuguesas', () => {
    const xml = `<rss version="0.91"><channel><item><title>Educa&ccedil;&atilde;o</title><link>https://f.exemplo/1</link></item></channel></rss>`;
    expect(interpretarFeed(xml)).toEqual([{ titulo: 'Educação', link: 'https://f.exemplo/1', descricao: null, publicadaEm: null }]);
  });

  it('recusa o que não é feed', () => {
    expect(() => interpretarFeed('<html><body>oi</body></html>')).toThrow(/não é um feed/);
  });
});

describe('decodificar', () => {
  it('respeita ISO-8859-1 declarado no XML', () => {
    const bytes = new Uint8Array([...Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><t>', 'latin1'), 0xe7, 0xe3, ...Buffer.from('</t>')]);
    expect(decodificar(bytes, 'text/xml')).toContain('<t>çã</t>');
  });
});

describe('LeitorRssHttp', () => {
  it('manda o User-Agent do projeto e transforma HTTP de erro em ErroInfra', async () => {
    let cabecalhos: Headers | undefined;
    const fetchFalso = (async (_url: string, init?: RequestInit) => {
      cabecalhos = new Headers(init?.headers);
      return new Response('não encontrado', { status: 404 });
    }) as typeof fetch;

    await expect(new LeitorRssHttp({ fetch: fetchFalso }).ler('https://x.exemplo/rss')).rejects.toMatchObject({ name: 'ErroInfra', message: 'HTTP 404' });
    expect(cabecalhos?.get('user-agent')).toMatch(/^PapoRetoBot/);
  });
});
