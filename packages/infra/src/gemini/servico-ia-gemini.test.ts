import { describe, expect, it } from 'vitest';
import { ServicoIaGemini, type GerarConteudo } from './servico-ia-gemini';

const entrada = {
  modelo: 'gemini-x',
  categorias: ['brasil', 'pop'],
  eventos: [{ id: 'e1', materias: [{ portal: 'g1', titulo: 'Manchete', descricao: 'Descrição' }] }],
};

describe('ServicoIaGemini', () => {
  it('manda modelo, instruções e JSON, e lê resumos e tokens', async () => {
    let pedido: Parameters<GerarConteudo>[0] | undefined;
    const ia = new ServicoIaGemini({
      gerar: async (p) => {
        pedido = p;
        return {
          text: JSON.stringify([{ id: 'e1', titulo: 'T', texto: 'X.', categoria: 'pop', imagem: 'concert stage lights' }, { lixo: true }]),
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
        };
      },
    });

    const r = await ia.resumir(entrada);

    expect(pedido?.model).toBe('gemini-x');
    expect(pedido?.contents).toContain('"manchete":"Manchete"');
    expect(pedido?.contents).toContain('brasil, pop');
    expect(pedido?.config).toMatchObject({ responseMimeType: 'application/json' });
    expect(r).toEqual({ resumos: [{ eventoId: 'e1', titulo: 'T', texto: 'X.', categoriaSlug: 'pop', buscaImagem: 'concert stage lights' }], tokensEntrada: 120, tokensSaida: 30 });
    expect(JSON.stringify(pedido?.config)).toContain('"imagem"');
  });

  it('transforma HTTP 429 em ErroCotaIa', async () => {
    const ia = new ServicoIaGemini({ gerar: async () => Promise.reject(Object.assign(new Error('Too Many Requests'), { status: 429 })) });
    await expect(ia.resumir(entrada)).rejects.toMatchObject({ name: 'ErroCotaIa' });
  });

  it('outros erros viram ErroInfra, e resposta sem JSON também', async () => {
    const falha = new ServicoIaGemini({ gerar: async () => Promise.reject(Object.assign(new Error('x'), { status: 500 })) });
    await expect(falha.resumir(entrada)).rejects.toMatchObject({ name: 'ErroInfra', message: 'falha ao chamar o Gemini (HTTP 500)' });

    const semJson = new ServicoIaGemini({ gerar: async () => ({ text: 'desculpe' }) });
    await expect(semJson.resumir(entrada)).rejects.toThrow(/JSON válido/);
  });
});
