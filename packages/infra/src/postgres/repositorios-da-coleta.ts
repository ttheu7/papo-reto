import type {
  ErroDeExecucao,
  Fonte,
  NovaNoticia,
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

  async criarEventosComNoticias(noticias: NovaNoticia[]): Promise<number> {
    if (noticias.length === 0) return 0;
    return this.sql.begin(async (tx) => {
      let gravadas = 0;
      for (const n of noticias) {
        const [evento] = await tx<{ id: string }[]>`
          insert into public.evento (categoria_id) values (${n.categoriaId}) returning id`;
        const inseridas = await tx`
          insert into public.noticia (fonte_id, evento_id, titulo, url, descricao_original, publicada_em)
          values (${n.fonteId}, ${evento!.id}, ${n.titulo}, ${n.url}, ${n.descricaoOriginal}, ${n.publicadaEm})
          on conflict (url) do nothing
          returning id`;
        if (inseridas.length === 0) {
          // Outra rodada gravou a mesma URL antes: não deixa evento órfão.
          await tx`delete from public.evento where id = ${evento!.id}`;
        } else {
          gravadas++;
        }
      }
      return gravadas;
    });
  }
}

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
