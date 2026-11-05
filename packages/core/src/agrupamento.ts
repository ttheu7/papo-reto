// Agrupa matérias sobre o mesmo acontecimento comparando as palavras importantes dos títulos.
// Não usa IA: é rápido, não gasta cota e dá o mesmo resultado sempre.
import type { EventoRecente, GrupoDeNoticias, NovaNoticia } from './entidades';

/** Mínimo de palavras importantes em comum para dois títulos falarem do mesmo fato. */
export const PALAVRAS_EM_COMUM = 3;
/** Fração mínima do título mais curto que precisa aparecer no outro. */
export const SEMELHANCA_MINIMA = 0.5;

// Palavras que aparecem em qualquer manchete e não dizem nada sobre o fato.
const VAZIAS = new Set(
  (
    // Português
    'que com para por pelo pela pelos pelas uma umas uns dos das nos nas num numa como mais menos sobre entre ' +
    'apos ate sem sob ser sera sao foi era tem ter teve vai vao pode podem deve devem diz dizem afirma afirmam ' +
    'disse ja nao sim seu sua seus suas ele ela eles elas isso esse essa este esta aqui ali onde quando quem qual ' +
    'quais porque pois mas tambem ainda muito muita muitos muitas todo toda todos todas outro outra outros outras ' +
    'ano anos dia dias hoje ontem amanha agora veja video videos fotos assista entenda saiba ao vivo novo nova ' +
    'novos novas segundo contra durante desde analise ' +
    // Datas: "nesta quarta-feira" aparece em assuntos sem relação nenhuma.
    'nesta neste desta deste nessa nesse dessa desse segunda terca quarta quinta sexta sabado domingo feira ' +
    'janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro semana mes ' +
    // Inglês (BBC News)
    'the and for with from that this are was were has have had will would can could not but its his her their ' +
    'they you who what when where why how after over into about says said new more than been out'
  ).split(/\s+/).filter(Boolean),
);

const ANO = /^(19|20)\d\d$/;

/** As palavras importantes de um título: sem acento, minúsculas, sem palavras vazias e sem plural simples. */
export function palavrasDoTitulo(titulo: string): Set<string> {
  const palavras = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  const resultado = new Set<string>();
  for (const p of palavras) {
    if (p.length < 3 || VAZIAS.has(p) || ANO.test(p)) continue;
    resultado.add(p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p);
  }
  return resultado;
}

/**
 * Quão parecidos são dois títulos, de 0 a 1: a fração do título mais curto que aparece no outro.
 * Vale 0 quando há menos de `PALAVRAS_EM_COMUM` palavras em comum.
 */
export function semelhanca(a: Set<string>, b: Set<string>): number {
  const [menor, maior] = a.size <= b.size ? [a, b] : [b, a];
  let comuns = 0;
  for (const p of menor) if (maior.has(p)) comuns++;
  if (comuns < PALAVRAS_EM_COMUM) return 0;
  return comuns / menor.size;
}

interface Grupo {
  eventoId: string | null;
  titulos: Set<string>[];
  noticias: NovaNoticia[];
}

/**
 * Distribui as notícias novas entre os acontecimentos recentes. Cada notícia entra no grupo
 * mais parecido (existente ou criado nesta rodada) ou abre um acontecimento novo.
 */
export function agruparNoticias(novas: NovaNoticia[], recentes: EventoRecente[]): GrupoDeNoticias[] {
  const grupos: Grupo[] = recentes.map((e) => ({ eventoId: e.id, titulos: e.titulos.map(palavrasDoTitulo), noticias: [] }));
  // As mais antigas primeiro: quem noticiou antes abre o acontecimento.
  const ordenadas = [...novas].sort((a, b) => a.publicadaEm.getTime() - b.publicadaEm.getTime());

  for (const noticia of ordenadas) {
    const palavras = palavrasDoTitulo(noticia.titulo);
    let melhor: Grupo | null = null;
    let melhorNota = 0;
    for (const g of grupos) {
      for (const t of g.titulos) {
        const nota = semelhanca(palavras, t);
        if (nota >= SEMELHANCA_MINIMA && nota > melhorNota) {
          melhor = g;
          melhorNota = nota;
        }
      }
    }
    if (melhor) {
      melhor.titulos.push(palavras);
      melhor.noticias.push(noticia);
    } else {
      grupos.push({ eventoId: null, titulos: [palavras], noticias: [noticia] });
    }
  }

  return grupos.filter((g) => g.noticias.length > 0).map((g) => ({ eventoId: g.eventoId, noticias: g.noticias }));
}
