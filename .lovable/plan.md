## Diagnóstico

A Donatella parou de responder porque o edge function `nina-orchestrator` está falhando no boot toda vez que é invocado:

```
worker boot error: Uncaught SyntaxError:
Identifier 'formatBusinessHoursBlock' has already been declared
at nina-orchestrator/index.ts:2048
```

A função `formatBusinessHoursBlock` aparece declarada em **dois lugares** do arquivo `supabase/functions/nina-orchestrator/index.ts`:

- **Linha 14** — versão atual usada em `runOrchestrator` (linha 1604), que recebe o objeto de horário e injeta o bloco no system prompt.
- **Linha 2381** — versão antiga remanescente da implementação anterior (`BusinessHoursStatus`), nunca mais chamada.

Como Deno aborta o módulo inteiro no erro de sintaxe, o worker nem sobe — por isso:
- Mensagens continuam entrando (webhook OK)
- `message-grouper` agrupa e enfileira normalmente
- Mas a chamada ao orchestrator falha silenciosamente e nenhuma resposta é gerada

## Correção

1. **Remover a declaração duplicada** em `supabase/functions/nina-orchestrator/index.ts`:
   - Apagar a segunda versão de `formatBusinessHoursBlock` (~linha 2381) e qualquer código órfão associado (tipo `BusinessHoursStatus` se não for usado em outro lugar).
   - Manter apenas a versão da linha 14, que é a efetivamente chamada no fluxo atual.

2. **Verificar** após o deploy:
   - Logs do `nina-orchestrator` devem mostrar `booted` em vez de `BootFailure`.
   - Enviar uma mensagem de teste no WhatsApp e confirmar resposta da Donatella.

## Observação

Não há mudança de comportamento — apenas remoção de código morto que está quebrando o build. Nenhuma migration, nenhuma alteração de UI, nenhuma mexida em outras functions.