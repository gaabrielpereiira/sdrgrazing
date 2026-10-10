# Não consigo entrar na conta

## O que encontrei

O seu usuário e a sua senha não são o problema. **O banco de dados do sistema está fora do ar.**

- Quando você clica em "Entrar", o serviço de login tenta consultar o banco de dados e não consegue se conectar (erro registrado às 03:21 UTC de hoje). Por isso a tela carrega, mas não entra.
- Neste momento, o painel do sistema mostra o banco "desligando/pausando", e as métricas dele estão indisponíveis.
- Às 02:25 UTC de hoje, chegou outro alerta de que o disco do banco esgotou a capacidade de leitura e escrita. É o mesmo alerta que já tinha aparecido em 9/10.
- Causa provável: o banco roda no menor tamanho (Tiny). Além disso, o app publicado ainda usa a versão antiga do contador de mensagens não lidas, que sobrecarrega o banco. A correção feita em 1/10 está só no editor e ainda não foi publicada.

Isso afeta todos os usuários, não só a sua conta. A Donatella e o WhatsApp também ficam sem funcionar enquanto o banco estiver fora.

## O que vou fazer

1. **Acompanhar o status** até o banco voltar a responder. Se ele continuar travado, peço sua aprovação para **reiniciá-lo**.
2. **Testar o login** de novo e confirmar que você consegue entrar e ver as conversas.
3. **Publicar o app** para que a versão online receba a correção do contador. Esse é o maior consumidor de recursos do banco.
4. **Aumentar o banco de Tiny para Mini**, com a sua aprovação: cerca de 0,10 crédito por hora, em vez de 0,08 (uns 15 créditos a mais por mês). Tiny é indicado para testes, não para um sistema usado o dia todo pela equipe e pela Donatella.
5. **Adicionar um atalho no banco** para a consulta lenta da fila de envio, que leva cerca de 1,2 s.
6. **Medir de novo** a saúde do banco e as consultas mais pesadas para confirmar que a pressão caiu.

Se o banco não voltar nem depois de reiniciar, vou orientar você a acionar o suporte da Lovable.

## Detalhes técnicos

- Evidência: auth `/token` 500 "failed to connect host=localhost ... dial tcp :5432", pooler 544, cloud_status = pausing/going down.
- Recuperação: `cloud_status` em loop → `supabase--restart` se ficar unhealthy.
- Prevenção: publish (RPCs `get_queue_unread_counts` / `get_conversation_tab_counts` já existem no banco), `resize_compute` para Mini e índice em `send_queue (message_type, created_at)` + GIN em `metadata` se o plano confirmar.
