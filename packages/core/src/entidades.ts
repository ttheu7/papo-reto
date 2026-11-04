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

export interface ModeloIa {
  id: number;
  provedor: string;
  modelo: string;
  /** Dólares por 1 milhão de tokens. */
  custoEntrada1m: number;
  custoSaida1m: number;
}

/** O que a IA recebe de um evento: só títulos e descrições dos feeds. */
export interface EventoParaResumir {
  id: string;
  materias: { portal: string; titulo: string; descricao: string | null }[];
}

export interface ResumoGerado {
  eventoId: string;
  titulo: string;
  texto: string;
  categoriaSlug: string | null;
}

export interface NovoResumo {
  eventoId: string;
  modeloIaId: number;
  titulo: string;
  texto: string;
  versaoPrompt: string;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimado: number;
  /** Só é aplicada se o evento ainda não tiver categoria. */
  categoriaId: number | null;
}

/** Linha da vw_evento_card, com a data da matéria mais recente. */
export interface CardDeEvento {
  id: string;
  titulo: string;
  resumo: string | null;
  categoriaSlug: string | null;
  categoriaNome: string | null;
  cobertura: number;
  criadoEm: Date;
  atualizadoEm: Date;
  publicadoEm: Date;
}

/** O que o site mostra de uma notícia. Sem descricao_original, de propósito. */
export interface MateriaPublica {
  portal: string;
  titulo: string;
  url: string;
  publicadaEm: Date;
  exigeAssinatura: boolean;
}
