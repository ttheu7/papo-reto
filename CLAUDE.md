# Papo Reto

Portal de notícias gratuito para o público jovem. Reúne o que os principais portais do Brasil e do mundo publicam (via RSS), agrupa as matérias sobre um mesmo acontecimento (o "evento") e explica cada um em linguagem simples, com resumos gerados por IA (Gemini) e link para todas as matérias originais.

Projeto acadêmico em grupo (Ciência da Computação, Unoesc Videira, disciplina PRATIC IV), com entrega de uma versão beta.

**Idioma:** português do Brasil em tudo: textos da interface, nomes de tabelas, entidades, casos de uso, mensagens de commit e comentários.

## Arquitetura

| Parte | Onde roda | Como acessa os dados |
|---|---|---|
| `apps/web` | GitHub Pages (site estático) | JSONs gerados antes do build. Nenhuma chave no front |
| `apps/coletor` | GitHub Actions, agendado | Postgres do Supabase via `SUPABASE_DB_URL` |
| `apps/mcp-admin` (futuro) | Máquina local, via stdio | Banco, com credencial local |
| `apps/mcp-publico` (futuro) | Cloudflare Workers | Os mesmos JSONs públicos do site, sem chave |
| `.github/workflows/banco.yml` | GitHub Actions | Aplica as migrations via `SUPABASE_DB_URL` |

Clean Architecture em monorepo (npm workspaces, TypeScript estrito):

- `packages/core`: entidades, portas (interfaces) e casos de uso. Não importa nada de infraestrutura: nem SDK, nem driver de banco, nem `fetch`.
- `packages/infra`: adaptadores que implementam as portas (Postgres, leitor de RSS, Gemini).
- `apps/*`: pontos de entrada. Só montam as dependências e chamam os casos de uso.
- Erros tipados (domínio x infraestrutura), tratados em cada ponto de entrada, com logs estruturados que levam o id da execução.
- Interfaces só onde existe chance real de troca (banco, IA, fonte de dados). Sem cerimônia desnecessária.
- Testes com Vitest. Casos de uso testados com repositórios falsos em memória, sem banco e sem rede.

## Banco de dados (Supabase, Postgres)

O schema está em `supabase/migrations/`, e os dados iniciais em `supabase/seed.sql`. Os dois já foram aplicados no projeto real.

- `categoria(id, slug único, nome)`: lista fechada; a IA só classifica com esses slugs.
- `fonte(id, nome, url_feed único, url_site, politica_uso, exige_assinatura, ativa, ultima_coleta_em, falhas_seguidas, ultimo_erro)`: um feed por linha. Feeds do mesmo portal usam o mesmo `nome`, porque a cobertura conta portais pelo nome.
- `evento(id uuid, categoria_id, criado_em, atualizado_em)`: o acontecimento, que vira um card.
- `noticia(id uuid, fonte_id, evento_id NOT NULL, titulo, url única e canônica, descricao_original, publicada_em, coletada_em)`.
- `resumo(id uuid, evento_id, modelo_ia_id, titulo, texto, versao_prompt, tokens_entrada, tokens_saida, custo_estimado, criado_em)`: o vigente é o mais recente do evento.
- `modelo_ia(id, provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo)`: no máximo um ativo. O código lê o nome do modelo daqui.
- `execucao(id uuid, iniciada_em, finalizada_em, status, novas_noticias, resumos_gerados, erros jsonb)`: uma linha por rodada do coletor.
- `doacao`: ainda não usada.
- View `vw_evento_card`: título (do resumo ou da primeira manchete), resumo, categoria, `fontes` (nomes) e `cobertura` (portais distintos).
- Gatilho `tocar_evento`: inserir notícia ou resumo atualiza `evento.atualizado_em`.
- pg_cron (`limpeza_diaria`, 6h UTC): apaga `descricao_original` depois de 30 dias, eventos parados há 180 dias (em cascata), eventos órfãos e execuções com mais de 30 dias.

Regras:

- Mudou o schema? Nova migration (`npm run db:nova -- nome`). Nunca edite uma migration já aplicada. O `banco.yml` aplica no push para `main`.
- RLS ligado em todas as tabelas, sem políticas, de propósito. O navegador nunca lê o banco direto.
- Antes de inserir notícias, filtre as URLs que já existem e só então crie evento e notícia (no MVP, um evento por notícia). Use `on conflict (url) do nothing` como rede de segurança.
- Normalize as URLs antes de deduplicar. Os links da Folha vêm como `redir.folha.com.br/...*https://...`: use o trecho depois do `*`. Remova parâmetros de rastreio (`utm_*` e parecidos).
- Plano gratuito: 500 MB de banco (acima disso ele fica só leitura), 5 GB de tráfego por mês, pausa depois de uma semana sem atividade e nenhum backup automático. Guarde só o necessário.

## Conexão com o banco

- `SUPABASE_DB_URL` é a string do **Session pooler** (IPv4, porta 5432). A conexão direta (`db.<ref>.supabase.co`) só funciona em IPv6 e falha no GitHub Actions.
- O coletor usa um driver Postgres (por exemplo, `postgres`) com essa URL, o que permite transações e `on conflict`.
- Supabase CLI 3, instalada via npm: `db push`, `migration list` e `migration repair` miram o banco **local** por padrão. Para o Supabase, use sempre `--remote` (ou `--remote="<url>"`). Comandos não interativos precisam de `--yes`.

## IA (Gemini)

- O plano gratuito tem cotas baixas (poucas requisições por minuto, com os limites visíveis só no AI Studio).
- Processe em lote: vários eventos por chamada, com resposta em JSON.
- Nunca resuma o mesmo evento duas vezes.
- Tenha uma alternativa: sem chave, ou com a cota esgotada, o site mostra a manchete original, a fonte e o link.
- O resumo sai **só** dos títulos e descrições dos feeds, sem inventar fatos. A classificação usa apenas os slugs de `categoria`.
- No plano gratuito o Google pode usar o conteúdo enviado. Nunca envie dados de usuários.
- O texto do resumo tem de três a quatro frases (50 a 80 palavras); o código corta em quatro (`limitarFrases`). Prompt atual: `resumo-v2-2026-11-04`.
- Registre a `versao_prompt`, os tokens e o modelo usado.

## Conteúdo e regras legais

- Exiba só título, resumo próprio e link para a matéria original. Texto integral, com crédito, apenas de fontes com `politica_uso = 'republicacao_com_credito'` (Agência Brasil).
- `descricao_original` é de uso interno: nunca vai para JSON público, página, MCP ou view.
- Sem imagens dos portais (direito autoral). O visual é tipográfico.
- Matérias de fontes com `exige_assinatura` levam a etiqueta "Exige assinatura".
- Todo resumo avisa que foi gerado por IA, mostra quais matérias foram usadas e oferece um jeito de reportar erro.
- Público jovem: nada de anúncio com perfilamento (ECA Digital, Lei 15.211/2025) e coleta mínima de dados pessoais (LGPD).

## Segredos

| Onde | Nome | Para quê |
|---|---|---|
| GitHub Actions | `SUPABASE_DB_URL` | Migrations e coletor (Session pooler, com a senha) |
| GitHub Actions | `GEMINI_API_KEY` | Resumos. Opcional: sem ela, o coletor pula a IA |
| `.env` local | As mesmas variáveis | Rodar o coletor na máquina |

Nunca coloque segredos no código, em logs, em JSONs ou no site. Nos workflows, os segredos entram só nos passos que precisam deles (`env` no passo), nunca no passo de `npm ci`.

## Visual

As telas de `docs/prototipo/` mostram só o funcionamento (quais páginas e blocos existem), não o design. O design foi feito com a skill taste-skill (direção "a página é o objeto", seed 2036481194) e revisado com a web-design-guidelines. Ele substituiu a primeira direção ("one motif"), que o grupo achou escura e quadrada demais.

- **Ideia:** o site é a primeira página do jornal da edição atual. Cabeçalho com data, "Edição das HHhMM" e o nome grande; manchete grande ao lado da coluna "Também hoje"; blocos por editoria; lista de últimas notícias. Cada parte é uma folha de papel (card) sobre o fundo.
- **Cores:** neutras. Fundo `#efefed`, folhas `#ffffff`, folha interna `#f5f5f3`, rodapé `#e2e3e0`, tinta azul-marinho `#1f2b4d` (texto e botões), tinta fraca `#5d6479`. A única cor é a das editorias, em pastel e sempre com a tinta por cima: `data-cat="<slug>"` define `--cat` (tokens `--cat-*`). Notícia sem editoria fica em `--cat-geral`. Tudo em `apps/web/src/styles/global.css`.
- **Fontes:** Newsreader (variável, títulos e textos de leitura) e Figtree 400/600 (interface: etiquetas, botões, metadados), servidas pelo próprio site via `@fontsource` (nenhuma chamada ao Google). A direção sorteou Erode; trocamos pela Newsreader porque ela existe no `@fontsource`.
- **Modo escuro:** segue o aparelho (`prefers-color-scheme`) e tem o botão "Modo escuro" no topo, que grava a escolha em `localStorage` (`papo-reto:tema`) e marca `data-tema` no `<html>` antes de pintar. No escuro só os tokens mudam: papel `#1d2230`, fundo `#14171f`, tinta `#e9ebf1` e as editorias em tons fundos. Cor nova sempre como token, nos dois temas, nunca solta no componente.
- **Regras da casa:** cinco tamanhos de letra (`--step-*`), um raio só (`--raio`, 22px) em cards, botões e etiquetas, sem gradiente, sem sombra, sem linha fina, sem rótulo acima de título (editoria, portal e hora vêm abaixo da manchete). Cards da mesma linha têm a mesma altura, inclusive "Em 1 minuto" e "Quem noticiou" na página da notícia. Barra de rolagem com trilho transparente.
- **Interação:** os botões de editoria em "Últimas notícias" filtram a lista ali mesmo e gravam a escolha no endereço (`?editoria=mundo`); a lista mostra 16 por vez ("Mostrar mais notícias"). Sem JavaScript, a lista aparece inteira.
- **Imagens:** sem fotos dos portais. Só imagens de acervos de domínio público ou CC0, nunca ao lado de uma notícia específica. Hoje o site é 100% tipográfico e gráfico.
- **Base:** mobile-first e acessível (HTML semântico, foco visível, contraste AA, alvos de 44px, `prefers-reduced-motion`).
- **Conferir:** `node ~/.claude/skills/design-taste-frontend/scripts/inspect.mjs http://localhost:4321/papo-reto/ --allow few-pictures,no-footage` com o `npm run preview -w @papo-reto/web` rodando. As manchetes longas de notícia passam de duas linhas (e por isso a página do acontecimento não tem um elemento dominante): é conteúdo de terceiros, não cortamos. A fonte diferente da sorteada também é aviso esperado.

## Comandos

- `npm install`: dependências. No Windows, se o PowerShell bloquear scripts, use `npm.cmd` ou o Prompt de Comando.
- `npm test`: testes (Vitest). `npm run typecheck`: TypeScript estrito em todos os pacotes e `astro check` no site.
- `npm run coletar`: lê os feeds, grava no banco e, se houver `GEMINI_API_KEY`, gera os resumos. Lê o `.env`.
- `npm run dados:site`: gera `apps/web/public/dados/*.json` a partir do banco.
- `npm run build:web` / `npm run dev:web`: build e servidor de desenvolvimento do site. Sem `public/dados/`, fora do CI, o site usa `apps/web/src/dados-exemplo/`.
- `npm run db:nova -- nome`: cria uma migration (se a CLI travar no fim, o arquivo já foi criado).
- `npm run db:status`: compara as migrations locais e remotas (exige `npx supabase login` e `npx supabase link`).
- Versões exatas (`.npmrc` com `save-exact`). TypeScript fica no 6.x porque o `@astrojs/check` ainda não aceita o 7.

## Código

- `packages/core`: `ColetarNoticias`, `ResumirEventos`, `GerarDadosDoSite`, `normalizarUrl`, portas e o contrato dos JSONs (`casos-de-uso/gerar-dados-do-site.ts`). Falsos em memória para testes em `src/testes/falsos.ts`.
- `packages/infra`: Postgres (`postgres`), leitor de RSS (`fast-xml-parser`, com timeout, User-Agent e ISO-8859-1), Gemini (`@google/genai`, prompt versionado em `gemini/prompt.ts`), logs JSON.
- `apps/coletor`: `coletar.ts` e `dados-do-site.ts`, só montam dependências.
- `apps/web`: Astro estático, base `/papo-reto/`.
- `.github/workflows/publicar.yml`: a cada 30 min coleta, gera os dados, faz o build e publica no Pages.

## Fluxo de trabalho

- Branch principal: `main`. Um push em `main` que mexe em `supabase/migrations/` é aplicado direto no banco de produção.
- Commits pequenos, com mensagens em português.
- Antes de dar uma tarefa por concluída, rode os testes e a checagem de tipos.
- Quando uma decisão mudar, atualize este arquivo e o README.
- As tarefas ficam em `docs/tarefas/`.
