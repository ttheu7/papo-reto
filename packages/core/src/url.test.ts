import { describe, expect, it } from 'vitest';
import { normalizarUrl } from './url';

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

  it('recusa o que não é http(s)', () => {
    expect(normalizarUrl('javascript:alert(1)')).toBeNull();
    expect(normalizarUrl('não é url')).toBeNull();
  });
});
