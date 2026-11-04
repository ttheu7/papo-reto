export type PoliticaUso = 'so_link' | 'resumo' | 'republicacao_com_credito';
export type StatusExecucao = 'rodando' | 'sucesso' | 'parcial' | 'falha';

export interface Categoria {
  id: number;
  slug: string;
  nome: string;
}

export interface Fonte {
  id: number;
  nome: string;
  urlFeed: string;
  urlSite: string;
  politicaUso: PoliticaUso;
  exigeAssinatura: boolean;
  /** Categoria padrão do feed (feeds de seção). Os eventos herdam esta categoria. */
  categoriaId: number | null;
}

/** Um item como veio do feed, antes de normalizar. */
export interface ItemRss {
  titulo: string;
  link: string;
  descricao: string | null;
  publicadaEm: Date | null;
}

/** Notícia pronta para gravar. Cada uma vira um evento novo (MVP). */
export interface NovaNoticia {
  fonteId: number;
  categoriaId: number | null;
  titulo: string;
  url: string;
  descricaoOriginal: string | null;
  publicadaEm: Date;
}

export interface ErroDeExecucao {
  etapa: 'fontes' | 'coleta' | 'resumos' | 'dados';
  mensagem: string;
  fonteId?: number;
}

export interface ResultadoDaColeta {
  execucaoId: string;
  status: Exclude<StatusExecucao, 'rodando'>;
  novasNoticias: number;
  erros: ErroDeExecucao[];
}
