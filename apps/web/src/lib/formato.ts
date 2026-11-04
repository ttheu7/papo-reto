const FUSO = 'America/Sao_Paulo';
const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Caminho dentro do site, respeitando o base path (/papo-reto/). */
export const caminho = (relativo = '') => base + relativo.replace(/^\//, '');

export const REPOSITORIO = 'https://github.com/ttheu7/papo-reto';

const dia = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, dateStyle: 'short' }).format(d);
const hora = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).format(d).replace(':', 'h');

/** "10h32", "ontem, 22h10" ou "02/11, 08h00", em horário de Brasília, relativo ao momento da geração. */
export function quando(iso: string, referencia: string): string {
  const d = new Date(iso);
  const ref = new Date(referencia);
  if (dia(d) === dia(ref)) return hora(d);
  if (dia(d) === dia(new Date(ref.getTime() - 86_400_000))) return `ontem, ${hora(d)}`;
  const curta = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d);
  return `${curta}, ${hora(d)}`;
}

/** "quarta-feira, 4 de novembro" */
export function dataPorExtenso(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}

export const horaDe = (iso: string) => hora(new Date(iso));

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Link que abre uma issue no GitHub já com o id do acontecimento. */
export function linkParaReportar(id: string, titulo: string): string {
  const corpo = `Acontecimento: ${id}\nTítulo: ${titulo}\n\nO que está errado?\n\n`;
  const p = new URLSearchParams({ title: `Erro no resumo: ${titulo.slice(0, 80)}`, body: corpo, labels: 'erro-no-resumo' });
  return `${REPOSITORIO}/issues/new?${p.toString()}`;
}

type ComMaterias = { materias: { portal: string; exigeAssinatura: boolean }[] };

/** Portais distintos que noticiaram o acontecimento, na ordem em que aparecem. */
export const portaisDe = (e: ComMaterias) => e.materias.map((m) => m.portal).filter((p, i, a) => a.indexOf(p) === i);

/** Verdadeiro quando todas as matérias do acontecimento são de portais com assinatura. */
export const exigeAssinatura = (e: ComMaterias) => e.materias.length > 0 && e.materias.every((m) => m.exigeAssinatura);
