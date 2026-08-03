# Histórico de suporte no perfil do lead

Hoje o painel "Informações do Lead" já tem uma seção "Tickets de Suporte" que lista os casos da tabela de casos de suporte daquele contato. O que falta: quando o ticket é encerrado no chat (botão "Encerrar" ou ao arquivar a conversa), nada é registrado — o encerramento só muda a fila da conversa de volta para Atendimento. E quando o motivo é definido manualmente pelos chips, também não nasce um caso. Resultado: o histórico fica vazio ou desatualizado depois do atendimento.

## O que vai mudar

1. **Encerrar ticket grava histórico**
   - Ao clicar em "Encerrar" no card "Suporte ativo", o ticket é fechado e registrado: data de abertura, data de encerramento, motivo/categoria, responsável e resumo.
   - Se não existir caso aberto (ex.: suporte marcado manualmente), o sistema cria o registro a partir do motivo selecionado, para nunca perder o histórico.
   - Ao arquivar a conversa, qualquer ticket ainda aberto é encerrado automaticamente.

2. **Nota de encerramento (opcional)**
   - Ao encerrar, um campo curto permite escrever como o problema foi resolvido. Essa nota aparece no histórico.

3. **Seção "Histórico de Suporte" no lead**
   - Renomeada de "Tickets de Suporte" para "Histórico de Suporte".
   - Cada item mostra: motivo/categoria, chip de grupo, status (**Em aberto** / **Encerrado**), período (abertura → encerramento), número do pedido quando houver, responsável e a nota de resolução.
   - Ordenado do mais recente para o mais antigo; contador total no cabeçalho.
   - Continua atualizando em tempo real.

## Detalhes técnicos

- **Banco** (migração em `support_cases`): novas colunas `closed_at timestamptz`, `closed_by uuid` (referência a `team_members`), `resolution_note text`. Nenhum dado existente é perdido; casos atuais ficam como "Em aberto" até serem encerrados. `status_resolucao` continua indicando a rota (IA vs agente) e o fechamento passa a ser derivado de `closed_at`.
- **`src/services/api.ts`**:
  - novo `closeSupportCase(conversationId, { note })`: encerra o caso aberto da conversa ou cria um a partir da tag `motivo:*` e depois encerra; em seguida chama `moveConversationQueue(..., 'sales')`;
  - `endConversation` passa a encerrar casos abertos da conversa antes de arquivar.
- **`src/hooks/useSupportCasesByContact.ts`**: incluir `closed_at`, `resolution_note`, `responsavel:team_members(name)` no select.
- **`src/components/ChatInterface.tsx`**: botão "Encerrar" abre um mini-prompt de nota e chama `api.closeSupportCase`; seção de histórico atualizada com status/período/nota/responsável.
