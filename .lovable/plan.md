## Objetivo

Substituir o bloco único "Horário de Atendimento" (fallback global) na aba Agente por **dois blocos lado a lado**, um para **Comercial/Atendimento** e outro para **Produção**, editáveis direto nas Configurações do agente — sem precisar abrir Equipe → Configurar → Horários.

## Mudanças

### 1. UI — `src/components/settings/AgentSettings.tsx`
- Remover o card único atual de Horário de Atendimento.
- Adicionar dois cards equivalentes, cada um com: Início, Fim, Dias da semana (toggle), e botão "Salvar".
  - **Card 1 — Atendimento / Comercial** (vinculado à equipe `comercial`)
  - **Card 2 — Produção** (vinculado à equipe `producao`)
- Manter abaixo (compartilhado entre os dois) o bloco já existente: **Mensagem fora do horário** + **Intervalo entre avisos** (continuam em `nina_settings`, são globais).
- Remover a nota de rodapé "Os horários abaixo são o fallback…" (não faz mais sentido — agora são os horários reais por departamento).

### 2. Dados
- Reutilizar a tabela `team_business_hours` já criada na implementação anterior (7 linhas por equipe).
- Resolver os `team_id` de `comercial` e `producao` no carregamento da tela e ler/gravar as 7 linhas de cada um.
- Modelo simplificado nesta tela: um único intervalo (Início/Fim) aplicado aos dias marcados — os dias desmarcados ficam fechados. Para a Produção, que tem horários diferentes Seg-Sáb vs Domingo, manter a UI mais avançada (com horários por dia) só em Equipe → Configurar → Horários; aqui o usuário poderá ajustar o bloco principal rapidamente. Se preferir suporte completo aos dois turnos da Produção nesta tela, posso adicionar um segundo intervalo opcional ("Horário alternativo" para dias específicos) — me avise.

### 3. Sem mudanças no backend
- O orquestrador (`nina-orchestrator` + `_shared/business-hours.ts`) já lê `team_business_hours` por equipe — funcionará sem alterações.

## Resultado
A aba Agente passa a mostrar dois cartões de horário (Comercial e Produção) gravando direto em `team_business_hours`, e o bloco de mensagem fora do horário permanece global logo abaixo.
