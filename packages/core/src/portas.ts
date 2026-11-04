import type {
  CardDeEvento,
  Categoria,
  ErroDeExecucao,
  EventoParaResumir,
  Fonte,
  ItemRss,
  MateriaPublica,
  ModeloIa,
  NovaNoticia,
  NovoResumo,
  ResumoGerado,
  StatusExecucao,
} from './entidades';

export interface RepositorioFontes {
  listarAtivas(): Promise<Fonte[]>;
  registrarSucesso(fonteId: number, em: Date): Promise<void>;
  registrarFalha(fonteId: number, em: Date, erro: string): Promise<void>;
}

export interface RepositorioNoticias {
  /** Das URLs informadas, devolve as que já estão no banco. */
  urlsExistentes(urls: string[]): Promise<Set<string>>;
  /**
   * Cria um evento por notícia. URLs que entrarem em conflito são ignoradas
   * (sem deixar evento órfão). Devolve quantas notícias foram gravadas.
   */
  criarEventosComNoticias(noticias: NovaNoticia[]): Promise<number>;
}

export interface RepositorioExecucoes {
  iniciar(em: Date): Promise<string>;
  finalizar(
    id: string,
    dados: { em: Date; status: Exclude<StatusExecucao, 'rodando'>; novasNoticias: number; erros: ErroDeExecucao[] },
  ): Promise<void>;
  /** Soma os resumos gerados e acrescenta erros a uma execução já registrada. */
  registrarResumos(id: string, quantidade: number, erros: ErroDeExecucao[]): Promise<void>;
}

export interface LeitorRss {
  ler(urlFeed: string): Promise<ItemRss[]>;
}

export interface Registro {
  info(mensagem: string, dados?: Record<string, unknown>): void;
  aviso(mensagem: string, dados?: Record<string, unknown>): void;
  erro(mensagem: string, dados?: Record<string, unknown>): void;
}

export type Relogio = () => Date;

export interface RepositorioResumos {
  modeloAtivo(): Promise<ModeloIa | null>;
  categorias(): Promise<Categoria[]>;
  /** Eventos recentes sem nenhum resumo, os de maior cobertura primeiro. */
  eventosSemResumo(opcoes: { limite: number; desde: Date }): Promise<EventoParaResumir[]>;
  /** Grava o resumo se o evento ainda não tiver um. Devolve se gravou. */
  gravarResumo(resumo: NovoResumo): Promise<boolean>;
}

export interface ServicoIa {
  readonly versaoPrompt: string;
  /**
   * Resume um lote de eventos numa chamada só. Lança `ErroCotaIa` quando a
   * cota acabar.
   */
  resumir(entrada: {
    modelo: string;
    categorias: string[];
    eventos: EventoParaResumir[];
  }): Promise<{ resumos: ResumoGerado[]; tokensEntrada: number; tokensSaida: number }>;
}

export interface RepositorioSite {
  /** Cards cuja matéria mais recente saiu depois de `desde`, os mais recentes primeiro. */
  cardsRecentes(opcoes: { desde: Date; limite: number }): Promise<CardDeEvento[]>;
  /** Matérias de cada evento, sem nenhum campo de uso interno. */
  materiasDosEventos(ids: string[]): Promise<Map<string, MateriaPublica[]>>;
  categorias(): Promise<Categoria[]>;
}

export interface EscritorDeDados {
  escrever(nome: string, dados: unknown): Promise<void>;
}
