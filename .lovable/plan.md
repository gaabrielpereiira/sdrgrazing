## Problema

No exemplo da Claudia, ela escreveu "Necessito fazer um pedido de cesta de café da manhã para amanhã" e, em seguida, clicou em **Suporte pós-venda**. A Donatella seguiu o fluxo de suporte cegamente (pediu número do pedido) mesmo quando o texto do lead é claramente um **novo pedido / pré-venda**.

Hoje o roteamento em `nina-orchestrator/index.ts` (`handleOnboarding`, passo `await_triage`) só olha o botão clicado — não valida se a intenção textual bate com o botão. E `classifySupportIntake` só roda depois que o lead responde `await_support_issue`, momento em que já foi pedido nº do pedido.

## Solução

Adicionar uma verificação de "intenção real" antes de entrar (e enquanto está) no fluxo de suporte. Se o texto do lead indicar pré-venda / novo pedido / orçamento, a Donatella sai do fluxo de suporte, confirma brevemente com o lead e devolve para o fluxo de atendimento normal (IA).

### 1. Novo helper `detectPreSaleIntent`
Em `supabase/functions/nina-orchestrator/index.ts`, criar uma função que chama o Lovable AI Gateway (`google/gemini-2.5-flash`, mesmo padrão de `classifySupportIntake`) recebendo:
- Texto do lead (ou concatenação dos últimos textos do lead nesta sessão de onboarding).
- Texto do botão clicado (quando houver).

Retorna JSON estruturado:
```
{ is_pre_sale: boolean, confidence: 0-100, reason: string }
```
Considera pré-venda: pedido novo, cotação, orçamento, cardápio, disponibilidade, preço, cesta / kit / evento futuro, iFood, "quero pedir", etc. Considera suporte pós-venda: pedido já feito, atraso, item faltando, troca, reembolso, nota fiscal, rastreio.

Fallback seguro: se a chamada falhar ou `confidence < 60`, mantém o fluxo atual (não muda nada).

### 2. Interceptação no `await_triage` (clique em Suporte)
No bloco `if (choseSuporte)` (linha ~1381), antes de enviar `SUPPORT_ASK_ORDER`:
- Rodar `detectPreSaleIntent` usando o texto que o lead enviou nesta virada + textos anteriores da sessão de onboarding.
- Se `is_pre_sale` com confiança ≥ 60:
  - Responder uma mensagem curta de confirmação natural (ex.: "Só pra confirmar, Claudia 💛 — é um pedido novo, certo? Vou te atender por aqui mesmo.").
  - `setOnboardingStep(step: 'done')`.
  - Marcar `metadata.onboarding_kickoff = true` na mensagem para que a IA principal assuma na sequência (mesmo padrão do `choseAtendimento`).
  - `return 'continue'` para deixar a IA responder.
- Caso contrário, segue o fluxo atual (pede número do pedido).

### 3. Interceptação no `await_support_order`
Mesmo check antes de mover para `await_support_issue`. Se o lead, ao invés de dar número de pedido, escrever algo claramente de pré-venda ("quero um orçamento", "preciso de uma cesta pra amanhã", "quanto custa X"), reclassifica como pré-venda: envia confirmação curta e devolve ao fluxo comercial (`step: 'done'`, `onboarding_kickoff = true`).

Isso resolve o caso em que a pessoa acertou o clique errado e só percebe quando a Donatella pede número de pedido.

### 4. Interceptação no `await_support_issue`
Adicionar o mesmo check ANTES de `classifySupportIntake`. Se sair pré-venda, cancela abertura de caso de suporte e devolve para IA comercial. Isso evita criar `support_cases` e mover a conversa pra fila "Produção" indevidamente.

### 5. Sem novos campos de banco
Não precisa alterar schema. Só reusar `nina_context.onboarding` existente. O único efeito colateral controlado é limpar `support_intake` ao sair pra pré-venda.

### 6. Logs
Adicionar `console.log('[Onboarding] pre-sale override:', reason, confidence)` para debug via `edge_function_logs`.

## Arquivos alterados

- `supabase/functions/nina-orchestrator/index.ts` — nova função `detectPreSaleIntent` e três pontos de interceptação (`await_triage`, `await_support_order`, `await_support_issue`).

## Fora do escopo

- Não altero UI do chat, não altero `whatsapp-webhook`, não altero tags/`support_cases` — apenas evito criá-los quando a intenção não é suporte.
- Não removo os botões de triagem; eles continuam iguais para quem realmente precisa de suporte.
