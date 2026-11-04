import type { EscritorDeDados } from '@papo-reto/core';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Grava os JSONs numa pasta. Escreve num temporário e renomeia, para nunca deixar arquivo pela metade. */
export class EscritorDeDadosEmPasta implements EscritorDeDados {
  constructor(private readonly pasta: string) {}

  async escrever(nome: string, dados: unknown): Promise<void> {
    if (!/^[\w.-]+\.json$/.test(nome)) throw new Error(`nome de arquivo inválido: ${nome}`);
    await mkdir(this.pasta, { recursive: true });
    const destino = join(this.pasta, nome);
    const temporario = `${destino}.tmp`;
    await writeFile(temporario, `${JSON.stringify(dados)}\n`, 'utf8');
    await rename(temporario, destino);
  }
}
