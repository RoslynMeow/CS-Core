import katex from 'katex';

export function Tex({ math, display }: { math: string; display?: boolean }) {
  const html = katex.renderToString(math, { throwOnError: false, displayMode: !!display });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// Render inline $...$ segments via KaTeX. Supports multiple $...$ per string.
// If no $, returns plain text. Does NOT support $$ display — use <Tex> for that.
export function MathText({ text }: { text: string }) {
  if (!text.includes('$')) return <span>{text}</span>;
  const parts: Array<string | { m: string }> = [];
  let last = 0;
  const re = /\$(.+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ m: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <span>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: katex.renderToString(p.m, { throwOnError: false, displayMode: false }) }} />
        )
      )}
    </span>
  );
}
