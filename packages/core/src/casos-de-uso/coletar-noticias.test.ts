import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemRss } from '../entidades';
import {
  ExecucoesEmMemoria,
  FontesEmMemoria,
  LeitorRssFalso,
  NoticiasEmMemoria,
  RegistroMudo,
  fonte,
} from '../testes/falsos';
import { ColetarNoticias } from './coletar-noticias';

const AGORA = new Date('2026-11-04T12:00:00Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);
const item = (titulo: string, link: string, publicadaEm: Date | null = horasAtras(1), descricao: string | null = 'texto'): ItemRss => ({
  titulo,
  link,
  publicadaEm,
  descricao,
});

describe('ColetarNoticias', () => {
  let noticias: NoticiasEmMemoria;
  let execucoes: ExecucoesEmMemoria;
  let registro: RegistroMudo;

  beforeEach(() => {
    noticias = new NoticiasEmMemoria();
    execucoes = new ExecucoesEmMemoria();
    registro = new RegistroMudo();
  });

  function coletor(fontes: FontesEmMemoria, leitor: LeitorRssFalso) {
    return new ColetarNoticias({ fontes, noticias, execucoes, leitor, registro, agora: () => AGORA });
  }

  it('cria um evento por notícia nova, com URL normalizada e a categoria do feed', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1, categoriaId: 5 })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [
        item('Primeira', 'https://redir.folha.com.br/redir/x/*https://www1.folha.uol.com.br/a.shtml?utm_source=rss'),
        item('Segunda', 'https://site.exemplo/b'),
      ],
    });

    const r = await coletor(fontes, leitor).executar();

    expect(r).toMatchObject({ status: 'sucesso', novasNoticias: 2, erros: [] });
    expect(noticias.noticias.map((n) => n.url)).toEqual(['https://www1.folha.uol.com.br/a.shtml', 'https://site.exemplo/b']);
    expect(noticias.noticias.every((n) => n.categoriaId === 5)).toBe(true);
    expect(new Set(noticias.noticias.map((n) => n.eventoId)).size).toBe(2);
  });

  it('descarta URLs que já existem e repetidas no mesmo feed', async () => {
    await noticias.criarEventosComNoticias([
      { fonteId: 1, categoriaId: null, titulo: 'Velha', url: 'https://site.exemplo/velha', descricaoOriginal: null, publicadaEm: horasAtras(5) },
    ]);
    const fontes = new FontesEmMemoria([fonte({ id: 1 })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [
        item('Velha', 'https://site.exemplo/velha?utm_campaign=x'),
        item('Nova', 'https://site.exemplo/nova'),
        item('Nova de novo', 'https://site.exemplo/nova#comentarios'),
      ],
    });

    const r = await coletor(fontes, leitor).executar();

    expect(r.novasNoticias).toBe(1);
    expect(noticias.noticias).toHaveLength(2);
  });

  it('ignora itens sem título, sem link válido ou velhos demais, e corrige datas ausentes ou futuras', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1 })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [
        item('   ', 'https://site.exemplo/sem-titulo'),
        item('Link ruim', 'javascript:void(0)'),
        item('Velha demais', 'https://site.exemplo/velha', horasAtras(24 * 8)),
        item('Sem data', 'https://site.exemplo/sem-data', null),
        item('Do futuro', 'https://site.exemplo/futuro', new Date(AGORA.getTime() + 3_600_000)),
      ],
    });

    await coletor(fontes, leitor).executar();

    expect(noticias.noticias.map((n) => n.titulo)).toEqual(['Sem data', 'Do futuro']);
    expect(noticias.noticias.every((n) => n.publicadaEm.getTime() === AGORA.getTime())).toBe(true);
  });

  it('a falha de uma fonte não derruba as outras e deixa a execução parcial', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1 }), fonte({ id: 2 })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': new Error('tempo esgotado'),
      'https://fonte2.exemplo/rss': [item('Ok', 'https://site.exemplo/ok')],
    });

    const r = await coletor(fontes, leitor).executar();

    expect(r.status).toBe('parcial');
    expect(r.novasNoticias).toBe(1);
    expect(r.erros).toEqual([{ etapa: 'coleta', fonteId: 1, mensagem: 'tempo esgotado' }]);
    expect(fontes.saude.get(1)).toEqual({ ultimaColetaEm: AGORA, falhasSeguidas: 1, ultimoErro: 'tempo esgotado' });
    expect(fontes.saude.get(2)).toEqual({ ultimaColetaEm: AGORA, falhasSeguidas: 0, ultimoErro: null });
  });

  it('registra a execução do início ao fim', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1 })]);
    const r = await coletor(fontes, new LeitorRssFalso({ 'https://fonte1.exemplo/rss': [item('A', 'https://a.exemplo/')] })).executar();

    expect(execucoes.execucoes.get(r.execucaoId)).toMatchObject({
      iniciadaEm: AGORA,
      finalizadaEm: AGORA,
      status: 'sucesso',
      novasNoticias: 1,
      erros: [],
    });
  });

  it('fica com status falha quando todas as fontes falham', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1 }), fonte({ id: 2 })]);
    const r = await coletor(fontes, new LeitorRssFalso({})).executar();

    expect(r.status).toBe('falha');
    expect(r.erros).toHaveLength(2);
  });

  it('fecha a execução com falha se não conseguir ler as fontes', async () => {
    const fontes = new FontesEmMemoria([]);
    fontes.falharAoListar = true;
    const r = await coletor(fontes, new LeitorRssFalso({})).executar();

    expect(r).toMatchObject({ status: 'falha', novasNoticias: 0, erros: [{ etapa: 'fontes', mensagem: 'banco fora do ar' }] });
    expect(execucoes.execucoes.get(r.execucaoId)?.status).toBe('falha');
  });

  it('sem fontes ativas, termina com sucesso e zero notícias', async () => {
    const r = await coletor(new FontesEmMemoria([]), new LeitorRssFalso({})).executar();
    expect(r).toMatchObject({ status: 'sucesso', novasNoticias: 0 });
  });
});
