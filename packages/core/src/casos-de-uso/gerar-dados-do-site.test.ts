import { describe, expect, it } from 'vitest';
import type { CardDeEvento, MateriaPublica } from '../entidades';
import { EscritorEmMemoria, RegistroMudo, SiteEmMemoria } from '../testes/falsos';
import { GerarDadosDoSite, type CategoriasJson, type EventosJson } from './gerar-dados-do-site';

const AGORA = new Date('2026-11-04T12:00:00Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);
const CATEGORIAS = [
  { id: 1, slug: 'brasil', nome: 'Brasil' },
  { id: 5, slug: 'tecnologia', nome: 'Tecnologia' },
];

function card(id: string, horas: number, cobertura = 1, extra: Partial<CardDeEvento> = {}): CardDeEvento {
  return {
    id,
    titulo: `Título ${id}`,
    resumo: null,
    categoriaSlug: null,
    categoriaNome: null,
    cobertura,
    criadoEm: horasAtras(horas),
    atualizadoEm: horasAtras(horas),
    publicadoEm: horasAtras(horas),
    ...extra,
  };
}

function gerar(cards: CardDeEvento[], materias = new Map<string, MateriaPublica[]>(), opcoes = {}) {
  const escritor = new EscritorEmMemoria();
  const caso = new GerarDadosDoSite({ site: new SiteEmMemoria(cards, materias, CATEGORIAS), escritor, registro: new RegistroMudo(), agora: () => AGORA }, opcoes);
  return { caso, escritor };
}

describe('GerarDadosDoSite', () => {
  it('gera eventos das últimas 48 horas com matérias, IA e categoria', async () => {
    const materia = (portal: string): MateriaPublica & { descricaoOriginal?: string } => ({
      portal,
      titulo: `Manchete ${portal}`,
      url: `https://${portal}.exemplo/x`,
      publicadaEm: horasAtras(2),
      exigeAssinatura: portal === 'Folha',
      // Mesmo que um repositório devolva algo a mais, o JSON não pode levar.
      descricaoOriginal: 'TEXTO INTERNO',
    });
    const { caso, escritor } = gerar(
      [card('a', 2, 2, { resumo: 'Resumo da IA.', categoriaSlug: 'tecnologia', categoriaNome: 'Tecnologia' }), card('velho', 50)],
      new Map([['a', [materia('g1'), materia('Folha')]]]),
    );

    await caso.executar();
    const eventos = escritor.arquivos.get('eventos.json') as EventosJson;

    expect(eventos.geradoEm).toBe(AGORA.toISOString());
    expect(eventos.eventos).toHaveLength(1);
    expect(eventos.eventos[0]).toEqual({
      id: 'a',
      titulo: 'Título a',
      resumo: 'Resumo da IA.',
      geradoPorIa: true,
      categoria: { slug: 'tecnologia', nome: 'Tecnologia' },
      cobertura: 2,
      criadoEm: horasAtras(2).toISOString(),
      atualizadoEm: horasAtras(2).toISOString(),
      publicadoEm: horasAtras(2).toISOString(),
      materias: [
        { portal: 'g1', titulo: 'Manchete g1', url: 'https://g1.exemplo/x', publicadaEm: horasAtras(2).toISOString(), exigeAssinatura: false },
        { portal: 'Folha', titulo: 'Manchete Folha', url: 'https://Folha.exemplo/x', publicadaEm: horasAtras(2).toISOString(), exigeAssinatura: true },
      ],
    });
  });

  it('nunca escreve descricao_original nem texto interno em nenhum arquivo', async () => {
    const { caso, escritor } = gerar(
      [card('a', 1)],
      new Map([['a', [{ portal: 'g1', titulo: 'M', url: 'https://g1.exemplo/', publicadaEm: horasAtras(1), exigeAssinatura: false, descricao_original: 'SEGREDO' } as MateriaPublica]]]),
    );
    await caso.executar();
    const tudo = JSON.stringify([...escritor.arquivos.values()]);
    expect(tudo).not.toMatch(/descricao/i);
    expect(tudo).not.toContain('SEGREDO');
  });

  it('"hoje" traz os 5 eventos das últimas 24 horas com maior cobertura', async () => {
    const cards = [
      card('h1', 1, 1),
      card('h2', 2, 4),
      card('h3', 3, 2),
      card('h4', 4, 3),
      card('h5', 5, 1),
      card('h6', 6, 5),
      card('ontem', 30, 9),
    ];
    const { caso, escritor } = gerar(cards);
    await caso.executar();

    const hoje = escritor.arquivos.get('hoje.json') as EventosJson;
    expect(hoje.eventos.map((e) => e.id)).toEqual(['h6', 'h2', 'h4', 'h3', 'h1']);
  });

  it('limita a quantidade de eventos sem perder os de hoje', async () => {
    const cards = [...Array.from({ length: 10 }, (_, i) => card(`novo${i}`, 1 + i * 0.1, 1)), card('destaque', 20, 8)];
    const { caso, escritor } = gerar(cards, new Map(), { maximoDeEventos: 6, eventosDeHoje: 2 });
    await caso.executar();

    const ids = (escritor.arquivos.get('eventos.json') as EventosJson).eventos.map((e) => e.id);
    expect(ids).toHaveLength(6);
    expect(ids).toContain('destaque');
    expect(ids[ids.length - 1]).toBe('destaque');
  });

  it('gera categorias com o total de eventos publicados', async () => {
    const { caso, escritor } = gerar([
      card('a', 1, 1, { categoriaSlug: 'brasil', categoriaNome: 'Brasil' }),
      card('b', 1, 1, { categoriaSlug: 'brasil', categoriaNome: 'Brasil' }),
      card('c', 1),
    ]);
    await caso.executar();
    expect((escritor.arquivos.get('categorias.json') as CategoriasJson).categorias).toEqual([
      { slug: 'brasil', nome: 'Brasil', total: 2 },
      { slug: 'tecnologia', nome: 'Tecnologia', total: 0 },
    ]);
  });

  it('sem resumo, o evento mostra a manchete original e geradoPorIa é false', async () => {
    const { caso, escritor } = gerar([card('a', 1)]);
    await caso.executar();
    expect((escritor.arquivos.get('eventos.json') as EventosJson).eventos[0]).toMatchObject({ resumo: null, geradoPorIa: false, categoria: null });
  });

  it('deixa de fora acontecimentos só com listas de vídeos ou chamadas de programa', async () => {
    const m = (titulo: string): MateriaPublica => ({ portal: 'g1', titulo, url: `https://g1.exemplo/${titulo.length}`, publicadaEm: horasAtras(1), exigeAssinatura: false });
    const { caso, escritor } = gerar(
      [card('programa', 1), card('noticia', 2)],
      new Map([
        ['programa', [m('VÍDEOS: Bom Dia Goiás de quinta-feira'), m('Assista ao Bom Dia ES')]],
        ['noticia', [m('Vídeo mostra o resgate de um cachorro')]],
      ]),
    );
    await caso.executar();
    expect((escritor.arquivos.get('eventos.json') as EventosJson).eventos.map((e) => e.id)).toEqual(['noticia']);
  });
});
