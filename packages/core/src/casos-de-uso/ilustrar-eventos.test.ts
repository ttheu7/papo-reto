import { describe, expect, it } from 'vitest';
import { ErroCotaIa } from '../erros';
import { AcervoFalso, ImagensEmMemoria, imagemDeTeste, RegistroMudo } from '../testes/falsos';
import { IlustrarEventos } from './ilustrar-eventos';

const AGORA = new Date('2026-11-05T12:00:00Z');
const pendentes = (n: number) => Array.from({ length: n }, (_, i) => ({ eventoId: `e${i + 1}`, busca: `busca ${i + 1}` }));
const ilustrar = (imagens: ImagensEmMemoria, acervos: AcervoFalso[], opcoes = {}) =>
  new IlustrarEventos({ imagens, acervos, registro: new RegistroMudo(), agora: () => AGORA }, opcoes).executar('x');

describe('IlustrarEventos', () => {
  it('usa o primeiro acervo que achar e só chama o seguinte quando o primeiro não acha', async () => {
    const imagens = new ImagensEmMemoria(pendentes(2));
    const pexels = new AcervoFalso('Pexels', async (t) => (t === 'busca 1' ? imagemDeTeste('Pexels', t) : null));
    const unsplash = new AcervoFalso('Unsplash', async (t) => imagemDeTeste('Unsplash', t));

    const r = await ilustrar(imagens, [pexels, unsplash]);

    expect(r).toEqual({ ilustrados: 2, semImagem: 0, erros: [] });
    expect(imagens.gravadas.get('e1')?.imagem?.provedor).toBe('Pexels');
    expect(imagens.gravadas.get('e2')?.imagem?.provedor).toBe('Unsplash');
    expect(unsplash.buscas).toEqual(['busca 2']);
    expect(imagens.pedidos[0]).toEqual({ desde: new Date('2026-11-03T12:00:00Z'), limite: 15 });
  });

  it('grava "sem imagem" quando todos respondem sem achar, para não procurar de novo', async () => {
    const imagens = new ImagensEmMemoria(pendentes(1));
    const r = await ilustrar(imagens, [new AcervoFalso('Pexels', async () => null), new AcervoFalso('Unsplash', async () => null)]);
    expect(r).toMatchObject({ ilustrados: 0, semImagem: 1 });
    expect(imagens.gravadas.get('e1')).toEqual({ busca: 'busca 1', imagem: null });
  });

  it('acervo sem cota sai da rodada; se nenhum responder, o acontecimento fica para a próxima', async () => {
    const imagens = new ImagensEmMemoria(pendentes(3));
    const pexels = new AcervoFalso('Pexels', async () => Promise.reject(new ErroCotaIa('429')));
    const unsplash = new AcervoFalso('Unsplash', async (t) => (t === 'busca 2' ? Promise.reject(new Error('HTTP 500')) : imagemDeTeste('Unsplash', t)));

    const r = await ilustrar(imagens, [pexels, unsplash]);

    expect(pexels.buscas).toEqual(['busca 1']);
    expect(r.ilustrados).toBe(2);
    expect(r.erros).toEqual(['Pexels: 429', 'Unsplash: HTTP 500']);
    expect(imagens.gravadas.has('e2')).toBe(false);
  });

  it('para quando todos os acervos ficam sem cota, e sem acervos não faz nada', async () => {
    const imagens = new ImagensEmMemoria(pendentes(5));
    const semCota = new AcervoFalso('Pexels', async () => Promise.reject(new ErroCotaIa('429')));
    expect(await ilustrar(imagens, [semCota])).toMatchObject({ ilustrados: 0, semImagem: 0 });
    expect(semCota.buscas).toHaveLength(1);
    expect(await ilustrar(new ImagensEmMemoria(pendentes(1)), [])).toEqual({ ilustrados: 0, semImagem: 0, erros: [] });
  });
});
