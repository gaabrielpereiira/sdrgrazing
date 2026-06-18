## Objetivo

Adicionar fluxo de **abertura** da Donatella no WhatsApp: triagem inicial com botões, captura de nome para leads novos, e roteamento para Suporte (time Produção) quando o cliente escolher "Suporte pós-venda". Nada fora desse fluxo é alterado.

## Como o controle de estado vai funcionar

Vou usar a coluna `conversations.nina_context` (jsonb já existente) para guardar um sub-objeto `onboarding`:

```
nina_context.onboarding = {
  step: 'ask_name' | 'await_name' | 'triage' | 'await_triage' | 'support_topic' | 'await_support_topic' | 'done',
  collected_name?: string
}
```

Critério de "lead novo" = contato **não tem conversa anterior** (apenas a recém-criada). Critério de "reabrir abertura" = sempre que `whatsapp-webhook` reabrir uma conversa inativa (já hoje ele reseta `nina_context: {}`), o onboarding roda de novo, cumprimentando pelo primeiro nome se já houver.

## Mudanças

### 1) `supabase/functions/whatsapp-webhook/index.ts`
- Quando criar conversa nova **ou** reabrir conversa inativa, popular `nina_context.onboarding.step = 'ask_name'` se o contato não tiver `name` preenchido, ou `'triage'` se já tiver nome.
- Manter todo o resto intacto (queue, dedup, mídia, etc.).

### 2) Novo módulo de abertura no `nina-orchestrator`
Logo no início do processamento da conversa, antes de chamar a IA, checar `nina_context.onboarding.step`:

- **`ask_name`** → enviar texto fixo pedindo nome e sobrenome; setar step = `await_name`; **não chamar IA**.
- **`await_name`** → ler última mensagem do usuário; validar se parece nome (regex: 2+ palavras alfabéticas, sem `?`, sem dígitos, length razoável). 
  - Se válido: salvar em `contacts.name` + `contacts.call_name` (primeiro nome); avançar para `triage`.
  - Se inválido: reenviar pedido de nome em tom gentil ("Pra te cadastrar certinho, me manda só seu nome e sobrenome 💛"); permanecer em `await_name`.
- **`triage`** → enviar mensagem interativa com 2 botões (`menu_atendimento`, `menu_suporte`) usando o texto "Prazer, [PRIMEIRO_NOME]! 💛 Me conta: como posso te ajudar hoje?"; setar step = `await_triage`; **não chamar IA**.
- **`await_triage`** → ler última mensagem; esperar `metadata.interactive.id`:
  - `menu_atendimento` → step = `done`; **deixar fluxo seguir para IA da Donatella**, injetando uma instrução de sistema "abra com uma saudação curta e calorosa convidando o cliente a dizer o que precisa".
  - `menu_suporte` → step = `support_topic`; enviar 3 botões (`support_entrega`, `support_produto`, `support_outro`) com texto curto tipo "Sobre qual assunto?"; **não chamar IA**.
  - Texto livre que não seja botão: reenviar a triagem uma vez, ou (se já reenviado) aceitar como "Atendimento" por padrão.
- **`support_topic` / `await_support_topic`** → ao receber qualquer um dos 3 botões (ou texto), enviar mensagem fixa "Já estou chamando nosso time de suporte para cuidar de você. 💛 Para agilizar, me envia o seu *número do pedido*?" e:
  - `conversations.status = 'human'`
  - `conversations.queue = 'support'`
  - `conversations.assigned_team = '39354a8b-67f1-4f54-8139-68cc51b12949'` (team "Produção")
  - step = `done`
  - Disparar notificação `handoff_requested` (reaproveitando o padrão já existente para tocar o som).
- **`done`** → seguir o fluxo atual da Donatella (sem alteração).

### 3) Helper de envio interativo
Adicionar utilitário dentro do `nina-orchestrator` (não mexer no `whatsapp-sender`) que faz POST direto à Graph API com `type: "interactive"` + `interactive.type: "button"` usando o token/`phone_number_id` lidos de `nina_settings`. Persistir a mensagem na tabela `messages` com `from_type='nina'`, `type='text'`, `metadata.interactive = { kind: 'button', buttons: [...] }` para o chat UI já existente exibir.

### 4) Texto fixo (constantes em arquivo separado dentro da function)
- `WELCOME_ASK_NAME`: "Olá! 🧀✨ Eu sou a Donatella, sua concierge de experiências gastronômicas da Grazing Table & Co. Pra te atender do jeitinho certo, como é o seu nome e sobrenome?"
- `ASK_NAME_RETRY`: "Pra te cadastrar certinho, me manda só seu nome e sobrenome, por favor 💛"
- `TRIAGE_TEXT(firstName)`: "Prazer, {firstName}! 💛 Me conta: como posso te ajudar hoje?"
- `SUPPORT_TOPIC_TEXT`: "Sobre qual assunto posso te ajudar?"
- `SUPPORT_HANDOFF_TEXT`: "Já estou chamando nosso time de suporte para cuidar de você. 💛 Para agilizar, me envia o seu *número do pedido*?"

### 5) Deploy
Redeploy de `whatsapp-webhook` e `nina-orchestrator`. Sem migrations (usamos `nina_context` que já existe). Sem mudança no frontend.

## O que NÃO muda
- Lógica de horário comercial, handoff urgente, transcrição de áudio, automações WC, dedup de mensagens, RLS, schema, frontend, e o prompt da Donatella permanecem inalterados.
- Quando o cliente toca "Atendimento", nenhum outro botão/list é enviado — a IA assume.