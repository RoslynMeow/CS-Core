import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 算法定义与渐近分析 · 单模块聚合
//   对应 tex/DataStructure/Chapters/AlgorithmAnalysis.tex
//   notation(渐进记号) / growth(阶数) / master(主定理)
//   definition / space 为纯文字定义, 已按规则移除
// =====================================================================

type SubMode = "notation" | "growth" | "master";

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
// notation: 渐进记号 O/Ω/Θ —— 两条增长曲线的上下界夹逼动画
// ---------------------------------------------------------------------
const NOTATION_N = 12;
const notationT = (n: number) => 3 * n * n + 2 * n + 1; // T(n) = 3n²+2n+1
const notationG = (n: number) => n * n; // g(n) = n²

const NOTATION_CODE = [
  T("$T(n)=3n^2+2n+1,\\quad g(n)=n^2$", "$T(n)=3n^2+2n+1,\\quad g(n)=n^2$"),
  T("大 $O$: $\\exists c,n_0,\\ \\forall n\\ge n_0:\\ T(n)\\le c\\,g(n)$", "Big-O: $\\exists c,n_0,\\ \\forall n\\ge n_0:\\ T(n)\\le c\\,g(n)$"),
  T("$\\Omega$: $\\exists c,n_0,\\ \\forall n\\ge n_0:\\ T(n)\\ge c\\,g(n)$", "$\\Omega$: $\\exists c,n_0,\\ \\forall n\\ge n_0:\\ T(n)\\ge c\\,g(n)$"),
  T("$\\Theta$: $T=O(g)\\ \\land\\ T=\\Omega(g)$", "$\\Theta$: $T=O(g)\\ \\land\\ T=\\Omega(g)$"),
];

type NotationScene = { kind: "intro" | "O" | "Omega" | "Theta"; cLo?: number; cHi?: number; n0Lo?: number; n0Hi?: number };

function notationFrames(): Frame<NotationScene>[] {
  return [
    { line: 0, caption: T("两条增长曲线 $T(n)=3n^2+2n+1$ 与 $g(n)=n^2$", "Two growth curves $T(n)=3n^2+2n+1$ and $g(n)=n^2$"), scene: { kind: "intro" } },
    { line: 1, caption: T("大 $O$（上界）：取 $c=4$，$n\\ge n_0=3$ 时 $T(n)\\le c\\,g(n)$", "Big-O (upper): $c=4$, $T(n)\\le c\\,g(n)$ for $n\\ge n_0=3$"), scene: { kind: "O", cHi: 4, n0Hi: 3 } },
    { line: 2, caption: T("$\\Omega$（下界）：取 $c=3$，$n\\ge n_0=1$ 时 $T(n)\\ge c\\,g(n)$", "$\\Omega$ (lower): $c=3$, $T(n)\\ge c\\,g(n)$ for $n\\ge n_0=1$"), scene: { kind: "Omega", cLo: 3, n0Lo: 1 } },
    { line: 3, caption: T("$\\Theta$（紧界）：两侧夹逼，$T(n)=\\Theta(n^2)$", "$\\Theta$ (tight): squeezed on both sides, $T(n)=\\Theta(n^2)$"), scene: { kind: "Theta", cLo: 3, cHi: 4, n0Lo: 1, n0Hi: 3 } },
  ];
}

function NotationRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? { kind: "intro" }) as NotationScene;
  const showHi = s.cHi !== undefined;
  const showLo = s.cLo !== undefined;
  const W = 720, H = 350;
  const pad = { l: 54, r: 20, t: 22, b: 40 };
  const yMax = 600;
  const X = (n: number) => pad.l + (n / NOTATION_N) * (W - pad.l - pad.r);
  const Y = (v: number) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const poly = (f: (n: number) => number) =>
    Array.from({ length: NOTATION_N + 1 }, (_, n) => `${X(n).toFixed(1)},${Y(f(n)).toFixed(1)}`).join(" ");
  const ticks = [0, 2, 4, 6, 8, 10, 12];
  const legend: [string, string, boolean][] = [
    ["$T(n)=3n^2+2n+1$", "#4f46e5", false],
    ["$g(n)=n^2$", "#0ea5e9", true],
  ];
  if (showHi) legend.push([`$c\\,g(n)$, $c=${s.cHi}$`, "#f59e0b", false]);
  if (showLo) legend.push([`$c\\,g(n)$, $c=${s.cLo}$`, "#16a34a", false]);
  return (
    <Panel>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        {ticks.map((n) => (
          <line key={`gx${n}`} x1={X(n)} y1={pad.t} x2={X(n)} y2={H - pad.b} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {s.n0Hi !== undefined && <rect x={X(s.n0Hi)} y={pad.t} width={X(NOTATION_N) - X(s.n0Hi)} height={H - pad.b - pad.t} fill="#f59e0b" opacity={0.08} />}
        {s.n0Lo !== undefined && <rect x={X(s.n0Lo)} y={pad.t} width={X(NOTATION_N) - X(s.n0Lo)} height={H - pad.b - pad.t} fill="#16a34a" opacity={0.06} />}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#94a3b8" strokeWidth={1.5} />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#94a3b8" strokeWidth={1.5} />
        {ticks.map((n) => <text key={`tx${n}`} x={X(n)} y={H - pad.b + 16} textAnchor="middle" fontSize={10} fill="#64748b">{n}</text>)}
        <text x={W - pad.r} y={H - pad.b + 32} textAnchor="end" fontSize={12} fill="#475569">n</text>
        <text x={pad.l - 8} y={pad.t + 4} textAnchor="end" fontSize={10} fill="#64748b">{yMax}</text>
        <text x={pad.l - 8} y={H - pad.b} textAnchor="end" fontSize={10} fill="#64748b">0</text>
        <polyline points={poly(notationG)} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="5 3" />
        {showHi && <polyline points={poly((n) => s.cHi! * notationG(n))} fill="none" stroke="#f59e0b" strokeWidth={2.5} />}
        {showLo && <polyline points={poly((n) => s.cLo! * notationG(n))} fill="none" stroke="#16a34a" strokeWidth={2.5} />}
        <polyline points={poly(notationT)} fill="none" stroke="#4f46e5" strokeWidth={3} />
        {s.n0Hi !== undefined && <line x1={X(s.n0Hi)} y1={pad.t} x2={X(s.n0Hi)} y2={H - pad.b} stroke="#f59e0b" strokeDasharray="4 3" />}
        {s.n0Lo !== undefined && <line x1={X(s.n0Lo)} y1={pad.t} x2={X(s.n0Lo)} y2={H - pad.b} stroke="#16a34a" strokeDasharray="4 3" />}
        {ticks.map((n) => <circle key={`pt${n}`} cx={X(n)} cy={Y(notationT(n))} r={2.6} fill="#4f46e5" />)}
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 12 }}>
        {legend.map(([label, color, dash], i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 22, height: 0, borderTop: `${dash ? "2px dashed" : "3px solid"} ${color}` }} />
            <MathText text={label} />
          </span>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 14, color: "#4338ca", fontWeight: 700 }}>
        {s.kind === "intro" && <MathText text={isZh ? "观察 $T$ 与 $g$ 的相对增长" : "Compare the growth of $T$ and $g$"} />}
        {s.kind === "O" && <MathText text={"$T(n)\\in O(n^2)$"} />}
        {s.kind === "Omega" && <MathText text={"$T(n)\\in \\Omega(n^2)$"} />}
        {s.kind === "Theta" && <MathText text={"$T(n)\\in \\Theta(n^2)$"} />}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh
          ? "$O$ 给上界（$c\\,g$ 在某 $n_0$ 之后恒在 $T$ 上方），$\\Omega$ 给下界，二者同时成立即 $\\Theta$。"
          : "$O$ upper-bounds ($c\\,g$ stays above $T$ past $n_0$), $\\Omega$ lower-bounds; both ⇒ $\\Theta$."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// growth: 阶数增长
// ---------------------------------------------------------------------
const FUNCS: { zh: string; en: string; f: (n: number) => number; color: string }[] = [
  { zh: "常数 O(1)", en: "O(1)", f: () => 1, color: "#64748b" },
  { zh: "对数 O(log n)", en: "O(log n)", f: (n) => n > 0 ? Math.log2(n) : 0, color: "#15803d" },
  { zh: "线性 O(n)", en: "O(n)", f: (n) => n, color: "#2563eb" },
  { zh: "线性对数 O(n log n)", en: "O(n log n)", f: (n) => n * (n > 1 ? Math.log2(n) : 0), color: "#0891b2" },
  { zh: "平方 O(n²)", en: "O(n²)", f: (n) => n * n, color: "#a21caf" },
  { zh: "指数 O(2ⁿ)", en: "O(2ⁿ)", f: (n) => 2 ** Math.min(n, 40), color: "#dc2626" },
];
function GrowthControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <input type="range" min={1} max={40} value={config.n} onChange={(e) => onChange({ ...config, n: Number(e.target.value) })} />
      <b style={{ fontFamily: "ui-monospace, monospace", color: "#4338ca" }}>{config.n}</b>
    </div>
  );
}
function GrowthRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const n = Math.max(1, config.n | 0);
  const max = FUNCS[FUNCS.length - 1].f(n);
  return (
    <Panel>
      <Table
        head={isZh ? ["阶", "操作数 T(n)", "相对最大"] : ["Order", "T(n)", "rel"]}
        rows={FUNCS.map((fn) => {
          const v = fn.f(n);
          const ratio = max > 0 ? v / max : 0;
          return [fn.zh, <b key="v" style={{ color: fn.color, fontFamily: "ui-monospace, monospace" }}>{Math.round(v).toLocaleString()}</b>, <div key="bar" style={{ width: "100%", height: 12, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", background: fn.color }} /></div>];
        })}
      />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? `n=${n} 时, O(2ⁿ) 与 O(n²) 已远超线性; 增长差异随 n 拉大。` : `At n=${n}, exponential far dominates; the gap widens with n.`}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// master: 主定理
// ---------------------------------------------------------------------
const MASTER_DEFAULT = { a: 2, b: 2, p: 1 };
const P_OPTS = [
  { p: 0, label: "1" }, { p: 0.5, label: "n^0.5" }, { p: 1, label: "n" }, { p: 1.5, label: "n^1.5" },
  { p: 2, label: "n²" }, { p: 3, label: "n³" },
];
function MasterControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>a</span>
        <input className="txt" type="number" min={1} max={8} value={config.a} onChange={(e) => set({ a: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} style={{ width: 60 }} />
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>b</span>
        <input className="txt" type="number" min={2} max={4} value={config.b} onChange={(e) => set({ b: Math.max(2, Math.min(4, Number(e.target.value) || 2)) })} style={{ width: 60 }} />
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>f(n)=</span>
        <select className="txt" value={config.p} onChange={(e) => set({ p: Number(e.target.value) })}>{P_OPTS.map((o) => <option key={o.p} value={o.p}>n^{o.label === "1" ? "0" : o.label}</option>)}</select>
      </label>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{isZh ? "T(n)=a·T(n/b)+f(n)" : "T(n)=a·T(n/b)+f(n)"}</span>
    </div>
  );
}
function MasterRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const { a, b, p } = config;
  const logba = Math.log(a) / Math.log(b);
  const eps = 1e-6;
  let caseNo: 1 | 2 | 3; let result: string;
  if (Math.abs(p - logba) < 0.05) { caseNo = 2; result = `\\Theta(n^{${logba.toFixed(2)}}\\log n)`; }
  else if (p < logba) { caseNo = 1; result = `\\Theta(n^{\\log_${b} ${a}})=\\Theta(n^{${logba.toFixed(2)}})`; }
  else { caseNo = 3; result = `\\Theta(n^{${p}})`; }
  const cases: React.ReactNode[][] = isZh
    ? [
      ["1", "$f=O(n^{\\log_b a-\\epsilon})$", isZh ? "叶主导" : "leaves dominate", "T(n)=\\Theta(n^{\\log_b a})"],
      ["2", "$f=\\Theta(n^{\\log_b a})$", isZh ? "每层等量" : "per-level equal", "T(n)=\\Theta(n^{\\log_b a}\\log n)"],
      ["3", "$f=\\Omega(n^{\\log_b a+\\epsilon})$", isZh ? "根主导" : "root dominates", "T(n)=\\Theta(f(n))"],
    ]
    : [
      ["1", "$f=O(n^{\\log_b a-\\epsilon})$", "leaves dominate", "T(n)=\\Theta(n^{\\log_b a})"],
      ["2", "$f=\\Theta(n^{\\log_b a})$", "per-level equal", "T(n)=\\Theta(n^{\\log_b a}\\log n)"],
      ["3", "$f=\\Omega(n^{\\log_b a+\\epsilon})$", "root dominates", "T(n)=\\Theta(f(n))"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span>{`a = ${a}`}</span><span>{`b = ${b}`}</span><span>{`f(n) = n^${p}`}</span>
        <span style={{ color: "#4338ca", fontWeight: 800 }}>{`log_b a = ${logba.toFixed(3)}`}</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900, color: "#b45309" }}>
        <MathText text={`\\text{case } ${caseNo}:\\quad T(n) = ${result}`} />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "ui-monospace, monospace", background: "#fff" }}>
        <tbody>
          {cases.map((r, i) => (
            <tr key={i} style={{ background: (i + 1) === caseNo ? "#dcfce7" : "#fff", fontWeight: (i + 1) === caseNo ? 800 : 400 }}>
              <td style={{ padding: "6px 10px", color: "#4338ca" }}>case {r[0]}</td>
              <td style={{ padding: "6px 10px" }}><MathText text={`$${r[1]}$`} /></td>
              <td style={{ padding: "6px 10px", color: "#64748b" }}>{r[2]}</td>
              <td style={{ padding: "6px 10px" }}><MathText text={`$${r[3]}$`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  notation: { id: "notation", title: T("渐进记号", "Notation"), defaultConfig: {}, generate: () => notationFrames() as never, code: NOTATION_CODE as never, Render: NotationRender as never } as unknown as ModuleDef,
  growth: { id: "growth", title: T("阶数增长", "Growth"), defaultConfig: { n: 16 }, Controls: GrowthControls as never, generate: () => [{ caption: T("复杂度阶数", "Complexity orders"), scene: {} }] as never, Render: GrowthRender as never } as unknown as ModuleDef,
  master: { id: "master", title: T("主定理", "Master Theorem"), defaultConfig: MASTER_DEFAULT, Controls: MasterControls as never, generate: () => [{ caption: T("主定理", "Master theorem"), scene: {} }] as never, Render: MasterRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "基础", opts: [
    { v: "notation", zh: "渐进记号", en: "Notation" },
  ]},
  { label: "度量", opts: [
    { v: "growth", zh: "阶数增长", en: "Growth" },
    { v: "master", zh: "主定理", en: "Master" },
  ]},
];

const DEFAULT: Cfg = { subMode: "notation", ...(SUB.notation as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.notation;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "notation";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const algorithmAnalysisModule: ModuleDef<any, Cfg> = {
  id: "algorithm-analysis",
  title: T("算法分析", "Algorithm Analysis"),
  desc: T("渐进记号 O·Ω·Θ（增长曲线夹逼）/ 阶数增长 / 主定理。", "Asymptotics O·Ω·Θ (growth curves) / growth / master theorem."),
  tags: ["data-structures", "algorithms"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "算法分析" : "ANALYSIS"}</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
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
    return frames.length ? frames : [{ caption: T("算法分析", "Algorithm Analysis"), scene: safe }];
  },
  codeFor(config) {
    const safe = safeCfg((config as Cfg).subMode, config as Cfg);
    const m = activeOf((config as Cfg).subMode) as any;
    return (m.codeFor ? m.codeFor(safe) : m.code) ?? [];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
