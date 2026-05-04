## Diagnóstico inicial

Olhando os dados reais da última tentativa:

- `send_queue` da mensagem template `feedback_pedido` ficou com `status='completed'`, `error_message=NULL`.
- Logs do `whatsapp-sender` mostram payload aceito pela Meta e retorno com `wamid.HBgLNTE5OTk1MDM1NDUVAgARGBJGMUY3ODA4RTBBNDRENkZFMTcA`.
- Logs do `whatsapp-webhook` mostram dois status updates dessa mesma `wamid`: primeiro `sent`, depois `delivered`. Ou seja, **a Meta confirmou entrega**.

Quando a Meta confirma `delivered` mas o cliente não recebe, as causas mais comuns são externas ao código:

1. **Idioma do template divergente** — o template `feedback_pedido` está cadastrado como `language: en`, mas o conteúdo é em português. Se o WhatsApp do destinatário estiver configurado com um locale que faz fallback diferente, ou se a Meta aprovar `en` mas o cliente real ter um pareamento incorreto, a mensagem pode "sumir". Convém migrar/duplicar como `pt_BR`.
2. **Componente BUTTONS (URL) não enviado** — o template tem um botão URL estático. Para botões estáticos não é obrigatório enviar o componente, mas se a Meta tiver alguma variação dinâmica futura, isso vira erro silencioso. Vale logar e tratar.
3. **Marketing opt-out** — `category: MARKETING`. Vários números (especialmente fora do Brasil, como o `+51` Peru testado) têm "Stop promotional messages" ligado. A Meta retorna `delivered` para fins de billing mas o aparelho não exibe. Esse é provavelmente o caso aqui.
4. **Conta de teste / janela de qualidade** — se o número de origem estiver em modo de teste limitado, ou com qualidade baixa, a Meta pode marcar como `delivered` mas suprimir.

Como o código de envio em si está correto, o plano abaixo foca em **dar visibilidade total** para o usuário descobrir qual caso está acontecendo, e em **eliminar 2 pontos cegos** (idioma e botões).

## Mudanças

### 1. `supabase/functions/whatsapp-sender/index.ts` — guardar resposta da Meta
- Após `fetch` para `/messages`, gravar **na própria mensagem** (`messages.metadata.whatsapp_response`) o JSON completo de resposta (status HTTP, `messages[0].message_status`, `wamid`).
- Quando `response.ok` for `false`, gravar `error.code`, `error.title`, `error.message`, `error.error_data.details` em `send_queue.error_message` formatado, em vez de só `error.message`.

### 2. `supabase/functions/whatsapp-webhook/index.ts` — propagar status da Meta para a mensagem
- Já tratamos `delivered`/`read`. Adicionar tratamento de `failed` salvando `errors[*].code` + `errors[*].title` em `messages.metadata.whatsapp_error` e mudando `status` para `failed`. Hoje, se a Meta marca falha, o usuário não vê.

### 3. `src/components/ChatInterface.tsx` — mostrar status da Meta na bolha
- Para mensagens com `metadata.template`, mostrar abaixo do nome do template:
  - `Entregue ao WhatsApp` (delivered) / `Lido` (read) / `Falhou: <error.title>` (failed) / `Aguardando` (sent).
- Adicionar um pequeno botão "Ver detalhes" que abre um modal simples com o JSON `metadata.whatsapp_response` e `metadata.whatsapp_error`. Isso permite copiar o erro exato da Meta.

### 4. `supabase/functions/whatsapp-sender/index.ts` — `buildTemplatePayload`
- Se houver componente `BUTTONS` com `sub_type=URL` e `example`/parâmetro dinâmico, montar `components: [{ type: 'button', sub_type: 'url', index: '0', parameters: [...] }]`. Para botões 100% estáticos (caso atual), nada muda.
- Logar warning se algum `{{n}}` no header/body/buttons ficar sem valor (`vars[n] === undefined`).

### 5. `src/components/chat/TemplatePickerModal.tsx` — aviso sobre idioma e categoria
- Mostrar um banner amarelo na pré-visualização quando:
  - `template.language !== 'pt_BR'` e o conteúdo parece ser português (heurística simples: contém palavras como "olá", "você"). Texto: "Este template está cadastrado como `<lang>`. Recadastre como `pt_BR` para evitar problemas de entrega.".
  - `template.category === 'MARKETING'`. Texto: "Templates de marketing podem não ser exibidos para quem optou por não receber promoções no WhatsApp, mesmo que a Meta marque como entregue.".

### 6. Documentação rápida no `SystemRoadmap.tsx`
- Adicionar bloco "Por que um template marca como enviado mas o cliente não recebe?" listando as 4 causas (opt-out marketing, idioma errado, número em modo teste, quality rating).

## Resultado esperado

Após o deploy:
- O usuário consegue ver na própria bolha do chat se a Meta retornou erro e qual.
- O modal de envio alerta sobre os dois principais culpados (idioma `en` num template em português + categoria `MARKETING`).
- No caso atual específico (`feedback_pedido` → +51), a tela vai mostrar "Entregue ao WhatsApp" e o aviso "marketing pode ser suprimido por opt-out", confirmando que a falha é externa (preferência do destinatário) e não do sistema.

## Notas técnicas

- Não vou alterar a lógica de fila, autenticação nem o fluxo de inserção em `messages`/`send_queue` — só enriquecer metadata e UI.
- Sem migrations: tudo cabe em `metadata jsonb` que já existe nas duas tabelas.
- Sem novos secrets.
