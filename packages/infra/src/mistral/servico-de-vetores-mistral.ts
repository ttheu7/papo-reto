// Vetores (embeddings) dos títulos pela Mistral, para agrupar matérias pelo sentido (sem SDK).
import { ErroCotaIa, ErroInfra, type ServicoDeVetores } from '@papo-reto/core';

const ENDERECO = 'https://api.mistral.ai/v1/embeddings';
export const MODELO_DE_VETORES = 'mistral-embed';
/** Títulos por chamada: o plano gratuito limita as chamadas por segundo, não o tamanho do lote. */
const POR_CHAMADA = 64;

interface RespostaMistral {
  data?: { index?: number; embedding?: number[] }[];
}

export class ServicoDeVetoresMistral implements ServicoDeVetores {
  private readonly chave: string;
  private readonly buscar: typeof fetch;
  private readonly espera: number;

  constructor(opcoes: { chave: string; buscar?: typeof fetch; esperaEntreChamadasMs?: number }) {
    this.chave = opcoes.chave;
    this.buscar = opcoes.buscar ?? fetch;
    this.espera = opcoes.esperaEntreChamadasMs ?? 1100;
  }

  async vetorizar(textos: string[]): Promise<number[][]> {
    const vetores: number[][] = [];
    for (let i = 0; i < textos.length; i += POR_CHAMADA) {
      // Uma chamada por segundo, no máximo: o limite do plano gratuito.
      if (i > 0 && this.espera > 0) await new Promise((r) => setTimeout(r, this.espera));
      vetores.push(...(await this.chamar(textos.slice(i, i + POR_CHAMADA))));
    }
    return vetores;
  }

  private async chamar(textos: string[]): Promise<number[][]> {
    let resposta: Response;
    try {
      resposta = await this.buscar(ENDERECO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO_DE_VETORES, input: textos }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      throw new ErroInfra('falha de rede ao chamar a Mistral', {}, { cause: erro });
    }
    if (resposta.status === 429) throw new ErroCotaIa('HTTP 429 da Mistral');
    if (!resposta.ok) throw new ErroInfra(`falha ao chamar a Mistral (HTTP ${resposta.status})`);

    const corpo = (await resposta.json()) as RespostaMistral;
    const itens = corpo.data ?? [];
    if (itens.length !== textos.length) throw new ErroInfra(`a Mistral devolveu ${itens.length} vetores para ${textos.length} títulos`);
    const vetores = new Array<number[]>(textos.length);
    itens.forEach((item, posicao) => {
      const v = item.embedding;
      if (!Array.isArray(v) || v.length === 0) throw new ErroInfra('a Mistral devolveu um vetor vazio');
      vetores[item.index ?? posicao] = v;
    });
    if (vetores.some((v) => !v)) throw new ErroInfra('a Mistral devolveu vetores fora de ordem');
    return vetores;
  }
}
