import { describe, expect, it } from 'vitest';
import { agruparNoticias, cosseno, palavrasDoTitulo, semelhanca, textoParaVetor } from './agrupamento';
import type { NovaNoticia } from './entidades';

const noticia = (titulo: string, url: string, hora = 0, vetor: number[] | null = null): NovaNoticia => ({
  fonteId: 1,
  categoriaId: null,
  titulo,
  url,
  descricaoOriginal: null,
  publicadaEm: new Date(Date.UTC(2026, 10, 4, hora)),
  vetor,
});

const parecidos = (a: string, b: string) => semelhanca(palavrasDoTitulo(a), palavrasDoTitulo(b));

describe('palavrasDoTitulo', () => {
  it('tira acentos, maiúsculas, palavras vazias, anos e o plural simples', () => {
    expect([...palavrasDoTitulo('Governo anuncia as novas tarifas de ônibus em 2026: veja o que muda')]).toEqual([
      'governo',
      'anuncia',
      'tarifa',
      'onibu',
      'muda',
    ]);
  });
});

describe('semelhanca', () => {
  it('reconhece o mesmo fato escrito de jeitos diferentes', () => {
    expect(parecidos('Lula sanciona lei que amplia isenção do Imposto de Renda', 'Presidente Lula sanciona isenção do IR para quem ganha até R$ 5 mil')).toBeGreaterThanOrEqual(0.5);
    expect(parecidos('Terremoto atinge o Japão e deixa mortos', 'Terremoto no Japão deixa mortos e feridos')).toBeGreaterThanOrEqual(0.5);
  });

  it('separa assuntos que só dividem uma ou duas palavras', () => {
    expect(parecidos('Lula diz que governo vai rever meta fiscal', 'Lula sanciona lei que amplia isenção do Imposto de Renda')).toBe(0);
    expect(parecidos('Flamengo vence o Palmeiras no Maracanã', 'Palmeiras contrata atacante do Flamengo')).toBe(0);
  });

  it('não junta assuntos só porque saíram no mesmo dia da semana', () => {
    expect(parecidos('Copom decide nesta quarta-feira se corta ou mantém a Taxa Selic', 'Mega-Sena sorteia prêmio acumulado de R$ 46 milhões nesta quarta-feira')).toBe(0);
  });
});

describe('agruparNoticias', () => {
  it('junta as parecidas, mesmo dentro da mesma rodada, e abre acontecimentos para as outras', () => {
    const grupos = agruparNoticias(
      [
        noticia('Terremoto no Japão deixa mortos e feridos', 'b', 2),
        noticia('Terremoto atinge o Japão e deixa mortos', 'a', 1),
        noticia('Seleção convoca jogadores para amistosos', 'c', 3),
      ],
      [],
    );
    expect(grupos.map((g) => ({ eventoId: g.eventoId, urls: g.noticias.map((n) => n.url) }))).toEqual([
      { eventoId: null, urls: ['a', 'b'] },
      { eventoId: null, urls: ['c'] },
    ]);
  });

  it('prefere o acontecimento recente mais parecido e deixa de fora os que não recebem nada', () => {
    const grupos = agruparNoticias(
      [noticia('Banco Central mantém a taxa Selic em 15% ao ano', 'nova')],
      [
        { id: 'juros', titulos: ['Banco Central mantém Selic em 15% e sinaliza cortes'] },
        { id: 'banco', titulos: ['Banco do Brasil lucra mais no trimestre'] },
      ],
    );
    expect(grupos).toEqual([{ eventoId: 'juros', noticias: [expect.objectContaining({ url: 'nova' })] }]);
  });

  it('com vetores, junta títulos de mesmo sentido mesmo sem palavras em comum, inclusive em outra língua', () => {
    const grupos = agruparNoticias(
      [
        noticia('Terremoto atinge o Japão e deixa mortos', 'pt', 1, [1, 0.1, 0]),
        noticia('Deadly earthquake strikes Japan', 'en', 2, [0.98, 0.12, 0.02]),
        noticia('Selic fica em 15%', 'selic', 3, [0, 0, 1]),
      ],
      [],
    );
    expect(grupos.map((g) => g.noticias.map((n) => n.url))).toEqual([['pt', 'en'], ['selic']]);
  });

  it('com vetores pouco parecidos, ainda junta se as palavras bastarem', () => {
    const grupos = agruparNoticias(
      [noticia('Terremoto atinge o Japão e deixa mortos', 'a', 1, [1, 0]), noticia('Terremoto no Japão deixa mortos e feridos', 'b', 2, [0, 1])],
      [],
    );
    expect(grupos).toHaveLength(1);
  });

  it('segue a sugestão do banco quando o acontecimento gravado é parecido o bastante', () => {
    const recentes = [{ id: 'gravado', titulos: ['Deadly earthquake strikes Japan'] }];
    const novas = [noticia('Tremor de terra no Japão', 'nova', 1, [1, 0])];
    expect(agruparNoticias(novas, recentes, [{ eventoId: 'gravado', semelhanca: 0.93 }])[0]?.eventoId).toBe('gravado');
    expect(agruparNoticias(novas, recentes, [{ eventoId: 'gravado', semelhanca: 0.7 }])[0]?.eventoId).toBeNull();
  });
});

describe('cosseno', () => {
  it('vale 1 para a mesma direção, 0 para perpendiculares e 0 para vetor vazio', () => {
    expect(cosseno([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosseno([1, 0], [0, 1])).toBe(0);
    expect(cosseno([0, 0], [1, 1])).toBe(0);
  });
});

describe('textoParaVetor', () => {
  it('junta o título ao começo da descrição, sem espaços repetidos, e usa só o título sem descrição', () => {
    expect(textoParaVetor(' Terremoto no Japão ', '  Tremor de\n magnitude 7  ')).toBe('Terremoto no Japão. Tremor de magnitude 7');
    expect(textoParaVetor('Terremoto no Japão', '   ')).toBe('Terremoto no Japão');
    expect(textoParaVetor('T', 'x'.repeat(900))).toHaveLength(3 + 500);
  });
});
