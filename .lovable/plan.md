# Links clicáveis nas mensagens do chat

## Problema
O conteúdo de texto das mensagens (`msg.content`) é renderizado como string pura, então URLs (`https://...`, `www....`) aparecem sem ser clicáveis.

## Solução
Criar um helper `renderTextWithLinks(text)` que quebra o texto em pedaços e transforma URLs em `<a>` clicáveis, preservando `whitespace-pre-wrap`.

### Arquivos
- **Novo** `src/lib/linkify.tsx` — função `renderTextWithLinks(text: string): ReactNode[]`:
  - Regex: `/(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+\.[^\s<]+)/gi`
  - Para cada match: `<a href={normalizedUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all hover:opacity-80">{match}</a>`
  - `www.` recebe `https://` no `href`.
  - Trim de pontuação final (`.,;:!?)`) deixada fora do link.

- **Editar** `src/components/ChatInterface.tsx`:
  - Linha 953 (texto puro): `<p className="leading-relaxed whitespace-pre-wrap">{renderTextWithLinks(msg.content || '')}</p>`.
  - Linha 798 (legenda de imagem): aplicar mesma função.

## Fora de escopo
- Preview de link (open graph).
- Detecção de telefones/emails.
- Mudanças no input ou no envio — só renderização.
