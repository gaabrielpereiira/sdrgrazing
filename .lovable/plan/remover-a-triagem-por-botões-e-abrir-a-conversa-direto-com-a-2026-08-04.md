# Remover a triagem por botões e abrir a conversa direto com a Donatella

A Donatella passa a atender desde a primeira mensagem: sem menu de dois botões, com apresentação calorosa + pedido de nome e sobrenome (leve, não obrigatório), gravação do nome no banco assim que o cliente responder, e suporte pós-venda acionado por detecção de intenção da própria IA.

## 1. Fluxo de abertura (sem botões)

- Primeira mensagem de um lead: a Donatella responde com apresentação da marca + pedido de "nome e sobrenome" e já segue disponível para atender.
- Se o cliente ignora o pedido de nome ou já manda um pedido/pergunta: a IA atende normalmente; o nome pode ser retomado uma única vez, de forma leve, mais adiante.
- Se vier só o primeiro nome: aceita, segue, e no máximo pergunta o sobrenome uma vez.
- Nada de tela de escolha, nada de mensagens fixas de menu, nada de "reenviar triagem".

## 2. Gravação do nome

Assim que a resposta do cliente contiver um nome:
- primeiro nome, sobrenome (quando houver) e nome completo são gravados no cadastro do contato naquele momento (não no fim da conversa).
- Só primeiro nome: grava primeiro nome e nome completo, sobrenome fica vazio.
- Cliente não informa nada: usa o nome do perfil do WhatsApp como fallback.
- Contato já com nome preenchido: só sobrescreve se o cliente informar um nome novo.

## 3. Suporte pós-venda (mesma lógica, novo gatilho)

Permanece igual: classificação silenciosa (causa, resumo, sentimento) gravada antes do handoff, escalação imediata, coleta do número do pedido depois, alerta pelo template `novo_atendimento_suporte`, responsável da Produção atribuído, mesma taxonomia de 19 categorias nos 4 grupos, mesmos casos resolvidos sozinha (elogios, dúvidas gerais, nota fiscal) e as mesmas regras de integridade de produto (nunca inventar dados fora da API do WooCommerce; sem informação, redireciona para o permalink; escala se não for verificável).

Única mudança: o gatilho vira a detecção de intenção da IA na conversa — quando a mensagem se encaixa numa categoria com `requer_agente_humano = true`, ela classifica e escala. Sem botão.

## 4. Follow-up de lead inativo

Hoje o follow-up de 1h só dispara quando a conversa está parada no passo dos botões. Passa a disparar quando a última mensagem enviada foi a mensagem de abertura da Donatella e o cliente não respondeu — mesma intenção (lead entrou e não deu andamento), sem depender da triagem.

## Detalhes técnicos

**Banco**
- Migration: adicionar `last_name text` em `public.contacts` (o `name` já guarda o nome completo e `call_name` o primeiro nome).

**`supabase/functions/whatsapp-webhook/index.ts`**
- Remover o seed de `nina_context.onboarding.step = 'triage' | 'ask_name'`; passa a marcar apenas se o lead ainda não recebeu a abertura (`step: 'opening'`).

**`supabase/functions/nina-orchestrator/index.ts`**
- Excluir `sendInteractiveButtons`, `getInteractiveButtonId`, `ONBOARDING_TEXTS.triage`, e os passos `triage` / `await_triage` de `handleOnboarding`.
- `handleOnboarding` fica só com: `opening` (primeira resposta com apresentação + pedido de nome, gerada pela IA com instrução de abertura injetada) e captura oportunista de nome nas mensagens seguintes (`looksLikeName` / `extractFirstName`) atualizando `name`, `last_name`, `call_name`; nunca mais retorna `handled` para bloquear a IA — a conversa nunca trava.
- Manter `await_support_order` / `await_support_issue`, `classifySupportIntake`, `dispatchSupportAlert`, `detectPreSaleIntent`, `fetchWooOrderStatus`.
- Escalação de suporte passa a nascer do tool call `request_human_handoff`: nos motivos pós-venda, roda `classifySupportIntake`, cria/atualiza o `support_cases`, atribui o responsável da Produção, envia o alerta e então entra em `await_support_order`.
- Prompt de sistema: incluir a instrução de abertura (apresentação + nome/sobrenome, pedido único e não bloqueante) e a regra de acionar `request_human_handoff` ao identificar categoria de suporte com `requer_agente_humano = true`.

**`supabase/functions/followup-inactive-leads/index.ts`**
- Trocar a checagem `step === 'await_triage'` + "última saída é a mensagem de botões" por "última saída é a mensagem de abertura da Donatella e sem resposta do cliente".

**Frontend**
- `src/components/ChatInterface.tsx`: remover a renderização dos botões de triagem e do badge "Botão clicado" (mensagens interativas deixam de existir).
