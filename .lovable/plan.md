# Corrigir reconhecimento de produtos por imagem da Donatella

## Diagnóstico confirmado

No caso da Francielle, a imagem foi salva corretamente e enviada ao modelo com a legenda “Seria possível uma dessa para 2 pessoas?”. A falha aconteceu depois:

1. A Donatella viu a imagem, mas consultou o catálogo somente por **“2 pessoas”**, em vez de extrair da captura o nome visível do produto.
2. A busca retornou dois produtos sem relação direta com a tábua mostrada (“Búfala Rolls”), porque o catálogo aceitou correspondências genéricas.
3. Mesmo sem um produto correspondente confirmado, a resposta afirmou que “essa Grazing da foto” atenderia um casal com fartura — informação que não veio do catálogo.
4. Hoje o sistema guarda a mensagem e a resposta final, mas não mantém um histórico completo das pesquisas, resultados e nível de confiança usados pela Donatella. Isso dificulta analisar ocorrências recorrentes.

## Plano de correção

### 1. Identificar o produto da imagem antes de consultar o catálogo
- Quando a mensagem tiver imagem e intenção de produto, fazer uma leitura estruturada da imagem.
- Extrair texto visível, possível nome do produto, quantidade mencionada e outros sinais úteis.
- Em capturas do próprio site, priorizar o nome exibido na página; neste caso, a busca deveria partir de “Grazing para 3”, não de “2 pessoas”.
- Tratar a quantidade solicitada pelo cliente como uma necessidade de adaptação, separada da identificação do produto original.

### 2. Tornar a busca do catálogo relevante e verificável
- Pesquisar primeiro pelo nome identificado na imagem e depois por variações controladas desse nome.
- Melhorar o retorno do catálogo com nome, descrição, preço, estoque, categorias, atributos, variações, link e imagem do produto.
- Classificar os resultados por aderência ao nome e às características identificadas.
- Descartar resultados genéricos que só coincidem por tags ou palavras vagas, como ocorreu com “2 pessoas”.

### 3. Impedir respostas não confirmadas
- Só permitir que a Donatella confirme o produto, capacidade, composição, personalização, preço ou disponibilidade quando esses dados vierem do catálogo.
- Separar claramente:
  - produto reconhecido na imagem;
  - tamanho/quantidade padrão confirmada;
  - pedido de adaptação ou personalização ainda não confirmado.
- Se não houver correspondência confiável, responder que não conseguiu confirmar o item e encaminhar ao Comercial, sem inventar ou negar categoricamente.
- Nunca afirmar que uma tábua “serve duas pessoas com fartura” sem essa informação existir nos dados reais do produto.

### 4. Criar rastreabilidade para novos debriefings
- Registrar, por mensagem analisada:
  - imagem recebida e legenda;
  - texto/nome extraído da imagem;
  - termos pesquisados;
  - produtos retornados;
  - produto escolhido e nível de confiança;
  - ferramentas acionadas, resposta final e eventual encaminhamento humano.
- Não armazenar raciocínio interno do modelo nem credenciais; apenas dados operacionais necessários para auditoria.
- Relacionar o registro à conversa e à mensagem para permitir investigar rapidamente novos casos.

### 5. Validar com cenários reais
- Reprocessar um cenário equivalente ao print da Francielle e confirmar que “Grazing para 3” é buscado antes de responder sobre duas pessoas.
- Testar foto do produto, captura do site com nome visível, imagem cortada, produto não encontrado e falha temporária do catálogo.
- Confirmar que resultados irrelevantes não geram recomendação e que baixa confiança sempre termina em confirmação humana.
- Publicar as funções atualizadas e verificar os registros do novo fluxo em uma execução real.

## Resultado esperado

A Donatella não responderá mais apenas pela aparência da foto ou por uma busca genérica. Ela identificará o produto, validará os dados reais no catálogo e só então responderá; quando não houver certeza suficiente, encaminhará a dúvida sem inventar informações. Cada etapa ficará registrada para futuros debriefings.

## Detalhes técnicos

- Ajustar o fluxo multimodal e a rodada de ferramentas no orquestrador da Donatella.
- Reforçar e enriquecer a consulta de produtos do WooCommerce.
- Criar uma tabela de auditoria protegida para decisões relacionadas ao catálogo, com permissões e políticas de acesso.
- Manter o comportamento atual das demais conversas; a mudança ficará limitada ao fluxo de identificação e consulta de produtos por imagem.
