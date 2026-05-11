## Responsividade mobile — app inteiro

Objetivo: o app inteiro precisa funcionar bem em telas a partir de **375px**, mantendo o layout desktop intocado em ≥`md` (768px+). Vou usar Tailwind responsivo (`sm:`, `md:`, `lg:`) e ajustar componente por componente, sem mexer em lógica/back-end.

### 1. Shell (`App.tsx` + `Sidebar.tsx`)
- Já existe `MobileSidebar` (drawer com hamburger, `md:hidden`) e o Sidebar desktop (`hidden md:flex`). Garantir que o `<main>` em `App.tsx` deixe espaço para a topbar mobile (padding-top ou margin) e que os "ambient glows" não causem overflow horizontal (`max-w-screen overflow-x-hidden` no wrapper).
- Mover o `NotificationsBell` para dentro da topbar mobile do Sidebar.

### 2. ChatInterface (`/chat`) — o caso mais crítico
Hoje é um split em duas colunas (`w-80 lg:w-96` + área da conversa).
- **Mobile (`< md`)**: comportamento "stack" — mostrar **só a lista** quando `selectedChatId === null`; ao selecionar, **ocultar a lista** e mostrar a conversa em tela cheia, com botão "voltar" no header (chevron-left) que faz `setSelectedChatId(null)`.
- Desktop (`md+`): split atual preservado.
- Painel direito de "perfil/contato" vira **Sheet/Drawer** no mobile, abre por botão no header.
- Composer (input + anexos): largura 100%, botões mantém touch-target ≥40px; remover paddings horizontais excessivos.
- Tabs (Atendimento/Suporte e Ativas/Finalizadas) ficam empilhadas e ocupam 100%.

### 3. Dashboard (`/Dashboard.tsx`)
- Grids de cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Filtros de período: viram `flex flex-wrap gap-2` no mobile.
- Gráficos: container com `min-w-0` e `overflow-x-auto` quando necessário.

### 4. Pipeline / Kanban (`/Kanban.tsx`)
- Manter colunas lado a lado com **scroll horizontal** (`overflow-x-auto snap-x`); cada coluna `min-w-[280px]`. Sem tentar empilhar — Kanban empilhado perde sentido.
- Header e filtros: `flex-wrap`, busca ocupa 100% no mobile.

### 5. Contatos (`/Contacts.tsx`)
- Tabela atual no desktop. No mobile (`md:hidden`), renderizar a mesma lista como **cards verticais** (nome, telefone, tags, ações em menu/kebab). Filtros viram `Sheet`.

### 6. Agendamentos (`/Scheduling.tsx`)
- Calendário: usar visão **agenda/lista** no mobile (`md:hidden`), e grade semanal no desktop. Botões de criar/filtros viram floating action / `flex-wrap`.

### 7. Equipe (`/Team.tsx`) e Templates (`/WhatsAppTemplates.tsx`)
- Mesmo padrão dos Contatos: tabela → cards no mobile.
- Modais (`TeamConfigModal`, `CreateDealModal`, `PipelineSettingsModal`, `LostReasonModal`) recebem `max-h-[90vh] overflow-y-auto w-[95vw] sm:w-auto` e padding reduzido no mobile.

### 8. Configurações (`/Settings.tsx`) e SystemRoadmap
- Tabs verticais em mobile (`flex-col sm:flex-row`) ou tabs horizontais com scroll.
- Conteúdo das abas: campos de form em `grid-cols-1 md:grid-cols-2`.

### 9. Auth (`/pages/Auth.tsx`) e Onboarding (`OnboardingWizard.tsx`, `OnboardingBanner.tsx`)
- Card central com `w-full max-w-md px-4`, sem alturas fixas grandes.
- Wizard: passos com `max-h-[90vh] overflow-y-auto`, botões em `flex-col sm:flex-row` e largura 100%.

### 10. Toaster e overlays
- `Toaster` já é OK; conferir que `position` não colide com a topbar mobile (talvez `top-center` em `< sm`).
- Modais Radix (`Dialog`) já são responsivos por padrão; só ajustar `max-w` por content.

### Padrão de breakpoints adotado
- `sm` 640px — telas grandes de celular
- `md` 768px — divisor mobile↔desktop (split do chat, sidebar persistente, tabela)
- `lg` 1024px — refinos (gaps maiores, segunda coluna no chat lg:w-96)

### Fora de escopo
- PWA / Capacitor (não foi pedido).
- Reescrita visual / redesign — só responsividade.
- Nenhuma mudança em hooks de dados, RLS ou edge functions.

### Estratégia de execução
Vou em duas levas para evitar uma resposta gigante:

**Leva 1 (esta resposta):** Shell (App + Sidebar topbar), ChatInterface, Dashboard, Kanban, Auth, Onboarding, modais grandes — cobre ~80% do uso diário.

**Leva 2 (próxima mensagem, se aprovar a leva 1):** Contatos, Agendamentos, Equipe, Templates, Settings, SystemRoadmap.

### Arquivos tocados na Leva 1
- `src/App.tsx`
- `src/components/Sidebar.tsx` (+ topbar mobile já existente)
- `src/components/ChatInterface.tsx` (maior trabalho)
- `src/components/Dashboard.tsx`
- `src/components/Kanban.tsx`
- `src/components/CreateDealModal.tsx`, `LostReasonModal.tsx`, `PipelineSettingsModal.tsx` (ajustes pequenos)
- `src/pages/Auth.tsx`
- `src/components/OnboardingWizard.tsx`, `OnboardingBanner.tsx`
