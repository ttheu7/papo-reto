/** Regra do negócio violada (dado inválido, estado impossível). */
export class ErroDominio extends Error {
  override readonly name: string = 'ErroDominio';
}

/** Falha de algo externo: rede, banco, feed, IA. */
export class ErroInfra extends Error {
  override readonly name: string = 'ErroInfra';
  constructor(
    mensagem: string,
    readonly detalhes: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(mensagem, options);
  }
}

/** A cota da IA acabou: encerra a etapa de resumos sem derrubar a execução. */
export class ErroCotaIa extends ErroInfra {
  override readonly name: string = 'ErroCotaIa';
}

export function mensagemDe(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  return String(erro);
}
