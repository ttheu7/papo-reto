// A escala do indicador de cobertura. Um assunto é medido contra os portais que cobrem a editoria dele,
// e não contra todos: ge e UOL dificilmente dão e-sports ou rap, então "1 de 20" num assunto de Games
// diria pouco. Quem cobre cada editoria sai dos próprios dados da edição: os portais que publicaram
// alguma matéria dela nas últimas 48 horas. Assunto sem editoria usa o total de portais.
import type { EventoJson } from '@papo-reto/core';

/** Para cada editoria (slug), os portais que publicaram alguma matéria dela. */
export function portaisPorEditoria(eventos: EventoJson[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (!e.categoria) continue;
    const portais = mapa.get(e.categoria.slug) ?? new Set<string>();
    for (const m of e.materias) portais.add(m.portal);
    mapa.set(e.categoria.slug, portais);
  }
  return mapa;
}

/** Contra quantos portais o assunto é medido: os da editoria dele, ou o total; nunca menos que a própria cobertura. */
export function escalaDoMedidor(
  cobertura: number,
  categoria: { slug: string } | null | undefined,
  porEditoria: Map<string, Set<string>>,
  totalDePortais: number,
): number {
  const daEditoria = categoria ? (porEditoria.get(categoria.slug)?.size ?? 0) : 0;
  return Math.max(daEditoria || totalDePortais, cobertura, 1);
}
