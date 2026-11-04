import type { ErroDeExecucao, EventoParaResumir, ModeloIa, ResumoGerado } from '../entidades';
import { ErroCotaIa, mensagemDe } from '../erros';
import type { Registro, RepositorioExecucoes, RepositorioResumos, Relogio, ServicoIa } from '../portas';

export interface DependenciasDosResumos {
  resumos: RepositorioResumos;
  execucoes: RepositorioExecucoes;
  ia: ServicoIa;
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
}

export interface ResultadoDosResumos {
  resumosGerados: number;
  chamadas: number;
  erros: ErroDeExecucao[];
}

const TAMANHO_MAXIMO_DO_TITULO = 120;
const FRASES_NO_TEXTO = 3;

/** Corta o texto em até três frases. */
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

    const modelo = await d.resumos.modeloAtivo();
    if (!modelo) {
      d.registro.aviso('nenhum modelo de IA ativo; resumos pulados', { execucaoId });
      return { resumosGerados, chamadas, erros };
    }

    const categorias = await d.resumos.categorias();
    const idDaCategoria = new Map(categorias.map((c) => [c.slug, c.id]));
    const eventos = await d.resumos.eventosSemResumo({
      limite: tamanhoDoLote * maximoDeChamadas,
      desde: new Date(d.agora().getTime() - janela * 3_600_000),
    });

    for (let i = 0; i < eventos.length && chamadas < maximoDeChamadas; i += tamanhoDoLote) {
      const lote = eventos.slice(i, i + tamanhoDoLote);
      chamadas++;
      try {
        const resposta = await d.ia.resumir({ modelo: modelo.modelo, categorias: [...idDaCategoria.keys()], eventos: lote });
        resumosGerados += await this.gravar(lote, resposta, modelo, idDaCategoria, execucaoId);
      } catch (erro) {
        if (erro instanceof ErroCotaIa) {
          d.registro.aviso('cota da IA esgotada; resumos encerrados nesta rodada', { execucaoId });
          erros.push({ etapa: 'resumos', mensagem: `cota da IA esgotada: ${erro.message}` });
          break;
        }
        d.registro.aviso('falha num lote de resumos', { execucaoId, erro: mensagemDe(erro) });
        erros.push({ etapa: 'resumos', mensagem: mensagemDe(erro) });
      }
    }

    await d.execucoes.registrarResumos(execucaoId, resumosGerados, erros);
    d.registro.info('resumos finalizados', { execucaoId, resumosGerados, chamadas, erros: erros.length });
    return { resumosGerados, chamadas, erros };
  }

  private async gravar(
    lote: EventoParaResumir[],
    resposta: Awaited<ReturnType<ServicoIa['resumir']>>,
    modelo: ModeloIa,
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
        versaoPrompt: this.d.ia.versaoPrompt,
        tokensEntrada,
        tokensSaida,
        custoEstimado,
        categoriaId: r.categoriaSlug ? (idDaCategoria.get(r.categoriaSlug) ?? null) : null,
      });
      if (gravou) gravados++;
    }
    return gravados;
  }
}
