import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { aStarSteps, ASTAR_CODE, type AStarStep, reconstructPathFromParent } from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import type { ImportedGraph } from "../tree/source";
import {
  type GraphCfg,
  randGraph,
  randomCfg,
  fromImport,
  graphScene,
  importPreviewFrames,
  GraphCanvasWrap,
  GraphSourcePanel,
} from "./source";

type Cfg = GraphCfg & { target: number; heuristic: "zero" | "manhattan" | "euclidean" };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 10,
  p: 0.25,
  directed: false,
  weighted: true,
  connected: true,
  seed: 99,
  root: 0,
  target: 9,
  heuristic: "zero",
};

function heuristicFn(cfg: Cfg, g: Awaited<ReturnType<typeof randGraph>>): (u: number, v: number) => number {
  if (cfg.heuristic === "zero") return () => 0;
  // 简单启发式：用节点标签的字母序差值模拟（仅演示用，实际需坐标）
  return (u: number, v: number) => Math.abs(u - v);
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg);
  if (pv) return pv;
  const res = fromImport(cfg.imp);
  const g = cfg.source === "random" ? randGraph(cfg) : res.g;
  if (!g || !res.ok) {
    return [{
      line: 0,
      caption: T(res.error ?? "请先选择来源", res.error ?? "pick a source"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [], ...(cfg.source === "graph" ? { error: res.error ?? "" } : {}) },
    }];
  }
  if (g.n === 0) {
    return [{
      line: 0,
      caption: T("空图：请先随机生成或导入一张加权图", "empty graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const start = Math.min(Math.max(0, cfg.root), g.n - 1);
  const target = Math.min(Math.max(0, cfg.target), g.n - 1);
  if (start === target) {
    return [{
      line: 0,
      caption: T("起点与终点相同", "start == target"),
      scene: { current: start, exploring: null, visited: [start], frontier: [], order: [start], edge: null, nodes: [], edges: [] },
    }];
  }
  const h = heuristicFn(cfg, g);
  const steps: AStarStep[] = aStarSteps(g, start, target, g.labels, h);
  const importGraph = cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  return steps.map((s) => {
    const path = reconstructPathFromParent(s.parent, target);
    const scene = graphScene(
      g,
      {
        current: s.current,
        exploring: s.exploring,
        visited: [...s.closedSet],
        frontier: [...s.openSet],
        order: path,
        edge: s.edge,
      },
      { root: start, annotate: Object.fromEntries(s.openSet.map((u) => [u, `f=${Number.isFinite(s.fScore[u]) ? s.fScore[u] : "∞"}`])), picked: path.length > 1 ? path.slice(0, -1).map((u, i) => [u, path[i + 1]] as [number, number]) : [], ...(importGraph ? { import: importGraph } : {}) },
    );
    return { line: s.line, caption: { zh: s.msg.zh, en: s.msg.en }, scene };
  });
}

export const graphAStarModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-astar",
  title: T("A* 启发式搜索", "A* Search"),
  desc: T(
    "A* = Dijkstra + 启发式 h(v)：f = g + h，优先展开 f 最小节点；h=0 时退化为 Dijkstra，h 可接受时保证最优",
    "A* = Dijkstra + heuristic h(v): f = g + h, expand min-f node; h=0 → Dijkstra, admissible h guarantees optimality",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...randomCfg(c), target: Math.min(c.n - 1, Math.max(1, c.target)), heuristic: c.heuristic };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const n = config.n;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>{isZh ? "起点/终点" : "START/GOAL"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.root} onChange={(e) => onChange({ ...config, root: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "→" : "→"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.target} onChange={(e) => onChange({ ...config, target: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "可点画布顶点切换" : "click vertex on canvas"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#fef3c7", border: "1px solid #fde68a" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: ".04em" }}>{isZh ? "启发式" : "HEURISTIC"}</span>
          <select className="txt" value={config.heuristic} onChange={(e) => onChange({ ...config, heuristic: e.target.value as Cfg["heuristic"] })}>
            <option value="zero">{t(T("h=0 (退化 Dijkstra)", "h=0 (Dijkstra)"))}</option>
            <option value="manhattan">{t(T("曼哈顿距离模拟", "Manhattan sim"))}</option>
            <option value="euclidean">{t(T("欧几里得模拟", "Euclidean sim"))}</option>
          </select>
          <span style={{ fontSize: 11, color: "#92400e" }}>{isZh ? "演示用模拟启发式（无真实坐标）" : "demo heuristic (no real coords)"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <GraphSourcePanel cfg={config} onChange={(c) => onChange({ ...config, ...c })} t={t} />
          {config.source === "random" && (
            <>
              <label className="txt-label">{isZh ? "顶点数" : "V"}<input className="txt" type="number" min={2} max={20} value={config.n} onChange={(e) => onChange({ ...config, n: Math.max(2, Math.min(20, Number(e.target.value))) })} /></label>
              <label className="txt-label">{isZh ? "密度" : "p"}<input className="txt" type="number" min={0} max={1} step={0.05} value={config.p} onChange={(e) => onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })} /></label>
              <label className="chk"><input type="checkbox" checked={config.directed} onChange={(e) => onChange({ ...config, directed: e.target.checked })} />{isZh ? "有向" : "directed"}</label>
              <label className="chk"><input type="checkbox" checked={config.weighted} onChange={(e) => onChange({ ...config, weighted: e.target.checked })} />{isZh ? "加权" : "weighted"}</label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor() { return ASTAR_CODE; },
  generate(config) { return buildFrames(config); },
  Render({ scene, t, config, onChange }) {
    return (
      <GraphCanvasWrap
        scene={scene}
        t={t}
        config={config}
        selected={config ? config.root : null}
        onNodeClick={config && onChange ? (id) => onChange({ ...config, root: id }) : undefined}
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};