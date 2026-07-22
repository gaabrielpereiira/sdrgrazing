## Diagnóstico

Investiguei a tabela `notifications`, `send_queue`, `support_cases`, `nina_settings` e o `nina-orchestrator`. Duas causas concretas:

**1. Todos os `notifications.insert` do fluxo de suporte estão falhando silenciosamente.**
A tabela `notifications` no banco atual tem apenas as colunas `id, type, title, body, conversation_id, contact_id, metadata, is_read, created_at`. Não existe coluna `priority`. Porém o `nina-orchestrator` insere com `priority: 'high' | 'normal'` em 4 pontos (`support_producao_missing` x2, `handoff_requested`/`handoff_urgent` do intake, `support_alert_failed`). Como cada insert está em `try/catch`, o erro é engolido — resultado: **nenhuma notificação de "Suporte → Produção" aparece no sininho** (confirmado no banco: zero linhas com `triggered_by = 'donatella_support_intake'`).

**2. O alerta WhatsApp (`dispatchSupportAlert`) só é enfileirado quando `requer_agente_humano = true`, e isso só acontece no final do intake completo (nome → botão Suporte → número do pedido → descrição do problema → classificação LLM).** Se o lead abandona no meio, ou se a classificação retorna `duvida_geral_pos_compra` com `requer_agente_humano = false` (o que aconteceu nos casos mais recentes — 19/07), a Donatella responde sozinha e nunca dispara nem alerta nem atribuição. As configs estão OK: `support_alert_enabled=true`, phone/template preenchidos, template `suporte` APPROVED, `producao_user_id` aponta para o Gabriel (ativo). Send_queue tem 0 linhas de alerta de suporte na retenção atual.

O mesmo vale para `assigned_user_id`: ele só é setado no update final do intake completo. Enquanto o lead está em `await_support_order` ou `await_support_issue`, a conversa fica sem responsável e sem notificação.

## Correções

### 1. Remover `priority` de todos os `notifications.insert` do orchestrator
Editar `supabase/functions/nina-orchestrator/index.ts` e limpar o campo `priority` das 4 chamadas (mover a sinalização de urgência para `metadata.priority` para preservar o dado sem quebrar o insert). Assim as notificações voltam a aparecer no sino.

### 2. Marcar responsável e disparar alerta no início do handoff, não só no final
Quando o lead clica no botão "Suporte pós-venda" (`choseSuporte` em `handleOnboarding`), passamos a:
- Setar `conversations.assigned_user_id = producao_user_id` e `assigned_team = <Produção>` imediatamente (com uma tag provisória `motivo:triagem_suporte`).
- Inserir uma notificação `handoff_requested` "Novo chamado de suporte iniciado" já nesse momento.
- Chamar `dispatchSupportAlert` com labels provisórios (`reasonLabel: 'Triagem inicial'`, sem `orderNumber` ainda). Como o dispatch já tem cooldown de 10 min por conversation, a segunda chamada no final do intake não duplica.

Depois, quando `classifySupportIntake` conclui, atualizamos os campos com o motivo/pedido reais (a atribuição já vai estar visível no chat desde o clique).

### 3. Log explícito quando `dispatchSupportAlert` decide não enviar
Adicionar logs claros nos guards (`support_alert_enabled=false`, template não encontrado, cooldown ativo, phone vazio) para facilitar debug futuro via `edge_function_logs`.

### 4. Verificar depois do deploy
- Simular via `simulate-webhook` um lead novo → clicar botão Suporte → conferir que:
  - Conversa aparece com badge do Gabriel imediatamente.
  - Aparece notificação no sino.
  - Aparece linha em `send_queue` (message_type=template, name=suporte) para o número 5551980565345.
- Consultar `edge_function_logs` do `nina-orchestrator` e do `whatsapp-sender` para confirmar envio.

## Detalhes técnicos

- Arquivo único alterado: `supabase/functions/nina-orchestrator/index.ts`.
- Nenhuma mudança de schema. Se no futuro quisermos `priority` de verdade em notificações, criar migration separada adicionando a coluna com default `'normal'`.
- Sem impacto no fluxo pré-venda (`detectPreSaleIntent` continua interceptando antes do handoff).
- Cooldown existente de 10 min em `dispatchSupportAlert` evita duplicação entre a chamada inicial (no clique do botão) e a final (após classificação).
