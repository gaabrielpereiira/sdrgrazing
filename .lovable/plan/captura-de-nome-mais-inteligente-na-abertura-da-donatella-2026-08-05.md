# Captura de nome mais inteligente na abertura da Donatella

Hoje a Donatella captura nome no passo `await_name` com uma regra puramente sintática: qualquer texto com 2+ palavras alfabéticas, sem número e sem "?", é tratado como nome. Por isso "Quero os valores" ou "boa tarde" viram nome. Este plano substitui **apenas** essa lógica de captura de nome. Handoff, taxonomia de suporte, WooCommerce, ownership e templates ficam intocados.

## Comportamento novo

1. **Intenção antes de nome.** Se a mensagem for pedido, pergunta ou intenção — mesmo que chegue logo após a Donatella perguntar o nome —, ela atende a intenção e não grava nada.
2. **Nunca é nome** quando a mensagem: contém verbo de desejo/pedido (quero, queria, gostaria, preciso, pode, poderia, tem, teria, manda, envia); contém palavra comercial/suporte (valores, valor, preço(s), quanto, custa, cardápio, catálogo, comprar, pedido, encomenda, entrega, orçamento, suporte, reclamação, troca, nota fiscal); é pergunta ou tem "?"; é saudação isolada (oi, olá, bom dia/tarde/noite); ou tem mais de 4 palavras.
3. **Pode ser nome** quando tem 1 a 4 palavras, não cai na regra 2, não é pergunta e tem cara de nome próprio. Prefixos como "meu nome é", "sou o/a", "me chamo", "aqui é a" são removidos antes de avaliar.
4. **Três tratamentos:**
   - **Nome claro** (2+ palavras nominais, ou primeiro nome comum com 4+ letras): salva em silêncio e usa o nome dentro da próxima frase útil.
   - **Nome duvidoso** (apelido curto, 1 sílaba, palavra incomum): não salva; confirma uma única vez, leve — "Só pra registrar certinho — posso te chamar de [X]?". Se confirmar, salva; se corrigir, usa a correção; se o cliente seguir com outro assunto, deixa pra lá e atende o assunto. Nunca insiste de novo.
   - **Não é nome:** atende o pedido, sem capturar.
5. **Sem eco "Muito prazer, [nome]!".** Nome recém-recebido nunca é devolvido como cumprimento isolado; entra dentro da próxima frase útil ("Perfeito, Maria! Me conta: a tábua é pra presentear ou pra compartilhar?").
6. **Salvamento** só em nome claro ou confirmado. Só primeiro nome → grava `name` e `call_name`, `last_name` fica vazio. Mensagem da regra 2 nunca grava.

## Detalhes técnicos

Tudo em `supabase/functions/nina-orchestrator/index.ts` (bloco "OPENING / ONBOARDING FLOW"), mais o redeploy da função.

- Substituir `looksLikeName` / `extractNameFromText` por um classificador `classifyNameCandidate(raw)` que retorna `{ kind: 'name' | 'maybe' | 'not_name', fullName?, firstName?, lastName? }`:
  - normaliza (remove acentos para matching, colapsa espaços, tira pontuação final);
  - **bloqueio (regra 2)**: listas de verbos e palavras de intenção, presença de `?`, saudação isolada, > 4 palavras, presença de dígitos → `not_name`;
  - remove prefixos de apresentação; se o texto tinha prefixo explícito ("meu nome é X"), trata como `name` mesmo com nome curto;
  - 2 a 4 tokens nominais → `name`; 1 token com ≥ 4 letras e ≥ 2 sílabas → `name`; 1 token curto/incomum → `maybe`.
- No passo `await_name` de `handleOnboarding`:
  - `name` → grava `name`/`call_name`/`last_name` (sobrenome nulo quando só houver primeiro nome), passa `step: 'done'` e injeta a diretiva de nome capturado;
  - `maybe` → **não grava**; salva `pending_name` no `nina_context.onboarding`, muda para `step: 'confirm_name'` e injeta diretiva de confirmação leve; retorna `continue` (a IA escreve a frase, sem mensagem fixa);
  - `not_name` → não grava, não conta como falha de nome; segue `continue`, com a diretiva de re-pedido leve só uma vez (mantendo o contador de tentativas atual).
- Novo passo `confirm_name`: se a resposta for afirmativa (sim, isso, pode, claro, aham, 👍), grava o `pending_name`; se vier um novo candidato `name`, grava a correção; qualquer outra coisa limpa o `pending_name`, marca `step: 'done'` e a conversa segue no assunto do cliente. Nunca pergunta duas vezes.
- Diretivas em `OPENING_DIRECTIVES`:
  - `nameCaptured`: reescrita para proibir cumprimento isolado/"muito prazer" e exigir uso do nome dentro de uma frase útil com pergunta de avanço;
  - nova `confirmName(candidate)`: pedir a confirmação leve uma única vez, sem travar o atendimento;
  - nova `answerFirstAskNameLater`: quando a mensagem é intenção, responder o pedido primeiro e, no máximo, retomar o nome de forma leve no fim.
- Sem mudança de schema — `contacts.name`, `call_name` e `last_name` já existem.
