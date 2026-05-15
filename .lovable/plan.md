## Verificação concluída

Inspecionei todas as foreign keys do banco e o código atual de `deleteContact` (`src/services/api.ts:2059`). Resultado:

### FKs relevantes (todas seguras)
| Tabela origem | Coluna | Referencia | ON DELETE |
|---|---|---|---|
| `conversations.contact_id` | → `contacts` | CASCADE |
| `messages.conversation_id` | → `conversations` | CASCADE |
| `conversation_states.conversation_id` | → `conversations` | CASCADE |
| `deals.contact_id` | → `contacts` | CASCADE |
| `deal_activities.deal_id` | → `deals` | CASCADE |
| `appointments.contact_id` | → `contacts` | SET NULL |
| `send_queue.message_id` | → `messages` | SET NULL ✅ (corrigido) |
| `message_grouping_queue.message_id` | → `messages` | SET NULL ✅ |
| `messages.reply_to_id` | → `messages` | SET NULL ✅ |

`send_queue`, `nina_processing_queue` e `message_processing_queue` **não possuem FK** apontando para `conversations`/`contacts` — são apenas colunas UUID soltas. Portanto não há risco de erro de FK quando o contato é apagado.

### Estado atual do `deleteContact`
- ✅ Apaga `send_queue` por `conversation_id`
- ✅ Apaga `nina_processing_queue` por `conversation_id`
- ✅ Apaga `messages`, `conversation_states`, `conversation_activities`, `conversations`, `deal_activities`, `deals`, `contact_cooldowns`, `notifications`, `contacts`
- ⚠️ **Não** limpa `message_processing_queue` (tabela só tem `whatsapp_message_id`/`phone_number_id`, sem vínculo direto com contato).

## Plano de melhoria (pequeno)

**1. Limpar `message_processing_queue`** antes de deletar mensagens, usando os `whatsapp_message_id` reais do contato:
```ts
if (convIds.length > 0) {
  const { data: msgs } = await supabase
    .from('messages')
    .select('whatsapp_message_id')
    .in('conversation_id', convIds)
    .not('whatsapp_message_id', 'is', null);
  const wamids = (msgs || []).map(m => m.whatsapp_message_id).filter(Boolean);
  if (wamids.length > 0) {
    await supabase.from('message_processing_queue').delete().in('whatsapp_message_id', wamids);
    await supabase.from('message_grouping_queue').delete().in('whatsapp_message_id', wamids);
  }
  // ... resto do fluxo atual
}
```

**2. Não há mudança de schema necessária** — todas as FKs já estão corretas.

## Conclusão

Nenhum erro de FK ocorrerá no fluxo atual. A melhoria acima é apenas higiene para evitar lixo em `message_processing_queue`/`message_grouping_queue` órfão do contato apagado. Se você quiser, aplico essa limpeza extra.