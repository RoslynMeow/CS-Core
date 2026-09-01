import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { dinicSteps, DINIC_CODE, type MaxFlowStep } from "../../lib/graph";
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

type Cfg = GraphCfg & { sourceNode: number; sinkNode: number };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 8,
  p: 0.3,
  directed: true,
  weighted: true,
  connected: true,
  seed: 66,
  root: 0,
  sourceNode: 0,
  sinkNode: 7,
};

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
      caption: T("空图：请先随机生成或导入一张有向加权图", "empty graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  if (!g.directed) {
    return [{
      line: 0,
      caption: T("最大流要求有向图（请在图创建中设为有向）", "Max flow needs directed graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const s = Math.min(Math.max(0, cfg.sourceNode), g.n - 1);
  const t = Math.min(Math.max(0, cfg.sinkNode), g.n - 1);
  if (s === t) {
    return [{
      line: 0,
      caption: T("源点与汇点不能相同", "source != sink required"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const steps: MaxFlowStep[] = dinicSteps(g, s, t, g.labels);
  const importGraph = cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  return steps.map((step) => {
    const annotate: Record<number, string> = {};
    if (step.phase === "bfs" || step.phase === "dfs") {
      for (let i = 0; i < g.n; i++) {
        if (step.level[i] >= 0) annotate[i] = `L${step.level[i]}`;
      }
    }
    const picked: [number, number][] = [];
    for (let u = 0; u < g.n; u++) {
      for (let v = 0; v < g.n; v++) {
        if (step.flow[u][v] > 0) picked.push([u, v]);
      }
    }
    const scene = graphScene(
      g,
      {
        current: step.current,
        exploring: step.exploring,
        visited: step.visited,
        frontier: step.frontier,
        order: step.path,
        edge: step.edge,
      },
      {
        root: s,
        annotate,
        picked,
        ...(importGraph ? { import: importGraph } : { layout: "force" }),
      },
    );
    const zh = step.msg.zh;
    return { line: step.line, caption: { zh: step.msg.zh, en: step.msg.en }, scene };
  });
}

export const graphMaxFlowModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-maxflow",
  title: T("最大流 Dinic", "Max Flow (Dinic)"),
  desc: T(
    "Dinic 算法：BFS 分层图 + DFS 寻找阻塞流；O(E√V) 稀疏图、O(V²E) 一般；当前弧优化；残量网络可视化",
    "Dinic: BFS level graph + DFS blocking flow; O(E√V) sparse, O(V²E) general; current-arc optimization; residual network viz",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...randomCfg(c), sourceNode: 0, sinkNode: Math.max(1, c.n - 1) };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const n = config.n;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>{isZh ? "源/汇" : "SRC/SNK"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.sourceNode} onChange={(e) => onChange({ ...config, sourceNode: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "源点" : "source"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.sinkNode} onChange={(e) => onChange({ ...config, sinkNode: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "汇点" : "sink"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <GraphSourcePanel cfg={config} onChange={(c) => onChange({ ...config, ...c })} t={t} />
          {config.source === "random" && (
            <>
              <label className="txt-label">{isZh ? "顶点数" : "V"}<input className="txt" type="number" min={2} max={14} value={config.n} onChange={(e) => onChange({ ...config, n: Math.max(2, Math.min(14, Number(e.target.value))) })} /></label>
              <label className="txt-label">{isZh ? "密度" : "p"}<input className="txt" type="number" min={0} max={1} step={0.05} value={config.p} onChange={(e) => onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })} /></label>
              <label className="chk"><input type="checkbox" checked={config.weighted} onChange={(e) => onChange({ ...config, weighted: e.target.checked })} />{isZh ? "加权(容量)" : "weighted(cap)"}</label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor() { return DINIC_CODE; },
  generate(config) { return buildFrames(config); },
  Render({ scene, t, config, onChange }) {
    return (
      <GraphCanvasWrap
        scene={scene}
        t={t}
        config={config}
        selected={config ? config.sourceNode : null}
        onNodeClick={config && onChange ? (id) => onChange({ ...config, sourceNode: id }) : undefined}
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};