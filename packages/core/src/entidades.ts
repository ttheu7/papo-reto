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

/** Notícia pronta para gravar. Entra num acontecimento recente parecido ou abre um novo. */
export interface NovaNoticia {
  fonteId: number;
  categoriaId: number | null;
  titulo: string;
  url: string;
  descricaoOriginal: string | null;
  publicadaEm: Date;
  /** Vetor do título (embedding), quando o serviço de vetores está ligado. */
  vetor?: number[] | null;
}

/** O acontecimento já gravado mais parecido com uma notícia nova, pelo vetor do título. */
export interface ParecidoPorVetor {
  eventoId: string;
  /** Semelhança de cosseno, de -1 a 1. */
  semelhanca: number;
}

/** Acontecimento recente, com os títulos das suas notícias, para o agrupamento. */
export interface EventoRecente {
  id: string;
  titulos: string[];
}

/** Notícias que vão para o mesmo acontecimento. `eventoId` nulo cria um acontecimento novo. */
export interface GrupoDeNoticias {
  eventoId: string | null;
  noticias: NovaNoticia[];
}

export interface ErroDeExecucao {
  etapa: 'fontes' | 'coleta' | 'agrupamento' | 'resumos' | 'dados';
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
  /** Palavras-chave (em inglês) para buscar a imagem ilustrativa, ou null para não ter imagem. */
  buscaImagem?: string | null;
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
  /** Palavras-chave da imagem ilustrativa, ou null para o acontecimento não ter imagem. */
  buscaImagem: string | null;
}

/**
 * Imagem ilustrativa de acervo gratuito (Pexels, Unsplash). Não mostra o fato: só ilustra o assunto.
 * É exibida direto do acervo, sempre com o crédito ao fotógrafo e o link para a foto.
 */
export interface ImagemDeAcervo {
  provedor: string;
  url: string;
  largura: number;
  altura: number;
  /** Cor média da foto, para pintar o espaço enquanto ela carrega. */
  cor: string | null;
  autor: string;
  urlAutor: string;
  urlPagina: string;
}

/** Acontecimento com resumo, palavras-chave de imagem e ainda sem imagem procurada. */
export interface EventoParaIlustrar {
  eventoId: string;
  busca: string;
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
  imagem?: ImagemDeAcervo | null;
}

/** O que o site mostra de uma notícia. Sem descricao_original, de propósito. */
/** Um portal acompanhado (fontes ativas com o mesmo nome viram um portal só). Só dados públicos. */
export interface PortalPublico {
  nome: string;
  /** O site do portal (o mais curto entre os feeds dele). */
  urlSite: string;
  exigeAssinatura: boolean;
}

export interface MateriaPublica {
  portal: string;
  titulo: string;
  url: string;
  publicadaEm: Date;
  exigeAssinatura: boolean;
}
