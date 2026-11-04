import type { CardDeEvento, Categoria, MateriaPublica, RepositorioSite } from '@papo-reto/core';
import type { Sql } from './conexao';

export class RepositorioSitePg implements RepositorioSite {
  constructor(private readonly sql: Sql) {}

  async cardsRecentes({ desde, limite }: { desde: Date; limite: number }): Promise<CardDeEvento[]> {
    const linhas = await this.sql<
      {
        id: string;
        titulo: string;
        resumo: string | null;
        categoria_slug: string | null;
        categoria_nome: string | null;
        cobertura: number;
        criado_em: Date;
        atualizado_em: Date;
        publicado_em: Date;
      }[]
    >`
      select v.id, v.titulo, v.resumo, v.categoria_slug, v.categoria_nome, v.cobertura,
             v.criado_em, v.atualizado_em, p.publicado_em
        from public.vw_evento_card v
        join lateral (
          select max(n.publicada_em) as publicado_em from public.noticia n where n.evento_id = v.id
        ) p on true
       where p.publicado_em >= ${desde}
       order by p.publicado_em desc
       limit ${limite}`;
    return linhas.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      resumo: l.resumo,
      categoriaSlug: l.categoria_slug,
      categoriaNome: l.categoria_nome,
      cobertura: l.cobertura,
      criadoEm: l.criado_em,
      atualizadoEm: l.atualizado_em,
      publicadoEm: l.publicado_em,
    }));
  }

  async materiasDosEventos(ids: string[]): Promise<Map<string, MateriaPublica[]>> {
    const porEvento = new Map<string, MateriaPublica[]>();
    if (ids.length === 0) return porEvento;
    // Lista as colunas uma a uma: descricao_original nunca sai daqui.
    const linhas = await this.sql<
      { evento_id: string; portal: string; titulo: string; url: string; publicada_em: Date; exige_assinatura: boolean }[]
    >`
      select n.evento_id, f.nome as portal, n.titulo, n.url, n.publicada_em, f.exige_assinatura
        from public.noticia n
        join public.fonte f on f.id = n.fonte_id
       where n.evento_id in ${this.sql(ids)}
       order by n.publicada_em`;
    for (const l of linhas) {
      const lista = porEvento.get(l.evento_id) ?? [];
      lista.push({ portal: l.portal, titulo: l.titulo, url: l.url, publicadaEm: l.publicada_em, exigeAssinatura: l.exige_assinatura });
      porEvento.set(l.evento_id, lista);
    }
    return porEvento;
  }

  async categorias(): Promise<Categoria[]> {
    return this.sql<Categoria[]>`select id, slug, nome from public.categoria order by nome`;
  }
}
