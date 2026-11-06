import type {
  ErroDeExecucao,
  EventoRecente,
  Fonte,
  GrupoDeNoticias,
  ParecidoPorVetor,
  PoliticaUso,
  RepositorioExecucoes,
  RepositorioFontes,
  RepositorioNoticias,
  StatusExecucao,
} from '@papo-reto/core';
import type { Sql } from './conexao';

export class RepositorioFontesPg implements RepositorioFontes {
  constructor(private readonly sql: Sql) {}

  async listarAtivas(): Promise<Fonte[]> {
    const linhas = await this.sql<
      { id: number; nome: string; url_feed: string; url_site: string; politica_uso: PoliticaUso; exige_assinatura: boolean; categoria_id: number | null }[]
    >`
      select id, nome, url_feed, url_site, politica_uso, exige_assinatura, categoria_id
        from public.fonte
       where ativa
       order by id`;
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      urlFeed: l.url_feed,
      urlSite: l.url_site,
      politicaUso: l.politica_uso,
      exigeAssinatura: l.exige_assinatura,
      categoriaId: l.categoria_id,
    }));
  }

  async registrarSucesso(fonteId: number, em: Date): Promise<void> {
    await this.sql`
      update public.fonte
         set ultima_coleta_em = ${em}, falhas_seguidas = 0, ultimo_erro = null
       where id = ${fonteId}`;
  }

  async registrarFalha(fonteId: number, em: Date, erro: string): Promise<void> {
    await this.sql`
      update public.fonte
         set ultima_coleta_em = ${em}, falhas_seguidas = falhas_seguidas + 1, ultimo_erro = ${erro.slice(0, 500)}
       where id = ${fonteId}`;
  }
}

export class RepositorioNoticiasPg implements RepositorioNoticias {
  constructor(private readonly sql: Sql) {}

  async urlsExistentes(urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set();
    const linhas = await this.sql<{ url: string }[]>`select url from public.noticia where url in ${this.sql(urls)}`;
    return new Set(linhas.map((l) => l.url));
  }

  async eventosRecentes(desde: Date): Promise<EventoRecente[]> {
    const linhas = await this.sql<{ id: string; titulos: string[] }[]>`
      select n.evento_id as id, array_agg(n.titulo order by n.publicada_em) as titulos
        from public.noticia n
        join public.evento e on e.id = n.evento_id
       where e.atualizado_em >= ${desde}
       group by n.evento_id
      having max(n.publicada_em) >= ${desde}`;
    return linhas.map((l) => ({ id: l.id, titulos: l.titulos }));
  }

  async parecidosPorVetor(vetores: number[][], desde: Date): Promise<(ParecidoPorVetor | null)[]> {
    if (vetores.length === 0) return [];
    // Para cada vetor, a notícia recente mais próxima (distância de cosseno do pgvector).
    const linhas = await this.sql<{ indice: number; evento_id: string | null; semelhanca: number | null }[]>`
      select (q.i - 1)::int as indice, m.evento_id, m.semelhanca
        from unnest(${vetores.map(textoDoVetor)}::text[]) with ordinality as q(v, i)
        left join lateral (
          select n.evento_id,
                 (1 - (n.vetor operator(extensions.<=>) q.v::extensions.vector))::float8 as semelhanca
            from public.noticia n
           where n.vetor is not null
             and n.publicada_em >= ${desde}
           order by n.vetor operator(extensions.<=>) q.v::extensions.vector
           limit 1
        ) m on true
       order by q.i`;
    return linhas.map((l) => (l.evento_id && l.semelhanca !== null ? { eventoId: l.evento_id, semelhanca: l.semelhanca } : null));
  }

  async gravarGrupos(grupos: GrupoDeNoticias[]): Promise<number> {
    if (grupos.length === 0) return 0;
    return this.sql.begin(async (tx) => {
      let gravadas = 0;
      for (const g of grupos) {
        // Acontecimento novo herda a categoria do primeiro feed de seção do grupo.
        const categoria = g.noticias.find((n) => n.categoriaId !== null)?.categoriaId ?? null;
        let eventoId = g.eventoId;
        if (!eventoId) {
          const [evento] = await tx<{ id: string }[]>`
            insert into public.evento (categoria_id) values (${categoria}) returning id`;
          eventoId = evento!.id;
        } else if (categoria !== null) {
          await tx`update public.evento set categoria_id = ${categoria} where id = ${eventoId} and categoria_id is null`;
        }

        let doGrupo = 0;
        for (const n of g.noticias) {
          const inseridas = await tx`
            insert into public.noticia (fonte_id, evento_id, titulo, url, descricao_original, publicada_em, vetor)
            values (${n.fonteId}, ${eventoId}, ${n.titulo}, ${n.url}, ${n.descricaoOriginal}, ${n.publicadaEm},
                    ${n.vetor ? textoDoVetor(n.vetor) : null}::extensions.vector)
            on conflict (url) do nothing
            returning id`;
          doGrupo += inseridas.length;
        }
        // Outra rodada gravou as mesmas URLs antes: não deixa acontecimento vazio.
        if (doGrupo === 0 && !g.eventoId) await tx`delete from public.evento where id = ${eventoId}`;
        gravadas += doGrupo;
      }
      return gravadas;
    });
  }
}

/** O formato de texto do pgvector: "[0.1,0.2,...]". */
const textoDoVetor = (v: number[]) => `[${v.join(',')}]`;

export class RepositorioExecucoesPg implements RepositorioExecucoes {
  constructor(private readonly sql: Sql) {}

  async iniciar(em: Date): Promise<string> {
    const [linha] = await this.sql<{ id: string }[]>`
      insert into public.execucao (iniciada_em, status) values (${em}, 'rodando') returning id`;
    return linha!.id;
  }

  async finalizar(
    id: string,
    d: { em: Date; status: Exclude<StatusExecucao, 'rodando'>; novasNoticias: number; erros: ErroDeExecucao[] },
  ): Promise<void> {
    await this.sql`
      update public.execucao
         set finalizada_em = ${d.em},
             status = ${d.status},
             novas_noticias = ${d.novasNoticias},
             erros = erros || ${JSON.stringify(d.erros)}::jsonb
       where id = ${id}`;
  }

  async registrarResumos(id: string, quantidade: number, erros: ErroDeExecucao[]): Promise<void> {
    await this.sql`
      update public.execucao
         set resumos_gerados = resumos_gerados + ${quantidade},
             erros = erros || ${JSON.stringify(erros)}::jsonb
       where id = ${id}`;
  }
}
