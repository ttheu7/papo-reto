import type { EventoParaIlustrar, ImagemDeAcervo, RepositorioImagens } from '@papo-reto/core';
import type { Sql } from './conexao';

export class RepositorioImagensPg implements RepositorioImagens {
  constructor(private readonly sql: Sql) {}

  async eventosParaIlustrar({ desde, limite }: { desde: Date; limite: number }): Promise<EventoParaIlustrar[]> {
    // As palavras-chave vêm do resumo vigente (o mais recente) do acontecimento.
    return this.sql<EventoParaIlustrar[]>`
      select v.id as "eventoId", r.busca_imagem as busca
        from public.vw_evento_card v
        join lateral (
          select busca_imagem from public.resumo where evento_id = v.id order by criado_em desc limit 1
        ) r on true
       where r.busca_imagem is not null
         and v.criado_em >= ${desde}
         and not exists (select 1 from public.imagem i where i.evento_id = v.id)
       order by v.cobertura desc, v.atualizado_em desc
       limit ${limite}`;
  }

  async gravarImagem(eventoId: string, busca: string, imagem: ImagemDeAcervo | null): Promise<void> {
    await this.sql`
      insert into public.imagem (evento_id, busca, provedor, url, largura, altura, cor, autor, url_autor, url_pagina)
      values (${eventoId}, ${busca}, ${imagem?.provedor ?? null}, ${imagem?.url ?? null}, ${imagem?.largura ?? null},
              ${imagem?.altura ?? null}, ${imagem?.cor ?? null}, ${imagem?.autor ?? null}, ${imagem?.urlAutor ?? null},
              ${imagem?.urlPagina ?? null})
      on conflict (evento_id) do nothing`;
  }
}
