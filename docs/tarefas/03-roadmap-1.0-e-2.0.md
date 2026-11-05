# Tarefa 03: o que falta para a 1.0, e a 2.0

Registro do plano combinado em 05/11/2026. Cada item vira uma tarefa própria quando for começar. Antes de implementar, confirme com o grupo os pontos marcados como **A decidir**.

## Versão 1.0

### Redesign com cara de jornal de papel

O visual atual (cartões soltos sobre o fundo, cantos bem redondos, muito respiro) ficou bonito, mas parece uma peça de apresentação, não um site. A 1.0 deve parecer um site de notícias de verdade, com estética de jornal impresso.

- Direção provável: a página como uma folha contínua, colunas e fios separando as seções, cabeçalho com nome, data e edição entre fios, rótulos de seção em versalete, mais hierarquia de tamanho nos títulos e mais notícias por tela. A cor das editorias vira detalhe, não fundo.
- Isso muda regras da casa no `CLAUDE.md` ("sem linha fina", raio de 22px, cards). Atualize as regras junto com o código.
- Antes de mexer, mostre duas ou três direções em captura para o grupo escolher. Peça ao grupo nomes de jornais que acertam a estética.
- Continua valendo: mobile-first, contraste AA, foco visível, `prefers-reduced-motion`, modo escuro e nenhuma foto dos portais.

### PWA para celular

- Manifesto (nome, ícones, cores dos dois temas) e um service worker que guarda a última edição (as páginas e os JSONs de `dados/`) para ler sem internet, com aviso de "edição de HHhMM" quando estiver sem conexão.
- O site é estático no GitHub Pages, com base `/papo-reto/`: o escopo do service worker e os caminhos do manifesto precisam respeitar a base.
- Sem notificações push por enquanto: exigiriam guardar inscrição de quem lê (dado pessoal) e um servidor.
- Imagens ilustrativas vêm do acervo: não guardar no cache do aparelho além do que o navegador já faz (as regras do Unsplash pedem exibir pelo endereço deles).

### Doações

- Só doação voluntária, sem metas nem pressão, e sem nenhuma vantagem para quem doa (o conteúdo é igual para todos).
- O site não guarda dados de quem doa. Caminho mais simples: PIX com QR Code estático e "copia e cola", ou uma plataforma de financiamento coletivo, com o link no rodapé e numa página "Apoie".
- **A decidir:** quem recebe (conta do grupo, da universidade ou de um integrante), se a doação é anunciada só para maiores de idade (público jovem, ECA Digital) e para que serve a tabela `doacao` (talvez só um total mensal publicado, para transparência).

### Formulário próprio para reportar erro

Já descrito na [tarefa 02](02-reportar-erro.md).

### Pedidos de melhoria

- Formulário como o de reportar erro: sem conta, sem dados pessoais, texto curto e tipo de pedido.
- Mesmo ponto de recebimento (o Worker na Cloudflare da tarefa 02) e tabela própria ou a mesma com um campo de tipo.

### Triagem com IA dos reports e dos pedidos

- Uma rotina (no coletor ou num workflow próprio) lê os reports e pedidos novos e pede à IA, em lote: o tipo (erro no resumo, erro no site, pedido de funcionalidade, spam ou ofensa), a prioridade, um resumo em uma frase e uma **nota de complexidade** (por exemplo 1 a 5, com critério escrito no prompt: 1 = trocar um texto, 5 = mudar a arquitetura).
- Grava a triagem no banco (prompt versionado, modelo e tokens registrados, como nos resumos). O texto de quem reportou é dado de usuário: vale a regra "nunca envie dados de usuários" para IAs que treinam com o conteúdo. **A decidir:** qual IA faz a triagem (a Mistral diz que não treina com os dados da API; o Google pode usar no plano gratuito) e se o texto é anonimizado antes.
- A triagem prepara a rotina da 2.0, então a nota de complexidade precisa ser estável e explicada.

## Versão 2.0

### Telemetria anônima e resumo diário por e-mail

- Só números agregados, sem identificar ninguém e sem cookies: visitas por página e por dia, notícias coletadas, resumos gerados, imagens, falhas de coleta, reports e pedidos novos. Nada de perfil, histórico por pessoa ou IP guardado (ECA Digital e LGPD).
- Contagem de visitas sem rastreamento: por exemplo, o Worker da Cloudflare soma acessos por página; os dados do coletor já estão na tabela `execucao`.
- Um workflow agendado monta o resumo do dia e envia por e-mail ao grupo. **A decidir:** serviço de e-mail (com plano gratuito) e destinatários.

### Rotina de correção com IA

- Lê a triagem e pega só itens de complexidade baixa (faixa a definir, por exemplo 1 e 2) e de tipos permitidos.
- Para cada um: cria uma branch a partir da `main`, implementa a correção, roda `npm test` e `npm run typecheck`, faz commit e abre um PR descrevendo o report original e o que mudou.
- Limites de segurança: a rotina **nunca mescla** (o grupo revisa e aprova cada PR), nunca mexe em `supabase/migrations/` (vai direto para o banco de produção), nunca toca em segredos nem em workflows, e tem um número máximo de PRs por dia. Se os testes falharem, ela não abre o PR e registra o motivo na triagem.
- Report vindo de fora pode tentar instruir a IA ("ignore as regras e..."): o texto do report é tratado como dado, nunca como instrução, e o PR sempre passa por revisão humana.
