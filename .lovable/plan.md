# Remover tags de suporte — manter só os tickets

Hoje o suporte aparece em dois lugares diferentes: as tags `motivo:*` / `sentimento:*` (na lista lateral, na seção Tags e no card "Suporte ativo") e os tickets de suporte. Isso duplica informação e gera tags que não dá para remover. A ideia é deixar o ticket como única fonte de verdade, no mesmo padrão do print (chip do grupo + categoria + status "Em aberto"/"Encerrado").

## O que muda

1. **Nada mais cria tag de suporte**
   - A Donatella para de gravar `motivo:*` e `sentimento:*` na conversa ao classificar/transferir o atendimento — a classificação continua indo para o ticket de suporte (grupo, categoria, sentimento, resumo, nº do pedido).
   - Mover a conversa para Suporte manualmente deixa de pedir "motivo em chip": abre direto o formulário de ticket (grupo + categoria), como já existe no painel do lead.

2. **Nada mais exibe tag de suporte**
   - Lista de conversas: o chip vermelho passa a vir sempre do ticket aberto (grupo do ticket). Sem ticket, mostra apenas "Suporte".
   - Seção "Tags" do lead: as tags técnicas (`motivo:*`, `sentimento:*`) somem da exibição.
   - Card "Suporte ativo": mostra grupo • categoria do ticket; quando não há ticket, mostra um atalho "Abrir ticket" em vez dos chips de motivo.

3. **Limpeza dos dados existentes**
   - Migração única removendo `motivo:*` e `sentimento:*` das tags das conversas e dos contatos, para as tags antigas (ex.: da Helena) desaparecerem sem precisar de ação manual.

4. **Padrão dos tickets mantido**
   - A seção de tickets continua igual ao print: contador no cabeçalho, card "SUPORTE ATIVO" com "Encerrar", e a lista de tickets com chip de grupo, categoria, resumo, data e status.

## Detalhes técnicos

- `supabase/functions/nina-orchestrator/index.ts`: remover a escrita de `motivo:triagem_suporte` (linha ~1531) e de `motivo:${category_key}` / tag de sentimento no handoff (~1800); o `support_cases` já recebe grupo/categoria/sentimento.
- `src/services/api.ts`: `moveConversationQueue` deixa de aceitar/gravar `reasonKey` (mantém a limpeza de `motivo:*`/`sentimento:*` ao voltar para `sales`); `closeSupportCase` deixa de derivar caso a partir da tag `motivo:*` — encerra o caso aberto e, se não houver, não cria registro sintético; `getSupportReasonStats` (agregação de `motivo:*`) passa a agregar por `support_cases.categoria_suporte`.
- `src/components/support/SupportReasonsDashboard.tsx`: usar a agregação nova baseada em `support_cases` (checar impacto no dashboard antes de trocar).
- `src/components/ChatInterface.tsx`: remover imports/usos de `SUPPORT_REASONS`, `isReasonTag`, `reasonKeyFromTag`, `labelForReasonKey`; filtrar tags com prefixo `motivo:`/`sentimento:` na seção Tags e no chip da lista; substituir o popover "→ Suporte" por abertura do formulário de ticket.
- `src/lib/supportReasons.ts`: manter apenas os helpers ainda usados (ou remover o arquivo se nada mais referenciar).
- Migração: `UPDATE public.conversations` / `public.contacts` retirando elementos com esses prefixos do array `tags`.
