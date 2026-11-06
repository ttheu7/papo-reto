// IA de reserva dos resumos: a Groq, pela API compatível com a da OpenAI (sem SDK).
import { ErroCotaIa, ErroInfra, type EventoParaResumir, type ResumoGerado, type ServicoIa } from '@papo-reto/core';
import { INSTRUCOES, interpretarResumos, montarPedido, VERSAO_DO_PROMPT } from '../ia/prompt';

const ENDERECO = 'https://api.groq.com/openai/v1/chat/completions';

// O modo JSON da Groq exige um objeto no topo (não uma lista) e a palavra JSON no pedido.
const FORMATO = `\n\nResponda só com um objeto JSON no formato {"resumos": [{"id": "...", "titulo": "...", "texto": "...", "categoria": "slug ou null", "imagem": "palavras-chave ou null"}]}.`;

interface RespostaGroq {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class ServicoIaGroq implements ServicoIa {
  readonly versaoPrompt = VERSAO_DO_PROMPT;
  private readonly chave: string;
  private readonly buscar: typeof fetch;

  constructor(opcoes: { chave: string; buscar?: typeof fetch }) {
    this.chave = opcoes.chave;
    this.buscar = opcoes.buscar ?? fetch;
  }

  async resumir(entrada: { modelo: string; categorias: string[]; eventos: EventoParaResumir[] }) {
    let resposta: Response;
    try {
      resposta = await this.buscar(ENDERECO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: entrada.modelo,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: INSTRUCOES },
            { role: 'user', content: montarPedido(entrada.eventos, entrada.categorias) + FORMATO },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (erro) {
      throw new ErroInfra('falha de rede ao chamar a Groq', {}, { cause: erro });
    }

    if (resposta.status === 429) throw new ErroCotaIa('HTTP 429 da Groq');
    if (!resposta.ok) throw new ErroInfra(`falha ao chamar a Groq (HTTP ${resposta.status})`);

    const corpo = (await resposta.json()) as RespostaGroq;
    return {
      resumos: this.interpretar(corpo.choices?.[0]?.message?.content),
      tokensEntrada: corpo.usage?.prompt_tokens ?? 0,
      tokensSaida: corpo.usage?.completion_tokens ?? 0,
    };
  }

  private interpretar(texto: string | null | undefined): ResumoGerado[] {
    let dados: unknown;
    try {
      dados = JSON.parse(texto ?? '');
    } catch {
      throw new ErroInfra('a Groq não devolveu JSON válido');
    }
    const lista = dados && typeof dados === 'object' && !Array.isArray(dados) ? (dados as { resumos?: unknown }).resumos : dados;
    return interpretarResumos(lista, 'Groq');
  }
}
