import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemRss } from '../entidades';
import {
  ExecucoesEmMemoria,
  FontesEmMemoria,
  LeitorRssFalso,
  NoticiasEmMemoria,
  RegistroMudo,
  VetoresFalsos,
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

  function coletor(fontes: FontesEmMemoria, leitor: LeitorRssFalso, vetores: VetoresFalsos | null = null) {
    return new ColetarNoticias({ fontes, noticias, execucoes, leitor, registro, agora: () => AGORA, vetores });
  }

  it('cria um evento por assunto diferente, com URL normalizada e a categoria do feed', async () => {
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
    await noticias.gravarGrupos([
      {
        eventoId: null,
        noticias: [{ fonteId: 1, categoriaId: null, titulo: 'Velha', url: 'https://site.exemplo/velha', descricaoOriginal: null, publicadaEm: horasAtras(5) }],
      },
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

  it('junta no mesmo acontecimento matérias de portais diferentes sobre o mesmo fato', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1, nome: 'g1' }), fonte({ id: 2, nome: 'Folha' }), fonte({ id: 3, nome: 'CNN' })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [item('Lula sanciona lei que amplia isenção do Imposto de Renda', 'https://g1.exemplo/ir', horasAtras(3))],
      'https://fonte2.exemplo/rss': [item('Presidente Lula sanciona isenção do Imposto de Renda para quem ganha até R$ 5 mil', 'https://folha.exemplo/ir', horasAtras(2))],
      'https://fonte3.exemplo/rss': [item('Flamengo vence o Palmeiras no Maracanã', 'https://cnn.exemplo/fla', horasAtras(1))],
    });

    const r = await coletor(fontes, leitor).executar();

    expect(r.novasNoticias).toBe(3);
    const evento = (url: string) => noticias.noticias.find((n) => n.url === url)!.eventoId;
    expect(evento('https://folha.exemplo/ir')).toBe(evento('https://g1.exemplo/ir'));
    expect(evento('https://cnn.exemplo/fla')).not.toBe(evento('https://g1.exemplo/ir'));
  });

  it('põe a matéria nova num acontecimento das últimas 48 horas, mas não num mais velho', async () => {
    await noticias.gravarGrupos([
      { eventoId: null, noticias: [{ fonteId: 9, categoriaId: null, titulo: 'Terremoto atinge o Japão e deixa mortos', url: 'https://a.exemplo/1', descricaoOriginal: null, publicadaEm: horasAtras(10) }] },
      { eventoId: null, noticias: [{ fonteId: 9, categoriaId: null, titulo: 'Eleição na Argentina tem segundo turno marcado', url: 'https://a.exemplo/2', descricaoOriginal: null, publicadaEm: horasAtras(72) }] },
    ]);
    const fontes = new FontesEmMemoria([fonte({ id: 1 })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [
        item('Terremoto no Japão deixa mortos e feridos', 'https://b.exemplo/1'),
        item('Argentina marca segundo turno da eleição', 'https://b.exemplo/2'),
      ],
    });

    await coletor(fontes, leitor).executar();

    const evento = (url: string) => noticias.noticias.find((n) => n.url === url)!.eventoId;
    expect(evento('https://b.exemplo/1')).toBe(evento('https://a.exemplo/1'));
    expect(evento('https://b.exemplo/2')).not.toBe(evento('https://a.exemplo/2'));
  });

  it('grava só uma vez a mesma URL vinda de dois feeds do mesmo portal', async () => {
    const fontes = new FontesEmMemoria([fonte({ id: 1, nome: 'g1' }), fonte({ id: 2, nome: 'g1' })]);
    const leitor = new LeitorRssFalso({
      'https://fonte1.exemplo/rss': [item('Mesma matéria', 'https://g1.exemplo/a')],
      'https://fonte2.exemplo/rss': [item('Mesma matéria', 'https://g1.exemplo/a?utm_source=rss')],
    });

    const r = await coletor(fontes, leitor).executar();

    expect(r.novasNoticias).toBe(1);
    expect(noticias.noticias).toHaveLength(1);
  });

  it('fecha a execução com falha se não conseguir gravar as notícias', async () => {
    noticias.falharAoGravar = true;
    const fontes = new FontesEmMemoria([fonte({ id: 1 })]);
    const r = await coletor(fontes, new LeitorRssFalso({ 'https://fonte1.exemplo/rss': [item('A', 'https://a.exemplo/')] })).executar();

    expect(r).toMatchObject({ status: 'falha', novasNoticias: 0, erros: [{ etapa: 'coleta', mensagem: 'ao gravar as notícias: conexão perdida' }] });
  });

  describe('com vetores', () => {
    it('grava o vetor e junta a matéria em inglês ao acontecimento já gravado pelo sentido', async () => {
      // O texto vetorizado é o título com a descrição do feed (aqui, "texto").
      const vetores = new VetoresFalsos({ 'Terremoto atinge o Japão. texto': [1, 0, 0], 'Deadly earthquake strikes Japan. texto': [0.97, 0.1, 0] });
      await coletor(new FontesEmMemoria([fonte({ id: 1 })]), new LeitorRssFalso({ 'https://fonte1.exemplo/rss': [item('Terremoto atinge o Japão', 'https://g1.exemplo/t', horasAtras(3))] }), vetores).executar();
      await coletor(new FontesEmMemoria([fonte({ id: 2 })]), new LeitorRssFalso({ 'https://fonte2.exemplo/rss': [item('Deadly earthquake strikes Japan', 'https://bbc.exemplo/t', horasAtras(1))] }), vetores).executar();

      expect(vetores.chamadas).toEqual([['Terremoto atinge o Japão. texto'], ['Deadly earthquake strikes Japan. texto']]);
      const [pt, en] = noticias.noticias;
      expect(pt?.vetor).toEqual([1, 0, 0]);
      expect(en?.eventoId).toBe(pt?.eventoId);
    });

    it('se o serviço de vetores falhar, agrupa só pelas palavras e registra o aviso sem mudar o status', async () => {
      const vetores = new VetoresFalsos();
      vetores.falhar = true;
      const r = await coletor(new FontesEmMemoria([fonte({ id: 1 })]), new LeitorRssFalso({ 'https://fonte1.exemplo/rss': [item('A', 'https://a.exemplo/')] }), vetores).executar();

      expect(r).toMatchObject({ status: 'sucesso', novasNoticias: 1, erros: [{ etapa: 'agrupamento', mensagem: 'agrupamento só por palavras: cota da Mistral esgotada' }] });
      expect(noticias.noticias[0]?.vetor).toBeNull();
    });
  });
});
