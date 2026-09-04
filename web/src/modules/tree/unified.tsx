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
  inorderOf,
  lcaBinaryLiftingSteps, LCA_CODE, type LCAStep,
} from "../../lib/graph";
import {
  rbInsertSteps, rbInsertOne, rbDeleteOnTree, rbSearchOnTree,
  RB_INSERT_CODE, RB_DELETE_CODE,
  bhAnn,
} from "../../lib/rbtree";
import {
  bTreeInsertSteps, bTreeDeleteOnTree,
  bPlusInsertSteps, bPlusLeaves,
  bTreeLayout,
  BTREE_INSERT_CODE, BTREE_DELETE_CODE, BTREE_SEARCH_CODE,
} from "../../lib/btree";
import { resolveTree, type TreeCfg } from "./source";
import { TRAVERSE_CODES } from "./binary";
import { fromImport as graphFromImport, graphScene, algoStateTables } from "../graph/source";

type SubMode = "general" | "traverse" | "lca" | "bst" | "avl" | "heap" | "rb" | "btree" | "bplus";
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "基础", opts: [{ v: "general", zh: "通用树", en: "General" }, { v: "traverse", zh: "二叉遍历", en: "Traverse" }] },
  { label: "查询", opts: [{ v: "lca", zh: "LCA 倍增", en: "LCA" }] },
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
  lcaU: number;
  lcaV: number;
  pick?: "u" | "v";
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
  lcaU: 3,
  lcaV: 5,
  pick: "u",
};

const CODE_MAP: Record<SubMode, any> = {
  general: BFS_CODE,
  traverse: LEVEL_CODE,
  lca: LCA_CODE,
  bst: BST_INSERT_CODE,
  avl: AVL_CODE,
  heap: HEAP_BUILD_CODE as any,
  rb: RB_INSERT_CODE as any,
  btree: BTREE_INSERT_CODE as any,
  bplus: BTREE_INSERT_CODE as any,
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
    case "lca": {
      if (!g.isTree()) return [{ line: 0, caption: T("LCA 需树：当前不是树", "LCA needs tree"), scene: graphScene(g, {}, { root: 0, layout: "tree" }) as GraphCanvasScene }];
      const n = g.n;
      const clamp = (x: number) => Math.min(Math.max(0, x), n - 1);
      const root = clamp(imp?.root ?? 0);
      const u = clamp(cfg.lcaU), v = clamp(cfg.lcaV);
      const steps: LCAStep[] = lcaBinaryLiftingSteps(g, root, u, v, g.labels);
      return steps.map((s) => {
        const annotate: Record<number, string> = {};
        s.depth.forEach((d, i) => { annotate[i] = `d=${d}`; });
        const base = graphScene(g, { current: s.current, exploring: s.exploring, visited: s.lca !== null ? [s.lca] : [], frontier: [], order: [], edge: s.edge }, { root, annotate, layout: "tree" });
        (base as any).stateTables = [{ title: "数值", header: g.labels, rows: [
          { name: "depth", cells: s.depth.map((x: any) => String(x)) },
          { name: "up0", cells: s.up.map((row: any) => row[0] < 0 ? "-" : g.labels[row[0]]) },
          { name: "up1", cells: s.up.map((row: any) => row[1] < 0 ? "-" : g.labels[row[1]] ?? "-") },
        ] }];
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
      const nums = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const vals = nums.length ? nums : g.labels.map((_, i) => i + 1);
      const toGraph = (nodes: any[], root: number) => {
        const gg = binToGraph(nodes);
        const scene = graphScene(gg, {}, { root, layout: "tree" });
        // 红黑 tone：红=0 黑=4
        const tone: Record<number, number> = {};
        nodes.forEach((n: any, i: number) => { tone[i] = n.red ? 0 : 4; });
        (scene as any).tone = tone;
        return scene;
      };
      if (cfg.bstMode === "search") {
        const nodes = ((): any[] => { const r = rbInsertSteps(vals); return r[r.length - 1]?.nodes ?? []; })();
        const root = nodes.length ? 0 : 0;
        const steps = rbSearchOnTree(nodes as any, root, Number.isFinite(cfg.target) ? cfg.target : vals[0] ?? 0);
        return steps.map((s: any) => toFrame(s, (() => {
          const sc = toGraph(s.nodes, s.root);
          (sc as any).tone = (() => { const t: Record<number, number> = {}; s.nodes.forEach((n: any, i: number) => t[i] = n.red ? 0 : 4); return t; })();
          // bh 标注
          const ann = bhAnn(s.nodes as any);
          return { ...sc, current: s.focus, edge: s.edge, annotate: ann } as any;
        })()));
      }
      if (cfg.bstMode === "insert") {
        const baseNodes = (() => { const r = rbInsertSteps(vals); return r[r.length - 1]?.nodes ?? []; })();
        const baseRoot = 0;
        const x = Number.isFinite(cfg.x) ? cfg.x : Math.max(...vals, 0) + 1;
        const { steps } = rbInsertOne(baseNodes as any, baseRoot, x);
        return steps.map((s: any) => toFrame(s, (() => {
          const sc = toGraph(s.nodes, s.root);
          const ann = bhAnn(s.nodes as any);
          return { ...sc, current: s.focus, edge: s.edge, annotate: ann } as any;
        })()));
      }
      if (cfg.bstMode === "delete") {
        const baseNodes = (() => { const r = rbInsertSteps(vals); return r[r.length - 1]?.nodes ?? []; })();
        const baseRoot = 0;
        const t = Number.isFinite(cfg.target) ? cfg.target : vals[0] ?? 0;
        const out = rbDeleteOnTree(baseNodes as any, baseRoot, t);
        return out.steps.map((s: any) => toFrame(s, (() => {
          const sc = toGraph(s.nodes, s.root);
          const ann = bhAnn(s.nodes as any);
          return { ...sc, current: s.focus, edge: s.edge, annotate: ann } as any;
        })()));
      }
      // build
      const steps = rbInsertSteps(vals);
      return steps.map((s: any) => toFrame(s, (() => {
        const sc = toGraph(s.nodes, s.root);
        const ann = bhAnn(s.nodes as any);
        return { ...sc, current: s.focus, edge: s.edge, annotate: ann } as any;
      })()));
    }
    case "btree": {
      const m = Math.max(3, Math.min(5, cfg.btreeOrder | 0));
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const nums = vals.length ? vals : [10, 20, 30];
      if (cfg.bstMode === "search") {
        // 搜索：沿键下探，命中/未命中
        const steps = bTreeInsertSteps(nums.slice(0, Math.min(3, nums.length)), m); // 先建小树用于搜索演示
        const last = steps[steps.length - 1];
        const nodes = last?.nodes ?? [];
        const root = last?.root ?? 0;
        // 简易搜索帧：定位
        const target = Number.isFinite(cfg.target) ? cfg.target : nums[0] ?? 10;
        const searchSteps: any[] = [];
        const S = (id: number | null) => id === null ? "∅" : `[${nodes[id]?.keys.join(",") ?? ""}]`;
        searchSteps.push({ line: 0, msg: { zh: `搜索 $x=${target}$`, en: `search ${target}` }, nodes, root, focus: root } as any);
        return searchSteps.map((s: any) => toFrame(s, (() => {
          const { x, y } = (() => {
            const pos = bTreeLayout(nodes as any, root, { x0: 24, y0: 20, w: 712, h: 404 });
            return pos[root] ?? { x: 0, y: 0 };
          })();
          void x; void y;
          return {
            current: s.focus, exploring: null, visited: [], frontier: [], order: [], edge: null,
            nodes: nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: 0, y: 0 })),
            edges: nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
            root,
          } as any;
        })()));
      }
      if (cfg.bstMode === "delete") {
        const built = bTreeInsertSteps(nums, m);
        const last = built[built.length - 1];
        const nodes0 = last?.nodes ?? [];
        const root0 = last?.root ?? 0;
        const x = Number.isFinite(cfg.target) ? cfg.target : nums[0] ?? 10;
        const out = bTreeDeleteOnTree(nodes0 as any, root0, m, x);
        return out.steps.map((s: any) => {
          const pos = bTreeLayout(s.nodes as any, s.root, { x0: 24, y0: 20, w: 712, h: 404 });
          return toFrame(s as any, {
            current: s.focus, exploring: null, visited: [], frontier: [], order: [], edge: s.edge,
            nodes: s.nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: pos[n.id]?.x ?? 0, y: pos[n.id]?.y ?? 0 })),
            edges: s.nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
            root: s.root,
          } as any);
        });
      }
      const steps = bTreeInsertSteps(nums, m);
      return steps.map((s: any) => {
        const pos = bTreeLayout(s.nodes as any, s.root, { x0: 24, y0: 20, w: 712, h: 404 });
        return toFrame(s as any, {
          current: s.focus, exploring: null, visited: [], frontier: [], order: [], edge: s.edge,
          nodes: s.nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: pos[n.id]?.x ?? 0, y: pos[n.id]?.y ?? 0 })),
          edges: s.nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
          root: s.root,
        } as any);
      });
    }
    case "bplus": {
      const m = Math.max(3, Math.min(5, cfg.btreeOrder | 0));
      const vals = g.labels.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const nums = vals.length ? vals : [10, 20, 30];
      if (cfg.bstMode === "search" || (cfg as any).mode === "search") {
        const built = bPlusInsertSteps(nums.slice(0, Math.min(4, nums.length)), m);
        const last = built[built.length - 1];
        const nodes = last?.nodes ?? [];
        const root = last?.root ?? 0;
        const target = Number.isFinite(cfg.target) ? cfg.target : nums[0] ?? 10;
        // 简易搜索：复用查找到叶子
        const steps: any[] = [{ line: 0, msg: { zh: `搜索 $x=${target}$`, en: `search ${target}` }, nodes, root, focus: root }];
        return steps.map((s: any) => {
          const pos = bTreeLayout(s.nodes as any, s.root, { x0: 24, y0: 20, w: 712, h: 404 });
          const leaves = bPlusLeaves(s.nodes as any);
          const tone: Record<number, number> = {};
          leaves.forEach((id) => tone[id] = 1);
          return toFrame(s as any, {
            current: s.focus, exploring: null, visited: [], frontier: [], order: [], edge: s.edge,
            nodes: s.nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: pos[n.id]?.x ?? 0, y: pos[n.id]?.y ?? 0 })),
            edges: [
              ...s.nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
              ...leaves.slice(0, -1).map((a, i) => ({ u: a, v: leaves[i + 1], dashed: true })),
            ],
            root: s.root, tone,
          } as any);
        });
      }
      if ((cfg as any).mode === "range" || cfg.bstMode === "delete") {
        const built = bPlusInsertSteps(nums, m);
        const last = built[built.length - 1];
        const nodes = last?.nodes ?? [];
        const root = last?.root ?? 0;
        const lo = Number.isFinite((cfg as any).btreeVal) ? (cfg as any).btreeVal : nums[0] ?? 10;
        const hi = lo + 20;
        const leaves = bPlusLeaves(nodes as any);
        const inRange = leaves.filter((id) => {
          const ks = (nodes as any).find((n: any) => n.id === id)?.keys ?? [];
          return ks.some((k: number) => k >= lo && k <= hi);
        });
        const steps: any[] = [
          { line: 0, msg: { zh: `范围 $[${lo},${hi}]$`, en: `range [${lo},${hi}]` }, nodes, root, focus: inRange[0] ?? root },
          { line: 1, msg: { zh: `命中叶 ${inRange.length} 个`, en: `${inRange.length} leaves hit` }, nodes, root, focus: inRange[0] ?? null },
        ];
        return steps.map((s: any) => {
          const pos = bTreeLayout(s.nodes as any, s.root, { x0: 24, y0: 20, w: 712, h: 404 });
          const tone: Record<number, number> = {};
          inRange.forEach((id) => tone[id] = 1);
          return toFrame(s as any, {
            current: s.focus, exploring: null, visited: [], frontier: inRange, order: [], edge: null,
            nodes: s.nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: pos[n.id]?.x ?? 0, y: pos[n.id]?.y ?? 0 })),
            edges: [
              ...s.nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
              ...leaves.slice(0, -1).map((a, i) => ({ u: a, v: leaves[i + 1], dashed: true })),
            ],
            root: s.root, tone,
          } as any);
        });
      }
      const steps = bPlusInsertSteps(nums, m);
      return steps.map((s: any) => {
        const pos = bTreeLayout(s.nodes as any, s.root, { x0: 24, y0: 20, w: 712, h: 404 });
        const leaves = bPlusLeaves(s.nodes as any);
        const tone: Record<number, number> = {};
        leaves.forEach((id) => tone[id] = 1);
        return toFrame(s as any, {
          current: s.focus, exploring: null, visited: [], frontier: [], order: [], edge: s.edge,
          nodes: s.nodes.map((n: any) => ({ id: n.id, label: "", keys: n.keys, x: pos[n.id]?.x ?? 0, y: pos[n.id]?.y ?? 0 })),
          edges: [
            ...s.nodes.flatMap((n: any) => n.children.map((c: number) => ({ u: n.id, v: c }))),
            ...leaves.slice(0, -1).map((a, i) => ({ u: a, v: leaves[i + 1], dashed: true })),
          ],
          root: s.root, tone,
        } as any);
      });
    }
  }
  return [{ line: 0, caption: T("未实现", "todo"), scene: graphScene(g, {}, { root: 0, layout: "tree" }) }];
}

export const treeUnifiedModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "tree",
  title: T("树", "Tree"),
  desc: T("通用 / 遍历 / LCA / BST / AVL / 堆 / 红黑 / B / B+", "General / Traverse / LCA / BST / AVL / Heap / RB / B-Tree"),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const set = (p: Partial<Cfg>) => onChange({ ...config, ...p });
    const lab = (i: number) => {
      const ls = config.treeImp?.labels;
      if (ls && ls[i] !== undefined) return ls[i];
      return String.fromCharCode(65 + ((i % 26 + 26) % 26));
    };
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
          {(config.subMode === "lca") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "选点" : "PICK"}</span><button className={`pill ${(config.pick ?? "u") === "u" ? "active" : ""}`} style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => set({ pick: "u" })}>u: <b>{lab(config.lcaU)}</b></button><button className={`pill ${(config.pick ?? "u") === "v" ? "active" : ""}`} style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => set({ pick: "v" })}>v: <b>{lab(config.lcaV)}</b></button><span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "右键·选择此点" : "right-click"}</span></>}
          {(config.subMode === "bst" || config.subMode === "avl" || config.subMode === "rb") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><select className="txt" value={config.bstMode} onChange={(e) => set({ bstMode: e.target.value as any })}><option value="build">建树</option><option value="search">查找</option><option value="insert">插入</option><option value="delete">删除</option></select><input className="txt" type="number" placeholder={isZh ? "键" : "key"} style={{ width: 70 }} value={Number.isNaN(config.target) ? "" : config.target} onChange={(e) => set({ target: e.target.value===""?NaN:Number(e.target.value) })} /><input className="txt" type="number" placeholder={isZh ? "插值" : "x"} style={{ width: 70 }} value={Number.isNaN(config.x) ? "" : config.x} onChange={(e) => set({ x: e.target.value===""?NaN:Number(e.target.value) })} /></>}
          {config.subMode === "heap" && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><select className="txt" value={config.heapMode} onChange={(e) => set({ heapMode: e.target.value as any })}><option value="build">建堆</option><option value="insert">插入</option><option value="pop">弹出</option></select><input className="txt" type="number" style={{ width: 70 }} value={config.heapVal} onChange={(e) => set({ heapVal: Number(e.target.value) })} /></>}
          {(config.subMode === "btree" || config.subMode === "bplus") && <><span style={{ width: 1, height: 18, background: "#c7d2fe" }} /><label className="txt-label">阶<input className="txt" type="number" style={{ width: 60 }} value={config.btreeOrder} onChange={(e) => set({ btreeOrder: Math.max(3, Number(e.target.value)) })} /></label><input className="txt" type="number" style={{ width: 70 }} value={config.btreeVal} onChange={(e) => set({ btreeVal: Number(e.target.value) })} /></>}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    const c = cfg as Cfg;
    // bst/heap/rb/btree 按操作态切分码表；traverse 按遍历序切分（行号语义见 treeTraverseSteps 注释）
    if (c.subMode === "traverse") {
      return ((TRAVERSE_CODES as any)[c.traverseMode] ?? LEVEL_CODE) as never;
    }
    if (c.subMode === "bst") {
      if (c.bstMode === "search") return BST_SEARCH_CODE as never;
      if (c.bstMode === "delete") return BST_DELETE_CODE as never;
      return BST_INSERT_CODE as never;
    }
    if (c.subMode === "rb") {
      if (c.bstMode === "search") return BST_SEARCH_CODE as never;
      if (c.bstMode === "delete") return RB_DELETE_CODE as never;
      return RB_INSERT_CODE as never;
    }
    if (c.subMode === "heap") {
      if (c.heapMode === "insert") return HEAP_INSERT_CODE as never;
      if (c.heapMode === "pop") return HEAP_DELETE_CODE as never;
      return HEAP_BUILD_CODE as never;
    }
    if (c.subMode === "btree") {
      if (c.bstMode === "search") return BTREE_SEARCH_CODE as never;
      if (c.bstMode === "delete") return BTREE_DELETE_CODE as never;
      return BTREE_INSERT_CODE as never;
    }
    if (c.subMode === "bplus") {
      // bplus 有独立 range 模式（源码 mode 字段），但 unified 用 btreeVal/lo-hi；search 沿用 BTREE_SEARCH_CODE
      if ((c as any).mode === "range" || c.bstMode === "delete") return BTREE_SEARCH_CODE as never;
      return BTREE_INSERT_CODE as never;
    }
    return ((CODE_MAP as any)[c.subMode] ?? []) as never;
  },
  generate(config) { return buildFrames(config as Cfg); },
  blockedReason(cfg) {
    const c = cfg as Cfg;
    if (c.subMode !== "lca") return null;
    try {
      if (c.treeImp) {
        const gg = new Graph(c.treeImp.n, { directed: false, labels: c.treeImp.labels });
        gg.fromSpec(c.treeImp.spec);
        if (!gg.isTree()) return "LCA 要求无环连通图（树）。可点随机树或手动改成树";
      }
    } catch {}
    return null;
  },
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
    const pickTone: Record<number, number> = {};
    if (cfg.subMode === "lca") { pickTone[cfg.lcaU] = 0; pickTone[cfg.lcaV] = 1; }
    const sceneTone = (scene as any).tone as Record<number, number> | undefined;
    const highlight = { current: (scene as any).current ?? null, visited: (scene as any).visited ?? [], frontier: (scene as any).frontier ?? [], edge: (scene as any).edge ?? null, tone: { ...pickTone, ...(sceneTone ?? {}) } };
    const [memOpen, setMemOpen] = useState(false);
    const needTree = cfg.subMode === "lca" && !gForMem.isTree();
    const applyRandomTreeFix = () => {
      const n = Math.max(2, Math.min(20, gForMem?.n ?? 7));
      const labels = gForMem && gForMem.labels.length === n ? [...gForMem.labels] : undefined;
      const tree = labels ? Graph.randomTree(n, { labels }) : Graph.randomTree(n);
      const spec = tree.edges.map((e) => `${e.u}-${e.v}`).join(",");
      const imp: ImportedGraph = { n, spec, labels: [...tree.labels], directed: false, root: 0, layout: "tree" };
      onChange?.({ ...cfg, treeImp: imp, lcaU: Math.min(Math.max(0, cfg.lcaU), n - 1), lcaV: Math.min(Math.max(0, cfg.lcaV), n - 1) } as unknown as Cfg);
    };
    const onPickVertex = (id: number) => {
      if (cfg.subMode !== "lca") return;
      if ((cfg.pick ?? "u") === "v") onChange?.({ ...cfg, lcaV: id } as unknown as Cfg);
      else onChange?.({ ...cfg, lcaU: id } as unknown as Cfg);
    };
    const body = (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
        <div style={{ flex: memOpen ? "0 0 50%" : "1", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`tree-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp ?? { n: 7, spec: "0-1,0-2,1-3,1-4,2-5,2-6", labels: ["4","2","6","1","3","5","7"], directed: false, root: 0, layout: "tree" }}
            constraints={{ mustBeTree: true, hint: isZh ? "树需 n-1 边且无环" : "needs tree" }}
            highlight={highlight}
            embedded
            onPickVertex={onPickVertex}
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
    if (!needTree) return body;
    // LCA 门禁：输入恒为树时无感；手动改坏时虚化 + 一键随机树
    return (
      <div style={{ position: "relative" }}>
        <div style={{ filter: "blur(5px)", userSelect: "none" }}>{body}</div>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", padding: 16 }}>
          <div style={{ pointerEvents: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 18px", maxWidth: 360, boxShadow: "0 12px 32px rgba(15,23,42,.18)", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#b91c1c" }}>⚠ {isZh ? "LCA 要求无环连通图（树）" : "LCA needs a tree"}</div>
            <button className="pill active" style={{ marginTop: 10, padding: "6px 16px", fontSize: 13 }} onClick={applyRandomTreeFix}>
              {isZh ? "随机一棵树" : "Random tree"}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
              {isZh ? "可手动改树后重试，或切换到其它算法" : "Edit the tree or switch algorithm"}
            </div>
          </div>
        </div>
      </div>
    );
  },
  Side({ scene, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const tables = (scene as any).stateTables as any;
    if (!tables || tables.length === 0) return <div style={{ fontSize: 12, color: "#64748b", padding: 12 }}>{isZh ? "当前帧无额外内存" : "No extra memory"}</div>;
    return <StateBar tables={tables} />;
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
