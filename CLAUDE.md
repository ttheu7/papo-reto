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

- `categoria(id, slug único, nome)`: lista fechada; a IA só classifica com esses slugs. Na 1.0 entrou `games` (jogos eletrônicos e e-sports), separada de `esportes`.
- `fonte(id, nome, url_feed único, url_site, politica_uso, exige_assinatura, ativa, ultima_coleta_em, falhas_seguidas, ultimo_erro)`: um feed por linha. Feeds do mesmo portal usam o mesmo `nome`, porque a cobertura conta portais pelo nome. `categoria_id` é a editoria padrão de um feed de seção: o acontecimento criado por ele a herda, e a IA só classifica os que ficaram sem. Fontes da beta: g1, Folha, Estadão, CNN Brasil, BBC News Brasil, BBC News, Agência Brasil e Tecnoblog. Na 1.0 (migration `fontes_esporte_e_games`, escolha de 05/11/2026): UOL (notícias e esporte), ge, NPR (mundo), Fox News (mundo; o feed "latest" mistura opinião), HLTV, VLR.gg e GamesIndustry.biz (o lado econômico de games e e-sports), os três em `games`. O Dot Esports ficou de fora: responde HTTP 403 ao coletor. Matéria de outro portal acompanhado que aparece num feed (a Folha no feed do UOL, o ge no do g1) fica para o feed do dono (`ehDeOutroPortal`, em `packages/core/src/url.ts`: vale o site mais específico, por host e caminho de `url_site`), para sair com o nome e a etiqueta de assinatura certos. Antes de cadastrar uma fonte, rode `npm run testar:feeds`.
- `evento(id uuid, categoria_id, criado_em, atualizado_em)`: o acontecimento, que vira um card.
- `noticia(id uuid, fonte_id, evento_id NOT NULL, titulo, url única e canônica, descricao_original, publicada_em, coletada_em, vetor)`. `vetor` (pgvector, schema `extensions`, sem dimensão fixa) é o embedding do título com o começo da descrição (`textoParaVetor`), de uso interno do agrupamento.
- `resumo(id uuid, evento_id, modelo_ia_id, titulo, texto, versao_prompt, tokens_entrada, tokens_saida, custo_estimado, busca_imagem, criado_em)`: o vigente é o mais recente do evento. `busca_imagem` são as palavras-chave (em inglês) que a IA sugeriu para a imagem ilustrativa, ou null para o acontecimento não ter imagem.
- `imagem(evento_id pk, provedor, url, largura, altura, cor, autor, url_autor, url_pagina, busca, criado_em)`: a imagem ilustrativa escolhida no acervo (só o endereço e o crédito; a imagem é exibida direto do acervo). Linha com `url` nula marca "procurou e não achou", para não buscar de novo. Sai em cascata com o evento.
- `modelo_ia(id, provedor, modelo, custo_entrada_1m, custo_saida_1m, ativo, reserva)`: no máximo um ativo (o principal dos resumos, hoje `gemini-3.5-flash-lite`) e no máximo um de reserva (hoje Groq `llama-3.3-70b-versatile`). O código lê o nome dos modelos daqui.
- `execucao(id uuid, iniciada_em, finalizada_em, status, novas_noticias, resumos_gerados, erros jsonb)`: uma linha por rodada do coletor.
- `doacao`: ainda não usada.
- View `vw_evento_card`: título (do resumo ou da primeira manchete), resumo, categoria, `fontes` (nomes) e `cobertura` (portais distintos).
- Gatilho `tocar_evento`: inserir notícia ou resumo atualiza `evento.atualizado_em`.
- pg_cron `disparar-publicacao` (minutos 17 e 47, UTC): a função `disparar_publicacao` lê o token `github_token_publicar` do Vault e chama, com o pg_net, a API do GitHub (`workflow_dispatch` do `publicar.yml`). Existe porque o agendamento do GitHub atrasava e pulava rodadas (na beta, de 4 em 4 a 8 em 8 horas). Sem o token, ela só avisa. As respostas ficam em `net._http_response` (204 = aceito). Na 2.0, o disparo vai para um Cron Trigger da Cloudflare, junto com o MCP público (tarefa 03). Esta função e a `limpeza_diaria` têm o `execute` revogado de `anon` e `authenticated`: só o banco as chama, nunca a API.
- pg_cron (`limpeza_diaria`, 6h UTC): apaga `descricao_original` depois de 30 dias, `vetor` depois de 3 dias, eventos parados há 90 dias (em cascata; eram 180 na beta), eventos órfãos e execuções com mais de 30 dias. Medição de 06/11/2026: cerca de 1.100 notícias por dia só com os feeds da beta, uns 1.400 com os da 1.0; com 180 dias o equilíbrio estimado chegava perto dos 500 MB, com 90 fica perto de 290 MB (migration `retencao_de_90_dias`).

Regras:

- Mudou o schema? Nova migration (`npm run db:nova -- nome`). Nunca edite uma migration já aplicada. O `banco.yml` aplica no push para `main`.
- RLS ligado em todas as tabelas, sem políticas, de propósito. O navegador nunca lê o banco direto.
- Antes de inserir notícias, filtre as URLs que já existem. Depois, agrupe: cada notícia nova entra no acontecimento das últimas 48 horas com o título mais parecido ou abre um novo (`agruparNoticias`, em `packages/core/src/agrupamento.ts`). Dois títulos são do mesmo fato por um de dois critérios:
  - **Vetores (Mistral, `mistral-embed`):** o vetor é do título com os primeiros 500 caracteres da descrição do feed (`textoParaVetor`), e o cosseno precisa ser de pelo menos `SEMELHANCA_MINIMA_VETOR` (0,88). Na calibragem com o banco (5/11/2026), o mesmo fato ficou de 0,884 para cima, inclusive inglês com português, e fatos diferentes do mesmo assunto ficaram até 0,872. Só com o título, os dois grupos se misturavam entre 0,83 e 0,89. As notícias novas são vetorizadas numa chamada por rodada; a comparação com as notícias já gravadas roda no banco (`parecidosPorVetor`, operador `<=>` do pgvector), para os vetores não trafegarem. Calibre o limite com `npm run calibrar:agrupamento`.
  - **Palavras (sempre, e reserva sem `MISTRAL_API_KEY` ou se a Mistral falhar):** 3 ou mais palavras importantes em comum e pelo menos metade do título mais curto; acentos, plural simples, palavras vazias, datas e anos não contam. Limitação conhecida: notícias policiais de vocabulário genérico ("homem morto a tiros… motocicleta") podem se juntar sem ser o mesmo fato.
  - **Títulos de programa** ("VÍDEOS: Bom Dia…", "Vídeos do g1…", "Assista…"), matérias que são só um vídeo ("VÍDEO: tutora denuncia…", com dois-pontos) e páginas de jogo ao vivo do ge ("São Paulo x Ceará - … - Ao vivo - globoesporte.com", `ehTituloDePrograma`) não são notícia: a coleta os descarta. Os que entraram antes desse filtro nunca se agrupam, não vão para os JSONs do site nem para a IA (`soProgramas`). "Vídeo mostra…", no singular, é notícia e passa.
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

E dois acervos de imagens gratuitas, para a imagem ilustrativa (ver "Imagens ilustrativas"): Pexels (`PEXELS_API_KEY`, o primeiro) e Unsplash (`UNSPLASH_API_KEY`, a reserva). Sem as duas chaves, o site segue só com texto.

- Os três planos gratuitos têm cotas baixas, por minuto e por dia, que mudam sem aviso e só aparecem no painel de cada um (AI Studio, console da Groq e console da Mistral). Sem novas tentativas: insistir só gasta cota. HTTP 429 vira `ErroCotaIa`.
- Processe em lote: vários eventos por chamada, com resposta em JSON.
- Nunca resuma o mesmo evento duas vezes.
- Tenha uma alternativa: sem chave, ou com a cota esgotada, o site mostra a manchete original, a fonte e o link.
- O resumo sai **só** dos títulos e descrições dos feeds, sem inventar fatos. A classificação usa apenas os slugs de `categoria`.
- No plano gratuito o Google pode usar o conteúdo enviado; a Mistral diz que os dados da API não treinam modelos; a política da Groq não foi conferida. Por isso, só vai para as IAs o texto público dos feeds. Nunca envie dados de usuários.
- O texto do resumo tem de três a quatro frases (50 a 80 palavras); o código corta em quatro (`limitarFrases`). Prompt atual: `resumo-v4-2026-11-05` (a v3 acrescentou o campo `imagem`; a v4, a separação entre "games" e "esportes"), em `packages/infra/src/ia/prompt.ts`, o mesmo para Gemini e Groq (a Groq recebe só um pedido extra de formato: objeto `{"resumos": [...]}`, exigência do modo JSON dela).
- O campo `imagem` do resumo são 2 a 4 palavras-chave EM INGLÊS para buscar uma foto genérica do assunto (lugares, objetos, paisagens, cenas sem pessoas identificáveis), nunca nomes de pessoas, marcas, clubes, empresas ou partidos. É null para crime, violência, morte, acidente, desastre ou tragédia com vítimas, doença de alguém e quando o assunto principal é uma pessoa específica: nesses casos uma foto ilustrativa engana ou fere. O código limpa o texto (`limparBuscaDeImagem`).
- Registre a `versao_prompt`, os tokens e o modelo usado.

## Conteúdo e regras legais

- Exiba só título, resumo próprio e link para a matéria original. Texto integral, com crédito, apenas de fontes com `politica_uso = 'republicacao_com_credito'` (Agência Brasil).
- `descricao_original` é de uso interno: nunca vai para JSON público, página, MCP ou view.
- Sem imagens dos portais (direito autoral). Fotos de redes sociais por embed também não: os scripts das plataformas rastreiam quem lê (ver o histórico da decisão no README, em Segurança e privacidade).
- **Imagens ilustrativas** (1.0): só de acervos gratuitos com licença para isso (Pexels e Unsplash; o Pixabay fica de fora porque exige baixar e guardar as imagens). Elas não mostram o fato, só ilustram o assunto, por isso: legenda sempre "Imagem ilustrativa · Foto: <autor> / <acervo>", com link para o fotógrafo e para a foto (no Unsplash, com `utm_source=papo_reto&utm_medium=referral`); `alt` vazio (o texto da notícia já diz tudo); exibidas direto do acervo com `referrerpolicy="no-referrer"`; nada de imagem em notícia sensível (a IA devolve null). Regras das APIs: o Unsplash exige exibir pelo endereço que a API devolve e avisar o uso pelo `download_location` (`AcervoUnsplash` faz isso); a Pexels pede o crédito com link para a foto. Cotas: Pexels 200 buscas por hora e 20 mil por mês; Unsplash 50 por hora no modo de teste. Por isso `IlustrarEventos` procura no máximo 15 acontecimentos por rodada com a Pexels (a primeira), ou 8 só com o Unsplash (cada imagem usada gasta duas chamadas: a busca e o aviso de uso), e o acervo que fica sem cota sai da rodada. No Unsplash basta a permissão "Acesso público" e a Access Key, que vai em `UNSPLASH_API_KEY` (a Secret Key não é usada). Para passar do modo de teste, peça a aprovação de produção no painel do Unsplash depois que o site estiver no ar com os créditos.
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
| GitHub Actions | `UNSPLASH_API_KEY` | Imagens ilustrativas (a reserva). Opcional: sem as duas, o site segue só com texto |
| Vault do Supabase | `github_token_publicar` | Token fine-grained do GitHub (só este repositório, só "Actions: Read and write") para o banco disparar a publicação. Vence: renovar com `vault.update_secret` (README, Deploy) |
| `.env` local | As mesmas variáveis | Rodar o coletor na máquina |

Nunca coloque segredos no código, em logs, em JSONs ou no site. Nos workflows, os segredos entram só nos passos que precisam deles (`env` no passo), nunca no passo de `npm ci`.

## Visual

As telas de `docs/prototipo/` mostram só o funcionamento (quais páginas e blocos existem), não o design. A beta usou a direção "a página é o objeto" (taste-skill, cartões de cantos redondos sobre o fundo); na 1.0 o grupo achou que aquilo parecia uma peça de apresentação, não um site, e escolheu entre três direções (capturas em 05/11/2026) a **"primeira página clássica"**: um jornal de papel na tela.

- **Ideia:** a página é uma folha contínua de jornal, sem cartões soltos. Linha de serviço no topo (data, "Edição das HHhMM", "Grátis · sem anúncio" e o botão de tema), o nome em letra gótica entre fios, um fio forte (3px; era duplo, virou um só em 06/11/2026 para não somar fios) e o menu em versalete. Na capa: manchete com chapéu, foto (se quente), resumo com capitular e "Também hoje" na coluna ao lado, separada por fio; as editorias em colunas com fio entre elas; as últimas notícias em colunas de jornal (`columns`, com fio); a carta ao leitor e o expediente; o rodapé como expediente.
- **Identidade "Feito por estudantes"** (escolhida entre três propostas em 05/11/2026): o jornal assina que é de estudantes, grátis e sem nada em troca.
  - Edição numerada na linha de serviço: "Ano I · Nº 128 · Edição das HHhMM" (`lib/edicao.ts`, com teste). Nº conta os dias desde a estreia da beta (`ESTREIA`, 04/11/2026 = Nº 1) no horário de Brasília; o ano vem em romano. No celular, só "4 de novembro", "Edição das HHhMM" e o ícone do tema, numa linha só.
  - Carimbo redondo (`components/Carimbo.astro`): "Grátis · sem anúncio · sem cadastro" no anel e "Feito por estudantes" no meio, girado, só na capa. No computador fica na margem direita, centrado na altura do nome e do lema, sem encostar nos fios. No celular (até 760 px) ele não cabe sem espremer o lema, então vira uma faixa em versalete entre fios finos, abaixo do lema: "Feito por estudantes · grátis" (escolha de 05/11/2026).
  - Selo "Papo reto" (contorno, girado) abrindo o resumo da manchete na capa, no lugar da capitular; carimbo "Explicado" no rótulo "Em 1 minuto" da notícia, quando há resumo.
  - Tudo na cor da tinta, sem cor nova. Carimbo e selos são decorativos (`aria-hidden` ou `aria-label` no carimbo).
- **Cores:** papel e tinta, sem cor de editoria. Papel `#f5f2ea`, papel interno `#ece7dc`, tinta `#16181d`, tinta fraca `#555a63` (AA nos dois papéis), fio forte na cor da tinta e fio fino `#cdc6b7` (decorativo). Tudo em `apps/web/src/styles/global.css`; cor nova sempre como token, nos dois temas.
- **Fontes:** UnifrakturMaguntia (gótica) só no nome do jornal (`--gotica`); Newsreader (variável) nos títulos e textos de leitura, que é a fonte do corpo; Figtree 400/600 na interface (chapéus, rótulos, menus, botões, linhas de serviço), quase sempre em versalete com espaçamento. Todas servidas pelo próprio site via `@fontsource` (nenhuma chamada ao Google). Texto de interface precisa declarar `var(--sans)`, porque o corpo é serifado.
- **Modo escuro:** o "jornal à noite". Segue o aparelho (`prefers-color-scheme`) e tem o botão "Modo escuro" na linha de serviço (até 1100 px, só o ícone; o nome continua para leitor de tela), que grava a escolha em `localStorage` (`papo-reto:tema`) e marca `data-tema` no `<html>` antes de pintar. Só os tokens mudam: papel `#15171b`, papel interno `#1e2127`, tinta `#ece7dc`, tinta fraca `#a8a295`, fio fino `#3b3e46`.
- **Regras da casa:** cinco tamanhos de letra (`--step-*`); cantos retos (`--raio: 0`); sem sombra; sem gradiente (a única exceção é o véu escuro sob o texto que fica por cima de foto, no Giro); fios no lugar de caixas: `.rotulo` (versalete entre fio forte e fio fino) abre cada seção, fio fino separa itens e colunas. Na página da notícia: sem foto no topo, o cabeçalho não tem fio de baixo (`Cabecalho semFio`) e quem abre a área das colunas é o fio forte dos rótulos "Em 1 minuto" e "Quem noticiou", com mais espaço depois do título; com foto, o fio do cabeçalho volta e a foto fica entre ele e os rótulos. Os dois rótulos ficam no estilo da casa, com a mesma altura (64 px, para o carimbo "Explicado" ficar a uns 11 px de cada fio), e o fio fino entre as colunas vai de cima a baixo (escolha de 06/11/2026, depois de testar só o fio de baixo). Na página "Como funciona", o cabeçalho também não tem fio de baixo, e o espaço entre o texto de abertura e as três colunas é o mesmo que entre o menu e o chapéu "Expediente" (`calc(var(--respiro) - 22px)`), e os portais acompanhados ficam numa seção própria, "Os portais que a gente lê" (nome em destaque, com o carimbo de cifrão `SeloAssinatura` ao lado quando o portal exige assinatura, e o endereço embaixo; 5 colunas no computador, 2 no celular), vinda de `portais.json` (fontes ativas agrupadas pelo nome). Sem logos: são marcas registradas dos portais, e a regra da casa é não usar imagem deles. A lista de "Quem noticiou" mostra duas fontes e meia (o script mede os três primeiros itens; sem JavaScript, 15rem) e rola o resto, sem barra visível; a metade cortada da terceira avisa que tem mais. Chapéu (`.chapeu`, a editoria em versalete) vem **acima** da manchete, como no jornal; a linha de serviço (`.servico`: medidor, portais, hora) vem abaixo. Item de notícia com `.item` e a manchete como link `.estica`, que cobre o item inteiro. Indicador de cobertura (`components/Medidor.astro`): um anel que enche na proporção dos portais acompanhados que noticiaram, com o número de portais no meio (escolhido em 05/11/2026 no lugar das barrinhas, que ficavam carregadas com 14 portais); curto nas listas (24 px), grande em "Quem noticiou" (96 px, com o número e o "de N" empilhados e centrados no anel, e a frase ao lado). Botões em versalete: cheio na tinta ou `botao--papel` (contorno). Barra de rolagem com trilho transparente.
- **Giro (`/giro/`, 1.0):** as manchetes em tela cheia, uma de cada vez, como vídeos curtos. Página imersiva (`Base` com `imersivo`: sem cabeçalho do jornal nem rodapé), barra com "Papo Reto" (volta para a capa), "Giro" e o contador "3 de 66". Cada cena é um cartão só com a manchete e uma linha pequena com o medidor, os portais e a hora: sem editoria, sem resumo e sem botões. O cartão inteiro abre a notícia (o link da manchete se estende sobre ele; os links do crédito ficam por cima). Sem imagem, o cartão é papel interno com fio forte em cima e a manchete grande. A ordem é a mesma para todo mundo (`eventosDoGiro`: os de "hoje" por cobertura, depois os demais das 48 horas, dos mais novos aos mais antigos): nada é personalizado nem guardado (ECA Digital e LGPD). A lista acaba num cartão "Você viu tudo desta edição", sem rolagem infinita. Passar é rolar: no celular, deslizar de baixo para cima (encaixe obrigatório, `scroll-snap-stop: always`, um cartão por gesto, mesmo numa deslizada rápida); no computador, cada gesto da roda ou do touchpad passa exatamente um cartão (o script trava até 250 ms sem eventos, o que engole a inércia do touchpad). Ao passar, o cartão que sai pelo topo encolhe e esmaece e o próximo sobe (animação ligada à rolagem, `animation-timeline: view()`, só com `prefers-reduced-motion: no-preference`; a linha do tempo fica numa regra à parte porque o minificador a juntaria no atalho `animation` e o navegador a descartaria). Sem JavaScript, funciona com a rolagem que encaixa e os links "Anterior"/"Próxima"; com ele, o contador acompanha e as setas, j/k, Home e End também passam. Na tela de toque, os botões somem (passar é deslizar). Com imagem, a foto cobre o cartão e o texto fica embaixo, em branco: a manchete vai em `--step-lead` (um degrau abaixo) para a foto ficar com pelo menos metade do cartão (medido com todos os cartões de exemplo: no pior caso 56% num iPhone SE, mediana de 65% a 76%), e a manchete nunca é cortada. O véu escuro acompanha o próprio bloco de texto (começa com um fade acima dele e fica sólido atrás das letras), o que garante o contraste com qualquer foto, e a linha de crédito fecha o cartão. No menu, "Giro" vem logo depois de "Últimas".
- **Interação:** os botões de editoria (versalete com contorno; o escolhido fica cheio) em "Últimas notícias" filtram a lista ali mesmo e gravam a escolha no endereço (`?editoria=mundo`); a lista mostra 16 por vez ("Mostrar mais notícias"). Sem JavaScript, a lista aparece inteira.
- **Imagens (1.0):** sem fotos dos portais. Imagem ilustrativa de acervo (ver "Conteúdo e regras legais") aparece em três lugares: no topo da página da notícia (`ImagemIlustrativa`, 21:9, 4:3 no celular, com a legenda de crédito embaixo); no Giro, ocupando o cartão inteiro; e na capa, só na manchete e só se ela tiver 3 ou mais portais (`imagemNaCapa`, `COBERTURA_PARA_FOTO_NA_CAPA`), logo abaixo do título, em 2:1. Nas listas, blocos e "Também hoje", nunca. Texto sobre foto usa os tokens `--sobre-foto`, `--veu-foto` e `--toque-foto`, iguais nos dois temas (a foto não muda com o tema).
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
  - **Grade de jornal:** `container-edges`, `off-grid`, `row-lines`, `row-gap` (blocos por editoria em número ímpar) e `heading-scale` (cinco tamanhos de letra só).
  - **Estética de jornal:** `button-styles` (botões cheios e de contorno, mais os filtros) e `hover-move` (itens sublinham a manchete no hover, não sobem).
  - **Movimento:** `scroll-reveal` e `hidden-content` (a entrada ao rolar só existe com JavaScript, sob `.js`; sem ele tudo aparece).
  - **`text-contrast`:** pede 7:1 para a tinta fraca; a regra da casa é AA (4.5:1), e ela passa com 5.89:1.

  Falha real é qualquer outra, principalmente `assets` (CSS sem carregar invalida tudo), `spill`, `off-viewport`, `cut-text`, `overlap-text`, `contrast`, `reduced-motion` e `links` apontando para página que não existe.

## Comandos

- `npm install`: dependências. No Windows, se o PowerShell bloquear scripts, use `npm.cmd` ou o Prompt de Comando.
- `npm test`: testes (Vitest). `npm run typecheck`: TypeScript estrito em todos os pacotes e `astro check` no site.
- `npm run coletar`: lê os feeds, agrupa (com vetores, se houver `MISTRAL_API_KEY`), grava no banco e, se houver `GEMINI_API_KEY` ou `GROQ_API_KEY`, gera os resumos; com `PEXELS_API_KEY` ou `UNSPLASH_API_KEY`, procura as imagens ilustrativas. Lê o `.env`.
- `npm run calibrar:agrupamento`: vetoriza as manchetes dos dados de exemplo (ou de um `eventos.json` passado depois de `--`) e lista os pares mais parecidos, para conferir o limite do agrupamento. Com `-- --banco [--horas 48] [--limite 120]`, lê as notícias recentes do banco (só leitura) e compara lado a lado o vetor só do título e o do título com a descrição (`textoParaVetor`). Precisa de `MISTRAL_API_KEY`; não grava nada. A coleta usa título + descrição.
- `npm run testar:feeds [-- <url>...]`: lê feeds candidatos com o mesmo leitor do coletor (sem banco e sem chave) e mostra, para cada um, se respondeu, quantos itens, quantos têm descrição e data, quantos saíram nas últimas 24 h e dois títulos. Sem endereços, testa a lista de candidatos de `apps/coletor/src/testar-feeds.ts`. Rode antes de cadastrar uma fonte.
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
- `.github/workflows/publicar.yml`: a cada 30 min (disparado pelo pg_cron do Supabase nos minutos 17 e 47; o `schedule` do próprio GitHub, a cada 3 horas, é só reserva) coleta, gera os dados, faz o build e publica no Pages. Cada rodada resume até 30 acontecimentos e busca até 15 imagens, então espaçar as rodadas também deixa acontecimentos sem resumo.

## Fluxo de trabalho

- Branch principal: `main`. Um push em `main` que mexe em `supabase/migrations/` é aplicado direto no banco de produção.
- A beta (o que está na `main` e no ar) está congelada: nada muda nela. Tudo o que vem depois é da versão 1.0 e se acumula na branch `main-hs0u73`, que só vai para a `main` por PR quando o grupo pedir.
- Commits pequenos.
- Nunca coloque o link da sessão do Claude (`claude.ai/code/session_…`) em commits, PRs, issues, comentários ou arquivos.
- Antes de dar uma tarefa por concluída, rode os testes e a checagem de tipos.
- Quando uma decisão mudar, atualize este arquivo e o README.
- O README segue sempre a mesma estrutura de seções, nesta ordem, cada uma com o seu emoji: Funcionalidades, Tecnologias, Arquitetura, Instalação, Configuração, Uso, API (dados públicos), Deploy, Roadmap, Segurança e privacidade, Licença, Contribuindo, Suporte e Agradecimentos, com o índice no topo. Informação nova entra na seção certa, e não numa seção nova. Se faltar alguma definição (contato, nomes, prazos), pergunte em vez de inventar.
- Licença MIT (`LICENSE`), só para o código. As matérias pertencem aos portais.
- As tarefas ficam em `docs/tarefas/`.
