import { describe, expect, it } from 'vitest';
import { ServicoDeVetoresMistral } from './servico-de-vetores-mistral';

/** Responde com um vetor [n] para cada texto "tn", fora de ordem, como a API pode fazer. */
function apiFalsa() {
  const pedidos: { model: string; input: string[] }[] = [];
  const buscar = async (_url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as { model: string; input: string[] };
    pedidos.push(corpo);
    const data = corpo.input.map((t, index) => ({ index, embedding: [Number(t.slice(1))] })).reverse();
    return new Response(JSON.stringify({ data }));
  };
  return { pedidos, buscar };
}

describe('ServicoDeVetoresMistral', () => {
  it('usa o mistral-embed, divide em lotes de 64 e devolve os vetores na ordem dos textos', async () => {
    const api = apiFalsa();
    const servico = new ServicoDeVetoresMistral({ chave: 'k', buscar: api.buscar, esperaEntreChamadasMs: 0 });
    const textos = Array.from({ length: 70 }, (_, i) => `t${i}`);

    const vetores = await servico.vetorizar(textos);

    expect(api.pedidos.map((p) => [p.model, p.input.length])).toEqual([['mistral-embed', 64], ['mistral-embed', 6]]);
    expect(vetores).toEqual(textos.map((_, i) => [i]));
  });

  it('HTTP 429 vira ErroCotaIa; resposta incompleta vira ErroInfra', async () => {
    const cota = new ServicoDeVetoresMistral({ chave: 'k', buscar: async () => new Response('{}', { status: 429 }) });
    await expect(cota.vetorizar(['a'])).rejects.toMatchObject({ name: 'ErroCotaIa' });

    const incompleta = new ServicoDeVetoresMistral({ chave: 'k', buscar: async () => new Response(JSON.stringify({ data: [] })) });
    await expect(incompleta.vetorizar(['a'])).rejects.toMatchObject({ name: 'ErroInfra', message: 'a Mistral devolveu 0 vetores para 1 títulos' });
  });
});
