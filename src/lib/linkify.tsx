import { ReactNode } from 'react';

const URL_REGEX = /(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+\.[^\s<]+)/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

export function renderTextWithLinks(text: string): ReactNode[] {
  if (!text) return [];
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const matches = text.matchAll(URL_REGEX);

  for (const m of matches) {
    const matchStart = m.index ?? 0;
    let matched = m[0];
    let trailing = '';
    const t = matched.match(TRAILING_PUNCT);
    if (t) {
      trailing = t[0];
      matched = matched.slice(0, -trailing.length);
    }
    if (matchStart > lastIndex) {
      nodes.push(text.slice(lastIndex, matchStart));
    }
    const href = matched.startsWith('http') ? matched : `https://${matched}`;
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 break-all hover:opacity-80"
        onClick={(e) => e.stopPropagation()}
      >
        {matched}
      </a>
    );
    if (trailing) nodes.push(trailing);
    lastIndex = matchStart + matched.length + trailing.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
