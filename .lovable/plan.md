
## Objetivo

Quando a Donatella transferir uma conversa para o time de **Produção** (handoff de suporte), disparar **imediatamente** uma mensagem WhatsApp via template HSM aprovado para **um número fixo de plantão**, contendo as informações do chamado.

## 1. Configuração (Settings → Agente)

Adicionar nova seção **"Alertas de Suporte"** em `AgentSettings.tsx` com três campos persistidos em `nina_settings`:

- `support_alert_enabled` (boolean) — liga/desliga
- `support_alert_phone` (text) — número E.164 do plantão (ex: `5511999999999`)
- `support_alert_template` (text) — nome do template HSM aprovado (ex: `novo_chamado_suporte`)

Mostrar dica explicando que o template precisa ter 3 variáveis na ordem: `{{1}}` nome do cliente, `{{2}}` número do pedido (ou "—"), `{{3}}` motivo/resumo do problema.

## 2. Template HSM (criação manual via UI existente)

O usuário criará o template em **WhatsApp Templates** (já existe `WhatsAppTemplates.tsx` + `submit-whatsapp-template`). Sugestão de corpo:

```
🚨 Novo chamado de suporte

Cliente: {{1}}
Pedido: {{2}}
Motivo: {{3}}

Acesse o painel para atender.
```

Categoria: `UTILITY`. Sem ação a nosso lado nesse passo — apenas documentar no campo de ajuda.

## 3. Gatilho no `nina-orchestrator`

No fluxo `handleSupportIntake` (onde hoje já fazemos transferência para Produção, system note, tag e notificação interna), adicionar uma chamada extra **após** a transferência ser concluída:

- Ler `nina_settings.support_alert_enabled/phone/template`
- Se habilitado e número/template preenchidos, enfileirar 1 registro em `send_queue` com:
  - `to_phone` = número do plantão
  - `type` = `template`
  - `payload` = `{ template_name, language: 'pt_BR', components: [{ type:'body', parameters:[{type:'text', text: contactName}, {type:'text', text: orderNumber||'—'}, {type:'text', text: reasonSummary}] }] }`
  - `conversation_id` = null (mensagem fora da conversa do cliente)
  - `priority` = high

O `whatsapp-sender` já existente consome `send_queue` e sabe enviar template — não precisa alterar.

## 4. Tolerância a falhas

- Se número/template não configurados → apenas log, não interrompe handoff.
- Se `whatsapp-sender` falhar (template não aprovado, número inválido) → registra em `notifications` (`type: 'support_alert_failed'`) para o admin ver no sino.
- Cooldown leve: não disparar 2x para o mesmo `conversation_id` em menos de 10 min (evita duplicado se a IA reclassificar).

## 5. Detalhes técnicos

**Arquivos tocados:**
- `supabase/functions/nina-orchestrator/index.ts` — função `dispatchSupportAlert(settings, contact, order, reason)` chamada no final do handoff.
- `src/components/settings/AgentSettings.tsx` — nova seção UI + persistência dos 3 campos.
- Migration: `ALTER TABLE nina_settings ADD COLUMN support_alert_enabled boolean DEFAULT false, ADD COLUMN support_alert_phone text, ADD COLUMN support_alert_template text;`
- `src/integrations/supabase/types.ts` regenera automaticamente.

**Sem alterações em:**
- `whatsapp-sender` (já processa template via `send_queue`)
- Schema de `send_queue` (já suporta `type='template'` e payload livre)
- Configuração de webhook / Meta

## Resultado esperado

Assim que a Donatella concluir a triagem de suporte e transferir para Produção, em menos de ~5 s o número de plantão recebe no WhatsApp uma mensagem padronizada com cliente, pedido e motivo — sem depender de ninguém estar olhando o painel.
