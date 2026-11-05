import type { Sql } from './conexao';

export interface NoticiaParaCalibrar {
  portal: string;
  titulo: string;
  /** Uso interno: só aparece no terminal de quem calibra, nunca no site. */
  descricao: string | null;
  eventoId: string;
}

/** Leitura para o script de calibragem do agrupamento. Não grava nada. */
export class RepositorioCalibragemPg {
  constructor(private readonly sql: Sql) {}

  async noticiasRecentes(desde: Date, limite: number): Promise<NoticiaParaCalibrar[]> {
    const linhas = await this.sql<{ portal: string; titulo: string; descricao: string | null; evento_id: string }[]>`
      select f.nome as portal, n.titulo, n.descricao_original as descricao, n.evento_id
        from public.noticia n
        join public.fonte f on f.id = n.fonte_id
       where n.publicada_em >= ${desde}
       order by n.publicada_em desc
       limit ${limite}`;
    return linhas.map((l) => ({ portal: l.portal, titulo: l.titulo, descricao: l.descricao, eventoId: l.evento_id }));
  }
}
