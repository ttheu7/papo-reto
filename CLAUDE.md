# Papo Reto

Portal de notícias gratuito para o público jovem. Reúne o que os principais portais do Brasil e do mundo publicam (via RSS), agrupa as matérias sobre um mesmo acontecimento (o "evento") e explica cada um em linguagem simples, com resumos gerados por IA (Gemini, com a Groq de reserva) e link para todas as matérias originais.

Projeto acadêmico em grupo (Ciência da Computação, Unoesc Videira, disciplina PRATIC IV), com entrega de uma versão beta.

**Idioma:** os textos da interface são em português do Brasil.

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
- `packages/infra`: adaptadores que implementam as portas (Postgres, leitor de RSS, Gemini, Groq, Mistral).
- `apps/*`: pontos de entrada. Só montam as dependências e chamam os casos de uso.
- Erros tipados (domínio x infraestrutura), tratados em cada ponto de entrada, com logs estruturados que levam o id da execução.
- Interfaces só onde existe chance real de troca (banco, IA, fonte de dados). Sem cerimônia desnecessária.
- Testes com Vitest. Casos de uso testados com repositórios falsos em memória, sem banco e sem rede.

## Banco de dados (Supabase, Postgres)

O schema está em `supabase/migrations/`, e os dados iniciais em `supabase/seed.sql`. Os dois já foram aplicados no projeto real.

- `categoria(id, slug único, nome)`: lista fechada; a IA só classifica com esses slugs.
- `fonte(id, nome, url_feed único, url_site, politica_uso, exige_assinatura, ativa, ultima_coleta_em, falhas_seguidas, ultimo_erro)`: um feed por linha. Feeds do mesmo portal usam o mesmo `nome`, porque a cobertura conta portais pelo nome.
- `evento(id uuid, categoria_id, criado_em, atualizado_em)`: o acontecimento, que vira um card.
- `noticia(id uuid, fonte_id, evento_id NOT NULL, titulo, url única e canônica, descricao_original, publicada_em, coletada_em, vetor)`. `vetor` (pgvector, schema `extensions`, sem dimensão fixa) é o embedding do título com o começo da descrição (`textoParaVetor`), de uso interno do agrupamento.
- `resumo(id uuid, evento_id, modelo_ia_id, titulo, texto, versao_prompt, tokens_entrada, tokens_saida, custo_estimado, busca_imagem, criado_em)`: o vigente é o mais recente do evento. `busca_imagem` são as palavras-chave (em inglês) que a IA sugeriu para a imagem ilustrativa, ou null para o acontecimento não ter imagem.
- `imagem(evento_id pk, provedor, url, largura, altura, cor, autor, url_autor, url_pagina, busca, criado_em)`: a imagem ilustrativa escolhida no acervo (só o endereço e o crédito; a imagem é exibida direto do acervo). Linha com `url` nula marca "procurou e não achou", para não buscar de novo. Sai em cascata com o evento.
- `modelo_ia(id, provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo, reserva)`: no máximo um ativo (o principal dos resumos, hoje `gemini-3.5-flash-lite`) e no máximo um de reserva (hoje Groq `llama-3.3-70b-versatile`). O código lê o nome dos modelos daqui.
- `execucao(id uuid, iniciada_em, finalizada_em, status, novas_noticias, resumos_gerados, erros jsonb)`: uma linha por rodada do coletor.
- `doacao`: ainda não usada.
- View `vw_evento_card`: título (do resumo ou da primeira manchete), resumo, categoria, `fontes` (nomes) e `cobertura` (portais distintos).
- Gatilho `tocar_evento`: inserir notícia ou resumo atualiza `evento.atualizado_em`.
- pg_cron (`limpeza_diaria`, 6h UTC): apaga `descricao_original` depois de 30 dias, `vetor` depois de 3 dias, eventos parados há 180 dias (em cascata), eventos órfãos e execuções com mais de 30 dias.

Regras:

- Mudou o schema? Nova migration (`npm run db:nova -- nome`). Nunca edite uma migration já aplicada. O `banco.yml` aplica no push para `main`.
- RLS ligado em todas as tabelas, sem políticas, de propósito. O navegador nunca lê o banco direto.
- Antes de inserir notícias, filtre as URLs que já existem. Depois, agrupe: cada notícia nova entra no acontecimento das últimas 48 horas com o título mais parecido ou abre um novo (`agruparNoticias`, em `packages/core/src/agrupamento.ts`). Dois títulos são do mesmo fato por um de dois critérios:
  - **Vetores (Mistral, `mistral-embed`):** o vetor é do título com os primeiros 500 caracteres da descrição do feed (`textoParaVetor`), e o cosseno precisa ser de pelo menos `SEMELHANCA_MINIMA_VETOR` (0,88). Na calibragem com o banco (5/11/2026), o mesmo fato ficou de 0,884 para cima, inclusive inglês com português, e fatos diferentes do mesmo assunto ficaram até 0,872. Só com o título, os dois grupos se misturavam entre 0,83 e 0,89. As notícias novas são vetorizadas numa chamada por rodada; a comparação com as notícias já gravadas roda no banco (`parecidosPorVetor`, operador `<=>` do pgvector), para os vetores não trafegarem. Calibre o limite com `npm run calibrar:agrupamento`.
  - **Palavras (sempre, e reserva sem `MISTRAL_API_KEY` ou se a Mistral falhar):** 3 ou mais palavras importantes em comum e pelo menos metade do título mais curto; acentos, plural simples, palavras vazias, datas e anos não contam. Limitação conhecida: notícias policiais de vocabulário genérico ("homem morto a tiros… motocicleta") podem se juntar sem ser o mesmo fato.
  - **Títulos de programa** ("VÍDEOS: Bom Dia…", "Vídeos do g1…", "Assista…", `ehTituloDePrograma`) não são notícia: a coleta os descarta. Os que entraram antes desse filtro nunca se agrupam, não vão para os JSONs do site nem para a IA (`soProgramas`). "Vídeo mostra…", no singular, é notícia e passa.
  A gravação é uma transação só, com `on conflict (url) do nothing` como rede de segurança. Falha da Mistral vira erro de etapa `agrupamento` na execução, sem mudar o status.
- Um acontecimento que já tem resumo não é resumido de novo quando ganha matérias: o resumo continua o da primeira rodada.
- Normalize as URLs antes de deduplicar. Os links da Folha vêm como `redir.folha.com.br/...*https://...`: use o trecho depois do `*`. Remova parâmetros de rastreio (`utm_*` e parecidos).
- Plano gratuito: 500 MB de banco (acima disso ele fica só leitura), 5 GB de tráfego por mês, pausa depois de uma semana sem atividade e nenhum backup automático. Guarde só o necessário.

## Conexão com o banco

- `SUPABASE_DB_URL` é a string do **Session pooler** (IPv4, porta 5432). A conexão direta (`db.<ref>.supabase.co`) só funciona em IPv6 e falha no GitHub Actions.
- O coletor usa um driver Postgres (por exemplo, `postgres`) com essa URL, o que permite transações e `on conflict`.
- Supabase CLI 3, instalada via npm: `db push`, `migration list` e `migration repair` miram o banco **local** por padrão. Para o Supabase, use sempre `--remote` (ou `--remote="<url>"`). Comandos não interativos precisam de `--yes`.

## IA (Gemini, Groq e Mistral)

Três provedores, todos no plano gratuito, cada um com um papel:

| Provedor | Papel | Chave | Sem a chave |
|---|---|---|---|
| Gemini (`@google/genai`) | Resumos e editoria: o principal | `GEMINI_API_KEY` | A Groq assume |
| Groq (API compatível com a da OpenAI, via `fetch`) | Resumos de reserva: assume o mesmo lote e o resto da rodada quando o Gemini falha ou fica sem cota | `GROQ_API_KEY` | Sem reserva |
| Mistral (`mistral-embed`, via `fetch`) | Vetores (título + descrição) para o agrupamento | `MISTRAL_API_KEY` | Agrupamento só por palavras |

E dois acervos de imagens gratuitas, para a imagem ilustrativa (ver "Imagens ilustrativas"): Pexels (`PEXELS_API_KEY`, o primeiro) e Unsplash (`UNSPLASH_ACCESS_KEY`, a reserva). Sem as duas chaves, o site segue só com texto.

- Os três planos gratuitos têm cotas baixas, por minuto e por dia, que mudam sem aviso e só aparecem no painel de cada um (AI Studio, console da Groq e console da Mistral). Sem novas tentativas: insistir só gasta cota. HTTP 429 vira `ErroCotaIa`.
- Processe em lote: vários eventos por chamada, com resposta em JSON.
- Nunca resuma o mesmo evento duas vezes.
- Tenha uma alternativa: sem chave, ou com a cota esgotada, o site mostra a manchete original, a fonte e o link.
- O resumo sai **só** dos títulos e descrições dos feeds, sem inventar fatos. A classificação usa apenas os slugs de `categoria`.
- No plano gratuito o Google pode usar o conteúdo enviado; a Mistral diz que os dados da API não treinam modelos; a política da Groq não foi conferida. Por isso, só vai para as IAs o texto público dos feeds. Nunca envie dados de usuários.
- O texto do resumo tem de três a quatro frases (50 a 80 palavras); o código corta em quatro (`limitarFrases`). Prompt atual: `resumo-v3-2026-11-05` (a v3 acrescentou o campo `imagem`), em `packages/infra/src/ia/prompt.ts`, o mesmo para Gemini e Groq (a Groq recebe só um pedido extra de formato: objeto `{"resumos": [...]}`, exigência do modo JSON dela).
- O campo `imagem` do resumo são 2 a 4 palavras-chave EM INGLÊS para buscar uma foto genérica do assunto (lugares, objetos, paisagens, cenas sem pessoas identificáveis), nunca nomes de pessoas, marcas, clubes, empresas ou partidos. É null para crime, violência, morte, acidente, desastre ou tragédia com vítimas, doença de alguém e quando o assunto principal é uma pessoa específica: nesses casos uma foto ilustrativa engana ou fere. O código limpa o texto (`limparBuscaDeImagem`).
- Registre a `versao_prompt`, os tokens e o modelo usado.

## Conteúdo e regras legais

- Exiba só título, resumo próprio e link para a matéria original. Texto integral, com crédito, apenas de fontes com `politica_uso = 'republicacao_com_credito'` (Agência Brasil).
- `descricao_original` é de uso interno: nunca vai para JSON público, página, MCP ou view.
- Sem imagens dos portais (direito autoral). Fotos de redes sociais por embed também não: os scripts das plataformas rastreiam quem lê (ver o histórico da decisão no README, em Segurança e privacidade).
- **Imagens ilustrativas** (1.0): só de acervos gratuitos com licença para isso (Pexels e Unsplash; o Pixabay fica de fora porque exige baixar e guardar as imagens). Elas não mostram o fato, só ilustram o assunto, por isso: legenda sempre "Imagem ilustrativa · Foto: <autor> / <acervo>", com link para o fotógrafo e para a foto (no Unsplash, com `utm_source=papo_reto&utm_medium=referral`); `alt` vazio (o texto da notícia já diz tudo); exibidas direto do acervo com `referrerpolicy="no-referrer"`; nada de imagem em notícia sensível (a IA devolve null). Regras das APIs: o Unsplash exige exibir pelo endereço que a API devolve e avisar o uso pelo `download_location` (`AcervoUnsplash` faz isso); a Pexels pede o crédito com link para a foto. Cotas: Pexels 200 buscas por hora e 20 mil por mês; Unsplash 50 por hora no modo de teste. Por isso `IlustrarEventos` procura no máximo 15 acontecimentos por rodada com a Pexels (a primeira), ou 8 só com o Unsplash (cada imagem usada gasta duas chamadas: a busca e o aviso de uso), e o acervo que fica sem cota sai da rodada. No Unsplash basta a permissão "Acesso público" e a Access Key (a Secret Key não é usada). Para passar do modo de teste, peça a aprovação de produção no painel do Unsplash depois que o site estiver no ar com os créditos.
- Matérias de fontes com `exige_assinatura` levam a etiqueta "Exige assinatura".
- Todo resumo avisa que foi gerado por IA, mostra quais matérias foram usadas e oferece um jeito de reportar erro. Na beta, o botão abre uma issue no GitHub já preenchida (`linkParaReportar`, em `apps/web/src/lib/formato.ts`): exige conta no GitHub e o report fica público. Na 1.0, isso vira um formulário próprio, sem conta (`docs/tarefas/02-reportar-erro.md`).
- Público jovem: nada de anúncio com perfilamento (ECA Digital, Lei 15.211/2025) e coleta mínima de dados pessoais (LGPD).

## Segredos

| Onde | Nome | Para quê |
|---|---|---|
| GitHub Actions | `SUPABASE_DB_URL` | Migrations e coletor (Session pooler, com a senha) |
| GitHub Actions | `GEMINI_API_KEY` | Resumos (principal). Opcional |
| GitHub Actions | `GROQ_API_KEY` | Resumos (reserva). Opcional: sem as duas, o coletor pula os resumos |
| GitHub Actions | `MISTRAL_API_KEY` | Vetores do agrupamento. Opcional: sem ela, o agrupamento usa só as palavras |
| GitHub Actions | `PEXELS_API_KEY` | Imagens ilustrativas (o primeiro acervo). Opcional |
| GitHub Actions | `UNSPLASH_ACCESS_KEY` | Imagens ilustrativas (a reserva). Opcional: sem as duas, o site segue só com texto |
| `.env` local | As mesmas variáveis | Rodar o coletor na máquina |

Nunca coloque segredos no código, em logs, em JSONs ou no site. Nos workflows, os segredos entram só nos passos que precisam deles (`env` no passo), nunca no passo de `npm ci`.

## Visual

As telas de `docs/prototipo/` mostram só o funcionamento (quais páginas e blocos existem), não o design. O design foi feito com a skill taste-skill (direção "a página é o objeto", seed 2036481194) e revisado com a web-design-guidelines. Ele substituiu a primeira direção ("one motif"), que o grupo achou escura e quadrada demais.

- **Ideia:** o site é a primeira página do jornal da edição atual. Cabeçalho com data, "Edição das HHhMM" e o nome grande; manchete grande ao lado da coluna "Também hoje"; blocos por editoria; lista de últimas notícias. Cada parte é uma folha de papel (card) sobre o fundo.
- **Cores:** neutras. Fundo `#efefed`, folhas `#ffffff`, folha interna `#f5f5f3`, rodapé `#e2e3e0`, tinta azul-marinho `#1f2b4d` (texto e botões), tinta fraca `#5d6479`. A única cor é a das editorias, em pastel e sempre com a tinta por cima: `data-cat="<slug>"` define `--cat` (tokens `--cat-*`). Notícia sem editoria fica em `--cat-geral`. Tudo em `apps/web/src/styles/global.css`.
- **Fontes:** Newsreader (variável, títulos e textos de leitura) e Figtree 400/600 (interface: etiquetas, botões, metadados), servidas pelo próprio site via `@fontsource` (nenhuma chamada ao Google). A direção sorteou Erode; trocamos pela Newsreader porque ela existe no `@fontsource`.
- **Modo escuro:** segue o aparelho (`prefers-color-scheme`) e tem o botão "Modo escuro" no topo, que grava a escolha em `localStorage` (`papo-reto:tema`) e marca `data-tema` no `<html>` antes de pintar. No escuro só os tokens mudam: papel `#1d2230`, fundo `#14171f`, tinta `#e9ebf1` e as editorias em tons fundos. Cor nova sempre como token, nos dois temas, nunca solta no componente.
- **Regras da casa:** cinco tamanhos de letra (`--step-*`), um raio só (`--raio`, 22px) em cards, botões e etiquetas, sem gradiente (a única exceção é o véu escuro sob o texto que fica por cima de foto, no Giro: ele garante o contraste), sem sombra, sem linha fina, sem rótulo acima de título (editoria, portal e hora vêm abaixo da manchete). Indicador de cobertura (`components/Medidor.astro`): uma barrinha por portal acompanhado, cheia para cada portal que noticiou; curto nas listas e na capa, grande em "Quem noticiou". Cards da mesma linha têm a mesma altura, inclusive "Em 1 minuto" e "Quem noticiou" na página da notícia. Barra de rolagem com trilho transparente.
- **Giro (`/giro/`, 1.0):** as manchetes em tela cheia, uma de cada vez, como vídeos curtos, mas só com texto. Página imersiva (`Base` com `imersivo`: sem cabeçalho do jornal nem rodapé), barra com "Papo Reto" (volta para a capa), "Giro" e o contador "3 de 66". Cada cena é um cartão na cor da editoria com a manchete, editoria, medidor, portais e hora, o resumo, o aviso de IA, "Entender o assunto" e "Ler na/no <portal>" (`lerNo`). A ordem é a mesma para todo mundo (`eventosDoGiro`: os de "hoje" por cobertura, depois os demais das 48 horas, dos mais novos aos mais antigos): nada é personalizado nem guardado (ECA Digital e LGPD). A lista acaba num cartão "Você viu tudo desta edição", sem rolagem infinita. Passar é rolar: no celular, deslizar de baixo para cima (encaixe obrigatório, `scroll-snap-stop: always`, um cartão por gesto, mesmo numa deslizada rápida); no computador, cada gesto da roda ou do touchpad passa exatamente um cartão (o script trava até 250 ms sem eventos, o que engole a inércia do touchpad). Ao passar, o cartão que sai pelo topo encolhe e esmaece e o próximo sobe (animação ligada à rolagem, `animation-timeline: view()`, só com `prefers-reduced-motion: no-preference`; a linha do tempo fica numa regra à parte porque o minificador a juntaria no atalho `animation` e o navegador a descartaria). Sem JavaScript, funciona com a rolagem que encaixa e os links "Anterior"/"Próxima"; com ele, o contador acompanha e as setas, j/k, Home e End também passam. Na tela de toque, os botões somem (passar é deslizar). Com imagem, a foto ocupa o cartão inteiro e o texto fica embaixo, em branco: o véu escuro acompanha o próprio bloco de texto (começa um fade acima dele e fica sólido atrás das letras), o que garante o contraste com qualquer foto e qualquer tamanho de manchete; o resumo vai em até 3 linhas (é nosso, não é manchete de terceiros), o botão vira `botao--papel` e o aviso de IA entra na linha do crédito. No menu, a pílula "Giro" vem na tinta, logo depois de "Últimas".
- **Interação:** os botões de editoria em "Últimas notícias" filtram a lista ali mesmo e gravam a escolha no endereço (`?editoria=mundo`); a lista mostra 16 por vez ("Mostrar mais notícias"). Sem JavaScript, a lista aparece inteira.
- **Imagens (1.0):** sem fotos dos portais. Imagem ilustrativa de acervo (ver "Conteúdo e regras legais") aparece em três lugares: no topo da página da notícia (`ImagemIlustrativa`, 21:9, 4:3 no celular, com a legenda de crédito embaixo); no Giro, ocupando o cartão inteiro; e na capa, só na manchete e só se ela tiver 3 ou mais portais (`imagemNaCapa`, `COBERTURA_PARA_FOTO_NA_CAPA`), depois do título e da linha de editoria, em 21:9. Nas listas, blocos e "Também hoje", nunca: o site continua com cara de jornal tipográfico. Texto sobre foto usa os tokens `--sobre-foto`, `--veu-foto` e `--toque-foto`, iguais nos dois temas (a foto não muda com o tema).
- **Base:** mobile-first e acessível (HTML semântico, foco visível, contraste AA, alvos de 44px, `prefers-reduced-motion`).
- **Conferir:** skills instaladas com `npx skills add Leonxlnx/taste-skill -g --agent claude-code -y` e `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -g --agent claude-code -y`. A web-design-guidelines revisa os arquivos de `apps/web/src` (acessibilidade e boas práticas). A taste-skill 2.5 não tem mais o `inspect.mjs`: o verificador é o `consistency.mjs`, que lê o build. Como o site usa a base `/papo-reto/`, sirva o build dentro de uma pasta com esse nome (leva alguns minutos):

  ```bash
  npm run build:web
  rm -rf /tmp/papo-reto-conferir && mkdir -p /tmp/papo-reto-conferir && cp -r apps/web/dist /tmp/papo-reto-conferir/papo-reto
  cd /tmp/papo-reto-conferir && node ~/.claude/skills/design-taste-frontend/scripts/consistency.mjs papo-reto/index.html --root . --widths 1440,390 --page editorial
  ```

  Ele mede o site como página de empresa, então boa parte das falhas é **esperada** e não se corrige:
  - **Sem fotos** (direito autoral): `no-visual`, `text-only`, `card-visual`.
  - **Várias seções por tela**, como numa primeira página de jornal: `hero-screen`, `section-height`, `one-section`, `one-heading`, `section-gaps`, `section-air`, `flush`, `fold-*`.
  - **Não é site de venda:** `nav` (o topo é o cabeçalho do jornal, sem ação principal), `cta`, `copy-headline` ("Papo Reto" é o nome), `copy-headings` e `copy-actions`/`copy-buttons` (manchetes são de terceiros).
  - **Cor por editoria:** `button-styles` e `button-contrast` (as pílulas pastel são as editorias).
  - **Grade de jornal:** `container-edges`, `off-grid`, `row-lines`, `row-gap` (blocos por editoria em número ímpar) e `heading-scale` (cinco tamanhos de letra só).
  - **Movimento:** `scroll-reveal` e `hidden-content` (a entrada ao rolar só existe com JavaScript, sob `.js`; sem ele tudo aparece) e `hover-move` (o card muda de cor no hover, não sobe).
  - **`text-contrast`:** pede 7:1 para a tinta fraca; a regra da casa é AA (4.5:1), e ela passa com 5.89:1.

  Falha real é qualquer outra, principalmente `assets` (CSS sem carregar invalida tudo), `spill`, `off-viewport`, `cut-text`, `overlap-text`, `contrast`, `reduced-motion` e `links` apontando para página que não existe.

## Comandos

- `npm install`: dependências. No Windows, se o PowerShell bloquear scripts, use `npm.cmd` ou o Prompt de Comando.
- `npm test`: testes (Vitest). `npm run typecheck`: TypeScript estrito em todos os pacotes e `astro check` no site.
- `npm run coletar`: lê os feeds, agrupa (com vetores, se houver `MISTRAL_API_KEY`), grava no banco e, se houver `GEMINI_API_KEY` ou `GROQ_API_KEY`, gera os resumos; com `PEXELS_API_KEY` ou `UNSPLASH_ACCESS_KEY`, procura as imagens ilustrativas. Lê o `.env`.
- `npm run calibrar:agrupamento`: vetoriza as manchetes dos dados de exemplo (ou de um `eventos.json` passado depois de `--`) e lista os pares mais parecidos, para conferir o limite do agrupamento. Com `-- --banco [--horas 48] [--limite 120]`, lê as notícias recentes do banco (só leitura) e compara lado a lado o vetor só do título e o do título com a descrição (`textoParaVetor`). Precisa de `MISTRAL_API_KEY`; não grava nada. A coleta usa título + descrição.
- `npm run dados:site`: gera `apps/web/public/dados/*.json` a partir do banco.
- `npm run build:web` / `npm run dev:web`: build e servidor de desenvolvimento do site. Sem `public/dados/`, fora do CI, o site usa `apps/web/src/dados-exemplo/`.
- `npm run db:nova -- nome`: cria uma migration (se a CLI travar no fim, o arquivo já foi criado).
- `npm run db:status`: compara as migrations locais e remotas (exige `npx supabase login` e `npx supabase link`).
- Versões exatas (`.npmrc` com `save-exact`). TypeScript fica no 6.x porque o `@astrojs/check` ainda não aceita o 7.

## Código

- `packages/core`: `ColetarNoticias`, `ResumirEventos`, `IlustrarEventos`, `GerarDadosDoSite`, `normalizarUrl`, `agruparNoticias`, portas e o contrato dos JSONs (`casos-de-uso/gerar-dados-do-site.ts`). Falsos em memória para testes em `src/testes/falsos.ts`.
- `packages/infra`: Postgres (`postgres`), leitor de RSS (`fast-xml-parser`, com timeout, User-Agent e ISO-8859-1), Gemini (`@google/genai`), Groq, Mistral, Pexels e Unsplash (`fetch`, sem SDK, em `groq/`, `mistral/` e `acervos/`), prompt versionado em `ia/prompt.ts`, logs JSON.
- `apps/coletor`: `coletar.ts`, `dados-do-site.ts` e `calibrar-agrupamento.ts`, só montam dependências.
- `apps/web`: Astro estático, base `/papo-reto/`.
- `.github/workflows/publicar.yml`: a cada 30 min coleta, gera os dados, faz o build e publica no Pages.

## Fluxo de trabalho

- Branch principal: `main`. Um push em `main` que mexe em `supabase/migrations/` é aplicado direto no banco de produção.
- A beta (o que está na `main` e no ar) está congelada: nada muda nela. Tudo o que vem depois é da versão 1.0 e se acumula na branch `main-hs0u73`, que só vai para a `main` por PR quando o grupo pedir.
- Commits pequenos.
- Antes de dar uma tarefa por concluída, rode os testes e a checagem de tipos.
- Quando uma decisão mudar, atualize este arquivo e o README.
- O README segue sempre a mesma estrutura de seções, nesta ordem, cada uma com o seu emoji: Funcionalidades, Tecnologias, Arquitetura, Instalação, Configuração, Uso, API (dados públicos), Deploy, Roadmap, Segurança e privacidade, Licença, Contribuindo, Suporte e Agradecimentos, com o índice no topo. Informação nova entra na seção certa, e não numa seção nova. Se faltar alguma definição (contato, nomes, prazos), pergunte em vez de inventar.
- Licença MIT (`LICENSE`), só para o código. As matérias pertencem aos portais.
- As tarefas ficam em `docs/tarefas/`.
