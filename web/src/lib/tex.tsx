import katex from "katex";
import type { ReactNode } from "react";

// KaTeX 不支持 CJK 中文字符：数学段里出现中文会报 "KaTeX parse error"（且渲染成红色错误）。
// 这里把数学段里的中文字符串拆出来按普通文本渲染，其余部分仍走 KaTeX。
// 典型场景：顶点重命名为中文后被拼进 $visited[甲] = true$ 这类模板。
const CJK_RUN = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]+/g;

// nosemgrep: dangerously-set-inner-html — KaTeX output is always escaped
// (https://katex.org/docs/security.html); `\(\href\)`/raw HTML only becomes
// possible with `trust: true`, which we never pass. Same pattern as before.
function mathHtml(m: string, display: boolean) {
  const props = {
    dangerouslySetInnerHTML: {
      __html: katex.renderToString(m, {
        throwOnError: false,
        displayMode: display,
      }),
    },
  };
  return <span {...props} />;
}

// 渲染一段数学内容：无中文直接交给 KaTeX；有中文则按中文字符串拆分，
// 中文段按普通文本输出，夹在中间的数学片段仍用 KaTeX。
function renderMath(m: string, display: boolean): ReactNode {
  if (!CJK_RUN.test(m)) return mathHtml(m, display);
  CJK_RUN.lastIndex = 0; // test 会推进 lastIndex，重置后再 exec
  const parts: ReactNode[] = [];
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = CJK_RUN.exec(m)) !== null) {
    if (mm.index > last) {
      parts.push(
        <span key={parts.length}>
          {mathHtml(m.slice(last, mm.index), display)}
        </span>,
      );
    }
    parts.push(<span key={parts.length}>{mm[0]}</span>);
    last = mm.index + mm[0].length;
  }
  if (last < m.length) {
    parts.push(
      <span key={parts.length}>{mathHtml(m.slice(last), display)}</span>,
    );
  }
  return <>{parts}</>;
}

export function Tex({ math, display }: { math: string; display?: boolean }) {
  return <span>{renderMath(math, !!display)}</span>;
}

// Render inline $...$ segments via KaTeX. Supports multiple $...$ per string.
// If no $, returns plain text. Does NOT support $$ display — use <Tex> for that.
export function MathText({ text }: { text: string }) {
  if (!text.includes("$")) return <span>{text}</span>;
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
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i}>{renderMath(p.m, false)}</span>
        ),
      )}
    </span>
  );
}
