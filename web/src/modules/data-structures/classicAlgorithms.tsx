import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 经典算法 · 单模块聚合 · 交互式
//   对应 tex/DataStructure/Chapters/ClassicAlgorithms.tex
//   paradigms(分治/贪心/DP + 斐波那契) / unionfind(并查集) / coverage(与其它模块的对应)
// =====================================================================

type SubMode = "paradigms" | "unionfind" | "coverage";

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
// paradigms
// ---------------------------------------------------------------------
const DP_DEFAULT = { n: 10 };
function ParadigmControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <input type="range" min={0} max={12} value={config.n} onChange={(e) => onChange({ ...config, n: Number(e.target.value) })} />
      <b style={{ fontFamily: "ui-monospace, monospace", color: "#4338ca" }}>{config.n}</b>
    </div>
  );
}
function ParadigmRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["分治 Divide & Conquer", "拆成独立子问题 → 递归求解 → 合并", "归并排序 / 快排 / 二分 / 大整数乘法"],
      ["贪心 Greedy", "每步取局部最优, 不回溯 (需最优子结构+贪心选择)", "活动选择 / Huffman / Prim / Kruskal / Dijkstra"],
      ["动态规划 DP", "子问题重叠 → 记忆化/表格, 避免重复计算", "背包 / LCS / 编辑距离 / Floyd"],
    ]
    : [
      ["Divide & Conquer", "split → recurse → merge", "merge/quick sort, binary search"],
      ["Greedy", "local optimum, no backtracking", "activity select, Huffman, Prim, Dijkstra"],
      ["Dynamic Programming", "overlapping subproblems, memo/table", "knapsack, LCS, edit distance, Floyd"],
    ];
  const n = Math.max(0, Math.min(12, config.n | 0));
  const dp: number[] = [0, 1];
  for (let i = 2; i <= n; i++) dp[i] = dp[i - 1] + dp[i - 2];
  return (
    <Panel>
      <Table head={isZh ? ["范式", "思想", "典型"] : ["Paradigm", "Idea", "Typical"]} rows={rows} />
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{isZh ? `DP 自底向上 (n=${n})` : `Bottom-up DP (n=${n})`}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {Array.from({ length: n + 1 }, (_, i) => (
          <div key={i} style={{ width: 46, textAlign: "center", padding: "6px 0", borderRadius: 8, border: `1.5px solid ${i === n ? "#4f46e5" : "#e2e8f0"}`, background: i === n ? "#eef2ff" : "#fff" }}>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>dp[{i}]</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: i === n ? "#4338ca" : "#334155" }}>{dp[i]}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 13 }}>
        <MathText text={`$F(${n}) = ${dp[n]}$，$T(n)=O(n)$ (对比朴素递归 $O(\\varphi^n)$)`} />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// unionfind
// ---------------------------------------------------------------------
type UfCfg = { parent: number[]; rank: number[]; a: number; b: number; log: string[] };
const UF_DEFAULT: UfCfg = { parent: [0, 1, 2, 3, 4, 5, 6, 7], rank: [0, 0, 0, 0, 0, 0, 0, 0], a: 0, b: 1, log: [] };
function find(parent: number[], x: number): number {
  while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
  return x;
}
function UfControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as UfCfg;
  const n = cfg.parent.length;
  const doUnion = () => {
    const parent = [...cfg.parent]; const rank = [...cfg.rank];
    let ra = find(parent, cfg.a), rb = find(parent, cfg.b);
    if (ra !== rb) {
      if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
      parent[rb] = ra;
      if (rank[ra] === rank[rb]) rank[ra]++;
    }
    onChange({ ...cfg, parent, rank, log: [...(cfg.log ?? []), `union(${cfg.a},${cfg.b})`].slice(-8) });
  };
  const reset = () => onChange({ ...UF_DEFAULT });
  const sel = (key: "a" | "b") => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{key}</span>
      <select className="txt" value={cfg[key]} onChange={(e) => onChange({ ...cfg, [key]: Number(e.target.value) })}>{Array.from({ length: n }, (_, i) => <option key={i} value={i}>{i}</option>)}</select>
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      {sel("a")}{sel("b")}
      <button className="ghost" onClick={doUnion} style={{ background: "#eef2ff", borderColor: "#c7d2fe", color: "#4338ca", fontWeight: 800 }}>{isZh ? "合并 union(a,b)" : "union(a,b)"}</button>
      <button className="ghost" onClick={reset}>{isZh ? "重置" : "Reset"}</button>
    </div>
  );
}
function UfRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as UfCfg;
  const parent = cfg.parent ?? [];
  const n = parent.length;
  const probe = [...parent];
  const ra = n ? find(probe, cfg.a) : 0;
  const probe2 = [...parent];
  const rb = n ? find(probe2, cfg.b) : 0;
  const connected = ra === rb;
  const rootGroups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find([...parent], i); if (!rootGroups.has(r)) rootGroups.set(r, []); rootGroups.get(r)!.push(i); }
  return (
    <Panel>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {parent.map((p, i) => (
          <div key={i} style={{ width: 52, textAlign: "center", padding: "6px 0", borderRadius: 8, border: `1.5px solid ${i === ra || i === rb ? "#4f46e5" : "#e2e8f0"}`, background: p === i ? "#dcfce7" : "#fff" }}>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>{`[${i}]`}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: p === i ? "#15803d" : "#334155" }}>{`→${p}`}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span>{`find(${cfg.a}) = ${ra}`}</span>
        <span>{`find(${cfg.b}) = ${rb}`}</span>
        <span style={{ fontWeight: 800, color: connected ? "#15803d" : "#b45309" }}>{connected ? (isZh ? "同一集合" : "same set") : (isZh ? "不同集合" : "different sets")}</span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {[...rootGroups.entries()].map(([r, members]) => (
          <span key={r} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", padding: "4px 10px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>{`{${members.join(",")}} ← ${r}`}</span>
        ))}
      </div>
      {cfg.log?.length > 0 && <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{cfg.log.join("  ")}</div>}
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "按秩合并 + 路径压缩 → 摊还 O(α(n)) ≈ O(1)。绿色为根节点。" : "Union by rank + path compression → amortized O(α(n)). Green = root."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// coverage
// ---------------------------------------------------------------------
function CoverageRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["排序 / 查找", "数组算法", "10 排序 + 4 查找, 含复杂度与 PK"],
      ["树 (BST/AVL/RB/堆/B/B+)", "树", "插入/删除/旋转/遍历动画"],
      ["图 (遍历/最短路/MST/拓扑/A*/SCC/流)", "图", "12 个图算法逐步高亮"],
      ["哈希 / 栈 / 队列 / 链表", "存储结构", "ADT 与实现"],
      ["并查集", "本章", "按秩合并 + 路径压缩"],
      ["分治 / 贪心 / DP", "本章", "范式与斐波那契 DP"],
    ]
    : [
      ["Sort / Search", "Array Algorithms", "10 sorts + 4 searches"],
      ["Trees (BST/AVL/RB/heap/B/B+)", "Tree", "insert/delete/rotate/traverse"],
      ["Graphs (traversal/shortest/MST/topo/A*/SCC/flow)", "Graph", "12 algorithms"],
      ["Hash / Stack / Queue / List", "Storage", "ADTs & implementations"],
      ["Union-Find", "This chapter", "rank + path compression"],
      ["D&C / Greedy / DP", "This chapter", "paradigms + fib DP"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["算法族", "所在模块", "说明"] : ["Family", "Module", "Note"]} rows={rows} />
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  paradigms: { id: "paradigms", title: T("算法范式", "Paradigms"), defaultConfig: DP_DEFAULT, Controls: ParadigmControls as never, generate: () => [{ caption: T("分治 / 贪心 / DP", "D&C / Greedy / DP"), scene: {} }] as never, Render: ParadigmRender as never } as unknown as ModuleDef,
  unionfind: { id: "unionfind", title: T("并查集", "Union-Find"), defaultConfig: UF_DEFAULT, Controls: UfControls as never, generate: () => [{ caption: T("并查集", "Union-Find"), scene: {} }] as never, Render: UfRender as never } as unknown as ModuleDef,
  coverage: { id: "coverage", title: T("覆盖映射", "Coverage"), defaultConfig: {}, generate: () => [{ caption: T("算法覆盖", "Algorithm coverage"), scene: {} }] as never, Render: CoverageRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "范式", opts: [
    { v: "paradigms", zh: "分治/贪心/DP", en: "Paradigms" },
    { v: "unionfind", zh: "并查集", en: "Union-Find" },
    { v: "coverage", zh: "覆盖映射", en: "Coverage" },
  ]},
];

const DEFAULT: Cfg = { subMode: "paradigms", ...(SUB.paradigms as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.paradigms;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "paradigms";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const classicAlgorithmsModule: ModuleDef<any, Cfg> = {
  id: "classic-algorithms",
  title: T("经典算法", "Classic Algorithms"),
  desc: T("分治/贪心/DP 范式, 斐波那契 DP, 并查集(按秩合并+路径压缩), 算法覆盖映射。", "D&C/Greedy/DP paradigms, fib DP, union-find, coverage map."),
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "经典算法" : "CLASSIC"}</span>
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
    return frames.length ? frames : [{ caption: T("经典算法", "Classic Algorithms"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
