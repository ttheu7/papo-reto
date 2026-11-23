import { soProgramas } from '../agrupamento';
import { EDITORIAS_DE_NICHO, type CardDeEvento, type MateriaPublica } from '../entidades';
import type { EscritorDeDados, Registro, RepositorioSite, Relogio } from '../portas';

// ---------------------------------------------------------------------
// Contrato dos JSONs públicos (site e, no futuro, MCP público).
// Mudou aqui? Atualize o README.
// ---------------------------------------------------------------------

export interface MateriaJson {
  portal: string;
  titulo: string;
  url: string;
  publicadaEm: string;
  exigeAssinatura: boolean;
}

/** Imagem ilustrativa de acervo: exibida direto do acervo, sempre com o crédito. */
export interface ImagemJson {
  url: string;
  largura: number;
  altura: number;
  cor: string | null;
  provedor: string;
  autor: string;
  urlAutor: string;
  urlPagina: string;
}

export interface EventoJson {
  id: string;
  titulo: string;
  resumo: string | null;
  geradoPorIa: boolean;
  categoria: { slug: string; nome: string } | null;
  cobertura: number;
  criadoEm: string;
  atualizadoEm: string;
  publicadoEm: string;
  materias: MateriaJson[];
  /** Ilustrativa (não mostra o fato). Null para notícias sensíveis ou sem imagem achada. */
  imagem: ImagemJson | null;
}

export interface EventosJson {
  geradoEm: string;
  eventos: EventoJson[];
}

export interface CategoriasJson {
  geradoEm: string;
  categorias: { slug: string; nome: string; total: number }[];
}

/** Os portais acompanhados, para a página "Como funciona". */
export interface PortaisJson {
  geradoEm: string;
  portais: { nome: string; site: string; exigeAssinatura: boolean }[];
}

export interface OpcoesDosDados {
  /** Padrão: 48 horas. */
  janelaEmHoras?: number;
  /** Acontecimentos sem resumo, os mais recentes, contando os de "hoje". Padrão: 80. */
  maximoDeEventos?: number;
  /**
   * Acontecimentos explicados (com resumo) que ficam no site pelas 48 horas, além dos de "hoje", mesmo sem
   * matéria nova. Passando disso, sai o menos noticiado (menos portais, depois o mais antigo), mas os das
   * editorias de nicho nunca saem. Padrão: 250.
   */
  maximoDeResumidos?: number;
  /** Editorias cujos acontecimentos explicados nunca saem antes das 48 horas. Padrão: EDITORIAS_DE_NICHO. */
  editoriasDeNicho?: readonly string[];
  /** "O que importa hoje": padrão 24 horas e 5 eventos. */
  janelaDeHojeEmHoras?: number;
  eventosDeHoje?: number;
}

const HORA = 3_600_000;

export class GerarDadosDoSite {
  constructor(
    private readonly d: { site: RepositorioSite; escritor: EscritorDeDados; registro: Registro; agora: Relogio },
    private readonly opcoes: OpcoesDosDados = {},
  ) {}

  async executar(): Promise<{ eventos: number; hoje: number }> {
    const { d } = this;
    const agora = d.agora();
    const maximo = this.opcoes.maximoDeEventos ?? 80;
    const quantosHoje = this.opcoes.eventosDeHoje ?? 5;
    const desdeHoje = agora.getTime() - (this.opcoes.janelaDeHojeEmHoras ?? 24) * HORA;

    // Busca tudo o que teve matéria na janela: os explicados ficam no site mesmo sem matéria nova, e só aparecem
    // aqui se a busca não cortar pelos mais recentes. O limite é só uma trava de segurança.
    const recentes = await d.site.cardsRecentes({
      desde: new Date(agora.getTime() - (this.opcoes.janelaEmHoras ?? 48) * HORA),
      limite: 5000,
    });
    // Acontecimentos só com listas de vídeos ou chamadas de programa, gravados antes do filtro da coleta, ficam de fora.
    const materias = await d.site.materiasDosEventos(recentes.map((c) => c.id));
    const cards = recentes.filter((c) => !soProgramas((materias.get(c.id) ?? []).map((m) => m.titulo)));

    const hoje = cards
      .filter((c) => c.publicadoEm.getTime() >= desdeHoje)
      .sort((a, b) => b.cobertura - a.cobertura || b.publicadoEm.getTime() - a.publicadoEm.getTime())
      .slice(0, quantosHoje);
    const idsDeHoje = new Set(hoje.map((c) => c.id));
    const resto = cards.filter((c) => !idsDeHoje.has(c.id));

    // Os explicados ficam as 48 horas. Acima do teto, sai o menos noticiado; os de nicho (Games e Rap, que
    // quase sempre saem num portal só) nunca saem.
    const nicho = new Set(this.opcoes.editoriasDeNicho ?? EDITORIAS_DE_NICHO);
    const ehNicho = (c: CardDeEvento) => c.categoriaSlug !== null && nicho.has(c.categoriaSlug);
    const resumidos = resto.filter((c) => c.resumo);
    const resumidosDeNicho = resumidos.filter(ehNicho);
    const outrosResumidos = resumidos
      .filter((c) => !ehNicho(c))
      .sort((a, b) => b.cobertura - a.cobertura || b.publicadoEm.getTime() - a.publicadoEm.getTime())
      .slice(0, Math.max(0, (this.opcoes.maximoDeResumidos ?? 250) - resumidosDeNicho.length));

    // Os sem resumo: só os mais recentes (a busca já vem do mais novo para o mais antigo).
    const semResumo = resto.filter((c) => !c.resumo).slice(0, Math.max(0, maximo - hoje.length));

    const selecionados = [...hoje, ...resumidosDeNicho, ...outrosResumidos, ...semResumo].sort(
      (a, b) => b.publicadoEm.getTime() - a.publicadoEm.getTime(),
    );

    const paraJson = (c: CardDeEvento) => eventoJson(c, materias.get(c.id) ?? []);
    const geradoEm = agora.toISOString();

    const contagem = new Map<string, number>();
    for (const c of selecionados) if (c.categoriaSlug) contagem.set(c.categoriaSlug, (contagem.get(c.categoriaSlug) ?? 0) + 1);
    const categorias = (await d.site.categorias()).map((c) => ({ slug: c.slug, nome: c.nome, total: contagem.get(c.slug) ?? 0 }));

    await d.escritor.escrever('eventos.json', { geradoEm, eventos: selecionados.map(paraJson) } satisfies EventosJson);
    await d.escritor.escrever('hoje.json', { geradoEm, eventos: hoje.map(paraJson) } satisfies EventosJson);
    await d.escritor.escrever('categorias.json', { geradoEm, categorias } satisfies CategoriasJson);
    const portais = (await d.site.portais()).map((p) => ({ nome: p.nome, site: p.urlSite, exigeAssinatura: p.exigeAssinatura }));
    await d.escritor.escrever('portais.json', { geradoEm, portais } satisfies PortaisJson);

    d.registro.info('dados do site gerados', { eventos: selecionados.length, hoje: hoje.length });
    return { eventos: selecionados.length, hoje: hoje.length };
  }
}

/** Monta o objeto público campo a campo: nada entra por acidente. */
function eventoJson(c: CardDeEvento, materias: MateriaPublica[]): EventoJson {
  return {
    id: c.id,
    titulo: c.titulo,
    resumo: c.resumo,
    geradoPorIa: c.resumo !== null,
    categoria: c.categoriaSlug && c.categoriaNome ? { slug: c.categoriaSlug, nome: c.categoriaNome } : null,
    cobertura: c.cobertura,
    criadoEm: c.criadoEm.toISOString(),
    atualizadoEm: c.atualizadoEm.toISOString(),
    publicadoEm: c.publicadoEm.toISOString(),
    materias: materias.map((m) => ({
      portal: m.portal,
      titulo: m.titulo,
      url: m.url,
      publicadaEm: m.publicadaEm.toISOString(),
      exigeAssinatura: m.exigeAssinatura,
    })),
    imagem: c.imagem
      ? {
          url: c.imagem.url,
          largura: c.imagem.largura,
          altura: c.imagem.altura,
          cor: c.imagem.cor,
          provedor: c.imagem.provedor,
          autor: c.imagem.autor,
          urlAutor: c.imagem.urlAutor,
          urlPagina: c.imagem.urlPagina,
        }
      : null,
  };
}
