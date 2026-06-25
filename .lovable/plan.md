# Horários de atendimento por equipe

Hoje só existe um horário global em `nina_settings`. Vou tornar configurável **por equipe** (Produção e Comercial), com regras por dia da semana e cadastro manual de feriados, e disparar auto-resposta quando a mensagem chegar fora do expediente — **sem parar a IA**.

## Banco de dados (1 migration)

**`team_business_hours`** — uma linha por (team, day_of_week)
- `team_id` (FK teams), `day_of_week` (0–6), `is_open` (bool), `start_time`, `end_time`
- Único: (team_id, day_of_week)

**`team_holidays`** — feriados manuais
- `team_id` (NULL = vale para todas as equipes), `date`, `name`, `is_open` (bool, default false), `start_time`/`end_time` opcionais (para feriados com horário reduzido, ex.: Domingo/Feriado 08–17 da Produção fica no `team_business_hours` de domingo; feriados pontuais usam essa tabela)

**`nina_settings`** — adicionar:
- `out_of_hours_auto_reply` (text) — mensagem padrão enviada uma vez por conversa fora do horário
- `out_of_hours_cooldown_minutes` (int, default 360)

Seed inicial:
- **Produção**: Seg–Sáb 08:00–20:00, Domingo 08:00–17:00
- **Comercial**: Seg–Sex 08:00–18:00; demais dias fechados

GRANTs + RLS permissivo authenticated (padrão do projeto).

## UI

**Novo card em `src/components/TeamConfigModal.tsx`** (ou aba nova "Horários" dentro do modal de equipe em `Team.tsx`):
- Tabela 7 linhas (Dom–Sáb) com toggle "Aberto" + dois time inputs
- Botão "Aplicar Seg–Sex" / "Aplicar Seg–Sáb" para acelerar
- Subseção "Feriados": lista com data + nome + botão remover, input para adicionar

**`src/components/settings/AgentSettings.tsx`**:
- Novo bloco "Mensagem fora do horário" (textarea + input minutos de cooldown)
- Remover/depreciar os campos globais `business_hours_start/end/days` (manter como fallback se nenhuma equipe configurada)

## Lógica (backend)

**Novo helper** `supabase/functions/_shared/business-hours.ts`:
- `isTeamOpen(teamId, now)` — consulta `team_holidays` (override), depois `team_business_hours` para o dia da semana, considera timezone de `nina_settings.timezone`
- `nextOpeningDescription(teamId, now)` — string "amanhã às 08:00" usada no template

**`nina-orchestrator/index.ts`**:
- Após resolver a equipe da conversa (assigned_team_id ou rota de triagem), checar `isTeamOpen`
- Se fechado: enfileirar a `out_of_hours_auto_reply` (substituindo `{{horario}}` pelo `nextOpeningDescription`), respeitando cooldown via `contact_cooldowns` para não repetir
- IA segue processando normalmente (conforme escolha do usuário)

**`automation-runner`**: nenhuma mudança — automações continuam disparando 24/7.

## Frontend tipos

- Regenerar `src/integrations/supabase/types.ts` após migration
- `src/services/api.ts`: CRUD para `team_business_hours` e `team_holidays`

## Arquivos tocados

```
supabase/migrations/<novo>.sql           [novo]
supabase/functions/_shared/business-hours.ts  [novo]
supabase/functions/nina-orchestrator/index.ts [editar]
src/components/TeamConfigModal.tsx       [editar - aba Horários]
src/components/settings/AgentSettings.tsx [editar - bloco fora-do-horário]
src/services/api.ts                       [editar]
src/types.ts                              [editar]
```

## Resultado

- Produção: aberta Seg–Sáb 08–20, Dom 08–17, fechada em feriados manuais (ou horário reduzido se configurado)
- Comercial: aberta Seg–Sex 08–18
- Fora do horário: cliente recebe uma única mensagem de aviso (com próximo horário) e a Donatella continua respondendo
- Configurável depois pela UI sem precisar de código
