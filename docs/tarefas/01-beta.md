# Tarefa 01: versão beta no GitHub Pages

## Objetivo

Colocar no ar a primeira versão funcional do Papo Reto. A beta tem notícias reais coletadas dos feeds, organizadas e publicadas automaticamente no GitHub Pages, com o visual do protótipo.

Os resumos com IA só entram se houver `GEMINI_API_KEY`. Sem ela, tudo funciona do mesmo jeito, mostrando a manchete original, a fonte e o link.

## Antes de escrever código

1. Leia o `CLAUDE.md`, o `README.md`, as migrations, o `supabase/seed.sql` e as telas em `docs/prototipo/`.
2. Apresente um plano curto (pastas, dependências, scripts, workflows e o contrato dos JSONs) e espere a aprovação.
3. Confira as versões atuais das bibliotecas e das actions do GitHub antes de fixá-las.
4. Implemente em etapas, nesta ordem. Ao fim de cada uma, rode os testes e a checagem de tipos e faça um commit.

## Etapas

### 1. Base do monorepo

- npm workspaces com `packages/core`, `packages/infra`, `apps/coletor` e `apps/web`.
- TypeScript estrito e Vitest.
- Scripts na raiz: `test`, `typecheck`, `coletar` e `build:web`. Os scripts `db:*` existentes continuam.

### 2. Coleta (sem IA)

Caso de uso `ColetarNoticias`, em `packages/core`. Ele deve:

1. Registrar uma `execucao` com status `rodando`.
2. Ler as fontes ativas.
3. Para cada fonte, baixar e ler o RSS, com timeout e User-Agent identificando o projeto. A falha de uma fonte não pode derrubar as outras.
4. Normalizar as URLs, descartar as que já existem e criar evento e notícia para as novas.
5. Atualizar a saúde da fonte (`ultima_coleta_em`, `falhas_seguidas`, `ultimo_erro`).
6. Fechar a execução com as contagens, os erros (em jsonb) e o status `sucesso`, `parcial` ou `falha`.

Teste o caso de uso com repositórios e leitor de RSS falsos.

Categoria: crie uma migration nova que adiciona `fonte.categoria_id` (a categoria padrão do feed, opcional) e preenche esse campo nos feeds de seção (g1 tecnologia vira `tecnologia`, g1 pop & arte vira `pop`). Os eventos herdam a categoria do feed. Os de feeds gerais ficam sem categoria até a IA classificar.

### 3. Resumos com IA (só com `GEMINI_API_KEY`)

Caso de uso `ResumirEventos`. Ele deve:

- Pegar os eventos recentes sem resumo, priorizando os de maior cobertura.
- Mandá-los em lotes para o Gemini, usando o modelo ativo de `modelo_ia`.
- Gravar o `resumo`: um título em linguagem jovem e um texto de até três frases.
- Gravar a categoria, usando só slugs existentes.
- Respeitar um limite de chamadas por rodada. Um erro de cota encerra esta etapa sem fazer a execução falhar.

### 4. Dados do site

Caso de uso `GerarDadosDoSite`. Ele lê a `vw_evento_card` e gera os JSONs em `apps/web` antes do build. Contrato sugerido:

- `eventos.json`: eventos das últimas 48 horas (até cerca de 80). Cada um com id, título, resumo (ou `null`), categoria, cobertura, se foi gerado por IA, datas e a lista de matérias (portal, título original, link, data e se exige assinatura).
- `hoje.json`: os 5 eventos das últimas 24 horas com maior cobertura.
- `categorias.json`.

Nunca inclua `descricao_original`.

### 5. Site (`apps/web`)

- Site estático. Sugestão: Astro, sem framework de interface no cliente.
- Base path `/papo-reto/`, que é o endereço do repositório no GitHub Pages.
- Páginas:
  - **Início:** "O que importa hoje" e "Mais notícias".
  - **Categorias:** uma página por categoria.
  - **Acontecimento:** uma página por acontecimento, com o resumo, o "Quem noticiou" (links e etiqueta "Exige assinatura") e o aviso de IA.
  - **Como funciona:** fontes, uso de IA e direitos autorais.
- Visual fiel às telas de `docs/prototipo/`.
- Nada de formulário que não funciona. Newsletter e Pix ficam pra depois ou aparecem como "em breve".
- "Reportar erro": um link que abre uma issue no repositório com o id do acontecimento.

### 6. Publicação

Workflow `publicar.yml`:

- Gatilhos: agendado (a cada 30 minutos, por exemplo), manual e push na `main` com mudanças fora de `supabase/`.
- Passos: instalar, coletar, gerar os dados, fazer o build e publicar com as actions oficiais do GitHub Pages.
- `SUPABASE_DB_URL` (e `GEMINI_API_KEY`, se existir) entram só nos passos que precisam.
- `concurrency` pra nunca rodar duas publicações ao mesmo tempo.
- Se a coleta falhar, o site é publicado mesmo assim, com os dados que já estão no banco.

## Critérios de aceite

- `npm test` e `npm run typecheck` passam.
- Rodando o coletor na máquina, com o `.env` preenchido, notícias reais entram no banco e a `execucao` fica registrada.
- O site abre em `https://<usuario>.github.io/papo-reto/`, mostra notícias reais, funciona no celular, e todos os links levam às matérias originais.
- Nenhum segredo e nenhuma `descricao_original` aparecem no site ou nos JSONs.
- O README explica como rodar, como publicar e quais são os segredos. O `.env.example` lista `SUPABASE_DB_URL` e `GEMINI_API_KEY`.

## Fora do escopo

MCPs, newsletter, doações, login e o fluxo de branches com testes nos PRs (que fica pra próxima tarefa).
