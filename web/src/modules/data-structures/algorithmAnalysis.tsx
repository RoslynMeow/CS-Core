import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 算法定义与渐近分析 · 单模块聚合 · 交互式
//   对应 tex/DataStructure/Chapters/AlgorithmAnalysis.tex
//   definition(定义与特征) / notation(渐进记号) / growth(阶数) / master(主定理) / space(空间)
// =====================================================================

type SubMode = "definition" | "notation" | "growth" | "master" | "space";

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
  return <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// definition / notation / space
// ---------------------------------------------------------------------
function DefinitionRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const features: [string, string][] = isZh
    ? [["有穷性", "执行步数有上界 B, 每步在有限时间内完成"], ["确定性", "同一状态下, 下一步唯一"], ["可行性", "每个基本操作都可实现"], ["输入/输出", "满足后置条件 Post(I, O)"]]
    : [["Finiteness", "bounded steps, each in finite time"], ["Definiteness", "unique next step per state"], ["Effectiveness", "every basic op is realizable"], ["I/O", "satisfies Post(I, O)"]];
  const layers: [string, string][] = isZh
    ? [["规约层", "用谓词逻辑描述前置 Pre / 后置 Post"], ["细化层", "伪代码 + 控制算子, 语言无关 (本书)"], ["实现层", "高级语言实现, 语义等价"]]
    : [["Specification", "Pre/Post predicates"], ["Refinement", "pseudocode, language-independent"], ["Implementation", "realization, semantics-preserving"]];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {features.map(([n, d]) => (
          <div key={n} style={{ flex: "1 1 190px", minWidth: 180, padding: "12px 14px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
            <div style={{ fontWeight: 900, color: "#4338ca", fontSize: 13 }}>{n}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{isZh ? "描述层级" : "Description levels"}</div>
      <Table head={isZh ? ["层级", "说明"] : ["Level", "Note"]} rows={layers} />
      <div style={{ textAlign: "center", fontSize: 13 }}>
        <MathText text={isZh ? "$\\{Pre\\}\\ A\\ \\{Post\\}$ — 从伪代码到实现的翻译保持 $Pre/Post$, 仅常数因子变化" : "$\\{Pre\\}\\ A\\ \\{Post\\}$ — translation preserves Pre/Post up to constants"} />
      </div>
    </Panel>
  );
}

function NotationRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["大 O (上界)", "$T(n)=O(f)$", "$\\exists c,n_0,\\ \\forall n\\ge n_0: T(n)\\le c\\,f(n)$"],
      ["Ω (下界)", "$T(n)=\\Omega(f)$", "$\\exists c,n_0,\\ \\forall n\\ge n_0: T(n)\\ge c\\,f(n)$"],
      ["Θ (紧界)", "$T(n)=\\Theta(f)$", "$O(f)\\ \\land\\ \\Omega(f)$"],
    ]
    : [
      ["Big-O (upper)", "$T(n)=O(f)$", "$\\exists c,n_0: T(n)\\le c f(n)$"],
      ["Omega (lower)", "$T(n)=\\Omega(f)$", "$\\exists c,n_0: T(n)\\ge c f(n)$"],
      ["Theta (tight)", "$T(n)=\\Theta(f)$", "$O(f)\\ \\land\\ \\Omega(f)$"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["记号", "写法", "含义"] : ["Notation", "Form", "Meaning"]} rows={rows.map((r) => [r[0], <MathText key={String(r[1])} text={`$${r[1]}$`} />, <MathText key={String(r[2])} text={String(r[2])} />])} />
    </Panel>
  );
}

function SpaceRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["$O(1)$", "原地 (in-place): 仅常数辅助槽位 τ 中转", "交换 / 就地排序"],
      ["$O(\\log n)$", "递归栈深度 H, 平衡分治 H=O(log n)", "快排期望 / 二分"],
      ["$O(n)$", "需与输入等大的副本或表", "归并 / 哈希 / 计数排序"],
    ]
    : [
      ["$O(1)$", "in-place, constant aux", "swap / in-place sort"],
      ["$O(\\log n)$", "recursion stack H", "quicksort avg / binary search"],
      ["$O(n)$", "copy as large as input", "merge / hash / counting sort"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["辅助空间", "含义", "典型"] : ["Aux space", "Meaning", "Typical"]} rows={rows.map((r) => [<MathText key="0" text={String(r[0])} />, r[1], r[2]])} />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "递归的栈空间计入辅助空间; 并查集的 O(α(n)) 为摊还界。" : "Recursion stack counts; union-find is amortized O(α(n))."}
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
  definition: { id: "definition", title: T("定义与特征", "Definition"), defaultConfig: {}, generate: () => [{ caption: T("算法定义", "Algorithm definition"), scene: {} }] as never, Render: DefinitionRender as never } as unknown as ModuleDef,
  notation: { id: "notation", title: T("渐进记号", "Notation"), defaultConfig: {}, generate: () => [{ caption: T("渐进记号", "Asymptotic notation"), scene: {} }] as never, Render: NotationRender as never } as unknown as ModuleDef,
  growth: { id: "growth", title: T("阶数增长", "Growth"), defaultConfig: { n: 16 }, Controls: GrowthControls as never, generate: () => [{ caption: T("复杂度阶数", "Complexity orders"), scene: {} }] as never, Render: GrowthRender as never } as unknown as ModuleDef,
  master: { id: "master", title: T("主定理", "Master Theorem"), defaultConfig: MASTER_DEFAULT, Controls: MasterControls as never, generate: () => [{ caption: T("主定理", "Master theorem"), scene: {} }] as never, Render: MasterRender as never } as unknown as ModuleDef,
  space: { id: "space", title: T("空间复杂度", "Space"), defaultConfig: {}, generate: () => [{ caption: T("空间复杂度", "Space complexity"), scene: {} }] as never, Render: SpaceRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "基础", opts: [
    { v: "definition", zh: "定义与特征", en: "Definition" },
    { v: "notation", zh: "渐进记号", en: "Notation" },
  ]},
  { label: "度量", opts: [
    { v: "growth", zh: "阶数增长", en: "Growth" },
    { v: "master", zh: "主定理", en: "Master" },
    { v: "space", zh: "空间复杂度", en: "Space" },
  ]},
];

const DEFAULT: Cfg = { subMode: "definition", ...(SUB.definition as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.definition;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "definition";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const algorithmAnalysisModule: ModuleDef<any, Cfg> = {
  id: "algorithm-analysis",
  title: T("算法分析", "Algorithm Analysis"),
  desc: T("算法定义 / 渐进记号 O·Ω·Θ / 阶数增长 / 主定理 / 空间复杂度。", "Definition / asymptotics / growth / master theorem / space."),
  tags: ["data-structures", "algorithms"],
  interactive: true,
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
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
