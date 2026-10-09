import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// C 语言 · 单模块聚合 · 交互式
//   对应 tex/CProgrammingLanguage
//   lexical / types / pointers / operators / storage / io / preprocessor / stdlib
// =====================================================================

type SubMode = "lexical" | "types" | "pointers" | "operators" | "storage" | "io" | "preprocessor" | "stdlib";

const hx = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(4, "0")}`;
const bitsOf = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0");

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "ui-monospace, monospace", background: "#fff" }}>
      <thead>
        <tr>{head.map((h, i) => <th key={i} style={{ padding: "6px 10px", textAlign: "left", color: "#475569", borderBottom: "2px solid #e2e8f0", fontSize: 12 }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, k) => (
          <tr key={k} style={{ background: k % 2 ? "#f8fafc" : "#fff" }}>
            {r.map((c, i) => <td key={i} style={{ padding: "5px 10px", borderBottom: "1px solid #f1f5f9", color: i === 0 ? "#0f172a" : "#475569", fontWeight: i === 0 ? 700 : 400 }}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// lexical: 词法分析 (交互)
// ---------------------------------------------------------------------
const C_KEYWORDS = new Set(["auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long", "register", "restrict", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while", "_Bool"]);
type Tok = { text: string; kind: string };
function tokenize(src: string): Tok[] {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(\b0[xX][0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][-+]?\d+)?[fFuUlL]*\b)|([A-Za-z_]\w*)|(->|<<=|>>=|\+\+|--|&&|\|\||<=|>=|==|!=|[-+*/%<>=!&|^~?:]+)|([()\[\]{};,.])|(\s+)/g;
  const out: Tok[] = []; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), kind: "other" });
    const text = m[0];
    let kind = "other";
    if (m[1]) kind = "comment"; else if (m[2]) kind = "string"; else if (m[3]) kind = "char";
    else if (m[4]) kind = "number"; else if (m[5]) kind = C_KEYWORDS.has(text) ? "keyword" : "ident";
    else if (m[6]) kind = "op"; else if (m[7]) kind = "punct"; else if (m[8]) kind = "space";
    out.push({ text, kind }); last = m.index + text.length;
  }
  if (last < src.length) out.push({ text: src.slice(last), kind: "other" });
  return out;
}
const TOK_COLOR: Record<string, string> = { keyword: "#7c3aed", ident: "#1e40af", number: "#b45309", string: "#15803d", char: "#15803d", comment: "#94a3b8", op: "#be185d", punct: "#475569", space: "inherit", other: "#b91c1c" };
const TOK_ZH: Record<string, string> = { keyword: "关键字", ident: "标识符", number: "常量", string: "字符串", char: "字符", comment: "注释", op: "运算符", punct: "分隔符", space: "空白", other: "?" };

function LexControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <input className="txt" value={config.src} onChange={(e) => onChange({ ...config, src: e.target.value })} style={{ flex: 1, minWidth: 320, fontFamily: "ui-monospace, monospace" }} />
    </div>
  );
}
function LexRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const toks = tokenize(config.src ?? "");
  const counts: Record<string, number> = {};
  toks.forEach((x) => { if (x.kind !== "space") counts[x.kind] = (counts[x.kind] ?? 0) + 1; });
  return (
    <Panel>
      <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0", fontFamily: "ui-monospace, monospace", fontSize: 14, lineHeight: 1.9, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {toks.map((x, i) => <span key={i} style={{ color: TOK_COLOR[x.kind] ?? "#334155", fontWeight: x.kind === "keyword" ? 800 : 400, background: x.kind === "keyword" ? "#f5f3ff" : undefined }}>{x.text}</span>)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", color: TOK_COLOR[k] }}>
            {isZh ? TOK_ZH[k] ?? k : k} ×{n}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "词法分析把字符流切成记号 (token): 关键字 / 标识符 / 常量 / 运算符 / 分隔符; 注释与空白在预处理后清除。" : "Lexing splits the char stream into tokens; comments/whitespace are removed."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// types: 基本类型 + 结构体对齐
// ---------------------------------------------------------------------
const BASE_TYPES: { t: string; size: number; range: string; fmt: string }[] = [
  { t: "char", size: 1, range: "-128 … 127", fmt: "%c" },
  { t: "unsigned char", size: 1, range: "0 … 255", fmt: "%hhu" },
  { t: "short", size: 2, range: "-32768 … 32767", fmt: "%hd" },
  { t: "int", size: 4, range: "≈ ±2.1×10⁹", fmt: "%d" },
  { t: "unsigned", size: 4, range: "0 … 4.29×10⁹", fmt: "%u" },
  { t: "long", size: 8, range: "≈ ±9.2×10¹⁸", fmt: "%ld" },
  { t: "float", size: 4, range: "~3.4×10³⁸", fmt: "%f" },
  { t: "double", size: 8, range: "~1.8×10³⁰⁸", fmt: "%lf" },
  { t: "void*", size: 8, range: "平台地址宽度", fmt: "%p" },
];
const STRUCT_PRESETS: string[][] = [["char", "int", "char"], ["int", "char", "char"], ["char", "double", "char"], ["short", "int", "char"]];
const ALIGN: Record<string, number> = { char: 1, short: 2, int: 4, double: 8, float: 4, long: 8 };
function structLayout(members: string[]) {
  let off = 0; const cells: { m: string; off: number; size: number }[] = [];
  for (const m of members) { const sz = ALIGN[m] ?? 4; off = Math.ceil(off / sz) * sz; cells.push({ m, off, size: sz }); off += sz; }
  const maxA = Math.max(...members.map((m) => ALIGN[m] ?? 4));
  const total = Math.ceil(off / maxA) * maxA;
  return { cells, total };
}
function TypesControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.view} onChange={(e) => onChange({ ...config, view: e.target.value })} style={{ fontWeight: 700 }}>
        <option value="basic">{isZh ? "基本类型" : "Basic types"}</option>
        <option value="struct">{isZh ? "结构体对齐" : "Struct alignment"}</option>
      </select>
      {config.view === "struct" && (
        <select className="txt" value={config.preset} onChange={(e) => onChange({ ...config, preset: Number(e.target.value) })}>
          {STRUCT_PRESETS.map((p, i) => <option key={i} value={i}>{`struct { ${p.join("; ")}; }`}</option>)}
        </select>
      )}
    </div>
  );
}
function TypesRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  if (config.view === "struct") {
    const members = STRUCT_PRESETS[config.preset ?? 0] ?? STRUCT_PRESETS[0];
    const { cells, total } = structLayout(members);
    const bytes: (string | null)[] = Array(total).fill(null);
    for (const c of cells) for (let k = 0; k < c.size; k++) bytes[c.off + k] = c.m;
    const color = (m: string | null) => m ? ({ char: "#dcfce7", short: "#dbeafe", int: "#fef3c7", double: "#fae8ff", float: "#ffe4e6", long: "#e0e7ff" }[m] ?? "#eee") : "#f8fafc";
    return (
      <Panel>
        <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{`struct S { ${members.join("; ")}; };`}</div>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
          {bytes.map((m, i) => (
            <div key={i} style={{ width: 40, textAlign: "center", padding: "6px 0", borderRadius: 6, background: color(m), border: `1.5px solid ${m ? "#cbd5e1" : "#e2e8f0"}` }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{i}</div>
              <div style={{ fontSize: 11, color: m ? "#334155" : "#cbd5e1", fontWeight: 700 }}>{m ?? "pad"}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", fontSize: 13 }}>
          {`sizeof(struct) = ${total}  ·  ${cells.map((c) => `${c.m}@${c.off}`).join(", ")}`}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
          {isZh ? "成员按自身大小对齐, 结构体总大小按最大成员对齐并补齐 (pad)。重排成员可减少填充。" : "Members align to their size; struct padded to max alignment."}
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <Table head={isZh ? ["类型", "字节 (LP64)", "范围", "printf"] : ["Type", "Bytes", "Range", "printf"]} rows={BASE_TYPES.map((b) => [b.t, b.size, b.range, b.fmt])} />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "宽度由实现定义 (以 LP64 为例); 整型提升与隐式转换可能悄悄丢精度。" : "Widths are implementation-defined (LP64 shown)."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// pointers
// ---------------------------------------------------------------------
const PTR_DEFAULT = { base: 0x1000, size: 4, off: 2, arr: [10, 20, 30, 40] };
function PtrControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <input type="range" min={0} max={3} value={cfg.off} onChange={(e) => onChange({ ...cfg, off: Number(e.target.value) })} />
      <b style={{ fontFamily: "ui-monospace, monospace", color: "#4338ca" }}>{cfg.off}</b>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>sizeof(int)</span>
        <select className="txt" value={cfg.size} onChange={(e) => onChange({ ...cfg, size: Number(e.target.value) })}>{[2, 4, 8].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "基址" : "base"}</span>
        <input className="txt" value={hx(cfg.base)} onChange={(e) => onChange({ ...cfg, base: parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ""), 16) || 0 })} style={{ width: 84, fontFamily: "ui-monospace, monospace" }} />
      </label>
    </div>
  ) as unknown as never;
}
function PtrRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const { base, size, off, arr } = config;
  const p = base + off * size;
  return (
    <Panel>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#1e293b", textAlign: "center" }}>
        {`int a[4] = {10, 20, 30, 40};  int *p = &a[${off}];`}
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
        {arr.map((v: number, i: number) => {
          const hot = i === off;
          return (
            <div key={i} style={{ width: 74, textAlign: "center", padding: "8px 0", borderRadius: 10, border: `2px solid ${hot ? "#4f46e5" : "#e2e8f0"}`, background: hot ? "#eef2ff" : "#fff" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{hx(base + i * size)}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{`a[${i}]`}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: hot ? "#4338ca" : "#334155" }}>{v}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>{`p = ${hx(p)}`}</span>
        <span style={{ color: "#4f46e5", fontSize: 18 }}>↓</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#4338ca" }}>{`*p = ${arr[off]}`}</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { k: "&a[i]", v: hx(base + off * size) }, { k: "a + i", v: hx(base + off * size) },
          { k: "p", v: hx(p) }, { k: "*p", v: `${arr[off]}` }, { k: "p + 1", v: hx(p + size) },
          { k: "*(p + 1)", v: `${arr[Math.min(3, off + 1)]}` }, { k: "p[i] ≡ *(p+i)", v: `${arr[off]}` },
        ].map((x) => (
          <div key={x.k} style={{ padding: "6px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
            <span style={{ color: "#64748b" }}>{x.k}</span> <b style={{ color: "#0f172a" }}>= {x.v}</b>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 12, color: "#3730a3", lineHeight: 1.9 }}>
        <MathText text={isZh
          ? `指针的本质是地址; $p+i \\to$ 地址 $+i\\times\\text{sizeof(type)}=+i\\times${size}$。\\ \\&a[i]\\equiv a+i,\\ a[i]\\equiv *(a+i)$。`
          : `A pointer is an address; $p+i$ advances by $i\\times\\text{sizeof(type)}=i\\times${size}$. $a[i]\\equiv *(a+i)$.`} />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// operators: 位运算 (交互)
// ---------------------------------------------------------------------
const OPS = [
  { k: "and", label: "&", zh: "按位与" }, { k: "or", label: "|", zh: "按位或" },
  { k: "xor", label: "^", zh: "按位异或" }, { k: "not", label: "~", zh: "按位取反" },
  { k: "shl", label: "<<", zh: "左移" }, { k: "shr", label: ">>", zh: "右移" },
];
function OpControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>A</span>
        <input type="number" min={0} max={255} value={config.a} onChange={(e) => set({ a: Math.max(0, Math.min(255, Number(e.target.value) || 0)) })} className="txt" style={{ width: 70 }} /></label>
      <select className="txt" value={config.op} onChange={(e) => set({ op: e.target.value })} style={{ fontWeight: 800 }}>{OPS.map((o) => <option key={o.k} value={o.k}>{o.label} {isZh ? o.zh : o.k}</option>)}</select>
      {config.op !== "not" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>B</span>
          <input type="number" min={0} max={255} value={config.b} onChange={(e) => set({ b: Math.max(0, Math.min(255, Number(e.target.value) || 0)) })} className="txt" style={{ width: 70 }} /></label>
      )}
      {(config.op === "shl" || config.op === "shr") && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "移位数" : "shift"}</span>
          <input type="number" min={0} max={7} value={config.sh} onChange={(e) => set({ sh: Math.max(0, Math.min(7, Number(e.target.value) || 0)) })} className="txt" style={{ width: 60 }} /></label>
      )}
    </div>
  );
}
function OpRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const { a, b, op, sh } = config;
  let res = 0;
  if (op === "and") res = a & b; else if (op === "or") res = a | b; else if (op === "xor") res = a ^ b;
  else if (op === "not") res = (~a) & 0xff; else if (op === "shl") res = (a << sh) & 0xff; else res = a >> sh;
  const row = (label: string, n: number, color: string) => (
    <tr>
      <td style={{ padding: "4px 10px", color: "#64748b", fontWeight: 700 }}>{label}</td>
      {bitsOf(n, 8).split("").map((c, i) => <td key={i} style={{ width: 30, textAlign: "center", fontFamily: "ui-monospace, monospace", fontWeight: c === "1" ? 800 : 400, color: c === "1" ? color : "#cbd5e1" }}>{c}</td>)}
      <td style={{ padding: "4px 10px", color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{n}</td>
    </tr>
  );
  const precedence: [string, string][] = isZh
    ? [["1 最高", "() [] -> ."], ["2", "! ~ ++ -- +x -x *x &x sizeof"], ["3", "* / %"], ["4", "+ -"], ["5", "<< >>"], ["6", "< <= > >="], ["7", "== !="], ["8", "&"], ["9", "^"], ["10", "|"], ["11", "&&"], ["12", "||"], ["13", "?: = += …"]]
    : [["1 high", "() [] -> ."], ["2", "! ~ ++ -- * & sizeof"], ["3", "* / %"], ["4", "+ -"], ["5", "<< >>"], ["6", "< <= > >="], ["7", "== !="], ["8", "&"], ["9", "^"], ["10", "|"], ["11", "&&"], ["12", "||"], ["13", "?: = …"]];
  return (
    <Panel>
      <table style={{ margin: "0 auto", borderCollapse: "collapse", background: "#fff", border: "1px solid #e2e8f0" }}>
        <tbody>
          {row("A", a, "#2563eb")}
          {op !== "not" && <tr><td /><td colSpan={9} style={{ textAlign: "center", color: "#be185d", fontWeight: 800, fontSize: 12 }}>{OPS.find((o) => o.k === op)?.label}</td></tr>}
          {op !== "not" && row("B", b, "#15803d")}
          {row("=", res, "#b45309")}
        </tbody>
      </table>
      <div style={{ textAlign: "center", fontSize: 14, fontFamily: "ui-monospace, monospace", color: "#1e40af", fontWeight: 800 }}>
        {op === "not" ? `~${a} = ${res} (0x${res.toString(16)})` : op === "shl" || op === "shr" ? `${a} ${OPS.find((o) => o.k === op)?.label} ${sh} = ${res}` : `${a} ${OPS.find((o) => o.k === op)?.label} ${b} = ${res} (0x${res.toString(16)})`}
      </div>
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{isZh ? "优先级 (高→低)" : "Precedence"}</div>
      <Table head={isZh ? ["级别", "运算符"] : ["Level", "Operators"]} rows={precedence} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------
const REGIONS = [
  { key: "stack", zh: "栈 Stack", en: "Stack", desc: "局部变量 / 参数 / 返回地址, 向低地址增长", color: "#dbeafe", dir: "↓" },
  { key: "heap", zh: "堆 Heap", en: "Heap", desc: "malloc/free 动态分配, 向高地址增长", color: "#dcfce7", dir: "↑" },
  { key: "bss", zh: "未初始化 .bss", en: ".bss", desc: "未初始化的全局/静态变量", color: "#fef3c7", dir: "" },
  { key: "data", zh: "已初始化 .data", en: ".data", desc: "已初始化的全局/静态变量", color: "#fce7f3", dir: "" },
  { key: "rodata", zh: "只读数据 .rodata", en: ".rodata", desc: "字符串字面量 / const 全局", color: "#ede9fe", dir: "" },
  { key: "text", zh: "代码段 .text", en: ".text", desc: "机器指令 (只读/可执行)", color: "#e2e8f0", dir: "" },
];
const CLASSES: { key: string; zh: string; en: string; region: string; life: string; lifeEn: string; link: string; linkEn: string }[] = [
  { key: "auto", zh: "auto 局部变量", en: "auto local", region: "stack", life: "块执行期间", lifeEn: "during block", link: "无", linkEn: "none" },
  { key: "static-local", zh: "static 局部", en: "static local", region: "data", life: "整个程序", lifeEn: "whole program", link: "无(但持久)", linkEn: "none (persistent)" },
  { key: "static-global", zh: "static 全局", en: "static global", region: "data", life: "整个程序", lifeEn: "whole program", link: "内部链接", linkEn: "internal" },
  { key: "extern", zh: "extern 全局", en: "extern global", region: "data", life: "整个程序", lifeEn: "whole program", link: "外部链接", linkEn: "external" },
  { key: "register", zh: "register", en: "register", region: "cpu", life: "块内", lifeEn: "block", link: "无", linkEn: "none" },
  { key: "malloc", zh: "malloc 动态", en: "malloc", region: "heap", life: "free 前", lifeEn: "until free", link: "指针", linkEn: "via pointer" },
  { key: "literal", zh: "字符串字面量", en: "string literal", region: "rodata", life: "整个程序", lifeEn: "whole program", link: "只读", linkEn: "read-only" },
];
function StorageControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.sel} onChange={(e) => onChange({ ...config, sel: e.target.value })} style={{ fontWeight: 700 }}>
        {CLASSES.map((c) => <option key={c.key} value={c.key}>{isZh ? c.zh : c.en}</option>)}
      </select>
    </div>
  ) as unknown as never;
}
function StorageRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cls = CLASSES.find((c) => c.key === config.sel) ?? CLASSES[0];
  const activeRegion = cls.region;
  return (
    <Panel>
      <div style={{ display: "grid", gap: 4 }}>
        {REGIONS.map((r) => {
          const active = r.key === activeRegion || (activeRegion === "cpu" && r.key === "stack");
          return (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 10, background: active ? "#eef2ff" : r.color, border: `2px solid ${active ? "#4f46e5" : "transparent"}`, boxShadow: active ? "0 0 0 3px rgba(79,70,229,0.15)" : "none" }}>
              <span style={{ fontWeight: 800, color: active ? "#4338ca" : "#334155", fontSize: 13, width: 150 }}>{isZh ? r.zh : r.en} <span style={{ color: "#94a3b8" }}>{r.dir}</span></span>
              <span style={{ fontSize: 12, color: "#475569" }}>{r.desc}</span>
            </div>
          );
        })}
      </div>
      <Table
        head={isZh ? ["属性", "值"] : ["Property", "Value"]}
        rows={[
          [isZh ? "位置" : "Location", REGIONS.find((r) => r.key === (activeRegion === "cpu" ? "stack" : activeRegion))?.[isZh ? "zh" : "en"] ?? "—"],
          [isZh ? "生命周期" : "Lifetime", isZh ? cls.life : cls.lifeEn],
          [isZh ? "作用域" : "Scope", cls.key === "extern" || cls.key === "static-global" ? (isZh ? "文件/全局" : "file/global") : (isZh ? "块内" : "block")],
          [isZh ? "链接属性" : "Linkage", isZh ? cls.link : cls.linkEn],
        ]}
      />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "栈自上而下、堆自下而上; static 变量存于 .data/.bss 且生命周期贯穿全程。" : "Stack grows down, heap up; static lives in .data/.bss."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// io: 文件 I/O 缓冲流 (逐帧)
// ---------------------------------------------------------------------
type IoPhase = "open" | "read" | "write" | "flush" | "close";
type IoScene = { phase: IoPhase; buffer: string[]; disk: string[]; flow: "none" | "in" | "out" };

const IO_PHASE: Record<IoPhase, { bg: string; fg: string; zh: string; en: string }> = {
  open: { bg: "#dbeafe", fg: "#1e40af", zh: "打开文件：分配 FILE 与控制块", en: "open: allocate FILE + control block" },
  read: { bg: "#dcfce7", fg: "#166534", zh: "读：磁盘 → 缓冲区 → 程序", en: "read: disk → buffer → program" },
  write: { bg: "#fef3c7", fg: "#92400e", zh: "写：程序 → 缓冲区（延迟落盘）", en: "write: program → buffer (deferred)" },
  flush: { bg: "#ede9fe", fg: "#5b21b6", zh: "刷新：缓冲区 → 磁盘", en: "flush: buffer → disk" },
  close: { bg: "#e2e8f0", fg: "#334155", zh: "关闭：刷新残余并释放资源", en: "close: flush + release" },
};

function IoBox({ label, sub, bytes, hot, tone }: { label: string; sub: string; bytes: string[]; hot: boolean; tone: string }) {
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "10px 12px", borderRadius: 10, background: hot ? tone : "#f8fafc", border: `2px solid ${hot ? "#0f172a" : "#e2e8f0"}` }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}>{label}</div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{sub}</div>
      <div style={{ marginTop: 6, minHeight: 22, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#0f172a", wordBreak: "break-all" }}>
        {bytes.length ? bytes.join(" ") : <span style={{ color: "#cbd5e1" }}>—</span>}
      </div>
    </div>
  );
}

function IoRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? { phase: "open", buffer: [], disk: [], flow: "none" }) as IoScene;
  const ph = IO_PHASE[s.phase] ?? IO_PHASE.open;
  const inFlow = s.flow === "in";
  const arrow = (hot: boolean) => (
    <div style={{ alignSelf: "center", fontSize: 20, fontWeight: 900, color: hot ? "#4f46e5" : "#cbd5e1", width: 30, textAlign: "center" }}>{inFlow ? "←" : "→"}</div>
  );
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: ph.bg, color: ph.fg, fontWeight: 800, fontSize: 14 }}>{isZh ? ph.zh : ph.en}</div>
      <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
        <IoBox label={isZh ? "程序" : "Program"} sub={isZh ? "用户变量 / 字符" : "user vars"} bytes={s.phase === "read" ? ["fgets"] : s.phase === "write" ? ["\"World\""] : []} hot={s.phase === "read" || s.phase === "write"} tone="#fef3c7" />
        {arrow(s.flow !== "none")}
        <IoBox label={isZh ? "stdio 缓冲区" : "stdio buffer"} sub={isZh ? "内存中的块" : "in-memory block"} bytes={s.buffer} hot={s.buffer.length > 0} tone="#eef2ff" />
        {arrow(s.flow !== "none")}
        <IoBox label={isZh ? "磁盘文件" : "disk file"} sub="data.txt" bytes={s.disk} hot={s.phase !== "open"} tone="#dcfce7" />
      </div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.8, padding: "8px 12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        {isZh
          ? "标准 I/O 带缓冲：读时先块读到缓冲区再交给程序；写时先进缓冲区，满或 $fflush$ / $fclose$ 时才落盘。格式符如 $\\%d\\,\\%x\\,\\%f\\,\\%s\\,\\%c$，打开模式 $r/w/a$（可加 $+$、$b$）。"
          : "Std I/O is buffered: reads fill the buffer block-wise; writes sit in the buffer until full or $fflush$/$fclose$. Specifiers like $\\%d\\,\\%x\\,\\%f\\,\\%s\\,\\%c$; modes $r/w/a$ (+$+$, $b$)."}
      </div>
    </Panel>
  );
}

function ioGenerate(_config: any): Frame<IoScene>[] {
  const HELLO = ["H", "e", "l", "l", "o"];
  const HELLO_WORLD = [...HELLO, "W", "o", "r", "l", "d"];
  return [
    { line: 0, caption: T("$fopen$：建立 FILE 控制块与缓冲区，打开 data.txt（模式 $r$）", "$fopen$: build FILE + buffer, open data.txt (mode $r$)"), scene: { phase: "open", buffer: [], disk: HELLO, flow: "none" } },
    { line: 1, caption: T("$fgets$：磁盘块读入缓冲区，再交给程序", "$fgets$: block-read disk → buffer → program"), scene: { phase: "read", buffer: [...HELLO], disk: HELLO, flow: "in" } },
    { line: 2, caption: T("$fprintf$ 写 \"World\"：先写入缓冲区，暂不落盘", "$fprintf$ writes \"World\": into the buffer first"), scene: { phase: "write", buffer: HELLO_WORLD, disk: HELLO, flow: "out" } },
    { line: 3, caption: T("$fflush$：把缓冲区内容整体写入磁盘", "$fflush$: dump the buffer to disk"), scene: { phase: "flush", buffer: [], disk: HELLO_WORLD, flow: "out" } },
    { line: 4, caption: T("$fclose$：刷新残余缓冲并释放 FILE", "$fclose$: flush remaining and release FILE"), scene: { phase: "close", buffer: [], disk: HELLO_WORLD, flow: "none" } },
  ];
}
const IO_CODE = [
  T("FILE *fp = fopen(\"data.txt\", \"r\");", "FILE *fp = fopen(\"data.txt\", \"r\");"),
  T("fgets(buf, n, fp);  // 读", "fgets(buf, n, fp);  // read"),
  T("fprintf(fp, \"World\");  // 写", "fprintf(fp, \"World\");  // write"),
  T("fflush(fp);  // 缓冲落盘", "fflush(fp);  // dump buffer"),
  T("fclose(fp);  // 关闭", "fclose(fp);  // close"),
];

// ---------------------------------------------------------------------
// preprocessor: 宏展开 (示例)
// ---------------------------------------------------------------------
const PP_EXAMPLES: { zh: string; en: string; rows: [string, string][] }[] = [
  { zh: "对象宏", en: "Object macro", rows: [["#define PI 3.14159", "定义"], ["double s = PI * r * r;", "使用"], ["double s = 3.14159 * r * r;", "文本替换"]] },
  { zh: "函数宏 (括号防坑)", en: "Function macro", rows: [["#define SQUARE(x) ((x)*(x))", "定义"], ["SQUARE(3 + 1)", "调用"], ["((3 + 1) * (3 + 1)) = 16", "展开 (每参数加括号)"]] },
  { zh: "包含卫士", en: "Include guard", rows: [["#ifndef HELLO_H", "首次未定义"], ["#define HELLO_H", "标记已包含"], ["/* 头文件内容 */", "只处理一次"], ["#endif", "结束"]] },
  { zh: "条件编译", en: "Conditional compile", rows: [["#ifdef DEBUG", "若定义 DEBUG"], ["  printf(...);", "调试代码"], ["#endif", "否则整段删除"]] },
];
function PpControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.ex} onChange={(e) => onChange({ ...config, ex: Number(e.target.value) })} style={{ fontWeight: 700 }}>
        {PP_EXAMPLES.map((p, i) => <option key={i} value={i}>{isZh ? p.zh : p.en}</option>)}
      </select>
    </div>
  );
}
function PpRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const ex = PP_EXAMPLES[config.ex ?? 0] ?? PP_EXAMPLES[0];
  return (
    <Panel>
      <div style={{ display: "grid", gap: 4 }}>
        {ex.rows.map(([code, note], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 10, background: i === ex.rows.length - 1 ? "#dcfce7" : "#f8fafc", border: `1px solid ${i === ex.rows.length - 1 ? "#16a34a" : "#e2e8f0"}` }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#1e293b", whiteSpace: "pre" }}>{code}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>{note}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// stdlib
// ---------------------------------------------------------------------
const HEADERS: Record<string, [string, string, string][]> = {
  "string.h": [["strlen(s)", "size_t", "串长"], ["strcpy(d,s)", "char*", "拷贝"], ["strcmp(a,b)", "int", "比较"], ["strcat(d,s)", "char*", "拼接"], ["memcpy(d,s,n)", "void*", "内存拷贝"], ["memset(p,c,n)", "void*", "填充"]],
  "stdlib.h": [["malloc(n)", "void*", "分配"], ["calloc(n,sz)", "void*", "分配并清零"], ["free(p)", "void", "释放"], ["atoi(s)", "int", "串→整数"], ["qsort(...)", "void", "排序"], ["rand()", "int", "伪随机"]],
  "math.h": [["sqrt(x)", "double", "平方根"], ["pow(x,y)", "double", "幂"], ["fabs(x)", "double", "绝对值"], ["sin(x)", "double", "正弦"], ["ceil/floor(x)", "double", "取整"]],
  "time.h": [["time(&t)", "time_t", "当前时间"], ["clock()", "clock_t", "CPU 时间"], ["difftime(a,b)", "double", "时间差"]],
  "ctype.h": [["isdigit(c)", "int", "数字?"], ["isalpha(c)", "int", "字母?"], ["isspace(c)", "int", "空白?"], ["toupper(c)", "int", "转大写"]],
  "stdio.h": [["printf(f,…)", "int", "格式化输出"], ["scanf(f,…)", "int", "格式化输入"], ["fopen(p,m)", "FILE*", "打开"], ["fclose(f)", "int", "关闭"], ["fgets(s,n,f)", "char*", "读一行"]],
  "assert.h": [["assert(expr)", "void", "断言; 失败中止"]],
};
function StdControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.header} onChange={(e) => onChange({ ...config, header: e.target.value })} style={{ fontWeight: 700 }}>
        {Object.keys(HEADERS).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}
function StdRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows = HEADERS[config.header] ?? HEADERS["string.h"];
  return (
    <Panel>
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 14, fontFamily: "ui-monospace, monospace" }}>#include &lt;{config.header}&gt;</div>
      <Table head={isZh ? ["函数", "返回", "用途"] : ["Function", "Returns", "Purpose"]} rows={rows.map((r) => [`${r[0]}`, r[1], r[2]])} />
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  lexical: { id: "lexical", title: T("词法", "Lexical"), defaultConfig: { src: 'int main() { int x = 42; /* comment */ return x + 1; }' }, Controls: LexControls as never, generate: () => [{ caption: T("程序结构与词法", "Lexical"), scene: {} }] as never, Render: LexRender as never } as unknown as ModuleDef,
  types: { id: "types", title: T("数据类型", "Types"), defaultConfig: { view: "basic", preset: 0 }, Controls: TypesControls as never, generate: () => [{ caption: T("数据类型", "Types"), scene: {} }] as never, Render: TypesRender as never } as unknown as ModuleDef,
  pointers: { id: "pointers", title: T("指针与地址", "Pointers"), defaultConfig: PTR_DEFAULT, Controls: PtrControls as never, generate: () => [{ caption: T("指针与地址", "Pointers"), scene: {} }] as never, Render: PtrRender as never } as unknown as ModuleDef,
  operators: { id: "operators", title: T("运算符与位运算", "Operators"), defaultConfig: { a: 0b1100, b: 0b1010, op: "and", sh: 1 }, Controls: OpControls as never, generate: () => [{ caption: T("位运算", "Bitwise"), scene: {} }] as never, Render: OpRender as never } as unknown as ModuleDef,
  storage: { id: "storage", title: T("存储类别与内存", "Storage & Memory"), defaultConfig: { sel: "auto" }, Controls: StorageControls as never, generate: () => [{ caption: T("存储类别与内存模型", "Storage & memory"), scene: {} }] as never, Render: StorageRender as never } as unknown as ModuleDef,
  io: { id: "io", title: T("输入输出与文件", "I/O"), defaultConfig: {}, generate: ioGenerate as never, code: IO_CODE, Render: IoRender as never } as unknown as ModuleDef,
  preprocessor: { id: "preprocessor", title: T("预处理", "Preprocessor"), defaultConfig: { ex: 0 }, Controls: PpControls as never, generate: () => [{ caption: T("预处理与工程", "Preprocessor"), scene: {} }] as never, Render: PpRender as never } as unknown as ModuleDef,
  stdlib: { id: "stdlib", title: T("标准库", "Stdlib"), defaultConfig: { header: "string.h" }, Controls: StdControls as never, generate: () => [{ caption: T("标准库速查", "Stdlib"), scene: {} }] as never, Render: StdRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "基础", opts: [
    { v: "lexical", zh: "程序结构与词法", en: "Lexical" },
    { v: "types", zh: "数据类型", en: "Types" },
  ]},
  { label: "核心", opts: [
    { v: "pointers", zh: "指针与地址", en: "Pointers" },
    { v: "operators", zh: "运算符与位运算", en: "Operators" },
    { v: "storage", zh: "存储类别与内存", en: "Storage" },
  ]},
  { label: "工程", opts: [
    { v: "io", zh: "输入输出与文件", en: "I/O" },
    { v: "preprocessor", zh: "预处理与工程", en: "Preprocessor" },
    { v: "stdlib", zh: "标准库速查", en: "Stdlib" },
  ]},
];

const DEFAULT: Cfg = { subMode: "lexical", ...(SUB.lexical as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.lexical;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "lexical";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const cProgrammingModule: ModuleDef<any, Cfg> = {
  id: "c-programming",
  title: T("C 语言", "The C Language"),
  desc: T("词法 / 类型与对齐 / 指针 / 位运算 / 存储模型 / IO / 预处理 / 标准库。", "Lexical / types & alignment / pointers / bitwise / storage / I/O / preprocessor / stdlib."),
  tags: ["c-programming", "programming"],
  interactive: false,
  defaultConfig: DEFAULT,
  Controls({ config, onChange, t, embedded }: any) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    if (embedded && !active?.Controls) return null;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        {!embedded && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "C 语言" : "C LANGUAGE"}</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 220, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
        </div>}
        {active?.Controls && createElement(active.Controls as any, { config: safe as any, onChange: onChange as any, t })}
      </div>
    ) as unknown as never;
  },
  generate(config) {
    const safe = safeCfg((config as Cfg).subMode, config as Cfg);
    const m = activeOf((config as Cfg).subMode) as any;
    const res: any = m.generate(safe);
    const frames: any[] = Array.isArray(res) ? res : res?.frames ?? [];
    return frames.length ? frames : [{ caption: T("C 语言", "C"), scene: safe }];
  },
  codeFor(config) {
    const m = activeOf((config as Cfg).subMode) as any;
    return (m.code ?? []) as never;
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
