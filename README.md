# 📰 Papo Reto

**Portal de notícias gratuito para o público jovem, com resumos em linguagem simples**

Site que reúne o que os principais portais do Brasil e do mundo publicam (via RSS), explica cada acontecimento em três ou quatro frases, com resumos gerados por IA (Gemini, com a Groq de reserva), e leva sempre para as matérias originais. O visual é o de uma primeira página de jornal, sem anúncios e sem coleta de dados de quem lê.

No ar em **https://ttheu7.github.io/papo-reto/** (versão beta). Projeto acadêmico de Ciência da Computação da Unoesc Videira, disciplina PRATIC IV.

---

## 📋 Índice

- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Arquitetura](#️-arquitetura)
- [Instalação](#-instalação)
- [Configuração](#️-configuração)
- [Uso](#-uso)
- [API (dados públicos)](#-api-dados-públicos)
- [Deploy](#-deploy)
- [Roadmap](#️-roadmap)
- [Segurança e privacidade](#️-segurança-e-privacidade)
- [Licença](#-licença)
- [Contribuindo](#-contribuindo)
- [Suporte](#-suporte)
- [Agradecimentos](#-agradecimentos)

---

## ✨ Funcionalidades

### Para quem lê:
- ✅ Primeira página com a manchete do momento, a coluna "Também hoje" e blocos por editoria
- ✅ Resumo "Em 1 minuto" de cada acontecimento, com aviso de que foi gerado por IA
- ✅ Indicador de cobertura: barrinhas mostram quantos dos portais acompanhados noticiaram cada assunto
- ✅ "Quem noticiou": link para todas as matérias originais, com a etiqueta "Exige assinatura" quando é o caso
- ✅ Lista de últimas notícias com filtro por editoria (`?editoria=mundo`), 16 por vez
- ✅ Páginas por editoria: Brasil, Mundo, Política, Economia, Tecnologia, Ciência, Educação, Pop e Esportes
- ✅ Página "Como funciona", explicando de onde vêm as notícias e onde entra a IA
- ✅ Botão para reportar erro em um resumo (na beta, abre uma issue no GitHub)
- ✅ Modo escuro, que segue o aparelho ou o botão no topo
- ✅ Funciona sem JavaScript, no celular e com leitor de tela

### Nos bastidores (automático):
- ✅ Coleta a cada 30 minutos de dez feeds (g1, Folha, Estadão, CNN Brasil, BBC News Brasil, BBC News, Agência Brasil e Tecnoblog)
- ✅ Normalização e deduplicação das URLs (redirecionamento da Folha, parâmetros `utm_*`)
- ✅ Agrupamento das matérias sobre o mesmo fato pelo sentido dos títulos (vetores da Mistral), inclusive entre português e inglês, com as palavras dos títulos como reserva
- ✅ Resumos e classificação por editoria em lote no Gemini, sem resumir o mesmo acontecimento duas vezes
- ✅ Groq de reserva: se o Gemini falha ou fica sem cota, ela resume o resto da rodada
- ✅ Sem chave da IA, ou com a cota esgotada, o site mostra a manchete original, o portal e o link
- ✅ Registro de cada rodada (novas notícias, resumos e erros) e, em cada resumo, do modelo, dos tokens e do custo
- ✅ Limpeza diária do banco para caber no plano gratuito

### Para o grupo (manutenção):
- ✅ Migrations aplicadas no Supabase a cada push na `main`
- ✅ Publicação automática no GitHub Pages, também disparável à mão
- ✅ Testes e checagem de tipos em todos os pacotes

---

## 🧰 Tecnologias

### Coletor (Node.js + TypeScript):
- **Node.js 22.23+** (recomendado: 24) e **TypeScript 6** estrito
- **postgres 4** - Driver Postgres, com transações e `on conflict`
- **fast-xml-parser 5** - Leitura dos feeds RSS (com timeout, User-Agent e ISO-8859-1)
- **@google/genai 2** - Cliente do Gemini
- **tsx** - Roda o TypeScript direto, lendo o `.env`

### Site:
- **Astro 7** - Site estático, base `/papo-reto/`
- **CSS próprio** - Tokens de cor, tipo e raio em `apps/web/src/styles/global.css`
- **Newsreader e Figtree** - Fontes servidas pelo próprio site via `@fontsource`, sem chamadas ao Google
- **JavaScript mínimo** - Só para o modo escuro e o filtro da lista

### Banco de dados:
- **Supabase (Postgres)** - Plano gratuito, região São Paulo, com `pg_cron` para a limpeza diária
- **Supabase CLI 3** - Migrations

### IA (planos gratuitos):
- **Gemini** (Google AI Studio) - Resumos e editoria; modelo principal lido da tabela `modelo_ia` (hoje `gemini-3.5-flash-lite`)
- **Groq** - Resumos de reserva; modelo de reserva lido da tabela `modelo_ia` (hoje `llama-3.3-70b-versatile`)
- **Mistral** (`mistral-embed`) - Vetores dos títulos para o agrupamento
- **pgvector** - Compara os vetores dentro do banco

### Infraestrutura e qualidade:
- **GitHub Actions** - Coleta agendada, migrations e publicação
- **GitHub Pages** - Hospedagem do site
- **Vitest 5** - Testes
- **npm workspaces** - Monorepo, com versões exatas (`save-exact`)

---

## 🏗️ Arquitetura

```
papo-reto/
├── packages/
│   ├── core/                        # Regras do negócio, sem banco, rede nem IA
│   │   └── src/
│   │       ├── entidades.ts         # Fonte, notícia, evento, resumo...
│   │       ├── portas.ts            # Interfaces (repositórios, leitor de feed, IA)
│   │       ├── erros.ts             # Erros de domínio e de infraestrutura
│   │       ├── url.ts               # normalizarUrl
│   │       ├── casos-de-uso/        # ColetarNoticias, ResumirEventos, GerarDadosDoSite
│   │       └── testes/falsos.ts     # Repositórios falsos em memória
│   └── infra/                       # Adaptadores que implementam as portas
│       └── src/
│           ├── postgres/            # Conexão e repositórios
│           ├── rss/                 # Leitor HTTP e interpretação dos feeds
│           ├── gemini/              # Serviço de IA e prompt versionado
│           ├── escritor-de-dados.ts # Grava os JSONs públicos
│           └── registro.ts          # Logs JSON com o id da execução
├── apps/
│   ├── coletor/src/
│   │   ├── coletar.ts               # Ponto de entrada da coleta e dos resumos
│   │   └── dados-do-site.ts         # Ponto de entrada do gerador de JSONs
│   └── web/                         # Site em Astro
│       ├── src/pages/               # Início, editoria, acontecimento, como funciona, 404
│       ├── src/components/          # Cabeçalho, notícia, lista, topo, rodapé
│       ├── src/dados-exemplo/       # Dados usados fora do CI quando não há banco
│       └── public/dados/            # JSONs gerados (não vão para o Git)
├── supabase/
│   ├── migrations/                  # Schema do banco, um arquivo por mudança
│   └── seed.sql                     # Categorias, modelo de IA e fontes
├── .github/workflows/
│   ├── banco.yml                    # Aplica as migrations no Supabase
│   └── publicar.yml                 # Coleta, gera os dados, faz o build e publica
├── docs/
│   ├── tarefas/                     # Tarefas do projeto
│   └── prototipo/                   # Telas de referência de funcionamento
├── .env.example                     # Exemplo das variáveis locais
└── CLAUDE.md                        # Regras do projeto
```

### Como funciona:
1. A cada 30 minutos, o workflow **Publicar site** roda o coletor: lê os feeds RSS das fontes ativas, normaliza e deduplica as URLs, junta as matérias sobre o mesmo fato num acontecimento e grava tudo no Supabase. Com `MISTRAL_API_KEY`, os títulos novos viram vetores e o banco (pgvector) acha o acontecimento recente mais parecido pelo sentido; sem ela, ou se a Mistral falhar, o agrupamento compara as palavras dos títulos.
2. O coletor manda os eventos novos em lotes para o Gemini, que devolve título, resumo e editoria. Se o Gemini falhar ou ficar sem cota, a Groq resume o mesmo lote e o resto da rodada. Sem nenhuma das duas chaves, essa etapa é pulada e o site mostra a manchete original.
3. O gerador lê a view `vw_evento_card` e escreve os JSONs públicos do site.
4. O Astro monta o site estático e as actions oficiais publicam no GitHub Pages.

Se a coleta falhar, o site é publicado mesmo assim com o que já está no banco. Se o banco não responder, a publicação para e o site anterior continua no ar.

### Quem acessa o quê:

| Parte | De onde lê | Credencial |
|---|---|---|
| Site | JSONs publicados no GitHub Pages | Nenhuma |
| MCP público (futuro) | Os mesmos JSONs do site | Nenhuma |
| MCP admin (futuro) | Banco do Supabase, a partir da sua máquina | Credencial no `.env` local |
| Workflow do banco | Postgres, pelo pooler | Segredo `SUPABASE_DB_URL` |
| Coletor e gerador | Postgres, pelo pooler, no GitHub Actions | Segredos `SUPABASE_DB_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY` e `MISTRAL_API_KEY` |

### Padrões utilizados:
- **Clean Architecture** - `core` não importa nada de infraestrutura; `apps` só montam as dependências e chamam os casos de uso
- **Portas e adaptadores** - Interfaces só onde há chance real de troca (banco, IA, fonte de dados)
- **Erros tipados** - Domínio x infraestrutura, tratados em cada ponto de entrada
- **Logs estruturados** - JSON, sempre com o id da execução
- **Site estático com dados pré-gerados** - O navegador nunca fala com o banco

---

## 🚀 Instalação

### Pré-requisitos:
- Node.js 22.23 ou mais novo (recomendado: 24)
- Git
- Para coletar dados reais: acesso ao projeto no Supabase (a string do Session pooler)

### Passo a passo:

1. **Clone o repositório:**
```bash
git clone https://github.com/ttheu7/papo-reto.git
cd papo-reto
```

2. **Instale as dependências:**
```bash
npm install
```
No Windows, se o PowerShell bloquear scripts, use `npm.cmd` ou o Prompt de Comando.

3. **Confira se está tudo certo:**
```bash
npm test             # testes
npm run typecheck    # checagem de tipos
```

4. **Configure as variáveis de ambiente** (só se for coletar dados reais; veja [Configuração](#️-configuração)):
```bash
cp .env.example .env
```

5. **Colete e gere os dados** (opcional, exige o `.env`):
```bash
npm run coletar      # coleta (e resumos, com a chave) e registra a execução no banco
npm run dados:site   # gera apps/web/public/dados/*.json
```

6. **Inicie o site:**
```bash
npm run dev:web
```

O site estará disponível em `http://localhost:4321/papo-reto/`

Sem acesso ao banco, pule o passo 5: fora do CI, o site usa os dados de exemplo de `apps/web/src/dados-exemplo/`. No CI isso não acontece: sem os dados reais, o build falha de propósito.

---

## ⚙️ Configuração

### Arquivo `.env`:

Copie `.env.example` para `.env` (não renomeie: o exemplo fica no repositório). O `.env` nunca vai para o Git.

```env
# Supabase > Connect > Session pooler (IPv4, porta 5432), com [YOUR-PASSWORD] trocado pela senha do banco.
SUPABASE_DB_URL=postgresql://postgres.SEU_REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

# Google AI Studio. Opcional: IA principal dos resumos.
GEMINI_API_KEY=

# Groq. Opcional: IA de reserva dos resumos. Sem esta e sem a do Gemini, o site mostra a manchete original.
GROQ_API_KEY=

# Mistral. Opcional: vetores dos títulos para o agrupamento. Sem ela, o agrupamento compara as palavras.
MISTRAL_API_KEY=
```

Use sempre a string do **Session pooler**: a conexão direta (`db.<ref>.supabase.co`) só funciona em IPv6 e falha no GitHub Actions.

### Segredos:

| Onde | Nome | Para quê |
|---|---|---|
| GitHub Actions | `SUPABASE_DB_URL` | Migrations, coletor e gerador do site (Session pooler, com a senha) |
| GitHub Actions | `GEMINI_API_KEY` | Resumos (principal). Opcional |
| GitHub Actions | `GROQ_API_KEY` | Resumos (reserva). Opcional: sem as duas, o coletor pula os resumos |
| GitHub Actions | `MISTRAL_API_KEY` | Vetores do agrupamento. Opcional: sem ela, o agrupamento usa só as palavras |
| `.env` local | As mesmas variáveis | Rodar o coletor e o gerador na máquina |

### Dados do banco:
- **Fontes** (`fonte`) - Um feed por linha; feeds do mesmo portal usam o mesmo `nome`. Para ligar ou desligar um feed, mude `ativa`.
- **Editorias** (`categoria`) - Lista fechada; a IA só classifica com esses slugs.
- **Modelos de IA** (`modelo_ia`) - No máximo um ativo (o principal) e um de reserva (`reserva`); o código lê o nome dos modelos daqui.
- **Prompt** - Versionado em `packages/infra/src/ia/prompt.ts` (atual: `resumo-v2-2026-11-04`), o mesmo para o Gemini e a Groq.
- **Limite do agrupamento** - `SEMELHANCA_MINIMA_VETOR` (0,90) em `packages/core/src/agrupamento.ts`. Confira com `npm run calibrar:agrupamento`.

---

## 📖 Uso

### No site:
1. Acesse https://ttheu7.github.io/papo-reto/
2. Leia a manchete e os destaques do dia, ou escolha uma editoria
3. Abra um acontecimento para ver o resumo "Em 1 minuto" e a lista "Quem noticiou"
4. Clique em uma matéria para ler no portal original
5. Achou um erro no resumo? Use "Reportar erro neste resumo". Na beta, ele abre uma [issue no GitHub](https://github.com/ttheu7/papo-reto/issues) já preenchida com o id e o título do acontecimento (é preciso ter conta no GitHub). Na 1.0, vira um formulário próprio, sem conta ([tarefa 02](docs/tarefas/02-reportar-erro.md)).

### Comandos do projeto:

| Comando | O que faz |
|---|---|
| `npm test` | Testes (Vitest) |
| `npm run typecheck` | TypeScript estrito em todos os pacotes e `astro check` no site |
| `npm run coletar` | Lê os feeds, agrupa, grava no banco e, com `GEMINI_API_KEY` ou `GROQ_API_KEY`, gera os resumos |
| `npm run calibrar:agrupamento` | Lista os pares de manchetes mais parecidos pelos vetores da Mistral, para conferir o limite do agrupamento (não grava nada) |
| `npm run dados:site` | Gera `apps/web/public/dados/*.json` a partir do banco |
| `npm run dev:web` | Servidor de desenvolvimento do site |
| `npm run build:web` | Build do site (veja com `npm run preview -w @papo-reto/web`) |
| `npm run db:nova -- nome` | Cria uma migration |
| `npm run db:status` | Compara as migrations locais e remotas |

### Mudando o banco:

```bash
npm run db:nova -- nome_da_mudanca
# escreva o SQL no arquivo criado em supabase/migrations/
git add .
git commit -m "banco: nome da mudança"
git push
```

O workflow **Banco de dados** aplica a migration no Supabase no push para a `main`. Nunca edite uma migration que já foi aplicada: crie outra. Se a CLI travar no fim do `db:nova`, o arquivo já foi criado.

Para conferir o estado do banco pela sua máquina (depois de `npx supabase login` e `npx supabase link`), use `npm run db:status`. Na CLI 3, `db push`, `migration list` e `migration repair` miram um banco local por padrão: para falar com o Supabase, use sempre `--remote` (os scripts do `package.json` já fazem isso).

---

## 🔌 API (dados públicos)

O site não tem servidor: os dados são arquivos JSON estáticos, gerados a cada publicação e servidos pelo GitHub Pages. Qualquer um pode lê-los, sem chave. O contrato está em `packages/core/src/casos-de-uso/gerar-dados-do-site.ts`.

Endereço base: `https://ttheu7.github.io/papo-reto/dados/`

#### **GET /dados/eventos.json**
Acontecimentos das últimas 48 horas, até 80, os mais recentes primeiro.

**Resposta:**
```jsonc
{
  "geradoEm": "2026-11-04T20:30:00Z",
  "eventos": [
    {
      "id": "uuid",
      "titulo": "Título do resumo ou a primeira manchete",
      "resumo": "Três ou quatro frases…",   // null quando ainda não há resumo
      "geradoPorIa": true,
      "categoria": { "slug": "tecnologia", "nome": "Tecnologia" },   // ou null
      "cobertura": 3,                        // portais distintos
      "criadoEm": "ISO", "atualizadoEm": "ISO", "publicadoEm": "ISO",
      "materias": [
        { "portal": "g1", "titulo": "…", "url": "https://…", "publicadaEm": "ISO", "exigeAssinatura": false }
      ]
    }
  ]
}
```

#### **GET /dados/hoje.json**
Os 5 acontecimentos das últimas 24 horas com maior cobertura, no mesmo formato de `eventos.json`.

#### **GET /dados/categorias.json**
Editorias com o total de acontecimentos.

**Resposta:**
```json
{
  "geradoEm": "2026-11-04T20:30:00Z",
  "categorias": [{ "slug": "brasil", "nome": "Brasil", "total": 12 }]
}
```

`descricao_original` nunca entra nesses arquivos (há teste para isso). No futuro, o `apps/mcp-publico` vai expor esses mesmos dados como um servidor MCP.

---

## 🚢 Deploy

### Publicação automática:

O workflow **Publicar site** (`.github/workflows/publicar.yml`) roda:
- a cada 30 minutos (o GitHub pode atrasar ou pular execuções agendadas);
- a cada push na `main` com mudanças fora de `supabase/`;
- à mão, pela aba Actions (**Run workflow**).

Ele coleta, gera os JSONs, faz o build e publica no GitHub Pages. Duas publicações nunca rodam ao mesmo tempo.

### Configuração inicial (uma vez só):

1. **Supabase:**
   - Crie um projeto no plano Free, na região South America (São Paulo).
   - Use uma senha de banco só com letras e números, porque ela vai dentro de uma URL.
   - Se a tela oferecer, deixe ativados o RLS automático e a Data API.

2. **GitHub:**
   - Crie um repositório público `papo-reto`, sem README, `.gitignore` nem licença.
   - Em Settings › Secrets and variables › Actions, crie o segredo `SUPABASE_DB_URL`: no painel do Supabase, clique em **Connect**, copie a string do **Session pooler** e troque `[YOUR-PASSWORD]` pela senha do banco.
   - Opcionais: crie os segredos `GEMINI_API_KEY` (Google AI Studio) e `GROQ_API_KEY` (console da Groq) para ligar os resumos, e `MISTRAL_API_KEY` (console da Mistral) para agrupar pelo sentido.
   - Em Settings › Pages, em **Source**, escolha **GitHub Actions**.

3. **Já rodou os SQL no SQL Editor?** Se sim, marque as migrations como aplicadas **antes do primeiro push**. Sem isso, o workflow tenta criar as tabelas de novo e falha:
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration repair --remote --status applied 20261028120000 20261028120100
```
O ref do projeto aparece na URL do painel do Supabase. Se o banco ainda está vazio, pule esta etapa.

4. **Primeiro envio:**
```bash
git init -b main
git add .
git commit -m "Estrutura inicial e banco"
git remote add origin https://github.com/SEU_USUARIO/papo-reto.git
git push -u origin main
```
O push dispara o workflow **Banco de dados**, que cria as tabelas no Supabase.

5. **Dados iniciais:** com o workflow verde, abra o SQL Editor do Supabase, cole o conteúdo de `supabase/seed.sql` e rode uma vez. Se o seed já foi rodado antes, pule.

O Security Advisor do Supabase pode avisar que as tabelas têm RLS sem nenhuma política. É de propósito: veja [Segurança e privacidade](#️-segurança-e-privacidade).

### Limites do plano gratuito:
- **Supabase:** 500 MB de banco (acima disso ele fica só leitura), 5 GB de tráfego por mês, pausa depois de uma semana sem atividade e nenhum backup automático. A limpeza diária (`pg_cron`, 6h UTC) apaga `descricao_original` depois de 30 dias, eventos parados há 180 dias, eventos órfãos e execuções com mais de 30 dias.
- **Gemini, Groq e Mistral:** poucas requisições por minuto e por dia, e os limites aparecem só no painel de cada um. Por isso os resumos saem em lote, a Groq só entra como reserva e a Mistral recebe uma chamada por rodada, só com os títulos novos.
- **Vetores:** cada título guarda um vetor de cerca de 4 KB, que a limpeza diária apaga depois de 3 dias.

---

## 🗺️ Roadmap

### Implementações futuras:

#### Versão 1.0:
- [ ] **Formulário próprio para reportar erro** - Sem conta no GitHub, gravando no banco ([tarefa 02](docs/tarefas/02-reportar-erro.md))

#### Depois da 1.0:
- [ ] **Resumo atualizado quando o acontecimento cresce** - Hoje o resumo é feito uma vez só, com as matérias da primeira rodada
- [ ] **MCP público** (`apps/mcp-publico`) - Os dados públicos como servidor MCP, no Cloudflare Workers
- [ ] **MCP admin** (`apps/mcp-admin`) - Manutenção do banco pela máquina local
- [ ] **Doações** - A tabela `doacao` já existe, mas ainda não é usada

---

## 🛡️ Segurança e privacidade

### Recursos implementados:
- ✅ RLS ligado em todas as tabelas, sem políticas, de propósito: com a chave publicável ninguém lê nada, e o navegador nunca fala com o banco
- ✅ Nenhuma chave no site: ele só lê JSONs públicos
- ✅ Segredos só no GitHub Actions e no `.env` local, e nos workflows apenas nos passos que precisam deles (nunca no `npm ci`)
- ✅ Nenhum segredo no código, nos logs, nos JSONs ou no site
- ✅ `descricao_original` (texto dos portais) é de uso interno, com teste que impede que ela vá para os JSONs
- ✅ Prompt versionado, com registro do modelo, dos tokens e do custo de cada resumo

### Público jovem e dados pessoais:
- ✅ Sem anúncios, sem perfilamento e sem ferramentas de rastreamento (ECA Digital, Lei 15.211/2025)
- ✅ Coleta mínima de dados pessoais (LGPD): o site não pede cadastro nem guarda nada de quem lê; só a escolha do tema fica no próprio navegador (`localStorage`)
- ✅ Nada de quem lê é enviado para as IAs: elas recebem só texto público dos feeds (o Google pode usar o que recebe no plano gratuito; a Mistral diz que os dados da API não treinam modelos)

### Conteúdo e direito autoral:
- ✅ O site mostra só título, resumo próprio e link para a matéria original. Texto integral, com crédito, apenas de fontes que permitem republicação (Agência Brasil)
- ✅ Sem imagens dos portais: o visual é tipográfico
- ✅ Todo resumo avisa que foi gerado por IA, mostra quais matérias foram usadas e oferece um jeito de reportar erro
- ✅ O resumo sai só dos títulos e descrições dos feeds, e a IA é instruída a não inventar fatos

---

## 📄 Licença

O código deste projeto é aberto, sob a licença MIT. Veja [`LICENSE`](LICENSE).

A licença vale só para o código. As manchetes e matérias pertencem aos portais de origem, e o site apenas as cita com link.

---

## 🤝 Contribuindo

Para contribuir:

1. Leia o [`CLAUDE.md`](CLAUDE.md), que reúne as regras do projeto, e veja as tarefas em [`docs/tarefas/`](docs/tarefas/)
2. Crie uma branch a partir da `main` (`git checkout -b nome-da-mudanca`)
3. Faça commits pequenos
4. Antes de enviar, rode `npm test` e `npm run typecheck`
5. Envie a branch e abra um Pull Request

### Diretrizes:
- Textos da interface em português do Brasil
- `packages/core` não importa nada de infraestrutura; casos de uso são testados com falsos em memória, sem banco e sem rede
- Mudou o banco? Nova migration. Nunca edite uma que já foi aplicada. Um push na `main` que mexe em `supabase/migrations/` vai direto para o banco de produção
- Cor nova no site sempre como token, nos dois temas (claro e escuro)
- Mudou o visual? Confira com as skills taste-skill e web-design-guidelines; o comando e a lista de falhas esperadas estão em "Visual › Conferir", no `CLAUDE.md`
- Quando uma decisão mudar, atualize o `CLAUDE.md` e este README, mantendo a estrutura de seções deste arquivo

---

## 💬 Suporte

Para dúvidas, problemas ou erros em resumos:
- Abra uma [issue no GitHub](https://github.com/ttheu7/papo-reto/issues)

---

## 👏 Agradecimentos

- À Unoesc Videira e à disciplina PRATIC IV
- Aos portais que mantêm feeds RSS abertos: g1, Folha, Estadão, CNN Brasil, BBC, Agência Brasil e Tecnoblog
- Às comunidades do Astro, do Supabase e das bibliotecas usadas no projeto
- Às fundições das fontes Newsreader e Figtree, distribuídas pelo Fontsource

---

**Feito para que todo jovem entenda o que está acontecendo no Brasil e no mundo**
