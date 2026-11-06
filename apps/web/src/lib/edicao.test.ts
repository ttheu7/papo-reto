import { describe, expect, it } from 'vitest';
import { numeroDaEdicao, romano, textoDaEdicao } from './edicao';

describe('numeração da edição', () => {
  it('a estreia (04/11/2026) é o Nº 1 do Ano I, e o dia seguinte é o Nº 2', () => {
    expect(numeroDaEdicao('2026-11-04T13:36:00Z')).toEqual({ ano: 'I', numero: 1 });
    expect(numeroDaEdicao('2026-11-05T12:00:00Z')).toEqual({ ano: 'I', numero: 2 });
  });

  it('conta o dia no horário de Brasília (02h UTC ainda é o dia anterior)', () => {
    expect(numeroDaEdicao('2026-11-06T02:00:00Z').numero).toBe(2);
    expect(numeroDaEdicao('2026-11-06T03:00:00Z').numero).toBe(3);
  });

  it('vira o Ano II depois de 365 dias e formata o número com ponto de milhar', () => {
    expect(numeroDaEdicao('2027-11-04T15:00:00Z')).toEqual({ ano: 'II', numero: 366 });
    expect(textoDaEdicao('2029-08-01T15:00:00Z')).toBe('Ano III · Nº 1.002');
  });

  it('antes da estreia fica no Nº 1, e os romanos saem certos', () => {
    expect(numeroDaEdicao('2026-10-01T12:00:00Z').numero).toBe(1);
    expect([1, 4, 9, 14, 40, 1999].map(romano)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIX']);
  });
});
