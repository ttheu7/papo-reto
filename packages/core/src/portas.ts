import type {
  CardDeEvento,
  Categoria,
  ErroDeExecucao,
  EventoParaIlustrar,
  EventoParaResumir,
  EventoRecente,
  Fonte,
  GrupoDeNoticias,
  ImagemDeAcervo,
  ItemRss,
  MateriaPublica,
  ModeloIa,
  ParecidoPorVetor,
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
  /** Acontecimentos com alguma notícia publicada desde `desde`, com os títulos das notícias. */
  eventosRecentes(desde: Date): Promise<EventoRecente[]>;
  /**
   * Grava cada grupo no seu acontecimento, ou num novo quando `eventoId` é nulo, numa
   * transação só. URLs que entrarem em conflito são ignoradas (sem deixar acontecimento
   * vazio). Devolve quantas notícias foram gravadas.
   */
  gravarGrupos(grupos: GrupoDeNoticias[]): Promise<number>;
  /**
   * Para cada vetor, o acontecimento (com notícia publicada desde `desde`) cuja notícia tem o
   * vetor mais parecido, ou null se nenhuma notícia recente tiver vetor. A comparação roda no
   * banco, para os vetores gravados não trafegarem.
   */
  parecidosPorVetor(vetores: number[][], desde: Date): Promise<(ParecidoPorVetor | null)[]>;
}

/** Transforma textos em vetores (embeddings) que se comparam pelo sentido. */
export interface ServicoDeVetores {
  /** Um vetor por texto, na mesma ordem. */
  vetorizar(textos: string[]): Promise<number[][]>;
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
  /** Modelo de reserva, usado quando o principal falha ou fica sem cota. */
  modeloReserva(): Promise<ModeloIa | null>;
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

/** Um acervo de imagens gratuitas (Pexels, Unsplash). */
export interface AcervoDeImagens {
  readonly nome: string;
  /** A melhor imagem para as palavras-chave, ou null se não houver. Lança `ErroCotaIa` sem cota. */
  buscar(termos: string): Promise<ImagemDeAcervo | null>;
}

export interface RepositorioImagens {
  /** Acontecimentos recentes com palavras-chave de imagem e sem imagem procurada, os de maior cobertura primeiro. */
  eventosParaIlustrar(opcoes: { desde: Date; limite: number }): Promise<EventoParaIlustrar[]>;
  /** Grava a imagem escolhida, ou null para "procurou e não achou" (não procura de novo). */
  gravarImagem(eventoId: string, busca: string, imagem: ImagemDeAcervo | null): Promise<void>;
}
