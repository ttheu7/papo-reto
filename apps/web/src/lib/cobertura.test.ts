import type { EventoJson } from '@papo-reto/core';
import { describe, expect, it } from 'vitest';
import { escalaDoMedidor, portaisPorEditoria } from './cobertura';

const evento = (slug: string | null, ...portais: string[]): EventoJson =>
  ({
    categoria: slug ? { slug, nome: slug } : null,
    materias: portais.map((portal) => ({ portal })),
  }) as unknown as EventoJson;

describe('escala do indicador de cobertura', () => {
  const eventos = [
    evento('games', 'HLTV'),
    evento('games', 'VLR.gg', 'HLTV'),
    evento('games', 'GamesIndustry.biz'),
    evento('brasil', 'g1', 'Folha', 'UOL'),
    evento(null, 'CNN Brasil'),
  ];
  const porEditoria = portaisPorEditoria(eventos);

  it('mede o assunto contra os portais que cobrem a editoria dele', () => {
    expect([...porEditoria.get('games')!].sort()).toEqual(['GamesIndustry.biz', 'HLTV', 'VLR.gg']);
    expect(escalaDoMedidor(1, { slug: 'games' }, porEditoria, 20)).toBe(3);
    expect(escalaDoMedidor(2, { slug: 'brasil' }, porEditoria, 20)).toBe(3);
  });

  it('usa o total de portais sem editoria ou com editoria sem dados', () => {
    expect(escalaDoMedidor(1, null, porEditoria, 20)).toBe(20);
    expect(escalaDoMedidor(1, { slug: 'rap' }, porEditoria, 20)).toBe(20);
  });

  it('nunca fica abaixo da própria cobertura', () => {
    expect(escalaDoMedidor(5, { slug: 'games' }, porEditoria, 20)).toBe(5);
  });
});
