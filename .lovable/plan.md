# Atendimentos não aparecem: falha no serviço de dados

## O que está acontecendo

Os atendimentos não foram perdidos. Consultando o banco diretamente, os dados continuam lá:

- 2.224 conversas no total, sendo 31 ativas.

O que está fora do ar é o serviço que entrega esses dados para o app. Ao chamar esse serviço, ele responde com erro 503 ("upstream connect error / connection failure"), enquanto o serviço de login responde normalmente. Por isso a tela de Conversas mostra tudo zerado e "Nenhuma conversa encontrada": o app pede a lista, não recebe nada e exibe vazio.

Isso não foi causado por nenhuma mudança de código nem de filtro — é uma falha do lado da infraestrutura do backend.

## O que fazer

1. Reiniciar o backend do projeto (ação que precisa da sua aprovação).
2. Verificar o estado até voltar a ficar saudável.
3. Confirmar pelo próprio app que a lista de conversas volta a carregar, com as contagens das abas Geral / Meus / Arquivados preenchidas.
4. Se o reinício não resolver, reportar como incidente de infraestrutura em vez de mexer no código do app.

## Observação

Nenhuma alteração de código está prevista. Se depois do backend voltar ainda faltar alguma conversa específica, aí sim investigo regras de visibilidade por departamento — mas hoje o sintoma é "tudo zerado", o que aponta para a indisponibilidade do serviço de dados.
