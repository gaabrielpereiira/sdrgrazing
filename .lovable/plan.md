
## Objetivo

Trazer para a Donatella a funcionalidade de gerenciar **Message Templates do WhatsApp Cloud API**:

1. **Sincronizar (puxar)** os templates já existentes na conta Meta da Donatella (usando o WABA ID + access token que já estão em `nina_settings`).
2. **Criar / editar / excluir** templates dentro da própria Donatella e submeter à Meta para aprovação.
3. **Listar** templates com status (APPROVED / PENDING / REJECTED), categoria, idioma e qualidade.
4. (Opcional fase 2) **Enviar** mensagens de template via Meta a partir de uma conversa.

A funcionalidade reutiliza o padrão validado no projeto **"AI Template Creator - WhatsApp API"** (`389bf17f...`), mas adaptada à arquitetura **single-tenant** e à origem de credenciais da Donatella (`nina_settings` em vez de tabela `meta_connections`).

---

## Arquitetura

```text
[Donatella UI: Configurações > WhatsApp Templates]
        │
        ├── "Sincronizar com Meta"  ──► edge: sync-whatsapp-templates
        │                                  └── GET graph.facebook.com/v22.0/{WABA_ID}/message_templates
        │                                  └── upsert em public.whatsapp_templates
        │
        ├── "Novo Template" (wizard) ──► edge: submit-whatsapp-template
        │                                  └── POST graph.facebook.com/.../message_templates
        │                                  └── insert em public.whatsapp_templates (status=PENDING)
        │
        └── Lista / Editar / Excluir ──► leitura direta (RLS) + delete chama Meta DELETE
```

Credenciais Meta lidas de `nina_settings` (campos já existentes):
- `whatsapp_access_token`
- `whatsapp_phone_number_id`
- `whatsapp_business_account_id` (WABA ID — usado para templates)

Se `whatsapp_business_account_id` estiver vazio, mostraremos um aviso pedindo para preenchê-lo na aba **APIs** das Configurações.

---

## Mudanças

### 1. Migration: nova tabela `whatsapp_templates`

Single-tenant, RLS permissiva como o resto da Donatella.

```sql
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id text,                 -- ID retornado pela Meta
  name text NOT NULL,                    -- lowercase, _ , números
  category text NOT NULL DEFAULT 'MARKETING',  -- MARKETING|UTILITY|AUTHENTICATION
  language text NOT NULL DEFAULT 'pt_BR',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  samples jsonb,
  status text NOT NULL DEFAULT 'draft',  -- draft|PENDING|APPROVED|REJECTED|...
  quality_rating text,
  rejected_reason text,
  user_id uuid,                          -- nullable (single-tenant compartilhado)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, language)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can access all whatsapp_templates"
ON public.whatsapp_templates FOR ALL TO authenticated
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;
```

### 2. Edge Function `sync-whatsapp-templates`

- `verify_jwt = false` (padrão Donatella).
- Lê credenciais de `nina_settings` (registro com `user_id IS NULL` — fallback igual ao resto do projeto).
- `GET https://graph.facebook.com/v22.0/{waba_id}/message_templates?limit=250&fields=name,language,status,category,components,quality_score,id,rejected_reason`
- Faz **upsert** em `whatsapp_templates` por `meta_template_id` (e por `(name, language)` para registros locais ainda sem `meta_template_id`).
- Retorna `{ imported, updated, total }`.

### 3. Edge Function `submit-whatsapp-template`

Adaptação do `submit-template` do projeto referência:
- Recebe `{ templateData, templateId?, isEdit? }`.
- Lê credenciais de `nina_settings`.
- Constrói payload Meta (HEADER/BODY/FOOTER/BUTTONS) com extração de variáveis `{{n}}`, sanitização de botões e suporte a header de texto (mídia fica como upgrade futuro).
- `POST` para criar ou `POST` no `meta_template_id` para editar.
- Trata erro de duplicado (`error_subcode 2388024`) buscando o template existente e atualizando.
- Salva em `whatsapp_templates` com `status` retornado pela Meta (geralmente `PENDING`).

### 4. Edge Function `delete-whatsapp-template`

- `DELETE https://graph.facebook.com/v22.0/{waba_id}/message_templates?name={name}` (ou por `hsm_id` quando aplicável).
- Após sucesso, remove o registro local.

### 5. Frontend

#### 5.1 Nova rota e item de menu
- Em `src/App.tsx`: adicionar `<Route path="/templates" element={<WhatsAppTemplates />} />`.
- Em `src/components/Sidebar.tsx`: adicionar item `{ id: 'templates', label: 'Templates WhatsApp', icon: FileText }`.

#### 5.2 `src/components/WhatsAppTemplates.tsx` (nova página)
- Header com botão **"Sincronizar com Meta"** (chama `sync-whatsapp-templates`) e **"Novo Template"**.
- Tabela com colunas: Nome, Categoria, Idioma, Status (badge colorido por status), Qualidade, Atualizado em, Ações (Editar / Excluir / Ver preview).
- Filtros: por status e por categoria.
- Estado vazio com CTA de sincronizar/criar.
- Aviso amarelo no topo quando `nina_settings.whatsapp_business_account_id` estiver vazio, com link para Configurações > APIs.

#### 5.3 `src/components/templates/TemplateEditorModal.tsx` (modal/drawer)
Wizard simplificado (1 tela com seções) baseado no projeto referência:
- **Básico**: nome (validação `^[a-z0-9_]+$`), idioma (select), categoria.
- **Header** (opcional): tipo TEXT/IMAGE/VIDEO/DOCUMENT (na fase 1 só TEXT — mídia fica anotada como follow-up).
- **Body** (obrigatório): textarea com contador (≤1024 chars), detector de variáveis `{{1}}..{{n}}`, campos de "exemplo" para cada variável.
- **Footer** (opcional): texto curto.
- **Botões** (opcional): Quick Reply, URL, Phone — máximo 10.
- **Preview** (lado direito): bolha estilo WhatsApp renderizando o template em tempo real (componente novo `WhatsAppBubblePreview` simplificado, sem copiar o do projeto referência inteiro).
- Submeter chama `submit-whatsapp-template`.

#### 5.4 `src/services/api.ts`
Adicionar:
```ts
templates: {
  list:    () => supabase.from('whatsapp_templates').select('*').order('updated_at', { ascending: false }),
  syncFromMeta: () => supabase.functions.invoke('sync-whatsapp-templates'),
  submit:  (templateData, templateId?) => supabase.functions.invoke('submit-whatsapp-template', { body: { templateData, templateId, isEdit: !!templateId } }),
  remove:  (id, name) => supabase.functions.invoke('delete-whatsapp-template', { body: { id, name } }),
}
```

### 6. (Fase 2 — opcional, pode ficar fora desta entrega) Envio
- Edge `send-whatsapp-template` semelhante ao `send-message` do projeto referência.
- Botão "Enviar template" dentro de uma conversa no chat, abrindo modal para escolher template aprovado e preencher variáveis.

---

## Detalhes técnicos relevantes

- **Versão da Graph API**: `v22.0` (mesmo que o projeto referência).
- **Categorias**: MARKETING / UTILITY / AUTHENTICATION.
- **Linguagens iniciais**: `pt_BR`, `en_US`, `es_ES` (mais podem ser adicionadas no select).
- **Validação de variáveis**: regex `\{\{(\d+)\}\}` — sequenciais começando em 1, nunca no início/fim do body, sample obrigatório.
- **Realtime**: a tabela é adicionada ao `supabase_realtime` para a lista atualizar sozinha quando o status mudar (sync periódico no futuro pode ser cron).
- **Sem foreign keys** para `auth.users` (consistente com o resto do projeto single-tenant).
- **Erros Meta**: mensagem amigável extraída de `error.error_user_msg || error.message`; `error_subcode 2388024` (template duplicado) tratado com auto-update.

## Fora do escopo desta entrega
- Geração de templates por IA (Copy → Template) — pode ser uma fase 3 reaproveitando `generate-templates-from-copy` com Lovable AI Gateway.
- Upload de mídia (imagem/vídeo/documento) no header — fase 2.
- Multi-instância WhatsApp — Donatella é single-tenant com uma conexão Meta.
- Envio em massa / analytics — fora do escopo agora.

## Resultado para o usuário

Na sidebar aparecerá **"Templates WhatsApp"**. Ao entrar:
- Um clique em **Sincronizar com Meta** já traz todos os templates existentes da conta WhatsApp Business conectada.
- Um clique em **Novo Template** abre um editor com preview ao vivo, valida as regras da Meta e envia para aprovação.
- A lista mostra status em tempo real (APPROVED / PENDING / REJECTED) com motivo da rejeição quando houver.
