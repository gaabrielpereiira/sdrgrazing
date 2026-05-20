# Atualização automática da UI após mudanças

## Diagnóstico

Investiguei o motivo da UI não atualizar sem refresh em ações como "mudar nome do usuário" e "criar tarefa". Encontrei **três causas combinadas**:

### 1. Tabelas faltando na publicação Realtime
Hoje só estão publicadas as tabelas do chat. Estas estão de fora:
- `profiles` (nome do usuário)
- `nina_settings` (configurações do agente)
- `tag_definitions` (tags)
- `system_settings` (registro habilitado, etc.)
- `user_roles` (mudança de função)

Sem estar na publicação, o Supabase Realtime nunca emite o evento — a tela só reflete a mudança no próximo fetch (refresh).

### 2. `REPLICA IDENTITY` incompleta
Algumas tabelas estão como `default` em vez de `full`:
- `team_members`, `profiles`, `nina_settings`, `tag_definitions`

Isso faz eventos de UPDATE chegarem incompletos (ou nem chegarem para clientes anon).

### 3. RLS bloqueia o canal Realtime para sessão anônima
Tabelas como `team_members`, `profiles`, `nina_settings`, `tag_definitions` só têm policies para `authenticated`. Como a autenticação está temporariamente bypassada (memória do projeto), o canal Realtime usa role `anon` e **não recebe nada**.

Já existe esse padrão "permissivo" em `conversation_activities` (`Public can access ...` para `anon`). Vamos replicar.

### 4. Algumas mutações não fazem refetch nem update otimista
Componentes confiam 100% em refetch via Realtime. Quando Realtime falha (itens 1-3), nada acontece até refresh.

---

## Plano

### A. Migration SQL única
1. `ALTER TABLE ... REPLICA IDENTITY FULL` para: `team_members`, `profiles`, `nina_settings`, `tag_definitions`, `system_settings`, `user_roles`.
2. Adicionar à publicação `supabase_realtime` (idempotente): `profiles`, `nina_settings`, `tag_definitions`, `system_settings`, `user_roles`.
3. Criar policies permissivas para role `anon` (apenas SELECT — o suficiente pro Realtime entregar eventos; mutações continuam restritas) nas mesmas tabelas, seguindo o padrão de `conversation_activities`.

### B. Update otimista no frontend (cinto + suspensório)
Mesmo com Realtime funcionando, atualizar o estado local imediatamente após a mutação melhora muito a percepção de velocidade e cobre o caso de Realtime cair. Vou ajustar:

- `src/components/Team.tsx` — após criar/editar/excluir/sync membro, atualizar `members` localmente em vez de só esperar Realtime.
- `src/hooks/useConversationActivities.ts` — já chama `fetchActivities()` ao final, mas vou também aplicar update otimista no estado antes do round-trip (criar/concluir/deletar).
- `src/components/Settings.tsx` (aba Agente) e `src/components/settings/AgentSettings.tsx` — atualizar estado local após salvar `nina_settings`.
- `src/components/TagSelector.tsx` (e onde tags são criadas) — refetch ou push local após criar tag.

### C. Hook utilitário opcional
Adicionar pequeno helper `useRealtimeRefresh(tables, onChange)` para padronizar os subscribes que hoje estão duplicados em Team, Contacts, Activities, etc. (opcional — só se ajudar a reduzir bugs).

---

## Detalhes técnicos

### Migration (esboço)
```sql
-- Replica identity completa
ALTER TABLE public.team_members      REPLICA IDENTITY FULL;
ALTER TABLE public.profiles          REPLICA IDENTITY FULL;
ALTER TABLE public.nina_settings     REPLICA IDENTITY FULL;
ALTER TABLE public.tag_definitions   REPLICA IDENTITY FULL;
ALTER TABLE public.system_settings   REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles        REPLICA IDENTITY FULL;

-- Publicação realtime (idempotente via DO $$ ... $$)
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='profiles';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; END IF;
  -- repetir para nina_settings, tag_definitions, system_settings, user_roles
END $$;

-- Policies permissivas (anon SELECT) — espelhando padrão de conversation_activities
CREATE POLICY "Public can read team_members"
  ON public.team_members FOR SELECT TO anon USING (true);
-- idem profiles, nina_settings, tag_definitions, system_settings, user_roles
```

### Escopo fora do plano
- Não vou mexer em RLS de escrita (continua só admin/authenticated).
- Não vou reativar auth (memória diz que está intencionalmente desligada).
- Não vou refatorar nenhum componente além do necessário pra update otimista.

---

## Resultado esperado
Mudar nome no perfil, criar/concluir tarefa, editar membro do time, criar tag, editar configuração do agente → atualiza na tela **na hora**, sem F5.
