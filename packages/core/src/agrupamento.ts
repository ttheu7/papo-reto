// Agrupa matérias sobre o mesmo acontecimento. Com o serviço de vetores (embeddings), compara o
// sentido dos títulos; sem ele, ou se ele falhar, compara as palavras importantes.
import type { EventoRecente, GrupoDeNoticias, NovaNoticia, ParecidoPorVetor } from './entidades';

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

/**
 * Semelhança de cosseno mínima entre os vetores (título + descrição, ver `textoParaVetor`) de duas
 * notícias para serem do mesmo fato. Calibrada com `npm run calibrar:agrupamento -- --banco`: com o
 * mistral-embed, o mesmo fato ficou de 0,884 para cima (inclusive inglês com português) e fatos
 * diferentes do mesmo assunto, até 0,872.
 */
export const SEMELHANCA_MINIMA_VETOR = 0.88;

// Títulos de programa ("VÍDEOS: Bom Dia Goiás...", "Assista ao Bom Dia ES") não são notícia: a coleta
// os descarta, e os que já estavam no banco nunca se agrupam, não vão para o site nem para a IA.
const PROGRAMA = /^\s*(v[íi]deos\b|assista\b)/i;

/** Verdadeiro para títulos de programa ou de lista de vídeos, que nunca se agrupam. */
export function ehTituloDePrograma(titulo: string): boolean {
  return PROGRAMA.test(titulo);
}

/** Verdadeiro quando há títulos e todos são de programa: o acontecimento não é notícia. */
export function soProgramas(titulos: string[]): boolean {
  return titulos.length > 0 && titulos.every(ehTituloDePrograma);
}

/** Semelhança de cosseno entre dois vetores, de -1 a 1 (0 se algum for vazio). */
export function cosseno(a: number[], b: number[]): number {
  let produto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    produto += a[i]! * b[i]!;
    normaA += a[i]! * a[i]!;
    normaB += b[i]! * b[i]!;
  }
  return normaA && normaB ? produto / Math.sqrt(normaA * normaB) : 0;
}

interface Titulo {
  palavras: Set<string>;
  vetor: number[] | null;
  programa: boolean;
}

interface Grupo {
  eventoId: string | null;
  titulos: Titulo[];
  noticias: NovaNoticia[];
}

/** Nota de dois títulos: o cosseno, se os vetores bastarem, ou as palavras em comum. 0 se não forem do mesmo fato. */
function nota(a: Titulo, b: Titulo): number {
  if (a.programa || b.programa) return 0;
  if (a.vetor && b.vetor) {
    const c = cosseno(a.vetor, b.vetor);
    if (c >= SEMELHANCA_MINIMA_VETOR) return c;
  }
  const p = semelhanca(a.palavras, b.palavras);
  return p >= SEMELHANCA_MINIMA ? p : 0;
}

/**
 * Distribui as notícias novas entre os acontecimentos recentes. Cada notícia entra no grupo
 * mais parecido (existente ou criado nesta rodada) ou abre um acontecimento novo.
 *
 * Com vetores, dois títulos são do mesmo fato quando o cosseno passa de `SEMELHANCA_MINIMA_VETOR`
 * ou quando as palavras bastam. `parecidos` traz, para cada notícia nova (na ordem de `novas`),
 * o acontecimento gravado mais parecido pelo vetor, calculado no banco.
 */
export function agruparNoticias(
  novas: NovaNoticia[],
  recentes: EventoRecente[],
  parecidos: (ParecidoPorVetor | null)[] = [],
): GrupoDeNoticias[] {
  const grupos: Grupo[] = recentes.map((e) => ({
    eventoId: e.id,
    titulos: e.titulos.map((t) => ({ palavras: palavrasDoTitulo(t), vetor: null, programa: ehTituloDePrograma(t) })),
    noticias: [],
  }));
  const porEvento = new Map(grupos.map((g) => [g.eventoId, g]));
  const parecidoDe = new Map(novas.map((n, i) => [n, parecidos[i] ?? null]));
  // As mais antigas primeiro: quem noticiou antes abre o acontecimento.
  const ordenadas = [...novas].sort((a, b) => a.publicadaEm.getTime() - b.publicadaEm.getTime());

  for (const noticia of ordenadas) {
    const titulo: Titulo = { palavras: palavrasDoTitulo(noticia.titulo), vetor: noticia.vetor ?? null, programa: ehTituloDePrograma(noticia.titulo) };
    let melhor: Grupo | null = null;
    let melhorNota = 0;

    const parecido = parecidoDe.get(noticia);
    const candidato = parecido && parecido.semelhanca >= SEMELHANCA_MINIMA_VETOR ? porEvento.get(parecido.eventoId) : undefined;
    const sugerido = candidato && !titulo.programa && !candidato.titulos.some((t) => t.programa) ? candidato : undefined;
    if (sugerido) {
      melhor = sugerido;
      melhorNota = parecido!.semelhanca;
    }

    for (const g of grupos) {
      for (const t of g.titulos) {
        const n = nota(titulo, t);
        if (n > melhorNota) {
          melhor = g;
          melhorNota = n;
        }
      }
    }
    if (melhor) {
      melhor.titulos.push(titulo);
      melhor.noticias.push(noticia);
    } else {
      grupos.push({ eventoId: null, titulos: [titulo], noticias: [noticia] });
    }
  }

  return grupos.filter((g) => g.noticias.length > 0).map((g) => ({ eventoId: g.eventoId, noticias: g.noticias }));
}

/** Tamanho máximo da descrição que entra no texto do vetor. */
const DESCRICAO_NO_VETOR = 500;

/**
 * O texto que vira vetor: o título e, se houver, o começo da descrição do feed, que traz nomes,
 * lugares e o que aconteceu. A descrição é de uso interno (só vai para a IA, nunca para o site).
 */
export function textoParaVetor(titulo: string, descricao?: string | null): string {
  const extra = descricao?.replace(/\s+/g, ' ').trim().slice(0, DESCRICAO_NO_VETOR);
  return extra ? `${titulo.trim()}. ${extra}` : titulo.trim();
}
