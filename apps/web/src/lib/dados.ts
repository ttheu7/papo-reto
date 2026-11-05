// Lê os JSONs gerados pelo coletor (npm run dados:site) em public/dados/.
// Fora do CI, se eles não existirem, usa os dados de exemplo para quem não tem acesso ao banco.
import type { CategoriasJson, EventoJson, EventosJson } from '@papo-reto/core';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// O Astro roda com a pasta apps/web como diretório atual (npm run build:web).
const RAIZ = existsSync('astro.config.mjs') ? process.cwd() : resolve('apps/web');
const PUBLICOS = join(RAIZ, 'public/dados');
const EXEMPLO = join(RAIZ, 'src/dados-exemplo');

function pasta(): string {
  if (existsSync(join(PUBLICOS, 'eventos.json'))) return PUBLICOS;
  if (process.env.CI) throw new Error('public/dados/ não existe: rode `npm run dados:site` antes do build.');
  console.warn('[papo-reto] usando apps/web/src/dados-exemplo/ (rode `npm run dados:site` para dados reais)');
  return EXEMPLO;
}

const base = pasta();
const ler = <T>(nome: string): T => JSON.parse(readFileSync(join(base, nome), 'utf8')) as T;

export const eventos = ler<EventosJson>('eventos.json');
export const hoje = ler<EventosJson>('hoje.json');
export const categorias = ler<CategoriasJson>('categorias.json');

export type Evento = EventoJson;

export function eventosDaCategoria(slug: string): Evento[] {
  return eventos.eventos.filter((e) => e.categoria?.slug === slug);
}

/** Portais distintos que aparecem nas notícias publicadas agora. */
export function portaisAtuais(): { nome: string; exigeAssinatura: boolean; materias: number }[] {
  const mapa = new Map<string, { nome: string; exigeAssinatura: boolean; materias: number }>();
  for (const e of eventos.eventos)
    for (const m of e.materias) {
      const p = mapa.get(m.portal) ?? { nome: m.portal, exigeAssinatura: m.exigeAssinatura, materias: 0 };
      p.materias++;
      mapa.set(m.portal, p);
    }
  return [...mapa.values()].sort((a, b) => b.materias - a.materias);
}

/** Quantos portais o site acompanha agora: a escala do indicador de cobertura. */
export const totalDePortais = Math.max(1, portaisAtuais().length);

/**
 * A ordem do Giro, a mesma para todo mundo (nada é personalizado): primeiro os de "hoje", com mais
 * portais noticiando, depois os demais das últimas 48 horas, dos mais novos para os mais antigos.
 */
export function eventosDoGiro(): Evento[] {
  const deHoje = hoje.eventos;
  const ids = new Set(deHoje.map((e) => e.id));
  return [...deHoje, ...eventos.eventos.filter((e) => !ids.has(e.id))];
}
