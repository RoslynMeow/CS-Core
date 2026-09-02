import { useState } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import type { ImportedGraph } from "../tree/source";
import { GraphEditor } from "../../components/GraphEditor";
import { Graph } from "../../lib/graph";
import { buildGraphDump } from "../../lib/graph";
import { buildMemoryUrl } from "../../lib/memoryDump";
import { MathText } from "../../lib/tex";
import { StateBar } from "../../components/canvas/StateBar";
import {
  type GraphCfg,
  randGraph,
  randDag,
  randomCfg,
  fromImport,
  graphScene,
} from "./source";
import {
  bfsSteps, dfsSteps, BFS_CODE, DFS_CODE,
  topoSteps, TOPO_CODE,
  dijkstraSteps, DIJKSTRA_CODE,
  primSteps, kruskalSteps, PRIM_CODE, KRUSKAL_CODE,
  bellmanFordSteps, BELLMAN_CODE,
  aStarSteps, ASTAR_CODE,
  floydWarshallSteps, FLOYD_CODE,
  kosarajuSteps, tarjanSteps, KOSARAJU_CODE, TARJAN_CODE,
  dinicSteps, DINIC_CODE,
  lcaBinaryLiftingSteps, LCA_CODE,
  reconstructPathFromParent,
  type AStarStep, type FloydStep, type SCCStep, type MaxFlowStep, type LCAStep,
} from "../../lib/graph";

// ── 子模式：一个下拉覆盖全部图知识点 ──
type SubMode =
  | "bfs" | "dfs"
  | "dijkstra" | "bellman" | "floyd" | "astar"
  | "topo"
  | "prim" | "kruskal"
  | "kosaraju" | "tarjan"
  | "dinic"
  | "lca";

const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "遍历", opts: [{ v: "bfs", zh: "BFS 广度优先", en: "BFS" }, { v: "dfs", zh: "DFS 深度优先", en: "DFS" }] },
  { label: "最短路", opts: [
    { v: "dijkstra", zh: "Dijkstra (非负权)", en: "Dijkstra" },
    { v: "bellman", zh: "Bellman-Ford (负权)", en: "Bellman-Ford" },
    { v: "floyd", zh: "Floyd-Warshall (多源)", en: "Floyd-Warshall" },
    { v: "astar", zh: "A* 启发式", en: "A*" },
  ]},
  { label: "拓扑 / MST", opts: [
    { v: "topo", zh: "拓扑排序 Kahn", en: "Topo Kahn" },
    { v: "prim", zh: "Prim MST", en: "Prim" },
    { v: "kruskal", zh: "Kruskal MST", en: "Kruskal" },
  ]},
  { label: "连通 / 流 / 树", opts: [
    { v: "kosaraju", zh: "Kosaraju SCC", en: "Kosaraju" },
    { v: "tarjan", zh: "Tarjan SCC", en: "Tarjan" },
    { v: "dinic", zh: "Dinic 最大流", en: "Dinic" },
    { v: "lca", zh: "LCA 倍增", en: "LCA" },
  ]},
];

type Cfg = GraphCfg & {
  subMode: SubMode;
  target: number;
  sourceNode: number;
  sinkNode: number;
  lcaU: number;
  lcaV: number;
  heuristic: "zero" | "manhattan" | "euclidean";
  pick?: "root" | "target" | "source" | "sink" | "u" | "v";
};

const DEFAULT: Cfg = {
  source: "random", imp: null, confirmed: true,
  n: 8, p: 0.28, directed: false, weighted: true, connected: true, seed: 42, root: 0,
  subMode: "bfs",
  target: 5, sourceNode: 0, sinkNode: 7, lcaU: 3, lcaV: 6, heuristic: "zero", pick: "root",
};

function heuristicFn(heuristic: Cfg["heuristic"]): (u: number, v: number) => number {
  if (heuristic === "zero") return () => 0;
  return (u: number, v: number) => Math.abs(u - v);
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  // 本页即编辑：图直接来自 GraphEditor 的 imp，无随机/导入分支
  // 兼容旧配置：若仍为 random 则按随机生成，否则用 imp
  let g;
  let importGraph: ImportedGraph | null = null;
  let err: string | null = null;
  if (cfg.source === "graph" && cfg.imp) {
    const res = fromImport(cfg.imp);
    if (!res.ok) err = res.error ?? "图解析失败";
    else { g = res.g; importGraph = cfg.imp; }
  } else if (cfg.imp) {
    const res = fromImport(cfg.imp);
    if (!res.ok) err = res.error ?? "图解析失败";
    else { g = res.g; importGraph = cfg.imp; }
  } else {
    // 首次进入无 imp：用随机图占位，编辑器会覆盖
    g = cfg.subMode === "topo" ? randDag(cfg) : randGraph(cfg);
  }
  if (err) {
    return [{ line: 0, caption: T(err, err), scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [], error: err } as GraphCanvasScene }];
  }
  if (!g || g.n === 0) {
    return [{ line: 0, caption: T("空图：请在上方编辑器中创建", "empty: create above"), scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] } as GraphCanvasScene }];
  }

  const S = (i: number) => g.labels[i] ?? String(i);
  const n = g.n;
  const clamp = (x: number) => Math.min(Math.max(0, x), n - 1);
  const start = clamp(cfg.root);

  // 按子模式分发（把 line 写入 scene.activeLine 供模板右侧伪代码高亮）
  const toFrame = (s: { line: number; msg: { zh: string; en: string } }, scene: GraphCanvasScene): Frame<GraphCanvasScene> => ({ line: s.line, caption: { zh: s.msg.zh, en: s.msg.en }, scene: { ...scene, activeLine: s.line } as GraphCanvasScene & { activeLine: number } });

  switch (cfg.subMode) {
    case "bfs":
    case "dfs": {
      const isB = cfg.subMode === "bfs";
      const steps = isB ? bfsSteps(g, start, g.labels) : dfsSteps(g, start, g.labels);
      return steps.map((s) => toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: s.visited, frontier: s.frontier, order: s.order, edge: s.edge }, { root: start, ...(importGraph ? { import: importGraph } : {}) })));
    }
    case "topo": {
      if (!g.directed || g.hasDirectedCycle()) {
        const reason = !g.directed ? "拓扑排序需有向图" : "检测到有向环：仅 DAG 可拓扑";
        return [{ line: 0, caption: T(reason, !g.directed ? "needs directed" : "cycle detected"), scene: { ...graphScene(g, {}, { root: start, ...(importGraph ? { import: importGraph } : { layout: "force" }) }), error: reason } as GraphCanvasScene }];
      }
      const steps = topoSteps(g, g.labels);
      return steps.map((s) => toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: s.visited, frontier: s.frontier, order: s.order, edge: s.edge }, { root: start, ...(importGraph ? { import: importGraph } : { layout: "force" }) })));
    }
    case "dijkstra": {
      const steps = dijkstraSteps(g, start, g.labels);
      return steps.map((s) => {
        const ann: Record<number, string> = {};
        for (let i = 0; i < n; i++) ann[i] = Number.isFinite(s.dist[i]) ? String(s.dist[i]) : "∞";
        const visited = [...s.visited];
        const scene: GraphCanvasScene = { ...graphScene(g, { current: s.current, exploring: s.exploring, visited, frontier: [...s.frontier], order: [...s.order], edge: s.edge }, { root: start, annotate: ann, ...(importGraph ? { import: importGraph } : {}) }) } as GraphCanvasScene;
        return toFrame(s, scene);
      });
    }
    case "bellman": {
      const steps = bellmanFordSteps(g, start, g.labels);
      return steps.map((s) => {
        const ann: Record<number, string> = {};
        for (let i = 0; i < n; i++) ann[i] = Number.isFinite(s.dist[i]) ? String(s.dist[i]) : "∞";
        return toFrame(s, { ...graphScene(g, { current: s.current, exploring: s.exploring, visited: [...s.visited], frontier: [...s.frontier], order: [...s.order], edge: s.edge }, { root: start, annotate: ann, ...(importGraph ? { import: importGraph } : {}) }) } as GraphCanvasScene);
      });
    }
    case "floyd": {
      const steps: FloydStep[] = floydWarshallSteps(g, g.labels);
      return steps.map((s) => toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: [], frontier: [], order: [], edge: s.edge }, { root: s.k >= 0 && s.k < n ? s.k : start, annotate: s.k >= 0 && s.k < n ? Object.fromEntries(g.labels.map((_: string, i: number) => [i, s.dist[s.k][i] === Infinity ? "∞" : String(s.dist[s.k][i])])) : undefined, ...(importGraph ? { import: importGraph } : { layout: "force" }) })));
    }
    case "astar": {
      const target = clamp(cfg.target);
      if (start === target) return [{ line: 0, caption: T("起点与终点相同", "start==target"), scene: graphScene(g, { current: start, visited: [start], order: [start] }, { root: start, ...(importGraph ? { import: importGraph } : {}) }) }];
      const steps: AStarStep[] = aStarSteps(g, start, target, g.labels, heuristicFn(cfg.heuristic));
      return steps.map((s) => {
        const path = reconstructPathFromParent(s.parent, target);
        const annotate: Record<number, string> = {};
        for (const u of s.openSet) annotate[u] = `f=${Number.isFinite(s.fScore[u]) ? s.fScore[u] : "∞"}`;
        const picked: [number, number][] = path.length > 1 ? path.slice(0, -1).map((u, i) => [u, path[i + 1]] as [number, number]) : [];
        return toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: [...s.closedSet], frontier: [...s.openSet], order: path, edge: s.edge }, { root: start, annotate, picked, ...(importGraph ? { import: importGraph } : {}) }));
      });
    }
    case "prim": {
      const steps = primSteps(g, start, g.labels);
      return steps.map((s) => {
        const ann: Record<number, string> = {};
        for (let i = 0; i < n; i++) ann[i] = Number.isFinite(s.key[i]) ? `k:${s.key[i]}` : "∞";
        const picked: [number, number][] = [];
        for (let v = 0; v < n; v++) if (s.inTree[v] && s.parent[v] >= 0) picked.push([s.parent[v], v]);
        return toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: [...s.visited], frontier: [...s.frontier], order: [...s.order], edge: s.edge }, { root: start, annotate: ann, picked, ...(importGraph ? { import: importGraph } : {}) }));
      });
    }
    case "kruskal": {
      const steps = kruskalSteps(g, g.labels);
      return steps.map((s) => toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: [...s.visited], frontier: [...s.frontier], order: [...s.order], edge: s.edge }, { root: start, picked: s.picked as [number, number][], ...(importGraph ? { import: importGraph } : {}) })));
    }
    case "kosaraju":
    case "tarjan": {
      if (!g.directed) return [{ line: 0, caption: T("SCC 需有向图", "SCC needs directed"), scene: { ...graphScene(g, {}, { root: start, ...(importGraph ? { import: importGraph } : { layout: "force" }) }), error: "SCC 仅适用于有向图" } as GraphCanvasScene }];
      const steps: SCCStep[] = cfg.subMode === "kosaraju" ? kosarajuSteps(g, g.labels) : tarjanSteps(g, g.labels);
      return steps.map((s) => {
        const annotate: Record<number, string> = {};
        s.comp.forEach((c, i) => { if (c !== -1) annotate[i] = `SCC ${c}`; });
        const tone: Record<number, number> = s.comp.reduce((acc: Record<number, number>, c, i) => { if (c !== -1) acc[i] = c; return acc; }, {});
        return toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: s.visited, frontier: s.frontier, order: s.order, edge: s.edge }, { root: start, annotate, tone, ...(importGraph ? { import: importGraph } : { layout: "force" }) }));
      });
    }
    case "dinic": {
      if (!g.directed) return [{ line: 0, caption: T("最大流需有向图", "Max flow needs directed"), scene: { ...graphScene(g, {}, { root: clamp(cfg.sourceNode), ...(importGraph ? { import: importGraph } : { layout: "force" }) }), error: "Dinic 仅适用于有向图" } as GraphCanvasScene }];
      const s = clamp(cfg.sourceNode), t = clamp(cfg.sinkNode);
      if (s === t) return [{ line: 0, caption: T("源点≠汇点", "source != sink"), scene: graphScene(g, {}, { root: s }) }];
      const steps: MaxFlowStep[] = dinicSteps(g, s, t, g.labels);
      return steps.map((step) => {
        const annotate: Record<number, string> = {};
        if (step.phase !== "done") for (let i = 0; i < n; i++) if (step.level[i] >= 0) annotate[i] = `L${step.level[i]}`;
        const picked: [number, number][] = [];
        for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) if (step.flow[u][v] > 0) picked.push([u, v]);
        return toFrame(step, graphScene(g, { current: step.current, exploring: step.exploring, visited: step.visited, frontier: step.frontier, order: step.path, edge: step.edge }, { root: s, annotate, picked, ...(importGraph ? { import: importGraph } : { layout: "force" }) }));
      });
    }
    case "lca": {
      if (!g.isTree()) return [{ line: 0, caption: T("LCA 需树", "LCA needs tree"), scene: { ...graphScene(g, {}, { root: start, layout: "tree" }), error: "LCA 要求无环连通图（树）" } as GraphCanvasScene }];
      const u = clamp(cfg.lcaU), v = clamp(cfg.lcaV);
      const steps: LCAStep[] = lcaBinaryLiftingSteps(g, start, u, v, g.labels);
      return steps.map((s) => {
        const annotate: Record<number, string> = {};
        s.depth.forEach((d, i) => { annotate[i] = `d=${d}`; });
        return toFrame(s, graphScene(g, { current: s.current, exploring: s.exploring, visited: s.lca !== null ? [s.lca] : [], frontier: [], order: [], edge: s.edge }, { root: start, annotate, ...(importGraph ? { import: importGraph } : { layout: "tree" }) }));
      });
    }
  }
}

function constraintsFor(mode: SubMode, isZh: boolean): { mustBeDirected?: boolean; mustBeTree?: boolean; hint?: string } | undefined {
  if (mode === "tarjan" || mode === "kosaraju" || mode === "dinic" || mode === "topo") return { mustBeDirected: true, hint: isZh ? "该算法需有向图" : "needs directed" };
  if (mode === "lca") return { mustBeTree: true, hint: isZh ? "LCA 需树" : "needs tree" };
  return undefined;
}

export const graphUnifiedModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph",
  title: T("图 · 综合", "Graph · Comprehensive"),
  desc: T("一站式图章节：遍历 / 最短路 / 拓扑 / MST / SCC / 最大流 / LCA，下拉切换，伪代码与画布联动", "All-in-one graph chapter: traverse / shortest paths / topo / MST / SCC / max flow / LCA via dropdown"),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) { return { ...randomCfg(c as GraphCfg) as Cfg, target: clampV(c.target, c.n), sourceNode: 0, sinkNode: Math.max(1, c.n - 1), lcaU: 2, lcaV: Math.max(3, c.n - 1), subMode: c.subMode, heuristic: c.heuristic } as unknown as Cfg; },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const set = (p: Partial<Cfg>) => onChange({ ...config, ...p });
    const mode = config.subMode;
    const showHeuristic = mode === "astar";
    const pick = config.pick ?? "root";
    const lab = (i: number) => {
      try { if (config.imp && config.imp.labels[i]) return config.imp.labels[i]; const raw = localStorage.getItem("graph-studio:last"); if (raw) { const s = JSON.parse(raw); if (s.labels?.[i]) return s.labels[i]; } } catch {}
      return String.fromCharCode(65 + (i % 26));
    };
    const Chip = ({ active, label, value, onClick }: { active?: boolean; label: string; value: number; onClick?: () => void }) => (
      <button onClick={onClick} className={`pill ${active ? "active" : ""}`} style={{ padding: "4px 10px", fontSize: 12, cursor: onClick ? "pointer" : "default" }}>
        {label}: <b>{lab(value)}</b>
      </button>
    );
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>图算法</span>
          <select className="txt" value={mode} onChange={(e) => set({ subMode: e.target.value as SubMode })} style={{ minWidth: 180, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖全部图知识点" : "one chapter"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#fef3c7", border: "1px solid #fde68a" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#92400e" }}>{isZh ? "选点" : "PICK"}</span>
          <span style={{ fontSize: 11, color: "#92400e" }}>{isZh ? "直接在图中点选节点（高亮）" : "click node on canvas"}</span>
          {(mode === "bfs" || mode === "dfs" || mode === "dijkstra" || mode === "bellman" || mode === "prim") && <Chip label={isZh ? "起点" : "src"} value={config.root} active={pick === "root"} onClick={() => set({ pick: "root" })} />}
          {mode === "astar" && <><Chip label={isZh ? "起点" : "src"} value={config.root} active={pick === "root"} onClick={() => set({ pick: "root" })} /><Chip label={isZh ? "终点" : "dst"} value={config.target} active={pick === "target"} onClick={() => set({ pick: "target" })} /></>}
          {mode === "topo" && <Chip label={isZh ? "起点" : "src"} value={config.root} active={pick === "root"} onClick={() => set({ pick: "root" })} />}
          {(mode === "kosaraju" || mode === "tarjan" || mode === "floyd" || mode === "kruskal") && <span style={{ fontSize: 11, color: "#92400e" }}>{isZh ? "无需选点" : "no pick"}</span>}
          {mode === "dinic" && <><Chip label="S" value={config.sourceNode} active={pick === "source"} onClick={() => set({ pick: "source" })} /><Chip label="T" value={config.sinkNode} active={pick === "sink"} onClick={() => set({ pick: "sink" })} /></>}
          {mode === "lca" && <><Chip label="u" value={config.lcaU} active={pick === "u"} onClick={() => set({ pick: "u" })} /><Chip label="v" value={config.lcaV} active={pick === "v"} onClick={() => set({ pick: "v" })} /></>}
          {showHeuristic && <><span style={{ width: 1, height: 18, background: "#fde68a" }} /><label className="txt-label">{isZh ? "启发式" : "h"}<select className="txt" value={config.heuristic} onChange={(e) => set({ heuristic: e.target.value as Cfg["heuristic"] })}><option value="zero">h=0</option><option value="manhattan">manhattan</option><option value="euclidean">euclidean</option></select></label></>}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    switch (cfg.subMode) {
      case "bfs": return BFS_CODE;
      case "dfs": return DFS_CODE;
      case "dijkstra": return DIJKSTRA_CODE;
      case "bellman": return BELLMAN_CODE;
      case "floyd": return FLOYD_CODE;
      case "astar": return ASTAR_CODE;
      case "topo": return TOPO_CODE;
      case "prim": return PRIM_CODE;
      case "kruskal": return KRUSKAL_CODE;
      case "kosaraju": return KOSARAJU_CODE;
      case "tarjan": return TARJAN_CODE;
      case "dinic": return DINIC_CODE;
      case "lca": return LCA_CODE;
    }
  },
  generate(config) { return buildFrames(config); },
  // 左侧画布：图创建同款编辑器（伪代码左侧），点选即设参，高亮同步
  Render({ scene, t, config, onChange }) {
    const isZh = t(T("中文", "en")) !== "en";
    const cfg = config as Cfg;
    const currentImp: ImportedGraph | null = cfg.imp ?? (() => { try { const raw = localStorage.getItem("graph-studio:last"); if (raw) { const s = JSON.parse(raw); return { n: s.n, spec: s.edgeSpec, labels: s.labels, directed: !!s.directed, root: s.root ?? 0, layout: s.layout, manual: s.manual } as ImportedGraph; } } catch {} return null; })();
    const gForMem = (() => {
      try {
        if (cfg.imp) { const r = fromImport(cfg.imp); if (r.ok) return r.g; }
        const raw = localStorage.getItem("graph-studio:last");
        if (raw) { const s = JSON.parse(raw); const gg = new Graph(s.n, { directed: !!s.directed, labels: s.labels }); gg.fromSpec(s.edgeSpec); return gg; }
      } catch {}
      const cc = cfg as unknown as GraphCfg;
      return cfg.subMode === "topo" ? randDag(cc) : randGraph(cc);
    })();
    // 选点高亮（与算法高亮叠加）
    const pickTone: Record<number, number> = {};
    if (cfg.subMode === "astar") { pickTone[cfg.root] = 0; pickTone[cfg.target] = 1; }
    else if (cfg.subMode === "dinic") { pickTone[cfg.sourceNode] = 0; pickTone[cfg.sinkNode] = 1; }
    else if (cfg.subMode === "lca") { pickTone[cfg.lcaU] = 0; pickTone[cfg.lcaV] = 1; }
    else { pickTone[cfg.root] = 0; }
    const sceneTone = (scene as any).tone as Record<number, number> | undefined;
    const mergedTone = { ...pickTone, ...(sceneTone ?? {}) };
    const highlight = { current: (scene as any).current ?? null, visited: (scene as any).visited ?? [], frontier: (scene as any).frontier ?? [], edge: (scene as any).edge ?? null, tone: mergedTone };
    const onPickVertex = (id: number) => {
      const pick = cfg.pick ?? "root";
      if (cfg.subMode === "astar") {
        if (pick === "target") onChange?.({ ...cfg, target: id } as unknown as Cfg);
        else onChange?.({ ...cfg, root: id } as unknown as Cfg);
      } else if (cfg.subMode === "dinic") {
        if (pick === "sink") onChange?.({ ...cfg, sinkNode: id } as unknown as Cfg);
        else onChange?.({ ...cfg, sourceNode: id } as unknown as Cfg);
      } else if (cfg.subMode === "lca") {
        if (pick === "v") onChange?.({ ...cfg, lcaV: id } as unknown as Cfg);
        else onChange?.({ ...cfg, lcaU: id } as unknown as Cfg);
      } else {
        onChange?.({ ...cfg, root: id } as unknown as Cfg);
      }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 380, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`editor-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp}
            constraints={constraintsFor(cfg.subMode, isZh)}
            highlight={highlight}
            embedded
            onPickVertex={onPickVertex}
            onConfirm={(g) => onChange?.({ ...cfg, imp: g, source: "graph", confirmed: true } as unknown as Cfg)}
            title={isZh ? "图编辑器 · 点选即设参（高亮）· 右键菜单" : "Graph Editor · click to pick"}
          />
        </div>
        <LeftMemoryPanel g={gForMem} isZh={isZh} />
      </div>
    );
  },
  Side({ scene, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const tables = (scene as any).stateTables as import("../../components/canvas/StateBar").AlgoTable[] | undefined;
    return (
      <div style={{ border: "1px solid #fde68a", borderRadius: 12, overflow: "hidden", background: "#fffbeb", display: "flex", flexDirection: "column", maxHeight: 260 }}>
        <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#92400e", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
          <span>{isZh ? "算法内存" : "Algo Memory"}</span>
          <span style={{ fontSize: 10, color: "#b45309" }}>{isZh ? "· Visit/dist 等" : "· Visit/dist"}</span>
          <a href="#/memory" style={{ marginLeft: "auto", fontSize: 11, color: "#92400e", textDecoration: "underline" }}>{isZh ? "跳转内存可视化 ↗" : "Memory ↗"}</a>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 6 }}>
          {tables && tables.length > 0 ? <StateBar tables={tables} /> : <div style={{ fontSize: 12, color: "#92400e", padding: 12 }}>{isZh ? "当前帧无额外内存" : "No extra memory"}</div>}
        </div>
      </div>
    );
  },
};

function LeftMemoryPanel({ g, isZh }: { g: Graph | null; isZh: boolean }) {
  const [repr, setRepr] = useState<"adjlist" | "adjmat" | "array" | "edges">("adjlist");
  if (!g) return <div style={{ border: "1px solid #c7d2fe", borderRadius: 12, padding: 12, fontSize: 12, color: "#64748b" }}>{isZh ? "空图" : "empty"}</div>;
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
    content = <div style={{ display: "flex", flexWrap: "wrap", padding: 4 }}>{g.edges.map((e, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", margin: 2 }}>{cell(g.labels[e.u], "#6366f1", "", addr(i * 2))}<span style={{ margin: "0 2px" }}>—</span>{cell(g.labels[e.v], "#0ea5e9", "", addr(i * 2 + 1))}{e.weight !== undefined && e.weight !== 1 && <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 3 }}>w:{e.weight}</span>}</div>)}</div>;
  } else if (repr === "array") {
    const parent = g.bfs(0).parent;
    content = <div style={{ display: "flex", flexWrap: "wrap", padding: 4 }}>{g.labels.map((l, i) => <div key={i} style={{ margin: 2 }}>{cell(i === 0 ? "−1" : String(parent[i]), i === 0 ? "#dc2626" : "#10b981", l, addr(i))}</div>)}<div style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>parent[i] · 根=−1</div></div>;
  } else {
    const adj = g.adj();
    content = <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 4 }}>{adj.map((neighbors, u) => <div key={u} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#475569" }}>{g.labels[u]}</div><div style={{ display: "flex", alignItems: "center", gap: 1 }}>{cell(g.labels[u], "#6366f1", "head", addr(u))}{neighbors.map(([v], j) => <span key={j} style={{ display: "inline-flex", alignItems: "center" }}><span style={{ color: "#94a3b8" }}>→</span>{cell(g.labels[v], "#0ea5e9", "", addr(u * 10 + j + 1))}</span>)}{neighbors.length === 0 && <span style={{ color: "#cbd5e1" }}>→ ∅</span>}</div></div>)}</div>;
  }
  return (
    <div style={{ border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", height: 220 }}>
      <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#4338ca", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid #c7d2fe" }}>
        <span>{isZh ? "内存表示" : "Memory"}</span>
        {(["adjlist", "adjmat", "array", "edges"] as const).map((v) => <button key={v} className={`pill ${repr === v ? "active" : ""}`} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setRepr(v)}>{v === "adjlist" ? (isZh ? "邻接表" : "List") : v === "adjmat" ? (isZh ? "矩阵" : "Matrix") : v === "array" ? "parent" : (isZh ? "边集" : "Edges")}</button>)}
        <button className="pill" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => { if (g) location.href = buildMemoryUrl(buildGraphDump(g, repr, { root: 0 }) as any); }}>{isZh ? "查看内存 ↗" : "Memory ↗"}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8, background: "#fff" }}>{content}</div>
    </div>
  );
}

function clampV(v: number, n: number) { return Math.min(Math.max(0, v), Math.max(0, n - 1)); }
