import { describe, expect, it } from 'vitest';
import { ehDeOutroPortal, normalizarUrl } from './url';

describe('normalizarUrl', () => {
  it('usa o trecho depois do * nos links da Folha', () => {
    expect(
      normalizarUrl('https://redir.folha.com.br/redir/online/emcimadahora/rss091/*https://www1.folha.uol.com.br/poder/2026/11/x.shtml'),
    ).toBe('https://www1.folha.uol.com.br/poder/2026/11/x.shtml');
  });

  it('remove parâmetros de rastreio e mantém os outros', () => {
    expect(normalizarUrl('https://g1.globo.com/a.ghtml?utm_source=rss&utm_medium=x&id=3&fbclid=abc#topo')).toBe(
      'https://g1.globo.com/a.ghtml?id=3',
    );
  });

  it('remove os parâmetros de campanha da BBC', () => {
    expect(normalizarUrl('https://www.bbc.co.uk/news/articles/c1?at_medium=RSS&at_campaign=rss')).toBe('https://www.bbc.co.uk/news/articles/c1');
  });

  it('recusa o que não é http(s)', () => {
    expect(normalizarUrl('javascript:alert(1)')).toBeNull();
    expect(normalizarUrl('não é url')).toBeNull();
  });
});

describe('ehDeOutroPortal', () => {
  const fontes = [
    { nome: 'UOL', urlSite: 'https://www.uol.com.br' },
    { nome: 'UOL', urlSite: 'https://www.uol.com.br/esporte' },
    { nome: 'Folha', urlSite: 'https://www.folha.uol.com.br' },
    { nome: 'BBC News Brasil', urlSite: 'https://www.bbc.com/portuguese' },
    { nome: 'BBC News', urlSite: 'https://www.bbc.com/news' },
    { nome: 'g1', urlSite: 'https://g1.globo.com' },
    { nome: 'ge', urlSite: 'https://ge.globo.com' },
  ];

  it('deixa para a Folha o link da Folha que veio no feed do UOL', () => {
    expect(ehDeOutroPortal('https://www1.folha.uol.com.br/mundo/2026/11/x.shtml', 'UOL', fontes)).toBe(true);
    expect(ehDeOutroPortal('https://aovivo.folha.uol.com.br/2026/11/05/x.shtml', 'UOL', fontes)).toBe(true);
    expect(ehDeOutroPortal('https://www1.folha.uol.com.br/mundo/2026/11/x.shtml', 'Folha', fontes)).toBe(false);
  });

  it('mantém os links do próprio portal, inclusive de subdomínios', () => {
    expect(ehDeOutroPortal('https://noticias.uol.com.br/x.htm', 'UOL', fontes)).toBe(false);
    expect(ehDeOutroPortal('https://motorsport.uol.com.br/f1/x', 'UOL', fontes)).toBe(false);
    expect(ehDeOutroPortal('https://ge.globo.com/futebol/x.ghtml', 'ge', fontes)).toBe(false);
  });

  it('separa portais do mesmo domínio pelo caminho', () => {
    expect(ehDeOutroPortal('https://www.bbc.com/portuguese/articles/x', 'BBC News Brasil', fontes)).toBe(false);
    expect(ehDeOutroPortal('https://www.bbc.com/news/articles/x', 'BBC News Brasil', fontes)).toBe(true);
    expect(ehDeOutroPortal('https://www.bbc.com/news/articles/x', 'BBC News', fontes)).toBe(false);
  });

  it('deixa a matéria do ge que aparece no g1 para o ge', () => {
    expect(ehDeOutroPortal('https://ge.globo.com/futebol/x.ghtml', 'g1', fontes)).toBe(true);
  });

  it('não descarta link de site que nenhum portal acompanhado tem', () => {
    expect(ehDeOutroPortal('https://www.reuters.com/world/x', 'UOL', fontes)).toBe(false);
    expect(ehDeOutroPortal('não é url', 'UOL', fontes)).toBe(false);
  });
});
