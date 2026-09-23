import katex from "katex";
import type { ReactNode } from "react";

// KaTeX 不支持 CJK 中文字符：数学段里出现中文会报 "KaTeX parse error"（且渲染成红色错误）。
// 策略：先保护 \text{...} 里含中文的整段（抽出用占位符），避免后续按中文拆分时打断 LaTeX 命令；
// 再把数学段里剩余的中文（如 $visited[甲]=true$）按普通文本切开，其余仍走 KaTeX。
// 最后把 \text 的占位符回填为普通文本（HTML 转义）。
const CJK_RUN = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]+/g;
const HAS_CJK = /[\u3400-\u9fff]/;

// nosemgrep: dangerously-set-inner-html — KaTeX output is always escaped
// (https://katex.org/docs/security.html); `\(\href\)`/raw HTML only becomes
// possible with `trust: true`, which we never pass. Same pattern as before.
function mathHtml(m: string, display: boolean, stash: string[]) {
  // KaTeX strict "warn" 会对中文标点“—”（8212）报 unknownSymbol，统一替换为 \text 形态并关闭 strict
  const safe = m.replace(/—/g, "\\text{—}").replace(/–/g, "\\text{–}");
  let html = katex.renderToString(safe, {
    throwOnError: false,
    strict: false,
    displayMode: display,
  });
  stash.forEach((txt, i) => {
    const esc = txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.split(`QQ${i}QQ`).join(esc);
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// 渲染一段数学内容：无中文直接交给 KaTeX；有中文则按中文字符串拆分，
// 中文段按普通文本输出，夹在中间的数学片段仍用 KaTeX。
function renderMath(m: string, display: boolean): ReactNode {
  const stash: string[] = [];
  const guarded = m.replace(/\\text\{([^{}]*)\}/g, (whole, inner: string) => {
    if (!HAS_CJK.test(inner)) return whole;
    const id = `QQ${stash.length}QQ`;
    stash.push(inner);
    return `\\text{${id}}`;
  });
  if (!CJK_RUN.test(guarded)) {
    CJK_RUN.lastIndex = 0;
    return mathHtml(guarded, display, stash);
  }
  CJK_RUN.lastIndex = 0; // test 会推进 lastIndex，重置后再 exec
  const parts: ReactNode[] = [];
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = CJK_RUN.exec(guarded)) !== null) {
    if (mm.index > last) {
      parts.push(
        <span key={parts.length}>
          {mathHtml(guarded.slice(last, mm.index), display, stash)}
        </span>,
      );
    }
    parts.push(<span key={parts.length}>{mm[0]}</span>);
    last = mm.index + mm[0].length;
  }
  if (last < guarded.length) {
    parts.push(
      <span key={parts.length}>{mathHtml(guarded.slice(last), display, stash)}</span>,
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
