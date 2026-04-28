## Problema

O botão de emoji (ícone de carinha sorridente) na barra de envio de mensagens do chat está **desabilitado**, com tooltip "Em breve: Emoji picker". A funcionalidade nunca foi implementada — não é uma regressão.

Localização: `src/components/ChatInterface.tsx` linhas 866-875.

## Solução

Adicionar um **emoji picker funcional** que insere o emoji selecionado na posição atual do cursor dentro do campo de mensagem.

### Abordagem técnica

1. **Instalar** a biblioteca `emoji-picker-react` (leve, sem dependências pesadas, suporta busca, categorias e tema escuro — combina com o tema dark do app).

2. **Substituir o botão desabilitado** por um `Popover` (componente já usado no projeto, ex.: menu de anexos) contendo o `<EmojiPicker />`.

3. **Inserção inteligente**: usar `selectionStart` do `<input>` de mensagem para inserir o emoji exatamente na posição do cursor (não apenas no final), e reposicionar o cursor após o emoji inserido.

4. **Tema**: configurar `theme="dark"` e largura/altura compatíveis com o painel do chat.

5. **Acessibilidade**: manter o ícone `Smile` do lucide-react como trigger, remover `disabled`, ajustar classes (cor cyan no hover, igual ao botão de anexo).

### Arquivos afetados

- `src/components/ChatInterface.tsx` — adicionar import, ref para o input de mensagem, handler `handleEmojiSelect`, substituir bloco do botão desabilitado pelo Popover com o picker.
- `package.json` — adicionar dependência `emoji-picker-react`.

### Detalhes técnicos

```tsx
// Pseudocódigo do handler
const inputRef = useRef<HTMLInputElement>(null);

const handleEmojiSelect = (emojiData: { emoji: string }) => {
  const input = inputRef.current;
  const start = input?.selectionStart ?? inputText.length;
  const end = input?.selectionEnd ?? inputText.length;
  const newText = inputText.slice(0, start) + emojiData.emoji + inputText.slice(end);
  setInputText(newText);
  // reposicionar cursor após emoji
  requestAnimationFrame(() => {
    input?.focus();
    input?.setSelectionRange(start + emojiData.emoji.length, start + emojiData.emoji.length);
  });
};
```

O Popover usa `side="top"` para abrir acima do campo (igual ao menu de anexos) e `align="start"`.

### Fora do escopo

- Atalhos de teclado tipo `:smile:` → 😄 (pode ser uma melhoria futura).
- Emoji picker em outros locais do app (notas, atividades).