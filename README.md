# Papo Reto

Portal de notícias gratuito para o público jovem: reúne o que os principais portais do Brasil e do mundo publicaram, explica cada acontecimento em até quatro frases (com IA) e leva para a matéria original.

No ar em **https://ttheu7.github.io/papo-reto/** (versão beta). Projeto acadêmico de Ciência da Computação da Unoesc Videira (PRATIC IV).

## Como funciona

1. A cada 30 minutos, o workflow **Publicar site** roda o coletor: lê os feeds RSS das fontes ativas, normaliza e deduplica as URLs e grava evento e notícia no Supabase.
2. Se houver `GEMINI_API_KEY`, o coletor manda os eventos novos em lotes para o Gemini, que devolve título, resumo de até quatro frases e categoria. Sem chave, ou com a cota esgotada, essa etapa é pulada e o site mostra a manchete original.
3. O gerador lê a view `vw_evento_card` e escreve os JSONs públicos do site.
4. O Astro monta o site estático e as actions oficiais publicam no GitHub Pages.

Se a coleta falhar, o site é publicado mesmo assim com o que já está no banco. Se o banco não responder, a publicação para e o site anterior continua no ar.

**Reportar erro:** na beta, o botão "Reportar erro neste resumo" abre uma [issue no GitHub](https://github.com/ttheu7/papo-reto/issues) já preenchida com o id e o título do acontecimento (é preciso ter conta no GitHub). Na versão 1.0, ele vira um formulário próprio do site, sem conta ([tarefa 02](docs/tarefas/02-reportar-erro.md)).

## Organização

Monorepo com npm workspaces, TypeScript estrito e Clean Architecture.

| Pasta | Conteúdo |
|---|---|
| `packages/core` | Entidades, portas e casos de uso (`ColetarNoticias`, `ResumirEventos`, `GerarDadosDoSite`). Não depende de banco, rede nem IA |
| `packages/infra` | Adaptadores: Postgres, leitor de RSS, Gemini, logs JSON |
| `apps/coletor` | Pontos de entrada da coleta e do gerador de JSONs |
| `apps/web` | Site estático em Astro, publicado no GitHub Pages |
| `supabase/migrations/` | Cada mudança no banco é um arquivo SQL, aplicado em ordem de data |
| `supabase/seed.sql` | Dados iniciais: categorias, modelo de IA e fontes |
| `.github/workflows/banco.yml` | Aplica as migrations novas no Supabase a cada push na `main` |
| `.github/workflows/publicar.yml` | Coleta, gera os dados, faz o build e publica o site |
| `docs/` | Tarefas e telas de referência de funcionamento |

Próximos: `apps/mcp-admin` (MCP de manutenção, local) e `apps/mcp-publico` (MCP de leitura, no Cloudflare Workers).

## Rodar na sua máquina

Precisa de Node 22.23 ou mais novo (recomendado: 24).

```bash
npm install
cp .env.example .env       # preencha SUPABASE_DB_URL e, se quiser, GEMINI_API_KEY
npm test                   # testes
npm run typecheck          # checagem de tipos
npm run coletar            # coleta (e resumos, com a chave) e registra a execução no banco
npm run dados:site         # gera apps/web/public/dados/*.json
npm run dev:web            # site em http://localhost:4321/papo-reto/
```

Sem acesso ao banco, pule `coletar` e `dados:site`: o `dev:web` e o `build:web` usam os dados de exemplo de `apps/web/src/dados-exemplo/`. No CI isso não acontece: sem os dados reais, o build falha de propósito.

Para ver o build de produção: `npm run build:web` e `npm run preview -w @papo-reto/web`.

## Publicar

A publicação é automática: o workflow **Publicar site** roda a cada 30 minutos, a cada push na `main` com mudanças fora de `supabase/` e à mão pela aba Actions (**Run workflow**). Antes da primeira vez:

1. Settings › Pages › Source: **GitHub Actions**.
2. Os segredos abaixo cadastrados.
3. As migrations aplicadas (o workflow **Banco de dados** faz isso no push).

## Segredos

| Onde | Nome | Para quê |
|---|---|---|
| GitHub Actions | `SUPABASE_DB_URL` | Migrations, coletor e gerador do site. String do **Session pooler** (IPv4, porta 5432), com a senha |
| GitHub Actions | `GEMINI_API_KEY` | Resumos. Opcional: sem ela, o coletor pula a IA |
| `.env` local | As mesmas variáveis | Rodar o coletor e o gerador na máquina |

Nos workflows, os segredos entram só nos passos que precisam deles, nunca no `npm ci`. Nenhum segredo vai para o site nem para os JSONs.

## Dados públicos do site

O gerador escreve três arquivos em `apps/web/public/dados/`, publicados em `https://ttheu7.github.io/papo-reto/dados/`. O contrato está em `packages/core/src/casos-de-uso/gerar-dados-do-site.ts`.

```jsonc
// eventos.json: últimas 48 horas, até 80 eventos, os mais recentes primeiro
{ "geradoEm": "ISO", "eventos": [{
    "id": "uuid", "titulo": "…", "resumo": "…" | null, "geradoPorIa": true,
    "categoria": { "slug": "tecnologia", "nome": "Tecnologia" } | null,
    "cobertura": 3, "criadoEm": "ISO", "atualizadoEm": "ISO", "publicadoEm": "ISO",
    "materias": [{ "portal": "g1", "titulo": "…", "url": "https://…", "publicadaEm": "ISO", "exigeAssinatura": false }]
}] }
// hoje.json: os 5 eventos das últimas 24 horas com maior cobertura, no mesmo formato
// categorias.json: { "geradoEm": "ISO", "categorias": [{ "slug": "brasil", "nome": "Brasil", "total": 12 }] }
```

`descricao_original` nunca entra nesses arquivos (há teste para isso).

## Quem acessa o quê

| Parte | De onde lê | Credencial |
|---|---|---|
| Site | JSONs publicados no GitHub Pages | Nenhuma |
| MCP público (futuro) | Os mesmos JSONs do site | Nenhuma |
| MCP admin (futuro) | Banco do Supabase, a partir da sua máquina | Credencial no `.env` local |
| Workflow do banco | Postgres, pelo pooler | Segredo `SUPABASE_DB_URL` |
| Coletor e gerador | Postgres, pelo pooler, no GitHub Actions | Segredos `SUPABASE_DB_URL` e `GEMINI_API_KEY` |

## Configuração inicial

Precisa de Node 20 ou mais novo e do Git.

### 1. Supabase

1. Crie um projeto no plano Free, na região South America (São Paulo).
2. Use uma senha de banco só com letras e números, porque ela vai dentro de uma URL.
3. Se a tela oferecer, deixe ativados o RLS automático e a Data API.

### 2. GitHub

1. Crie um repositório público `papo-reto`, sem README, `.gitignore` nem licença.
2. Em Settings › Secrets and variables › Actions, crie o segredo `SUPABASE_DB_URL`. Para montar o valor: no painel do Supabase, clique em **Connect**, copie a string do **Session pooler** e troque `[YOUR-PASSWORD]` pela senha do banco.
3. Opcional: crie o segredo `GEMINI_API_KEY` (Google AI Studio) para ligar os resumos com IA.
4. Em Settings › Pages, em **Source**, escolha **GitHub Actions**.

### 3. Já rodou os SQL no SQL Editor?

Se sim, marque as migrations como aplicadas **antes do primeiro push**. Sem isso, o workflow tenta criar as tabelas de novo e falha:

```bash
npm install
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration repair --remote --status applied 20261028120000 20261028120100
```

O ref do projeto aparece na URL do painel do Supabase. Se o banco ainda está vazio, pule esta etapa.

### 4. Primeiro envio

```bash
npm install
git init -b main
git add .
git commit -m "Estrutura inicial e banco"
git remote add origin https://github.com/SEU_USUARIO/papo-reto.git
git push -u origin main
```

O push dispara o workflow **Banco de dados** (aba Actions), que cria as tabelas no Supabase.

### 5. Dados iniciais

Com o workflow verde, abra o SQL Editor do Supabase, cole o conteúdo de `supabase/seed.sql` e rode uma vez. Se o seed já foi rodado antes, pule.

O Security Advisor do Supabase pode avisar que as tabelas têm RLS sem nenhuma política. É de propósito: com a chave publicável ninguém lê nada, e só as partes com credencial acessam o banco.

## Mudando o banco

```bash
npm run db:nova -- nome_da_mudanca
# escreva o SQL no arquivo criado em supabase/migrations/
git add .
git commit -m "banco: nome da mudança"
git push
```

O workflow aplica a migration no Supabase. Nunca edite uma migration que já foi aplicada: crie outra.

Para conferir o estado do banco pela sua máquina (depois de `npx supabase login` e `npx supabase link`):

```bash
npm run db:status
```

Na CLI 3, `db push`, `migration list` e `migration repair` miram um banco local por padrão. Para falar com o Supabase, use sempre `--remote` (os scripts do `package.json` já fazem isso).

## Variáveis de ambiente locais

Copie `.env.example` para `.env` (não renomeie: o exemplo fica no repositório) e preencha quando for rodar o coletor na sua máquina. O `.env` nunca vai para o Git.
