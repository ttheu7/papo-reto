// Ajuda a calibrar SEMELHANCA_MINIMA_VETOR: vetoriza as manchetes dos dados de exemplo (ou de
// um eventos.json passado como argumento) e lista os pares mais parecidos, com o cosseno e se
// as palavras também bastariam. Não grava nada.
// Uso: npm run calibrar:agrupamento [-- caminho/para/eventos.json]   (precisa de MISTRAL_API_KEY)
import { cosseno, palavrasDoTitulo, semelhanca, SEMELHANCA_MINIMA, SEMELHANCA_MINIMA_VETOR, type EventosJson } from '@papo-reto/core';
import { ServicoDeVetoresMistral } from '@papo-reto/infra';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const chave = process.env.MISTRAL_API_KEY?.trim();
if (!chave) {
  console.error('Defina MISTRAL_API_KEY no .env.');
  process.exit(1);
}

const arquivo = resolve(process.argv[2] ?? 'apps/web/src/dados-exemplo/eventos.json');
const dados = JSON.parse(readFileSync(arquivo, 'utf8')) as EventosJson;
const materias = dados.eventos.flatMap((e) => e.materias.map((m) => ({ portal: m.portal, titulo: m.titulo, evento: e.id })));
console.log(`${materias.length} manchetes de ${arquivo}\n`);

const vetores = await new ServicoDeVetoresMistral({ chave }).vetorizar(materias.map((m) => m.titulo));
const pares: { c: number; p: number; a: (typeof materias)[number]; b: (typeof materias)[number] }[] = [];
for (let i = 0; i < materias.length; i++)
  for (let j = i + 1; j < materias.length; j++) {
    const c = cosseno(vetores[i]!, vetores[j]!);
    if (c >= SEMELHANCA_MINIMA_VETOR - 0.1)
      pares.push({ c, p: semelhanca(palavrasDoTitulo(materias[i]!.titulo), palavrasDoTitulo(materias[j]!.titulo)), a: materias[i]!, b: materias[j]! });
  }

pares.sort((x, y) => y.c - x.c);
console.log(`Limite atual: ${SEMELHANCA_MINIMA_VETOR}. "junta" = o par seria agrupado; confira se cada par é mesmo o mesmo fato.\n`);
for (const { c, p, a, b } of pares.slice(0, 60)) {
  const junta = c >= SEMELHANCA_MINIMA_VETOR || p >= SEMELHANCA_MINIMA;
  console.log(`${c.toFixed(3)} ${junta ? 'junta ' : '      '}${p >= SEMELHANCA_MINIMA ? '(palavras)' : ''}`);
  console.log(`   [${a.portal}] ${a.titulo}\n   [${b.portal}] ${b.titulo}`);
}
