# Tarefa 02: formulário próprio para reportar erro (versão 1.0)

## Por quê

Na beta, "Reportar erro neste resumo" abre uma issue no GitHub já preenchida (`linkParaReportar`, em `apps/web/src/lib/formato.ts`). Isso tem quatro problemas:

- Exige conta no GitHub, e o público jovem quase nunca tem uma.
- O report fica público, com o nome de usuário de quem reportou.
- A etiqueta `erro-no-resumo` passada no link não existe no repositório, e o GitHub ignora etiquetas vindas de quem não é colaborador.
- O report não chega ao banco: o resumo errado continua no ar até alguém ler a issue.

## O que fazer

- Formulário no site, sem conta e sem login: o id do acontecimento (preenchido sozinho), o tipo de problema (por exemplo: fato errado, resumo não bate com as matérias, editoria errada, outro) e um campo de texto curto.
- Um ponto de recebimento fora do GitHub Pages, que é estático. O candidato é um Worker na Cloudflare, já previsto para o `apps/mcp-publico`, gravando no banco com uma credencial que só ele tem.
- Uma nova migration com a tabela `reporte(id uuid, evento_id, tipo, texto, criado_em, resolvido_em)`, com RLS ligado e sem políticas, como as outras. Incluir os reportes na `limpeza_diaria` (por exemplo, apagar os resolvidos depois de 30 dias).
- No `packages/core`, o caso de uso `ReportarErro` com uma porta para o repositório e testes com falso em memória. Na infraestrutura, o adaptador Postgres.
- Uma forma de o grupo ver e resolver os reportes (de início, consulta no banco; depois, o `apps/mcp-admin`).

## Regras

- Coleta mínima (LGPD e ECA Digital): nada de nome, e-mail, IP guardado ou cookie. Se precisar de contato, o campo é opcional e avisa para que serve.
- Proteção contra spam sem rastrear quem envia: limite de tamanho do texto, limite de envios por minuto no Worker e, se precisar, um desafio que não perfile (por exemplo, Cloudflare Turnstile).
- Sem JavaScript, o formulário ainda funciona (envio comum de `<form>`, com uma página de confirmação).
- O texto do reporte nunca vai para JSON público, página ou IA.
- Mantenha o link para o GitHub no rodapé, para quem quiser abrir uma issue.
