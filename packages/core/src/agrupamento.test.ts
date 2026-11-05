import { describe, expect, it } from 'vitest';
import { agruparNoticias, palavrasDoTitulo, semelhanca } from './agrupamento';
import type { NovaNoticia } from './entidades';

const noticia = (titulo: string, url: string, hora = 0): NovaNoticia => ({
  fonteId: 1,
  categoriaId: null,
  titulo,
  url,
  descricaoOriginal: null,
  publicadaEm: new Date(Date.UTC(2026, 10, 4, hora)),
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
});
