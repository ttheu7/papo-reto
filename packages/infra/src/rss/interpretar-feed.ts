import type { ItemRss } from '@papo-reto/core';
import { XMLParser } from 'fast-xml-parser';
import { textoLimpo } from './texto';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Entidades do HTML ficam pro textoLimpo, que conhece as da língua portuguesa.
  processEntities: true,
  htmlEntities: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (nome) => nome === 'item' || nome === 'entry' || nome === 'link',
});

type No = unknown;

function texto(no: No): string {
  if (no == null) return '';
  if (typeof no === 'string' || typeof no === 'number') return String(no);
  if (Array.isArray(no)) return texto(no[0]);
  if (typeof no === 'object' && '#text' in no) return texto((no as Record<string, No>)['#text']);
  return '';
}

function data(...valores: No[]): Date | null {
  for (const v of valores) {
    const t = texto(v);
    if (!t) continue;
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Link de item RSS (texto) ou de entrada Atom (atributo href, de preferência rel=alternate). */
function link(no: No): string {
  const links = Array.isArray(no) ? no : [no];
  let primeiro = '';
  for (const l of links) {
    if (l && typeof l === 'object' && '@_href' in l) {
      const href = String((l as Record<string, No>)['@_href'] ?? '');
      const rel = (l as Record<string, No>)['@_rel'];
      if (!rel || rel === 'alternate') return href;
      primeiro ||= href;
    } else {
      const t = texto(l);
      if (t) return t;
    }
  }
  return primeiro;
}

/** Lê RSS 2.0, RSS 0.91, RDF (RSS 1.0) e Atom. */
export function interpretarFeed(xml: string): ItemRss[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const itens: Record<string, No>[] =
    doc.rss?.channel?.item ?? doc.rss?.item ?? doc['rdf:RDF']?.item ?? doc.feed?.entry ?? [];

  if (!doc.rss && !doc['rdf:RDF'] && !doc.feed) {
    throw new Error('o conteúdo não é um feed RSS ou Atom');
  }

  return itens.map((i) => {
    const descricao = textoLimpo(texto(i.description ?? i.summary ?? i.content));
    return {
      titulo: textoLimpo(texto(i.title)),
      link: (link(i.link) || texto(i.guid)).trim(),
      descricao: descricao || null,
      publicadaEm: data(i.pubDate, i['dc:date'], i.published, i.updated),
    };
  });
}
