import { ErroCotaIa, mensagemDe } from '../erros';
import type { AcervoDeImagens, Registro, RepositorioImagens, Relogio } from '../portas';

export interface DependenciasDasImagens {
  imagens: RepositorioImagens;
  /** Na ordem de preferência: o primeiro que achar vence. */
  acervos: AcervoDeImagens[];
  registro: Registro;
  agora: Relogio;
}

export interface OpcoesDasImagens {
  /** Acontecimentos por rodada. Padrão: 15 (as cotas gratuitas são por hora). */
  limite?: number;
  /** Só ilustra acontecimentos criados nesse intervalo. Padrão: 48 horas. */
  janelaEmHoras?: number;
}

export interface ResultadoDasImagens {
  ilustrados: number;
  semImagem: number;
  erros: string[];
}

/**
 * Procura uma imagem ilustrativa nos acervos para cada acontecimento cuja IA pediu imagem.
 * Acervo sem cota sai da rodada; se nenhum responder, o acontecimento fica para a próxima.
 * Se todos responderem sem achar nada, fica gravado "sem imagem" para não procurar de novo.
 */
export class IlustrarEventos {
  constructor(
    private readonly d: DependenciasDasImagens,
    private readonly opcoes: OpcoesDasImagens = {},
  ) {}

  async executar(execucaoId: string): Promise<ResultadoDasImagens> {
    const { d } = this;
    const resultado: ResultadoDasImagens = { ilustrados: 0, semImagem: 0, erros: [] };
    if (d.acervos.length === 0) return resultado;

    const pendentes = await d.imagens.eventosParaIlustrar({
      desde: new Date(d.agora().getTime() - (this.opcoes.janelaEmHoras ?? 48) * 3_600_000),
      limite: this.opcoes.limite ?? 15,
    });
    const semCota = new Set<string>();

    for (const { eventoId, busca } of pendentes) {
      const disponiveis = d.acervos.filter((a) => !semCota.has(a.nome));
      if (disponiveis.length === 0) break;

      let respondeu = false;
      let achada = null;
      for (const acervo of disponiveis) {
        try {
          achada = await acervo.buscar(busca);
          respondeu = true;
          if (achada) break;
        } catch (erro) {
          if (erro instanceof ErroCotaIa) semCota.add(acervo.nome);
          resultado.erros.push(`${acervo.nome}: ${mensagemDe(erro)}`);
          d.registro.aviso('falha ao buscar imagem', { execucaoId, acervo: acervo.nome, erro: mensagemDe(erro) });
        }
      }

      if (achada) {
        await d.imagens.gravarImagem(eventoId, busca, achada);
        resultado.ilustrados++;
      } else if (respondeu) {
        await d.imagens.gravarImagem(eventoId, busca, null);
        resultado.semImagem++;
      }
    }

    d.registro.info('imagens procuradas', { execucaoId, pendentes: pendentes.length, ...resultado, erros: resultado.erros.length });
    return resultado;
  }
}
