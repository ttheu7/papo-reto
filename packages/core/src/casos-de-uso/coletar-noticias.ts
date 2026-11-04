import type { ErroDeExecucao, Fonte, NovaNoticia, ResultadoDaColeta } from '../entidades';
import { mensagemDe } from '../erros';
import type { LeitorRss, Registro, RepositorioExecucoes, RepositorioFontes, RepositorioNoticias, Relogio } from '../portas';
import { normalizarUrl } from '../url';

export interface DependenciasDaColeta {
  fontes: RepositorioFontes;
  noticias: RepositorioNoticias;
  execucoes: RepositorioExecucoes;
  leitor: LeitorRss;
  registro: Registro;
  agora: Relogio;
}

export interface OpcoesDaColeta {
  /** Itens mais velhos que isso são ignorados. Padrão: 7 dias. */
  idadeMaximaEmHoras?: number;
  /** Corta a descrição do feed (uso interno da IA). Padrão: 1000 caracteres. */
  tamanhoMaximoDaDescricao?: number;
}

const TAMANHO_MAXIMO_DO_TITULO = 300;

export class ColetarNoticias {
  constructor(
    private readonly d: DependenciasDaColeta,
    private readonly opcoes: OpcoesDaColeta = {},
  ) {}

  async executar(): Promise<ResultadoDaColeta> {
    const { d } = this;
    const execucaoId = await d.execucoes.iniciar(d.agora());
    const erros: ErroDeExecucao[] = [];
    let novasNoticias = 0;

    let fontes: Fonte[];
    try {
      fontes = await d.fontes.listarAtivas();
    } catch (erro) {
      erros.push({ etapa: 'fontes', mensagem: mensagemDe(erro) });
      return this.finalizar(execucaoId, 'falha', 0, erros);
    }

    // Cada fonte roda isolada: a falha de uma não derruba as outras.
    const resultados = await Promise.all(fontes.map((fonte) => this.coletarFonte(fonte, execucaoId)));
    let falhas = 0;
    for (const r of resultados) {
      if (r.ok) novasNoticias += r.novas;
      else {
        falhas++;
        erros.push(r.erro);
      }
    }

    const status = fontes.length > 0 && falhas === fontes.length ? 'falha' : falhas > 0 ? 'parcial' : 'sucesso';
    return this.finalizar(execucaoId, status, novasNoticias, erros);
  }

  private async coletarFonte(
    fonte: Fonte,
    execucaoId: string,
  ): Promise<{ ok: true; novas: number } | { ok: false; erro: ErroDeExecucao }> {
    const { d } = this;
    try {
      const itens = await d.leitor.ler(fonte.urlFeed);
      const candidatas = this.prepararNoticias(fonte, itens);
      const existentes = candidatas.length ? await d.noticias.urlsExistentes(candidatas.map((n) => n.url)) : new Set<string>();
      const novas = candidatas.filter((n) => !existentes.has(n.url));
      const gravadas = novas.length ? await d.noticias.criarEventosComNoticias(novas) : 0;

      await d.fontes.registrarSucesso(fonte.id, d.agora());
      d.registro.info('fonte coletada', { execucaoId, fonteId: fonte.id, fonte: fonte.nome, itens: itens.length, novas: gravadas });
      return { ok: true, novas: gravadas };
    } catch (erro) {
      const mensagem = mensagemDe(erro);
      d.registro.aviso('falha ao coletar fonte', { execucaoId, fonteId: fonte.id, fonte: fonte.nome, erro: mensagem });
      try {
        await d.fontes.registrarFalha(fonte.id, d.agora(), mensagem);
      } catch (erroAoRegistrar) {
        d.registro.erro('falha ao registrar saúde da fonte', { execucaoId, fonteId: fonte.id, erro: mensagemDe(erroAoRegistrar) });
      }
      return { ok: false, erro: { etapa: 'coleta', fonteId: fonte.id, mensagem } };
    }
  }

  /** Normaliza, descarta o que não serve e remove duplicadas dentro do próprio feed. */
  private prepararNoticias(fonte: Fonte, itens: Awaited<ReturnType<LeitorRss['ler']>>): NovaNoticia[] {
    const agora = this.d.agora();
    const limite = agora.getTime() - (this.opcoes.idadeMaximaEmHoras ?? 24 * 7) * 3_600_000;
    const tamanhoDescricao = this.opcoes.tamanhoMaximoDaDescricao ?? 1000;
    const vistas = new Set<string>();
    const noticias: NovaNoticia[] = [];

    for (const item of itens) {
      const titulo = item.titulo.trim().slice(0, TAMANHO_MAXIMO_DO_TITULO);
      const url = normalizarUrl(item.link);
      if (!titulo || !url || vistas.has(url)) continue;

      // Sem data, ou com data no futuro, vale o momento da coleta.
      const data = item.publicadaEm && item.publicadaEm.getTime() <= agora.getTime() ? item.publicadaEm : agora;
      if (data.getTime() < limite) continue;

      vistas.add(url);
      noticias.push({
        fonteId: fonte.id,
        categoriaId: fonte.categoriaId,
        titulo,
        url,
        descricaoOriginal: item.descricao?.trim().slice(0, tamanhoDescricao) || null,
        publicadaEm: data,
      });
    }
    return noticias;
  }

  private async finalizar(
    execucaoId: string,
    status: ResultadoDaColeta['status'],
    novasNoticias: number,
    erros: ErroDeExecucao[],
  ): Promise<ResultadoDaColeta> {
    await this.d.execucoes.finalizar(execucaoId, { em: this.d.agora(), status, novasNoticias, erros });
    this.d.registro.info('coleta finalizada', { execucaoId, status, novasNoticias, erros: erros.length });
    return { execucaoId, status, novasNoticias, erros };
  }
}
