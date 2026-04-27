

## Plano: Implementar controle de registro de novos usuários

### O que será feito
Copiar a lógica do projeto "Remix - Nina Evolution" para permitir habilitar/desabilitar o registro de novos usuários, com toggle acessível a qualquer usuário autenticado.

### 1. Migration: Criar tabela `system_settings`

```sql
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas: qualquer autenticado pode ler, inserir e atualizar
CREATE POLICY "Authenticated can read system_settings"
ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert system_settings"
ON public.system_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update system_settings"
ON public.system_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Anon pode ler (para a tela de login verificar)
CREATE POLICY "Public can read system_settings"
ON public.system_settings FOR SELECT TO anon USING (true);
```

### 2. Auth.tsx — Verificar `registration_enabled` antes de exibir opção de criar conta

- Adicionar `import { supabase }` 
- Adicionar estado `registrationEnabled` (default `true`)
- No `useEffect`, buscar `system_settings.registration_enabled` com `.maybeSingle()`
- Se `data` é `null` (row não existe) → manter `true` (registro habilitado por padrão)
- Se `data.registration_enabled === false` → esconder botão "Criar conta" e bloquear submit de signup
- Condicionar a seção do link "Não tem uma conta?" com `registrationEnabled !== false`

### 3. Team.tsx — Adicionar toggle de registro

- Adicionar estados: `registrationEnabled`, `registrationSettingsId`, `updatingRegistration`
- No `loadAllData`, buscar `system_settings` com `.maybeSingle()` (não `.single()` para evitar erro quando não existe row)
- Adicionar função `handleRegistrationToggle` que faz upsert na tabela
- Adicionar card com `Switch` + label "Permitir novos registros" acima da lista de membros
- Importar `Switch` e `Label` dos componentes UI

### 4. Lógica de segurança

| Valor de `registration_enabled` | Comportamento |
|---|---|
| `true` | Registro habilitado ✅ |
| `false` | Registro desabilitado ❌ |
| `null` (row não existe) | Registro habilitado ✅ |

### Arquivos modificados
- **Migration SQL** — nova tabela `system_settings` + RLS permissivas
- **`src/pages/Auth.tsx`** — verificar setting antes de mostrar signup
- **`src/components/Team.tsx`** — adicionar toggle de registro

