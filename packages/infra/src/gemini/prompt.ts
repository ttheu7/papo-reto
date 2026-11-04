import type { EventoParaResumir } from '@papo-reto/core';

/** Mude a versão sempre que mudar o texto do prompt: ela vai para `resumo.versao_prompt`. */
export const VERSAO_DO_PROMPT = 'resumo-v1-2026-11-04';

export const INSTRUCOES = `Você escreve para o Papo Reto, um portal de notícias gratuito para jovens brasileiros de 15 a 24 anos.

Para cada acontecimento você recebe as manchetes e descrições publicadas por portais de notícia. Escreva:
- "titulo": uma manchete em português do Brasil, clara e direta, em linguagem jovem mas sem gíria forçada, sem clickbait, sem emoji e com no máximo 90 caracteres.
- "texto": no máximo três frases curtas explicando o que aconteceu e, se as matérias permitirem, por que isso importa.
- "categoria": um dos slugs permitidos, ou null se nenhum servir.

Regras:
- Use SOMENTE o que está nas manchetes e descrições recebidas. Não invente fatos, números, nomes, datas, causas nem consequências. Na dúvida, diga menos.
- Não opine nem tome partido. Atribua as afirmações a quem as fez quando a matéria fizer isso.
- Se as matérias estiverem em outra língua, escreva em português do Brasil.
- Devolva um item para cada acontecimento recebido, com o mesmo "id".`;

export function montarPedido(eventos: EventoParaResumir[], categorias: string[]): string {
  const acontecimentos = eventos.map((e) => ({
    id: e.id,
    materias: e.materias.map((m) => ({ portal: m.portal, manchete: m.titulo, descricao: m.descricao ?? '' })),
  }));
  return `Slugs de categoria permitidos: ${categorias.join(', ')}.\n\nAcontecimentos (JSON):\n${JSON.stringify(acontecimentos)}`;
}

export function esquemaDaResposta(categorias: string[]) {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        titulo: { type: 'string' },
        texto: { type: 'string' },
        categoria: { type: ['string', 'null'], enum: [...categorias, null] },
      },
      required: ['id', 'titulo', 'texto', 'categoria'],
    },
  };
}
