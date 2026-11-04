// Implementações em memória das portas, só para testes.
import type {
  Categoria,
  ErroDeExecucao,
  EventoParaResumir,
  Fonte,
  ItemRss,
  ModeloIa,
  NovaNoticia,
  NovoResumo,
  StatusExecucao,
} from '../entidades';
import type {
  LeitorRss,
  Registro,
  RepositorioExecucoes,
  RepositorioFontes,
  RepositorioNoticias,
  RepositorioResumos,
  ServicoIa,
} from '../portas';

export function fonte(parcial: Partial<Fonte> & Pick<Fonte, 'id'>): Fonte {
  return {
    nome: `Fonte ${parcial.id}`,
    urlFeed: `https://fonte${parcial.id}.exemplo/rss`,
    urlSite: `https://fonte${parcial.id}.exemplo`,
    politicaUso: 'resumo',
    exigeAssinatura: false,
    categoriaId: null,
    ...parcial,
  };
}

export class FontesEmMemoria implements RepositorioFontes {
  saude = new Map<number, { ultimaColetaEm: Date | null; falhasSeguidas: number; ultimoErro: string | null }>();
  falharAoListar = false;

  constructor(readonly fontes: Fonte[]) {
    for (const f of fontes) this.saude.set(f.id, { ultimaColetaEm: null, falhasSeguidas: 0, ultimoErro: null });
  }
  async listarAtivas() {
    if (this.falharAoListar) throw new Error('banco fora do ar');
    return this.fontes;
  }
  async registrarSucesso(id: number, em: Date) {
    this.saude.set(id, { ultimaColetaEm: em, falhasSeguidas: 0, ultimoErro: null });
  }
  async registrarFalha(id: number, em: Date, erro: string) {
    const atual = this.saude.get(id)!;
    this.saude.set(id, { ultimaColetaEm: em, falhasSeguidas: atual.falhasSeguidas + 1, ultimoErro: erro });
  }
}

export class NoticiasEmMemoria implements RepositorioNoticias {
  noticias: (NovaNoticia & { eventoId: string })[] = [];
  private proximoEvento = 1;

  async urlsExistentes(urls: string[]) {
    const gravadas = new Set(this.noticias.map((n) => n.url));
    return new Set(urls.filter((u) => gravadas.has(u)));
  }
  async criarEventosComNoticias(novas: NovaNoticia[]) {
    let gravadas = 0;
    for (const n of novas) {
      if (this.noticias.some((x) => x.url === n.url)) continue; // on conflict do nothing
      this.noticias.push({ ...n, eventoId: `evento-${this.proximoEvento++}` });
      gravadas++;
    }
    return gravadas;
  }
}

export class ExecucoesEmMemoria implements RepositorioExecucoes {
  execucoes = new Map<
    string,
    { iniciadaEm: Date; finalizadaEm: Date | null; status: StatusExecucao; novasNoticias: number; resumosGerados: number; erros: ErroDeExecucao[] }
  >();

  async iniciar(em: Date) {
    const id = `execucao-${this.execucoes.size + 1}`;
    this.execucoes.set(id, { iniciadaEm: em, finalizadaEm: null, status: 'rodando', novasNoticias: 0, resumosGerados: 0, erros: [] });
    return id;
  }
  async finalizar(id: string, d: { em: Date; status: Exclude<StatusExecucao, 'rodando'>; novasNoticias: number; erros: ErroDeExecucao[] }) {
    const e = this.execucoes.get(id)!;
    Object.assign(e, { finalizadaEm: d.em, status: d.status, novasNoticias: d.novasNoticias, erros: [...e.erros, ...d.erros] });
  }
  async registrarResumos(id: string, quantidade: number, erros: ErroDeExecucao[]) {
    const e = this.execucoes.get(id)!;
    e.resumosGerados += quantidade;
    e.erros.push(...erros);
  }
}

export class LeitorRssFalso implements LeitorRss {
  constructor(private readonly respostas: Record<string, ItemRss[] | Error>) {}
  async ler(urlFeed: string) {
    const r = this.respostas[urlFeed];
    if (r === undefined) throw new Error(`feed desconhecido: ${urlFeed}`);
    if (r instanceof Error) throw r;
    return r;
  }
}

export class RegistroMudo implements Registro {
  linhas: { nivel: string; mensagem: string; dados?: Record<string, unknown> }[] = [];
  info(mensagem: string, dados?: Record<string, unknown>) {
    this.linhas.push({ nivel: 'info', mensagem, ...(dados && { dados }) });
  }
  aviso(mensagem: string, dados?: Record<string, unknown>) {
    this.linhas.push({ nivel: 'aviso', mensagem, ...(dados && { dados }) });
  }
  erro(mensagem: string, dados?: Record<string, unknown>) {
    this.linhas.push({ nivel: 'erro', mensagem, ...(dados && { dados }) });
  }
}

export class ResumosEmMemoria implements RepositorioResumos {
  gravados: NovoResumo[] = [];
  categoriaDoEvento = new Map<string, number | null>();
  pedidos: { limite: number; desde: Date }[] = [];

  constructor(
    public modelo: ModeloIa | null,
    readonly listaDeCategorias: Categoria[],
    readonly pendentes: EventoParaResumir[],
  ) {}

  async modeloAtivo() {
    return this.modelo;
  }
  async categorias() {
    return this.listaDeCategorias;
  }
  async eventosSemResumo(opcoes: { limite: number; desde: Date }) {
    this.pedidos.push(opcoes);
    const resumidos = new Set(this.gravados.map((r) => r.eventoId));
    return this.pendentes.filter((e) => !resumidos.has(e.id)).slice(0, opcoes.limite);
  }
  async gravarResumo(r: NovoResumo) {
    if (this.gravados.some((g) => g.eventoId === r.eventoId)) return false;
    this.gravados.push(r);
    if ((this.categoriaDoEvento.get(r.eventoId) ?? null) === null) this.categoriaDoEvento.set(r.eventoId, r.categoriaId);
    return true;
  }
}

export class IaFalsa implements ServicoIa {
  readonly versaoPrompt = 'teste-v1';
  chamadas: Parameters<ServicoIa['resumir']>[0][] = [];

  constructor(private readonly responder: (entrada: Parameters<ServicoIa['resumir']>[0], chamada: number) => ReturnType<ServicoIa['resumir']>) {}

  async resumir(entrada: Parameters<ServicoIa['resumir']>[0]) {
    this.chamadas.push(entrada);
    return this.responder(entrada, this.chamadas.length);
  }
}
