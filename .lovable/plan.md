# Modelo de IA — Multi-provedor com API Key

Apenas mudanças de UI/estado dentro do bloco "Modelo de IA" em `src/components/settings/AgentSettings.tsx`. Nada fora dessa seção será tocado.

## 1. Migration (campos novos em `nina_settings`)

Adicionar 3 colunas para persistir provedor e chaves:

- `ai_provider text default 'google'` — valores: `google` | `openai` | `anthropic`
- `ai_model text` — id do modelo selecionado dentro do provedor (ex: `gpt-4o-mini`, `claude-sonnet-4-5`). Para Google continua mapeando para os ids atuais (`flash`/`pro`/`pro3`/`adaptive`) para não quebrar o backend existente.
- `ai_api_keys jsonb default '{}'::jsonb` — `{ google: string, openai: string, anthropic: string }`

`ai_model_mode` continua existindo (não removo nada) para compatibilidade com `nina-orchestrator`.

## 2. UI dentro da seção "Modelo de IA"

Ordem dos elementos no card "Comportamento":

```
[Modelo de IA]
 ├─ Pill selector de provedor: Google | OpenAI | Anthropic  (novo)
 ├─ Grid de 4 cards de modelo (muda conforme provedor)       (existente, dinâmico)
 ├─ Texto descritivo dinâmico do modelo                       (existente)
 └─ Campo API Key — [Provedor]                                (novo)
```

### Pill selector
3 botões estilo pill no topo. Selecionado = fundo violeta translúcido + borda violeta (mesmo padrão dos cards). Ícones: `G` (Google), logo OpenAI, `A` (Anthropic) — usando letras estilizadas + `lucide-react` quando aplicável.

### Cards dinâmicos
Catálogo por provedor (id armazenado em `ai_model`):

- **Google**: `flash` Flash/Rápido ⚡, `pro` Pro 2.5/Inteligente 🧠, `pro3` Pro 3/Mais Recente 🚀, `adaptive` Adaptativo/Contexto 🎯
- **OpenAI**: `gpt-4o-mini` ⚡, `gpt-4o` 🧠, `gpt-4.1` 🚀, `o3` 🎯
- **Anthropic**: `claude-haiku-3-5-20251001` ⚡, `claude-sonnet-4-5` 🧠, `claude-sonnet-4-5-20251001` 🚀, `claude-opus-4-5` 🎯

Ao trocar provedor, seleciona automaticamente o primeiro modelo do catálogo (se o `ai_model` atual não pertencer ao novo provedor).

### Campo API Key
- Input `type=password` com toggle olho (lucide `Eye`/`EyeOff`)
- Label: `API Key — Google` / `OpenAI` / `Anthropic`
- Placeholder por provedor: `AIza...`, `sk-...`, `sk-ant-...`
- Validação no `onBlur` (regex simples por prefixo) — borda verde se válido, vermelha + mensagem se inválido
- Texto auxiliar cinza: "Sua chave é salva com criptografia e nunca é exposta publicamente."
- Estado é mantido por provedor em `apiKeys: { google, openai, anthropic }` — trocar provedor não apaga keys dos outros

## 3. Estado e persistência

Estender interface `AgentSettings` local com:
```ts
ai_provider: 'google' | 'openai' | 'anthropic';
ai_model: string;
ai_api_keys: { google: string; openai: string; anthropic: string };
```

`loadSettings` lê os novos campos com defaults seguros. `handleSave` envia todos juntos no mesmo `update` em `nina_settings`. Para Google, também sincroniza `ai_model_mode = ai_model` para manter compatibilidade com o orchestrator atual.

## 4. Fora de escopo (não tocar agora)

- `nina-orchestrator` continua usando `ai_model_mode` (Gemini). Suporte real a OpenAI/Anthropic no backend ficaria para uma próxima etapa — agora só salvamos as configurações.
- Toggles (Agente Ativo, Resposta Automática, Quebrar Mensagens, Agendamento via IA) ficam idênticos.
- Nenhuma outra tela é alterada.

## Aviso

Como o backend (`nina-orchestrator`) hoje só fala com Gemini via Lovable AI Gateway, selecionar OpenAI/Anthropic vai salvar a preferência mas a IA continuará respondendo via Google até implementarmos o roteamento por provedor. Quer que eu já inclua esse roteamento no backend nesta mesma rodada, ou prefere só a UI + persistência agora?
