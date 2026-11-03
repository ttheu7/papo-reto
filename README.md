# Papo Reto

Portal de notícias para o público jovem: reúne o que os principais portais do Brasil e do mundo estão noticiando, com resumos feitos por IA e link para a matéria original.

> Em desenvolvimento. "Papo Reto" é um nome provisório.

## Organização

| Pasta | Conteúdo |
|---|---|
| `supabase/migrations/` | Cada mudança no banco é um arquivo SQL, aplicado em ordem de data |
| `supabase/seed.sql` | Dados iniciais: categorias, modelo de IA e fontes |
| `supabase/config.toml` | Configuração da Supabase CLI |
| `.github/workflows/banco.yml` | Aplica as migrations novas no Supabase a cada push na `main` |

Próximas pastas, seguindo Clean Architecture:

| Pasta | Conteúdo |
|---|---|
| `packages/core` | Entidades, casos de uso e interfaces, sem depender de banco nem de IA |
| `packages/infra` | Implementações: Supabase, Gemini e leitor de RSS |
| `apps/coletor` | Pipeline que lê os feeds e gera os resumos, rodando no GitHub Actions |
| `apps/web` | Site estático publicado no GitHub Pages |
| `apps/mcp-admin` | MCP de manutenção, roda local |
| `apps/mcp-publico` | MCP de leitura, no Cloudflare Workers |

## Quem acessa o quê

| Parte | De onde lê | Credencial |
|---|---|---|
| Site | JSONs publicados no GitHub Pages | Nenhuma |
| MCP público | Os mesmos JSONs do site | Nenhuma |
| MCP admin | Banco do Supabase, a partir da sua máquina | Chave secreta no `.env` local |
| Workflow do banco | Postgres, pelo pooler | Segredo `SUPABASE_DB_URL` no GitHub |
| Coletor | Banco do Supabase, a partir do GitHub Actions | Segredos no GitHub, definidos quando ele for criado |

A chave secreta do Supabase (`sb_secret_...`) ignora o RLS: nunca vai para o repositório nem para o navegador.

## Configuração inicial

Precisa de Node 20 ou mais novo e do Git.

### 1. Supabase

1. Crie um projeto no plano Free, na região South America (São Paulo).
2. Use uma senha de banco só com letras e números, porque ela vai dentro de uma URL.
3. Se a tela oferecer, deixe ativados o RLS automático e a Data API.

### 2. GitHub

1. Crie um repositório público `papo-reto`, sem README, `.gitignore` nem licença.
2. Em Settings › Secrets and variables › Actions, crie o segredo `SUPABASE_DB_URL`. Para montar o valor: no painel do Supabase, clique em **Connect**, copie a string do **Session pooler** e troque `[YOUR-PASSWORD]` pela senha do banco.

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

Copie `.env.example` para `.env` e preencha quando for rodar o MCP admin ou o coletor na sua máquina. O `.env` nunca vai para o Git.
