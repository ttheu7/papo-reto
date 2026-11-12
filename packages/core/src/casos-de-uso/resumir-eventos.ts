import { soProgramas } from '../agrupamento';
import type { ErroDeExecucao, EventoParaResumir, ModeloIa, ResumoGerado } from '../entidades';
import { ErroCotaIa, mensagemDe } from '../erros';
import type { Registro, RepositorioExecucoes, RepositorioResumos, Relogio, ServicoIa } from '../portas';

export interface DependenciasDosResumos {
  resumos: RepositorioResumos;
  execucoes: RepositorioExecucoes;
  /** IA principal (Gemini). Nula quando não há chave. */
  ia: ServicoIa | null;
  /** IA de reserva (Groq): assume quando a principal falha ou fica sem cota. */
  reserva?: ServicoIa | null;
  registro: Registro;
  agora: Relogio;
}

export interface OpcoesDosResumos {
  /** Eventos por chamada. Padrão: 10. */
  tamanhoDoLote?: number;
  /** Chamadas à IA por rodada. Padrão: 3. */
  maximoDeChamadas?: number;
  /** Só resume eventos criados nesse intervalo. Padrão: 48 horas. */
  janelaEmHoras?: number;
  /**
   * Editorias com vaga garantida em toda rodada: se nenhum dos escolhidos é dela, o mais noticiado dela
   * entra no primeiro lote. Padrão: ["games", "rap"] (e-sports e rap quase sempre saem num portal só e
   * ficariam por último).
   */
  editoriasGarantidas?: string[];
}

export interface ResultadoDosResumos {
  resumosGerados: number;
  chamadas: number;
  erros: ErroDeExecucao[];
  /** Se a IA de reserva precisou entrar nesta rodada. */
  usouReserva: boolean;
}

interface Opcao {
  nome: 'principal' | 'reserva';
  ia: ServicoIa;
  modelo: ModeloIa;
}

const TAMANHO_MAXIMO_DO_TITULO = 120;
const FRASES_NO_TEXTO = 4;

/**
 * Limpa as palavras-chave de imagem que a IA devolveu: só letras, números, espaço e hífen, no máximo
 * 60 caracteres. Vazio vira null (sem imagem).
 */
export function limparBuscaDeImagem(busca: string | null | undefined): string | null {
  const limpa = busca?.replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  return limpa ? limpa : null;
}

/** Corta o texto em até quatro frases. */
export function limitarFrases(texto: string, maximo = FRASES_NO_TEXTO): string {
  const frases = texto.trim().match(/[^.!?…]+(?:[.!?…]+["”')\]]*|$)/g) ?? [];
  return frases.slice(0, maximo).join('').trim();
}

export class ResumirEventos {
  constructor(
    private readonly d: DependenciasDosResumos,
    private readonly opcoes: OpcoesDosResumos = {},
  ) {}

  async executar(execucaoId: string): Promise<ResultadoDosResumos> {
    const { d } = this;
    const tamanhoDoLote = this.opcoes.tamanhoDoLote ?? 10;
    const maximoDeChamadas = this.opcoes.maximoDeChamadas ?? 3;
    const janela = this.opcoes.janelaEmHoras ?? 48;
    const erros: ErroDeExecucao[] = [];
    let resumosGerados = 0;
    let chamadas = 0;
    let usouReserva = false;

    const modeloPrincipal = d.ia ? await d.resumos.modeloAtivo() : null;
    const modeloReserva = d.reserva ? await d.resumos.modeloReserva() : null;
    const principal: Opcao | null = d.ia && modeloPrincipal ? { nome: 'principal', ia: d.ia, modelo: modeloPrincipal } : null;
    const reserva: Opcao | null = d.reserva && modeloReserva ? { nome: 'reserva', ia: d.reserva, modelo: modeloReserva } : null;
    let atual = principal ?? reserva;
    if (!atual) {
      d.registro.aviso('nenhuma IA com modelo cadastrado; resumos pulados', { execucaoId });
      return { resumosGerados, chamadas, erros, usouReserva };
    }
    if (atual === reserva) usouReserva = true;

    const categorias = await d.resumos.categorias();
    const idDaCategoria = new Map(categorias.map((c) => [c.slug, c.id]));
    // Listas de vídeos e chamadas de programa gravadas antes do filtro da coleta não gastam cota.
    const limite = tamanhoDoLote * maximoDeChamadas;
    const desde = new Date(d.agora().getTime() - janela * 3_600_000);
    const naoEPrograma = (e: EventoParaResumir) => !soProgramas(e.materias.map((m) => m.titulo));
    let eventos = (await d.resumos.eventosSemResumo({ limite, desde })).filter(naoEPrograma);

    // Vaga garantida: pelo menos um acontecimento de cada editoria garantida por rodada, no primeiro lote.
    for (const slug of this.opcoes.editoriasGarantidas ?? ['games', 'rap']) {
      if (!idDaCategoria.has(slug) || eventos.some((e) => e.categoriaSlug === slug)) continue;
      const [garantido] = (await d.resumos.eventosSemResumo({ limite: 3, desde, categoria: slug })).filter(naoEPrograma);
      if (garantido) eventos = [garantido, ...eventos.filter((e) => e.id !== garantido.id)].slice(0, limite);
    }

    lotes: for (let i = 0; i < eventos.length && chamadas < maximoDeChamadas; i += tamanhoDoLote) {
      const lote = eventos.slice(i, i + tamanhoDoLote);
      chamadas++;
      // Cada lote tenta a IA da vez; se a principal falhar, o mesmo lote vai para a reserva.
      while (atual) {
        try {
          const resposta = await atual.ia.resumir({ modelo: atual.modelo.modelo, categorias: [...idDaCategoria.keys()], eventos: lote });
          resumosGerados += await this.gravar(lote, resposta, atual, idDaCategoria, execucaoId);
          continue lotes;
        } catch (erro) {
          const cota = erro instanceof ErroCotaIa;
          const quem = `${atual.modelo.provedor} (${atual.nome})`;
          d.registro.aviso(cota ? 'cota da IA esgotada' : 'falha num lote de resumos', { execucaoId, ia: quem, erro: mensagemDe(erro) });
          erros.push({ etapa: 'resumos', mensagem: `${quem}: ${cota ? 'cota esgotada: ' : ''}${mensagemDe(erro)}` });
          if (atual === principal && reserva) {
            d.registro.info('resumos seguem com a IA de reserva', { execucaoId, ia: reserva.modelo.provedor });
            atual = reserva;
            usouReserva = true;
            continue;
          }
          if (cota) break lotes;
          continue lotes;
        }
      }
    }

    await d.execucoes.registrarResumos(execucaoId, resumosGerados, erros);
    d.registro.info('resumos finalizados', { execucaoId, resumosGerados, chamadas, erros: erros.length, usouReserva });
    return { resumosGerados, chamadas, erros, usouReserva };
  }

  private async gravar(
    lote: EventoParaResumir[],
    resposta: Awaited<ReturnType<ServicoIa['resumir']>>,
    { ia, modelo }: Opcao,
    idDaCategoria: Map<string, number>,
    execucaoId: string,
  ): Promise<number> {
    const doLote = new Set(lote.map((e) => e.id));
    const validos = new Map<string, ResumoGerado>();
    for (const r of resposta.resumos) {
      const titulo = r.titulo.trim().slice(0, TAMANHO_MAXIMO_DO_TITULO);
      const texto = limitarFrases(r.texto);
      // Descarta ids inventados, repetidos ou resumos vazios.
      if (!doLote.has(r.eventoId) || validos.has(r.eventoId) || !titulo || !texto) continue;
      validos.set(r.eventoId, { ...r, titulo, texto });
    }
    if (validos.size < resposta.resumos.length) {
      this.d.registro.aviso('a IA devolveu resumos inválidos', { execucaoId, recebidos: resposta.resumos.length, validos: validos.size });
    }
    if (validos.size === 0) return 0;

    // Os tokens são da chamada inteira: divide igualmente entre os resumos.
    const tokensEntrada = Math.round(resposta.tokensEntrada / validos.size);
    const tokensSaida = Math.round(resposta.tokensSaida / validos.size);
    const custoEstimado = (tokensEntrada * modelo.custoEntrada1m + tokensSaida * modelo.custoSaida1m) / 1_000_000;

    let gravados = 0;
    for (const r of validos.values()) {
      const gravou = await this.d.resumos.gravarResumo({
        eventoId: r.eventoId,
        modeloIaId: modelo.id,
        titulo: r.titulo,
        texto: r.texto,
        versaoPrompt: ia.versaoPrompt,
        tokensEntrada,
        tokensSaida,
        custoEstimado,
        categoriaId: r.categoriaSlug ? (idDaCategoria.get(r.categoriaSlug) ?? null) : null,
        buscaImagem: limparBuscaDeImagem(r.buscaImagem),
      });
      if (gravou) gravados++;
    }
    return gravados;
  }
}
