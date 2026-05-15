# Tickets de suporte + Mapeamento de motivos no Dashboard

## Como funciona hoje
- Conversas com `queue = 'support'` em `public.conversations` representam tickets de suporte.
- Não existe coluna de "motivo" — vamos usar **tags** com prefixo `motivo:` (ex.: `motivo:cobranca`, `motivo:acesso`) para que fique consultável e reutilizável.

## Mudanças

### 1. Captura do motivo (frontend, `ChatInterface.tsx`)
Quando o usuário clica em **→ Suporte** no header da conversa (já existente), abrir um pequeno popover com chips de motivo:
- Cobrança · Acesso · Bug · Dúvida · Pedido · Outro
- A escolha adiciona uma tag `motivo:<slug>` ao array `conversations.tags` antes de mover a conversa para `queue='support'`.
- Se o usuário fechar sem escolher, registra `motivo:nao_classificado`.
- Mover de Suporte → Atendimento limpa as tags `motivo:*`.

### 2. Dashboard (`src/components/Dashboard.tsx`)
Adicionar uma nova seção **"Suporte"** abaixo dos cards de métricas, com:

**a) KPI de tickets de suporte** (1 card grande, mesmo estilo dos outros)
- Conta conversas com `queue='support'` e `started_at >= período` (Hoje / 7d / 30d, respeitando o filtro existente).
- Mostra: total no período · ativos · finalizados (badges pequenos).
- Comparativo de tendência vs período anterior (mesma lógica usada nos outros cards).

**b) Mapa de motivos** (painel lateral)
- Agrega tags `motivo:*` das conversas `queue='support'` do período.
- Renderiza top 6 motivos como linhas com nome legível ("Cobrança", "Acesso", …) + contagem + barra horizontal proporcional ao maior valor.
- Fallback "Não classificado" para conversas suporte sem tag de motivo.
- Empty state: "Nenhum ticket de suporte no período".

Layout sugerido (logo abaixo dos 4 cards atuais, antes dos charts):
```text
┌─────────────────────────┬───────────────────────────────┐
│ KPI Tickets de suporte  │ Principais motivos (lista)    │
│  total · ativos · fin.  │ ▓▓▓▓▓▓ Cobrança       12      │
│  trend vs período ant.  │ ▓▓▓▓   Acesso          7      │
│                         │ ▓▓     Bug             3      │
└─────────────────────────┴───────────────────────────────┘
```

### 3. Camada de dados (`src/services/api.ts`)
Adicionar `fetchSupportSummary(days: number)` que retorna:
```ts
{
  total: number;
  active: number;
  finished: number;
  prevTotal: number; // pra calcular trend
  reasons: { key: string; label: string; count: number }[];
}
```
Implementação: 1 query em `conversations` filtrada por `queue='support'` e `started_at`, agregando tags em memória no cliente (volume baixo de tickets justifica).

## Fora de escopo
- Classificação automática por IA dos motivos (poderia ser uma melhoria futura usando Lovable AI Gateway, lendo a 1ª mensagem do contato).
- Persistir motivos numa tabela própria (`support_tickets`) — por ora reusamos `tags`, sem mudança de schema.

## Arquivos tocados
- `src/services/api.ts` — novo método `fetchSupportSummary`.
- `src/components/Dashboard.tsx` — nova seção Suporte (KPI + lista de motivos).
- `src/components/ChatInterface.tsx` — popover de motivo ao mover para Suporte.
- `src/constants.ts` (opcional) — lista canônica de motivos com slug + label.

Sem migrações, sem novas RLS, sem edge functions.
