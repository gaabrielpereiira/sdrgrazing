## Objetivo

Adicionar no chat a possibilidade de enviar **Templates aprovados do WhatsApp** a qualquer momento (não apenas após 24h), via um botão sempre visível na barra do composer.

## Comportamento

1. **Botão "Template" sempre visível** na barra de composição, ao lado dos botões de emoji e anexo (ícone `LayoutTemplate` / `FileStack`). Tooltip: *"Enviar template do WhatsApp"*.

2. **Modal `TemplatePickerModal`** ao clicar:
   - Lista templates de `whatsapp_templates` com `status = 'APPROVED'`.
   - Busca por nome + filtro por idioma e categoria (MARKETING / UTILITY / AUTHENTICATION).
   - Para cada template: preview no estilo WhatsApp já renderizado (header / body / footer / buttons).
   - Detecta variáveis `{{n}}` no body e header (text) e mostra inputs obrigatórios para cada uma.
   - Botão **"Enviar template"** com validação (todas as variáveis preenchidas).
   - Estado vazio amigável quando não houver templates aprovados, com link direto para a página `/templates`.

3. **Envio do template**:
   - Inserir registro em `messages` (`from_type='human'`, `type='text'`, `content` = corpo já interpolado para exibição local, `status='sent'`, `metadata.template = { name, language, components, variables }`) — feedback imediato no chat.
   - Inserir item em `send_queue` apontando para `message_id` e copiando `metadata.template`.
   - O `whatsapp-sender` detecta `metadata.template` e envia payload `type: "template"` para a Graph API:
     ```json
     {
       "type": "template",
       "template": {
         "name": "...",
         "language": { "code": "pt_BR" },
         "components": [{ "type": "body", "parameters": [{ "type": "text", "text": "..." }] }]
       }
     }
     ```
   - Em caso de erro (template não aprovado, variável inválida), reaproveita o fluxo de falha existente (`status='failed'` + alerta vermelho na bolha com motivo).

4. **Renderização da bolha**: mensagem enviada como template aparece com um pequeno chip/badge "Template • {nome}" acima do conteúdo interpolado.

## Arquivos a alterar/criar

**Frontend**
- `src/components/chat/TemplatePickerModal.tsx` *(novo)* — listagem + busca + preview + inputs de variáveis + envio.
- `src/components/ChatInterface.tsx` — novo botão de template no composer (sempre visível); estado para abrir o modal; renderização do badge "Template" nas bolhas que têm `metadata.template`.
- `src/services/api.ts` — `sendTemplateMessage(conversationId, contactId, template, variables)` que cria a `messages` row e enfileira em `send_queue` com metadata de template.
- `src/hooks/useConversations.ts` — expor `sendTemplateMessage` (com update otimista).

**Backend**
- `supabase/functions/whatsapp-sender/index.ts` — em `sendMessage`, se `queueItem.metadata?.template` estiver presente, montar payload `type: "template"` em vez de `text`/mídia. Não prefixar com nome do atendente em templates (regra da Meta exige template puro).

## Detalhes técnicos

- Variáveis: extraídas com `/\{\{(\d+)\}\}/g` em components do tipo BODY/HEADER (text). Componentes só são adicionados ao payload da API se tiverem parâmetros.
- Quando `activeChat.status === 'nina'` (Nina respondendo automaticamente), o botão fica desabilitado para evitar conflito — um humano só dispara template após assumir o atendimento.
- Templates são lidos diretamente de `whatsapp_templates` ao abrir o modal (sem cache), respeitando RLS já existente.

## Fora de escopo (fase 2)
- Header com mídia (IMAGE/VIDEO/DOCUMENT) — só body + header text por enquanto.
- Botões com URL dinâmica (`{{1}}` em URL) e quick-reply parametrizados.
