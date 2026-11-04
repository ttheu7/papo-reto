import type { ErroDeExecucao, Fonte, ItemRss, NovaNoticia, StatusExecucao } from './entidades';

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
