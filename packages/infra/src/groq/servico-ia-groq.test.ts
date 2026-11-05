import { describe, expect, it } from 'vitest';
import { ServicoIaGroq } from './servico-ia-groq';

const entrada = {
  modelo: 'llama-x',
  categorias: ['brasil', 'pop'],
  eventos: [{ id: 'e1', materias: [{ portal: 'g1', titulo: 'Manchete', descricao: 'Descrição' }] }],
};

const responder = (status: number, corpo: unknown) => async () => new Response(JSON.stringify(corpo), { status });

describe('ServicoIaGroq', () => {
  it('manda o modelo, as instruções e o modo JSON, e lê o objeto com os resumos e os tokens', async () => {
    let pedido: { url: string; corpo: Record<string, unknown>; auth: string | null } | undefined;
    const ia = new ServicoIaGroq({
      chave: 'segredo',
      buscar: async (url, init) => {
        pedido = { url: String(url), corpo: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get('authorization') };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ resumos: [{ id: 'e1', titulo: 'T', texto: 'X.', categoria: 'pop' }, { lixo: 1 }] }) } }],
            usage: { prompt_tokens: 300, completion_tokens: 40 },
          }),
        );
      },
    });

    const r = await ia.resumir(entrada);

    expect(pedido?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(pedido?.auth).toBe('Bearer segredo');
    expect(pedido?.corpo).toMatchObject({ model: 'llama-x', response_format: { type: 'json_object' } });
    expect(JSON.stringify(pedido?.corpo)).toContain('brasil, pop');
    expect(r).toEqual({ resumos: [{ eventoId: 'e1', titulo: 'T', texto: 'X.', categoriaSlug: 'pop' }], tokensEntrada: 300, tokensSaida: 40 });
  });

  it('aceita também uma lista no topo', async () => {
    const ia = new ServicoIaGroq({ chave: 'k', buscar: responder(200, { choices: [{ message: { content: '[{"id":"e1","titulo":"T","texto":"X.","categoria":null}]' } }] }) });
    expect((await ia.resumir(entrada)).resumos).toEqual([{ eventoId: 'e1', titulo: 'T', texto: 'X.', categoriaSlug: null }]);
  });

  it('HTTP 429 vira ErroCotaIa; outros erros e respostas sem JSON viram ErroInfra', async () => {
    await expect(new ServicoIaGroq({ chave: 'k', buscar: responder(429, {}) }).resumir(entrada)).rejects.toMatchObject({ name: 'ErroCotaIa' });
    await expect(new ServicoIaGroq({ chave: 'k', buscar: responder(500, {}) }).resumir(entrada)).rejects.toMatchObject({
      name: 'ErroInfra',
      message: 'falha ao chamar a Groq (HTTP 500)',
    });
    const semJson = new ServicoIaGroq({ chave: 'k', buscar: responder(200, { choices: [{ message: { content: 'oi' } }] }) });
    await expect(semJson.resumir(entrada)).rejects.toMatchObject({ name: 'ErroInfra', message: 'a Groq não devolveu JSON válido' });
  });

  it('nunca põe a chave na mensagem de erro', async () => {
    const ia = new ServicoIaGroq({ chave: 'segredo-123', buscar: async () => Promise.reject(new Error('rede caiu')) });
    await expect(ia.resumir(entrada)).rejects.toSatisfy((e: Error) => !e.message.includes('segredo-123'));
  });
});
