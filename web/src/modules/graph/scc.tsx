import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { kosarajuSteps, tarjanSteps, KOSARAJU_CODE, TARJAN_CODE, type SCCStep } from "../../lib/graph";
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

type Mode = "kosaraju" | "tarjan";
type Cfg = GraphCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 8,
  p: 0.25,
  directed: true,
  weighted: false,
  connected: true,
  seed: 77,
  root: 0,
  mode: "tarjan",
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
      caption: T("空图：请先随机生成或导入一张有向图", "empty graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  if (!g.directed) {
    return [{
      line: 0,
      caption: T("SCC 仅适用于有向图（请在图创建中设为有向）", "SCC needs directed graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const steps: SCCStep[] = cfg.mode === "kosaraju" ? kosarajuSteps(g, g.labels) : tarjanSteps(g, g.labels);
  const importGraph = cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  return steps.map((s) => {
    const annotate: Record<number, string> = {};
    s.comp.forEach((c, i) => { if (c !== -1) annotate[i] = `SCC ${c}`; });
    const scene = graphScene(
      g,
      {
        current: s.current,
        exploring: s.exploring,
        visited: s.visited,
        frontier: s.frontier,
        order: s.order,
        edge: s.edge,
      },
      { root: cfg.root, annotate, tone: s.comp.reduce((acc, c, i) => { if (c !== -1) acc[i] = c; return acc; }, {} as Record<number, number>), ...(importGraph ? { import: importGraph } : { layout: "force" }) },
    );
    return { line: s.line, caption: { zh: s.msg.zh, en: s.msg.en }, scene };
  });
}

export const graphSCCModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-scc",
  title: T("强连通分量 SCC", "Strongly Connected Components"),
  desc: T(
    "Kosaraju（两遍 DFS）与 Tarjan（单遍 DFS + lowlink）求有向图的强连通分量；缩点后成 DAG，是 2-SAT、缩点 DP 等的基础",
    "Kosaraju (two-pass DFS) & Tarjan (single-pass DFS + lowlink) for SCCs; condensation yields a DAG, basis for 2-SAT, DP on DAG",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) { return { ...randomCfg(c), mode: c.mode }; },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>{isZh ? "算法" : "ALGO"}</span>
          <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as Mode })}>
            <option value="tarjan">{t(T("Tarjan (单遍 + lowlink)", "Tarjan (one-pass)"))}</option>
            <option value="kosaraju">{t(T("Kosaraju (两遍 DFS)", "Kosaraju (two-pass)"))}</option>
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "仅有向图；颜色标记不同 SCC" : "directed only; colors = SCC ids"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <GraphSourcePanel cfg={config} onChange={(c) => onChange({ ...config, ...c })} t={t} constraints={{ mustBeDirected: true, hint: isZh ? "SCC 仅适用于有向图" : "SCC needs directed graph" }} />
          {config.source === "random" && (
            <>
              <label className="txt-label">{isZh ? "顶点数" : "V"}<input className="txt" type="number" min={2} max={16} value={config.n} onChange={(e) => onChange({ ...config, n: Math.max(2, Math.min(16, Number(e.target.value))) })} /></label>
              <label className="txt-label">{isZh ? "密度" : "p"}<input className="txt" type="number" min={0} max={1} step={0.05} value={config.p} onChange={(e) => onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })} /></label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return cfg.mode === "tarjan" ? TARJAN_CODE : KOSARAJU_CODE; },
  generate(config) { return buildFrames(config); },
  Render({ scene, t, config, onChange }) {
    return (
      <GraphCanvasWrap
        scene={scene}
        t={t}
        config={config}
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};