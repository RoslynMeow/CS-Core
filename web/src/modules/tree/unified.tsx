import { useState } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import type { ImportedGraph } from "./source";
import { GraphEditor } from "../../components/GraphEditor";
import { Graph, buildGraphDump } from "../../lib/graph";
import { buildMemoryUrl } from "../../lib/memoryDump";
import { MathText } from "../../lib/tex";
import { StateBar } from "../../components/canvas/StateBar";
import { SplitPane } from "../../components/SplitPane";
import { Graph as GraphCls } from "../../lib/graph";
import {
  bstFromValues, completeTree, bstInsertSteps, bstSearchOnTree, bstInsertOne, bstDeleteOnTree,
  BST_SEARCH_CODE, BST_INSERT_CODE, BST_DELETE_CODE,
  binBf, binToGraph, treeTraverseSteps, LEVEL_CODE, BFS_CODE, DFS_CODE,
  avlInsertSteps, AVL_CODE,
  heapBuildSteps, heapInsertSteps as heapInsertSteps2, heapDeleteTopSteps, HEAP_BUILD_CODE, HEAP_INSERT_CODE, HEAP_DELETE_CODE,
} from "../../lib/graph";
import { resolveTree, type TreeCfg } from "./source";
import { TRAVERSE_CODES } from "./binary";
import { fromImport as graphFromImport, graphScene, algoStateTables } from "../graph/source";

type SubMode = "general" | "traverse" | "bst" | "avl" | "heap" | "rb" | "btree" | "bplus";
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "基础", opts: [{ v: "general", zh: "通用树", en: "General" }, { v: "traverse", zh: "二叉遍历", en: "Traverse" }] },
  { label: "BST/平衡", opts: [{ v: "bst", zh: "BST", en: "BST" }, { v: "avl", zh: "AVL", en: "AVL" }, { v: "rb", zh: "红黑", en: "RB" }] },
  { label: "堆/B树", opts: [{ v: "heap", zh: "堆", en: "Heap" }, { v: "btree", zh: "B 树", en: "B-Tree" }, { v: "bplus", zh: "B+ 树", en: "B+ Tree" }] },
];

type Cfg = {
  subMode: SubMode;
  treeImp: ImportedGraph | null;
  traverseMode: "pre" | "in" | "post" | "level";
  bstMode: "build" | "search" | "insert" | "delete";
  target: number;
  x: number;
  heapMode: "build" | "insert" | "pop";
  heapVal: number;
  btreeOrder: number;
  btreeVal: number;
};

const DEFAULT: Cfg = {
  subMode: "bst",
  treeImp: { n: 7, spec: "0-1,0-2,1-3,1-4,2-5,2-6", labels: ["4","2","6","1","3","5","7"], directed: false, root: 0, layout: "tree" },
  traverseMode: "pre",
  bstMode: "build",
  target: 3,
  x: 8,
  heapMode: "build",
  heapVal: 10,
  btreeOrder: 3,
  btreeVal: 5,
};

const CODE_MAP: Record<SubMode, any> = {
  general: BFS_CODE,
  traverse: LEVEL_CODE,
  bst: BST_INSERT_CODE,
  avl: AVL_CODE,
  heap: HEAP_BUILD_CODE as any,
  rb: BST_INSERT_CODE as any,
  btree: HEAP_BUILD_CODE as any,
  bplus: HEAP_BUILD_CODE as any,
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const imp = cfg.treeImp;
  let g: GraphCls | null = null;
  if (imp) {
    const gg = new GraphCls(imp.n, { directed: false, labels: imp.labels });
    const r = gg.fromSpec(imp.spec);
    if (!r.ok) return [{ line: 0, caption: T(r.error ?? "图解析失败", r.error ?? "parse fail"), scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [], error: r.error } as any }];
    g = gg;
  } else {
    g = GraphCls.randomTree(7, { labels: ["4","2","6","1","3","5","7"] });
  }
  if (!g || g.n === 0) return [{ line: 0, caption: T("空树", "empty"), scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] } as any }];
  const toFrame = (s: any, scene: GraphCanvasScene): Frame<GraphCanvasScene> => ({ line: s.line, caption: s.msg, scene: { ...(scene as any), activeLine: s.line } as any });

  switch (cfg.subMode) {
    case "general": {
      const scene = graphScene(g, {}, { root: 0, layout: "tree" });
      (scene as any).stateTables = [{ title: "数值", header: g.labels, rows: [{ name: "deg", cells: g.degree().map(String) }] }];
      return [{ line: 0, caption: T("通用树 · 可直接编辑", "General tree"), scene } as any];
    }
    case "traverse": {
      const steps = treeTraverseSteps(g, cfg.traverseMode as any, 0, g.labels);
      return steps.map((s: any) => {
        const base = graphScene(g, { current: s.current, exploring: s.exploring, visited: s.visited, frontier: s.frontier, order: s.order, edge: s.edge }, { root: 0, layout: "tree" });
        (base as any).stateTables = [{ title: "数值", header: g.labels, rows: [{ name: "order", cells: g.labels.map((_: string, i: number) => { const p = s.order.indexOf(i); return p >=0 ? String(p+1) : "-"; }) }] }];
        return toFrame(s, base);
      });
    }
    case "bst": {
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      if (cfg.bstMode === "build") {
        const steps = bstInsertSteps(vals);
        return steps.map((s: any) => {
          const base = graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" });
          (base as any).stateTables = [{ title: "数值", header: g.labels, rows: [{ name: "inorder", cells: vals.map(String) }] }];
          return toFrame(s, base);
        });
      }
      if (cfg.bstMode === "search") {
        const steps = bstSearchOnTree(g.labels.map((v,i)=>({ id:i, val: Number(v), left: null, right: null })) as any, 0, cfg.target);
        return steps.map((s: any) => toFrame(s, graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" })));
      }
      if (cfg.bstMode === "insert") {
        const { steps } = bstInsertOne(g.labels.map((v,i)=>({ id:i, val: Number(v), left: null, right: null })) as any, 0, cfg.x);
        return steps.map((s: any) => toFrame(s, graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" })));
      }
      const out = bstDeleteOnTree(g.labels.map((v,i)=>({ id:i, val: Number(v), left: null, right: null })) as any, 0, cfg.target);
      return out.steps.map((s: any) => toFrame(s, graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" })));
    }
    case "avl": {
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const steps = avlInsertSteps(vals);
      return steps.map((s: any) => {
        const base = graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" });
        const bf = binBf(s.nodes);
        (base as any).stateTables = [{ title: "数值", header: s.nodes.map((n: any) => String(n.val)), rows: [{ name: "bf", cells: bf.map(String) }] }];
        return toFrame(s, base);
      });
    }
    case "heap": {
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const steps = cfg.heapMode === "pop" ? heapDeleteTopSteps(vals) : cfg.heapMode === "insert" ? heapInsertSteps2(vals, cfg.heapVal) : heapBuildSteps(vals);
      return steps.map((s: any) => toFrame(s, graphScene(g, { current: (s as any).focus ?? (s as any).current ?? null, edge: (s as any).edge ?? null }, { root: 0, layout: "tree" })));
    }
    case "rb": {
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      // 暂用 BST 插入演示（红黑逻辑复用 BST 形态，颜色高亮后续补）
      const steps = bstInsertSteps(vals);
      return steps.map((s: any) => toFrame(s, graphScene(g, { current: s.focus, edge: s.edge }, { root: s.root, layout: "tree" })));
    }
    case "btree":
    case "bplus": {
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      // 暂用堆构建占位（B/B+ 后续接入 btreeInsertSteps）
      const steps = heapBuildSteps(vals);
      return steps.map((s: any) => toFrame(s, graphScene(g, { current: (s as any).focus ?? null, edge: (s as any).edge ?? null }, { root: 0, layout: "tree" })));
    }
  }
  return [{ line: 0, caption: T("未实现", "todo"), scene: graphScene(g, {}, { root: 0, layout: "tree" }) }];
}

export const treeUnifiedModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "tree",
  title: T("树", "Tree"),
  desc: T("通用 / 遍历 / BST / AVL / 堆 / 红黑 / B / B+", "General / Traverse / BST / AVL / Heap / RB / B-Tree"),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const set = (p: Partial<Cfg>) => onChange({ ...config, ...p });
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>树</span>
          <select className="txt" value={config.subMode} onChange={(e) => set({ subMode: e.target.value as SubMode })} style={{ minWidth: 180, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          {(config.subMode === "traverse") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><select className="txt" value={config.traverseMode} onChange={(e) => set({ traverseMode: e.target.value as any })}><option value="pre">前序</option><option value="in">中序</option><option value="post">后序</option><option value="level">层序</option></select></>}
          {(config.subMode === "bst" || config.subMode === "avl" || config.subMode === "rb") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><select className="txt" value={config.bstMode} onChange={(e) => set({ bstMode: e.target.value as any })}><option value="build">建树</option><option value="search">查找</option><option value="insert">插入</option><option value="delete">删除</option></select><input className="txt" type="number" placeholder={isZh ? "键" : "key"} style={{ width: 70 }} value={Number.isNaN(config.target) ? "" : config.target} onChange={(e) => set({ target: e.target.value===""?NaN:Number(e.target.value) })} /><input className="txt" type="number" placeholder={isZh ? "插值" : "x"} style={{ width: 70 }} value={Number.isNaN(config.x) ? "" : config.x} onChange={(e) => set({ x: e.target.value===""?NaN:Number(e.target.value) })} /></>}
          {config.subMode === "heap" && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><select className="txt" value={config.heapMode} onChange={(e) => set({ heapMode: e.target.value as any })}><option value="build">建堆</option><option value="insert">插入</option><option value="pop">弹出</option></select><input className="txt" type="number" style={{ width: 70 }} value={config.heapVal} onChange={(e) => set({ heapVal: Number(e.target.value) })} /></>}
          {(config.subMode === "btree" || config.subMode === "bplus") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><label className="txt-label">阶<input className="txt" type="number" style={{ width: 60 }} value={config.btreeOrder} onChange={(e) => set({ btreeOrder: Math.max(3, Number(e.target.value)) })} /></label><input className="txt" type="number" style={{ width: 70 }} value={config.btreeVal} onChange={(e) => set({ btreeVal: Number(e.target.value) })} /></>}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    const c = cfg as Cfg;
    // bst/heap 按操作态切分码表；traverse 按遍历序切分（行号语义见 treeTraverseSteps 注释）
    // 暂位动画：红黑/B 树沿用 BST/堆步骤，码表与帧一致
    if (c.subMode === "traverse") {
      return ((TRAVERSE_CODES as any)[c.traverseMode] ?? LEVEL_CODE) as never;
    }
    if (c.subMode === "bst") {
      if (c.bstMode === "search") return BST_SEARCH_CODE as never;
      if (c.bstMode === "delete") return BST_DELETE_CODE as never;
      return BST_INSERT_CODE as never;
    }
    if (c.subMode === "heap") {
      if (c.heapMode === "insert") return HEAP_INSERT_CODE as never;
      if (c.heapMode === "pop") return HEAP_DELETE_CODE as never;
      return HEAP_BUILD_CODE as never;
    }
    return ((CODE_MAP as any)[c.subMode] ?? []) as never;
  },
  generate(config) { return buildFrames(config as Cfg); },
  Render({ scene, t, config, onChange }) {
    const isZh = t(T("中文", "en")) !== "en";
    const cfg = config as Cfg;
    const gForMem = (() => {
      try {
        if (cfg.treeImp) { const gg = new Graph(cfg.treeImp.n, { directed: false, labels: cfg.treeImp.labels }); gg.fromSpec(cfg.treeImp.spec); return gg; }
      } catch {}
      return new Graph(7, { labels: ["4","2","6","1","3","5","7"] });
    })();
    const currentImp = cfg.treeImp;
    const highlight = { current: (scene as any).current ?? null, visited: (scene as any).visited ?? [], frontier: (scene as any).frontier ?? [], edge: (scene as any).edge ?? null, tone: (scene as any).tone };
    const [memOpen, setMemOpen] = useState(false);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
        <div style={{ flex: memOpen ? "0 0 50%" : "1", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`tree-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp ?? { n: 7, spec: "0-1,0-2,1-3,1-4,2-5,2-6", labels: ["4","2","6","1","3","5","7"], directed: false, root: 0, layout: "tree" }}
            constraints={{ mustBeTree: true, hint: isZh ? "树需 n-1 边且无环" : "needs tree" }}
            highlight={highlight}
            embedded
            onConfirm={(g) => onChange?.({ ...cfg, treeImp: g } as unknown as Cfg)}
            title={isZh ? "树编辑器 · 直接编辑" : "Tree Editor"}
          />
        </div>
        <div onClick={() => setMemOpen(!memOpen)} style={{ height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, cursor: "pointer", marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4338ca" }}>{memOpen ? (isZh ? "收起内存表示 ▾" : "Hide Memory ▾") : (isZh ? "展开内存表示 ▸" : "Show Memory ▸")}</span>
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6 }}>{memOpen ? (isZh ? "占画布 50%" : "50%") : (isZh ? "默认折叠" : "collapsed")}</span>
        </div>
        {memOpen && (
          <div style={{ height: "50%", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", marginTop: 6 }}>
            <LeftMemoryPanel g={gForMem} isZh={isZh} />
          </div>
        )}
      </div>
    );
  },
  Side({ scene, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const tables = (scene as any).stateTables as any;
    if (!tables || tables.length === 0) return <div style={{ fontSize: 12, color: "#64748b", padding: 12 }}>{isZh ? "当前帧无额外内存" : "No extra memory"}</div>;
    return <StateBar tables={tables} headerAction={<button className="pill" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => location.href = "#/memory"}>{isZh ? "查看内存 ↗" : "Memory ↗"}</button>} />;
  },
};

function LeftMemoryPanel({ g, isZh }: { g: Graph | null; isZh: boolean }) {
  const [repr, setRepr] = useState<"adjlist" | "adjmat" | "array" | "edges">("adjlist");
  if (!g) return <div style={{ border: "1px solid #c7d2fe", borderRadius: 12, padding: 12, fontSize: 12, color: "#64748b" }}>{isZh ? "空树" : "empty"}</div>;
  const base = 0x555555559800;
  const addr = (i: number) => `0x${(base + i * 0x10).toString(16)}`;
  const cell = (v: string, color = "#6366f1", note = "", addrS?: string) => (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1, margin: 2 }}>
      <div style={{ minWidth: 46, textAlign: "center", padding: "4px 6px", borderRadius: 8, background: "#fff", border: `1.5px solid ${color}`, fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{v}</div>
      {addrS && <div style={{ fontFamily: "monospace", fontSize: 8, color: "#94a3b8" }}>{addrS}</div>}
      {note && <div style={{ fontSize: 9, color: "#64748b" }}>{note}</div>}
    </div>
  );
  let content: React.ReactNode;
  if (repr === "adjmat") {
    const mat = g.mat();
    content = <div style={{ overflow: "auto", padding: 4 }}><table style={{ borderCollapse: "separate", borderSpacing: "1px 2px", tableLayout: "fixed" }}><thead><tr><th style={{ width: 26 }} />{g.labels.map((l, i) => <th key={i} style={{ width: 36, fontSize: 10, color: "#64748b" }}>{l}</th>)}</tr></thead><tbody>{mat.map((row, r) => <tr key={r}><td style={{ fontSize: 10, color: "#64748b", textAlign: "center" }}>{g.labels[r]}</td>{row.map((w, c) => <td key={c} style={{ height: 28, textAlign: "center", fontSize: 11, fontFamily: "monospace", background: w === null ? "#f8fafc" : "#4f46e5", color: w === null ? "#cbd5e1" : "#fff", borderRadius: 6 }}>{w === null ? "·" : w}</td>)}</tr>)}</tbody></table><div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}><MathText text={"邻接矩阵 · $M[i][j]=w$"} /></div></div>;
  } else if (repr === "edges") {
    content = (
      <div style={{ overflow: "auto", padding: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "#eef2ff", color: "#4338ca" }}><th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #c7d2fe" }}>#</th><th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #c7d2fe" }}>{isZh ? "起点" : "from"}</th><th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #c7d2fe" }}>{isZh ? "终点" : "to"}</th><th style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #c7d2fe" }}>{isZh ? "权重" : "w"}</th><th style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #c7d2fe", fontFamily: "monospace", fontSize: 10, color: "#64748b" }}>{isZh ? "地址" : "addr"}</th></tr></thead>
          <tbody>
            {g.edges.map((e, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", color: "#64748b", fontWeight: 700 }}>{i}</td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>{cell(g.labels[e.u], "#6366f1", "", addr(i*2))}</td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>{cell(g.labels[e.v], "#0ea5e9", "", addr(i*2+1))}</td>
                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: e.weight !== undefined && e.weight !== 1 ? "#f59e0b" : "#94a3b8" }}>{e.weight ?? 1}</td>
                <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 10, color: "#94a3b8" }}>{addr(i*2)}<br/>{addr(i*2+1)}</td>
              </tr>
            ))}
            {g.edges.length===0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: "center", color: "#94a3b8" }}>{isZh ? "无边" : "no edges"}</td></tr>}
          </tbody>
        </table>
      </div>
    );
  } else if (repr === "array") {
    const parent = g.bfs(0).parent;
    content = <div style={{ display: "flex", flexWrap: "wrap", padding: 4 }}>{g.labels.map((l, i) => <div key={i} style={{ margin: 2 }}>{cell(i === 0 ? "−1" : String(parent[i] === -1 ? "−1" : g.labels[parent[i]] ?? String(parent[i])), i === 0 ? "#dc2626" : "#10b981", l, addr(i))}</div>)}<div style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{isZh ? "父节点[i] · 根=−1" : "parent[i] · root=−1"}</div></div>;
  } else {
    const adj = g.adj();
    content = (
      <div style={{ display: "grid", gap: 8, padding: 4 }}>
        {adj.map((neighbors, u) => (
          <div key={u} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>head[{g.labels[u]}]</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", border: "1.5px solid #4338ca", borderRadius: 8, background: "#fff", padding: "4px 8px", minWidth: 46 }}>
                <span style={{ fontSize: 12, fontWeight: 800 }}>{g.labels[u]}</span>
                <span style={{ fontSize: 8, color: "#94a3b8", fontFamily: "monospace" }}>{addr(u)}</span>
              </div>
            </div>
            <span style={{ color: "#6366f1", fontSize: 18, fontWeight: 800 }}>→</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
              {neighbors.length === 0 ? (
                <span style={{ color: "#94a3b8", fontSize: 12, padding: "6px 10px", border: "1px dashed #cbd5e1", borderRadius: 8, background: "#fff" }}>∅ null</span>
              ) : neighbors.map(([v, w], j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "stretch", border: "1.5px solid #0ea5e9", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
                    <div style={{ padding: "4px 8px", fontSize: 12, fontWeight: 700, borderRight: "1px solid #e0f2fe", background: "#f0f9ff" }}>{g.labels[v]}{w !== 1 ? `(${w})` : ""}</div>
                    <div style={{ padding: "4px 8px", fontSize: 9, color: "#64748b", fontFamily: "monospace", background: "#f8fafc", display: "flex", alignItems: "center" }}>next<br/>{j + 1 < neighbors.length ? addr(u*10+j+2) : "null"}</div>
                  </div>
                  {j + 1 < neighbors.length && <span style={{ color: "#6366f1", fontWeight: 800 }}>→</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#4338ca", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid #c7d2fe" }}>
        <span>{isZh ? "内存表示" : "Memory"}</span>
        {(["adjlist", "adjmat", "array", "edges"] as const).map((v) => <button key={v} className={`pill ${repr === v ? "active" : ""}`} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setRepr(v)}>{v === "adjlist" ? (isZh ? "邻接表" : "List") : v === "adjmat" ? (isZh ? "矩阵" : "Matrix") : v === "array" ? (isZh ? "父节点" : "parent") : (isZh ? "边集" : "Edges")}</button>)}
        <button className="pill" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => { if (g) location.href = buildMemoryUrl(buildGraphDump(g, repr, { root: 0 }) as any); }}>{isZh ? "查看内存 ↗" : "Memory ↗"}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8, background: "#fff" }}>{content}</div>
    </div>
  );
}

function clampV(v: number, n: number) { return Math.min(Math.max(0, v), Math.max(0, n - 1)); }
