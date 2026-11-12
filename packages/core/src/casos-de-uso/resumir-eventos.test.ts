import { beforeEach, describe, expect, it } from 'vitest';
import type { EventoParaResumir, ModeloIa } from '../entidades';
import { ErroCotaIa } from '../erros';
import { ExecucoesEmMemoria, IaFalsa, RegistroMudo, ResumosEmMemoria } from '../testes/falsos';
import { limitarFrases, ResumirEventos } from './resumir-eventos';

const AGORA = new Date('2026-11-04T12:00:00Z');
const MODELO: ModeloIa = { id: 7, provedor: 'Google', modelo: 'gemini-x', custoEntrada1m: 0.1, custoSaida1m: 0.4 };
const CATEGORIAS = [
  { id: 1, slug: 'brasil', nome: 'Brasil' },
  { id: 5, slug: 'tecnologia', nome: 'Tecnologia' },
];
const evento = (id: string): EventoParaResumir => ({ id, materias: [{ portal: 'g1', titulo: `Manchete ${id}`, descricao: 'descrição' }] });
const eventos = (n: number) => Array.from({ length: n }, (_, i) => evento(`e${i + 1}`));

describe('ResumirEventos', () => {
  let execucoes: ExecucoesEmMemoria;
  let execucaoId: string;

  beforeEach(async () => {
    execucoes = new ExecucoesEmMemoria();
    execucaoId = await execucoes.iniciar(AGORA);
  });

  function resumidor(repo: ResumosEmMemoria, ia: IaFalsa, opcoes = {}) {
    return new ResumirEventos({ resumos: repo, execucoes, ia, registro: new RegistroMudo(), agora: () => AGORA }, opcoes);
  }

  const iaQueResumeTudo = () =>
    new IaFalsa(async ({ eventos }) => ({
      resumos: eventos.map((e) => ({ eventoId: e.id, titulo: `Título ${e.id}`, texto: 'Uma. Duas.', categoriaSlug: 'tecnologia' })),
      tokensEntrada: 1000,
      tokensSaida: 200,
    }));

  it('resume em lotes, respeita o limite de chamadas e registra na execução', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(25));
    const ia = iaQueResumeTudo();

    const r = await resumidor(repo, ia, { tamanhoDoLote: 10, maximoDeChamadas: 2 }).executar(execucaoId);

    expect(ia.chamadas.map((c) => c.eventos.length)).toEqual([10, 10]);
    expect(ia.chamadas[0]).toMatchObject({ modelo: 'gemini-x', categorias: ['brasil', 'tecnologia'] });
    expect(r).toEqual({ resumosGerados: 20, chamadas: 2, erros: [], usouReserva: false });
    expect(execucoes.execucoes.get(execucaoId)?.resumosGerados).toBe(20);
    expect(repo.pedidos[0]).toEqual({ limite: 20, desde: new Date('2026-11-02T12:00:00Z') });
  });

  it('grava versão do prompt, tokens divididos, custo e categoria por slug', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(2));
    await resumidor(repo, iaQueResumeTudo()).executar(execucaoId);

    expect(repo.gravados[0]).toEqual({
      eventoId: 'e1',
      modeloIaId: 7,
      titulo: 'Título e1',
      texto: 'Uma. Duas.',
      versaoPrompt: 'teste-v1',
      tokensEntrada: 500,
      tokensSaida: 100,
      custoEstimado: (500 * 0.1 + 100 * 0.4) / 1_000_000,
      categoriaId: 5,
      buscaImagem: null,
    });
  });

  it('grava as palavras-chave da imagem limpas, e null quando a IA não quer imagem', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(3));
    const ia = new IaFalsa(async () => ({
      resumos: [
        { eventoId: 'e1', titulo: 'T', texto: 'Uma.', categoriaSlug: null, buscaImagem: '  soccer   stadium; <night> ' },
        { eventoId: 'e2', titulo: 'T', texto: 'Uma.', categoriaSlug: null, buscaImagem: null },
        { eventoId: 'e3', titulo: 'T', texto: 'Uma.', categoriaSlug: null, buscaImagem: '   ' },
      ],
      tokensEntrada: 1,
      tokensSaida: 1,
    }));
    await resumidor(repo, ia).executar(execucaoId);
    expect(repo.gravados.map((g) => g.buscaImagem)).toEqual(['soccer stadium night', null, null]);
  });

  it('descarta ids inventados e repetidos, ignora slug desconhecido e corta o texto em quatro frases', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(2));
    const ia = new IaFalsa(async () => ({
      resumos: [
        { eventoId: 'e1', titulo: 'Ok', texto: 'Um. Dois. Três. Quatro. Cinco.', categoriaSlug: 'inventada' },
        { eventoId: 'e1', titulo: 'De novo', texto: 'X.', categoriaSlug: null },
        { eventoId: 'nao-existe', titulo: 'Fantasma', texto: 'Y.', categoriaSlug: null },
        { eventoId: 'e2', titulo: '  ', texto: 'Sem título.', categoriaSlug: null },
      ],
      tokensEntrada: 10,
      tokensSaida: 10,
    }));

    const r = await resumidor(repo, ia).executar(execucaoId);

    expect(r.resumosGerados).toBe(1);
    expect(repo.gravados).toHaveLength(1);
    expect(repo.gravados[0]).toMatchObject({ eventoId: 'e1', texto: 'Um. Dois. Três. Quatro.', categoriaId: null });
  });

  it('erro de cota encerra a etapa sem lançar e fica registrado', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(30));
    const ia = new IaFalsa(async ({ eventos }, chamada) => {
      if (chamada === 2) throw new ErroCotaIa('429');
      return { resumos: eventos.map((e) => ({ eventoId: e.id, titulo: 'T', texto: 'X.', categoriaSlug: null })), tokensEntrada: 1, tokensSaida: 1 };
    });

    const r = await resumidor(repo, ia).executar(execucaoId);

    expect(ia.chamadas).toHaveLength(2);
    expect(r.resumosGerados).toBe(10);
    expect(r.erros).toEqual([{ etapa: 'resumos', mensagem: 'Google (principal): cota esgotada: 429' }]);
    expect(execucoes.execucoes.get(execucaoId)?.erros).toHaveLength(1);
  });

  it('outros erros perdem só o lote e seguem para o próximo', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(20));
    const ia = new IaFalsa(async ({ eventos }, chamada) => {
      if (chamada === 1) throw new Error('JSON inválido');
      return { resumos: eventos.map((e) => ({ eventoId: e.id, titulo: 'T', texto: 'X.', categoriaSlug: null })), tokensEntrada: 1, tokensSaida: 1 };
    });

    const r = await resumidor(repo, ia).executar(execucaoId);
    expect(r).toMatchObject({ resumosGerados: 10, chamadas: 2, erros: [{ etapa: 'resumos', mensagem: 'Google (principal): JSON inválido' }] });
  });

  it('nunca resume o mesmo evento duas vezes', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(3));
    await resumidor(repo, iaQueResumeTudo()).executar(execucaoId);
    const ia = iaQueResumeTudo();
    const r = await resumidor(repo, ia).executar(execucaoId);

    expect(ia.chamadas).toHaveLength(0);
    expect(r.resumosGerados).toBe(0);
    expect(repo.gravados).toHaveLength(3);
  });

  it('sem modelo ativo, não chama a IA', async () => {
    const ia = iaQueResumeTudo();
    const r = await resumidor(new ResumosEmMemoria(null, CATEGORIAS, eventos(3)), ia).executar(execucaoId);
    expect(ia.chamadas).toHaveLength(0);
    expect(r.resumosGerados).toBe(0);
  });
});

describe('limitarFrases', () => {
  it('mantém até quatro frases, inclusive com ! e ?', () => {
    expect(limitarFrases('Oi! Tudo bem? Sim. Não. Talvez.')).toBe('Oi! Tudo bem? Sim. Não.');
    expect(limitarFrases('Sem ponto final')).toBe('Sem ponto final');
  });
});

describe('ResumirEventos com IA de reserva', () => {
  let execucoes: ExecucoesEmMemoria;
  let execucaoId: string;
  beforeEach(async () => {
    execucoes = new ExecucoesEmMemoria();
    execucaoId = await execucoes.iniciar(AGORA);
  });
  const iaQueResumeTudo = () =>
    new IaFalsa(async ({ eventos }) => ({
      resumos: eventos.map((e) => ({ eventoId: e.id, titulo: `Título ${e.id}`, texto: 'Uma. Duas.', categoriaSlug: null })),
      tokensEntrada: 100,
      tokensSaida: 20,
    }));
  const RESERVA: ModeloIa = { id: 9, provedor: 'Groq', modelo: 'llama-x', custoEntrada1m: 0, custoSaida1m: 0 };
  const iaSemCota = () => new IaFalsa(async () => Promise.reject(new ErroCotaIa('429')));
  const comReserva = (repo: ResumosEmMemoria, ia: IaFalsa | null, reserva: IaFalsa, opcoes = {}) =>
    new ResumirEventos({ resumos: repo, execucoes, ia, reserva, registro: new RegistroMudo(), agora: () => AGORA }, opcoes);

  it('quando a principal fica sem cota, a reserva resume o mesmo lote e os seguintes', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(15));
    repo.modeloDeReserva = RESERVA;
    const principal = iaSemCota();
    const reserva = iaQueResumeTudo();

    const r = await comReserva(repo, principal, reserva, { tamanhoDoLote: 10, maximoDeChamadas: 2 }).executar(execucaoId);

    expect(principal.chamadas).toHaveLength(1);
    expect(reserva.chamadas.map((c) => [c.modelo, c.eventos.length])).toEqual([['llama-x', 10], ['llama-x', 5]]);
    expect(r).toMatchObject({ resumosGerados: 15, usouReserva: true, erros: [{ etapa: 'resumos', mensagem: 'Google (principal): cota esgotada: 429' }] });
    expect(new Set(repo.gravados.map((g) => g.modeloIaId))).toEqual(new Set([9]));
  });

  it('sem chave da principal, usa direto a reserva', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(2));
    repo.modeloDeReserva = RESERVA;
    const r = await comReserva(repo, null, iaQueResumeTudo()).executar(execucaoId);
    expect(r).toMatchObject({ resumosGerados: 2, usouReserva: true, erros: [] });
  });

  it('se a reserva também ficar sem cota, encerra a etapa sem lançar', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(25));
    repo.modeloDeReserva = RESERVA;
    const reserva = iaSemCota();
    const r = await comReserva(repo, iaSemCota(), reserva).executar(execucaoId);
    expect(reserva.chamadas).toHaveLength(1);
    expect(r).toMatchObject({ resumosGerados: 0, chamadas: 1 });
    expect(r.erros.map((e) => e.mensagem)).toEqual(['Google (principal): cota esgotada: 429', 'Groq (reserva): cota esgotada: 429']);
  });

  it('sem modelo de reserva cadastrado, a reserva não entra', async () => {
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, eventos(2));
    const reserva = iaQueResumeTudo();
    const r = await comReserva(repo, iaSemCota(), reserva).executar(execucaoId);
    expect(reserva.chamadas).toHaveLength(0);
    expect(r).toMatchObject({ resumosGerados: 0, usouReserva: false });
  });

  it('não manda para a IA acontecimentos só com listas de vídeos', async () => {
    const execucoes = new ExecucoesEmMemoria();
    const execucaoId = await execucoes.iniciar(AGORA);
    const programa: EventoParaResumir = { id: 'p', materias: [{ portal: 'g1', titulo: 'VÍDEOS: Bom Dia PE', descricao: null }] };
    const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, [programa, evento('e1')]);
    const ia = new IaFalsa(async ({ eventos }) => ({
      resumos: eventos.map((e) => ({ eventoId: e.id, titulo: 'T', texto: 'Uma.', categoriaSlug: null })),
      tokensEntrada: 1,
      tokensSaida: 1,
    }));
    await new ResumirEventos({ resumos: repo, execucoes, ia, registro: new RegistroMudo(), agora: () => AGORA }).executar(execucaoId);
    expect(ia.chamadas[0]?.eventos.map((e) => e.id)).toEqual(['e1']);
  });

  describe('vaga garantida para Games', () => {
    const COM_GAMES = [...CATEGORIAS, { id: 9, slug: 'games', nome: 'Games' }];
    const deGames = (id: string): EventoParaResumir => ({ ...evento(id), categoriaSlug: 'games' });
    let execucoes: ExecucoesEmMemoria;
    let execucaoId: string;
    beforeEach(async () => {
      execucoes = new ExecucoesEmMemoria();
      execucaoId = await execucoes.iniciar(AGORA);
    });
    const resumidor = (repo: ResumosEmMemoria, ia: IaFalsa, opcoes = {}) =>
      new ResumirEventos({ resumos: repo, execucoes, ia, registro: new RegistroMudo(), agora: () => AGORA }, opcoes);
    const iaQueResumeTudo = () =>
      new IaFalsa(async ({ eventos }) => ({
        resumos: eventos.map((e) => ({ eventoId: e.id, titulo: `Título ${e.id}`, texto: 'Uma. Duas.', categoriaSlug: 'games' })),
        tokensEntrada: 1000,
        tokensSaida: 200,
      }));

    it('põe o acontecimento de Games no primeiro lote quando nenhum dos escolhidos é de Games', async () => {
      const repo = new ResumosEmMemoria(MODELO, COM_GAMES, [...eventos(25), deGames('furia')]);
      const ia = iaQueResumeTudo();

      const r = await resumidor(repo, ia, { tamanhoDoLote: 10, maximoDeChamadas: 2 }).executar(execucaoId);

      expect(ia.chamadas[0]!.eventos[0]!.id).toBe('furia');
      expect(r.resumosGerados).toBe(20);
      expect(repo.gravados.map((g) => g.eventoId)).toContain('furia');
    });

    it('não reserva vaga quando já há um acontecimento de Games entre os escolhidos', async () => {
      const repo = new ResumosEmMemoria(MODELO, COM_GAMES, [deGames('vct'), ...eventos(25)]);
      const ia = iaQueResumeTudo();

      await resumidor(repo, ia, { tamanhoDoLote: 10, maximoDeChamadas: 1 }).executar(execucaoId);

      expect(repo.pedidos.some((p) => p.categoria === 'games')).toBe(false);
      expect(ia.chamadas[0]!.eventos.map((e) => e.id)).toEqual(['vct', ...eventos(9).map((e) => e.id)]);
    });

    it('não procura Games se a editoria não existe no banco', async () => {
      const repo = new ResumosEmMemoria(MODELO, CATEGORIAS, [...eventos(5), deGames('furia')]);
      const ia = iaQueResumeTudo();

      await resumidor(repo, ia, { tamanhoDoLote: 2, maximoDeChamadas: 1 }).executar(execucaoId);

      expect(repo.pedidos.some((p) => p.categoria === 'games')).toBe(false);
      expect(ia.chamadas[0]!.eventos.map((e) => e.id)).toEqual(['e1', 'e2']);
    });
  });
});
