import type { Registro } from '@papo-reto/core';

/** Logs estruturados: uma linha JSON por evento. Nunca passe segredos em `dados`. */
export class RegistroJson implements Registro {
  constructor(private readonly base: Record<string, unknown> = {}) {}

  info(mensagem: string, dados?: Record<string, unknown>) {
    this.escrever('info', mensagem, dados);
  }
  aviso(mensagem: string, dados?: Record<string, unknown>) {
    this.escrever('aviso', mensagem, dados);
  }
  erro(mensagem: string, dados?: Record<string, unknown>) {
    this.escrever('erro', mensagem, dados);
  }

  private escrever(nivel: string, mensagem: string, dados?: Record<string, unknown>) {
    const linha = JSON.stringify({ em: new Date().toISOString(), nivel, mensagem, ...this.base, ...dados });
    if (nivel === 'erro') console.error(linha);
    else console.log(linha);
  }
}
