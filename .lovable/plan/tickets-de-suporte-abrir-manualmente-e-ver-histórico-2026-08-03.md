# Tickets de suporte: abrir manualmente e ver histórico

## O que já existe
- Tabela `support_cases` com grupo, categoria, resumo, nº do pedido, responsável, e os campos de encerramento (`closed_at`, `closed_by`, `resolution_note`).
- Painel "Informações do Lead" já mostra o card "Suporte ativo" (com botão Encerrar + nota) e a lista de tickets do contato.
- `api.closeSupportCase` encerra o ticket e registra no histórico; arquivar a conversa também encerra.

## O que falta (o pedido)
1. **Abrir ticket manualmente** — hoje só a Donatella cria tickets automaticamente. Vamos adicionar um botão "Abrir ticket" no painel do lead.
2. **Histórico separado de encerrados** — hoje abertos e encerrados aparecem misturados na mesma lista.

## Como vai funcionar

### 1. Botão "Abrir ticket" (painel Informações do Lead)
Ao clicar, abre um formulário compacto inline com:
- **Grupo** (Entrega / Produto / Pedido-Pagamento / Outros)
- **Categoria** (lista filtrada pelo grupo escolhido — as 17 categorias já existentes)
- **Nº do pedido** (opcional, pré-preenchido com o último pedido do lead quando houver)
- **Resumo** (opcional)

Ao confirmar:
- cria o registro em `support_cases` (aberto, sem `closed_at`), com o agente logado como responsável;
- move a conversa para a fila de **Suporte** com a tag de motivo correspondente, para o chip vermelho aparecer na lista lateral;
- o card "Suporte ativo" passa a mostrar grupo + categoria do ticket criado.

Mais de um ticket pode ser aberto para o mesmo cliente ao longo do tempo — cada um fica no histórico.

### 2. Histórico de tickets encerrados
A seção "Histórico de Suporte" passa a ter duas partes:
- **Em aberto** — tickets sem encerramento, no topo.
- **Encerrados (N)** — bloco recolhível (fechado por padrão) com todos os tickets já encerrados, mostrando: grupo, categoria, resumo, nota de resolução, data de abertura → data de encerramento, nº do pedido e responsável.

Assim, ao abrir a conversa de qualquer cliente, dá para ver rapidamente tudo que ela já teve de problema com a gente.

## Detalhes técnicos
- `src/services/api.ts`: nova função `openSupportCase(conversationId, { grupo, categoria, orderNumber, resumo })` — insere em `support_cases` resolvendo `contact_id` da conversa e `responsavel_id` pelo `team_members` do usuário logado, e chama `moveConversationQueue(id, 'support', { reasonKey })`.
- `src/hooks/useSupportCasesByContact.ts`: sem mudança de query; expor `openCases` e `closedCases` derivados de `closed_at` para simplificar a UI.
- `src/components/ChatInterface.tsx`: novo formulário inline de abertura (estado local: `openTicketFormOpen`, grupo, categoria, pedido, resumo) e a divisão abertos/encerrados com bloco recolhível. Sem mudança de banco de dados — os campos necessários já existem.
