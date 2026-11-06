import { ErroCotaIa, ErroInfra, type EventoParaResumir, type ResumoGerado, type ServicoIa } from '@papo-reto/core';
import { GoogleGenAI } from '@google/genai';
import { esquemaDaResposta, INSTRUCOES, interpretarResumos, montarPedido, VERSAO_DO_PROMPT } from '../ia/prompt';

/** O pedaço do SDK que usamos. Facilita testar sem rede. */
export type GerarConteudo = (pedido: {
  model: string;
  contents: string;
  config: Record<string, unknown>;
}) => Promise<{ text?: string | undefined; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined }>;

export class ServicoIaGemini implements ServicoIa {
  readonly versaoPrompt = VERSAO_DO_PROMPT;
  private readonly gerar: GerarConteudo;

  constructor(opcoes: { chave: string } | { gerar: GerarConteudo }) {
    if ('gerar' in opcoes) {
      this.gerar = opcoes.gerar;
    } else {
      // Sem novas tentativas: no plano gratuito, insistir só gasta cota.
      const ai = new GoogleGenAI({ apiKey: opcoes.chave, httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } } });
      this.gerar = (pedido) => ai.models.generateContent(pedido);
    }
  }

  async resumir(entrada: { modelo: string; categorias: string[]; eventos: EventoParaResumir[] }) {
    let resposta: Awaited<ReturnType<GerarConteudo>>;
    try {
      resposta = await this.gerar({
        model: entrada.modelo,
        contents: montarPedido(entrada.eventos, entrada.categorias),
        config: {
          systemInstruction: INSTRUCOES,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseJsonSchema: esquemaDaResposta(entrada.categorias),
        },
      });
    } catch (erro) {
      const status = (erro as { status?: unknown }).status;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(mensagem)) {
        throw new ErroCotaIa(`HTTP 429 do Gemini`, {}, { cause: erro });
      }
      throw new ErroInfra(`falha ao chamar o Gemini${typeof status === 'number' ? ` (HTTP ${status})` : ''}`, {}, { cause: erro });
    }

    return {
      resumos: this.interpretar(resposta.text),
      tokensEntrada: resposta.usageMetadata?.promptTokenCount ?? 0,
      tokensSaida: resposta.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  private interpretar(texto: string | undefined): ResumoGerado[] {
    let dados: unknown;
    try {
      dados = JSON.parse(texto ?? '');
    } catch {
      throw new ErroInfra('o Gemini não devolveu JSON válido');
    }
    return interpretarResumos(dados, 'Gemini');
  }
}
