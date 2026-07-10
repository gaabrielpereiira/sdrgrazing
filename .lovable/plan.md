## Problema
Em Settings → Agente → "Alerta de novo chamado de suporte", o campo **Nome do template aprovado** é um input de texto livre. O usuário precisa digitar o nome manualmente e não consegue ver os templates disponíveis.

## Solução
Trocar o `<input type="text">` por um `<select>` que lista todos os templates da tabela `whatsapp_templates` com `status = 'APPROVED'`.

### Detalhes
- **Query:** `supabase.from('whatsapp_templates').select('id, name, language, category').eq('status', 'APPROVED').order('name')`.
- Carregar junto com os `teamMembers` no `useEffect` já existente do `AgentSettings.tsx`.
- Cada option mostra `nome_do_template · pt_BR · UTILITY` para dar contexto; `value` = `name` (compatível com o que hoje está salvo em `support_alert_template`).
- Se não houver templates aprovados, exibir uma option desabilitada "Nenhum template aprovado — crie na aba WhatsApp Templates".
- Mostrar também uma option vazia "— Selecione um template —" no topo.
- Mantém o link "Como criar o template na aba WhatsApp Templates" existente.

### Arquivos
- `src/components/settings/AgentSettings.tsx`: adicionar state `templates`, fetch no load, e substituir o input pelo select.

Nenhuma migração, edge function ou mudança de schema é necessária.
