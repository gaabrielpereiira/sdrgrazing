# Corrigir mensagens "duplicadas" no chat

## Diagnóstico

As mensagens nos prints **não são duplicadas de verdade** — o cliente realmente enviou só uma vez cada. O que está acontecendo:

Quando o lead manda várias mensagens rápidas (ex.: `Oa`, `Olá`), o `whatsapp-webhook` cria cada mensagem individual no banco imediatamente (para aparecer em tempo real). Depois de 10s, a função `message-grouper` agrupa essas mensagens para mandar para a Nina com contexto completo. **O bug está aqui:**

`supabase/functions/message-grouper/index.ts` (~linha 115):

```ts
if (dbMessages.length > 1) {
  await supabase
    .from('messages')
    .update({
      content: combinedContent,   // ← sobrescreve "Olá" com "Oa\nOlá"
      metadata: { ...lastDbMessage.metadata, grouped_messages: messageIds, ... }
    })
    .eq('id', lastDbMessage.id);
}
```

A última mensagem do grupo é **reescrita** com a concatenação de todas as anteriores. Resultado visível no chat:

```
[bubble 1] Oa
[bubble 2] Oa
           Olá        ← era só "Olá", virou "Oa\nOlá"
```

Por isso o print do Naty mostra `Olay` / `Boa tarde Donatella` / `Olay\nBoa tarde Donatella\nTd bem?` — cada bolha individual continua existindo, mas a última foi inflada com o texto das anteriores.

## Solução

A Nina **já recebe** o conteúdo combinado via `context_data.combined_content` na fila `nina_processing_queue`, então não há razão para alterar o `content` da mensagem no banco. Basta:

1. **`supabase/functions/message-grouper/index.ts`**
   - Remover o `update({ content: combinedContent, ... })` da última mensagem quando `dbMessages.length > 1`.
   - Manter apenas a atualização de `metadata` (opcional: `grouped_messages`, `message_count`) para fins de auditoria — sem mexer em `content`.
   - Manter o caso especial de áudio único: continuar gravando a transcrição em `content` quando `dbMessages.length === 1 && type === 'audio'` (esse update é legítimo e não causa duplicação visual).
   - O `combinedContent` segue sendo enviado para a Nina via `context_data.combined_content` exatamente como hoje.

2. **Nada mais precisa mudar** — `nina-orchestrator` já lê `context_data.combined_content` quando disponível para montar o prompt, então o agrupamento semântico para a IA continua funcionando.

## Arquivos

- `supabase/functions/message-grouper/index.ts` — remover sobrescrita de `content` no agrupamento de mensagens de texto.

## Observações

- Mensagens já existentes no banco que foram "infladas" continuarão exibindo o texto concatenado (são dados históricos). A correção evita que o problema aconteça em novas conversas.
- Se quiser limpar o histórico, posso adicionar uma migration opcional que detecta mensagens com `metadata.grouped_messages` e restaura o `content` original a partir do payload em `message_grouping_queue.message_data`. Avise se quer incluir.
