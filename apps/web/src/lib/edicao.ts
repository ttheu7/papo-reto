// A numeração da edição, como no cabeçalho de um jornal: "Ano I · Nº 128".
// Nº conta os dias desde a estreia (a beta entrou no ar em 04/11/2026, que é o Nº 1), no horário de
// Brasília: todas as edições do mesmo dia (uma por hora) levam o mesmo número.

const FUSO = 'America/Sao_Paulo';
/** Dia da estreia (Nº 1), em Brasília. */
export const ESTREIA = '2026-11-04';

/** "2026-11-05" do instante dado, no horário de Brasília. */
const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export function romano(n: number): string {
  const tabela: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let resto = Math.max(1, Math.floor(n));
  let texto = '';
  for (const [valor, letra] of tabela) while (resto >= valor) { texto += letra; resto -= valor; }
  return texto;
}

/** Ano (em romano, contado da estreia) e número da edição do dia. */
export function numeroDaEdicao(iso: string): { ano: string; numero: number } {
  const dias = Math.max(0, diasEntre(ESTREIA, diaEmBrasilia(new Date(iso))));
  return { ano: romano(Math.floor(dias / 365) + 1), numero: dias + 1 };
}

/** "Ano I · Nº 128" */
export function textoDaEdicao(iso: string): string {
  const { ano, numero } = numeroDaEdicao(iso);
  return `Ano ${ano} · Nº ${numero.toLocaleString('pt-BR')}`;
}
