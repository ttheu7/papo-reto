import type { Categoria, EventoParaResumir, ModeloIa, NovoResumo, RepositorioResumos } from '@papo-reto/core';
import type { Sql } from './conexao';

export class RepositorioResumosPg implements RepositorioResumos {
  constructor(private readonly sql: Sql) {}

  async modeloAtivo(): Promise<ModeloIa | null> {
    const [l] = await this.sql<{ id: number; provedor: string; modelo: string; entrada: number; saida: number }[]>`
      select id, provedor, modelo, custo_entrada_1m::float8 as entrada, custo_saida_1m::float8 as saida
        from public.modelo_ia
       where ativo`;
    return l ? { id: l.id, provedor: l.provedor, modelo: l.modelo, custoEntrada1m: l.entrada, custoSaida1m: l.saida } : null;
  }

  async categorias(): Promise<Categoria[]> {
    return this.sql<Categoria[]>`select id, slug, nome from public.categoria order by id`;
  }

  async eventosSemResumo({ limite, desde }: { limite: number; desde: Date }): Promise<EventoParaResumir[]> {
    // descricao_original sai daqui só para a IA (uso interno), nunca para o site.
    const linhas = await this.sql<{ id: string; materias: EventoParaResumir['materias'] }[]>`
      select e.id,
             json_agg(json_build_object('portal', f.nome, 'titulo', n.titulo, 'descricao', n.descricao_original)
                      order by n.publicada_em) as materias
        from public.evento e
        join public.noticia n on n.evento_id = e.id
        join public.fonte f on f.id = n.fonte_id
       where e.criado_em >= ${desde}
         and not exists (select 1 from public.resumo r where r.evento_id = e.id)
       group by e.id
      having bool_and(f.politica_uso <> 'so_link')
       order by count(distinct f.nome) desc, max(n.publicada_em) desc
       limit ${limite}`;
    return linhas.map((l) => ({ id: l.id, materias: l.materias }));
  }

  async gravarResumo(r: NovoResumo): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const inseridos = await tx`
        insert into public.resumo
          (evento_id, modelo_ia_id, titulo, texto, versao_prompt, tokens_entrada, tokens_saida, custo_estimado)
        select ${r.eventoId}, ${r.modeloIaId}, ${r.titulo}, ${r.texto}, ${r.versaoPrompt},
               ${r.tokensEntrada}, ${r.tokensSaida}, ${r.custoEstimado}
         where not exists (select 1 from public.resumo where evento_id = ${r.eventoId})
        returning id`;
      if (inseridos.length === 0) return false;
      if (r.categoriaId !== null) {
        // A categoria do feed tem prioridade: a IA só preenche quem está sem.
        await tx`update public.evento set categoria_id = ${r.categoriaId} where id = ${r.eventoId} and categoria_id is null`;
      }
      return true;
    });
  }
}
