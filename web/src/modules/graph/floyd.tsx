import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { floydWarshallSteps, FLOYD_CODE, type FloydStep } from "../../lib/graph";
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

type Cfg = GraphCfg;
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 6,
  p: 0.35,
  directed: false,
  weighted: true,
  connected: true,
  seed: 88,
  root: 0,
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
      caption: T("空图：请先随机生成或导入一张加权图", "empty graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const steps: FloydStep[] = floydWarshallSteps(g, g.labels);
  const importGraph = cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  return steps.map((s) => {
    const scene = graphScene(
      g,
      {
        current: s.current,
        exploring: s.exploring,
        visited: [],
        frontier: [],
        order: [],
        edge: s.edge,
      },
      {
        root: s.k,
        annotate: s.k >= 0 ? Object.fromEntries(g.labels.map((_, i) => [i, s.dist[s.k][i] === Infinity ? "∞" : String(s.dist[s.k][i])])) : undefined,
        ...(importGraph ? { import: importGraph } : { layout: "force" }),
      },
    );
    return { line: s.line, caption: { zh: s.msg.zh, en: s.msg.en }, scene };
  });
}

export const graphFloydModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-floyd",
  title: T("Floyd-Warshall 多源最短路", "Floyd-Warshall APSP"),
  desc: T(
    "动态规划 O(V³) 求所有点对最短路：dist[i][j] = min(dist[i][j], dist[i][k]+dist[k][j])；next 数组可重构路径；能检测负环",
    "DP O(V³) all-pairs shortest paths: dist[i][j] = min(dist[i][j], dist[i][k]+dist[k][j]); next array reconstructs paths; detects negative cycles",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) { return randomCfg(c); },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>{isZh ? "算法" : "ALGO"}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>Floyd-Warshall · {isZh ? "O(V³) 多源最短路" : "O(V³) APSP"}</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "邻接矩阵 DP，next 数组重构路径，负环检测" : "matrix DP, next[] for paths, neg-cycle detect"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <GraphSourcePanel cfg={config} onChange={(c) => onChange({ ...config, ...c })} t={t} />
          {config.source === "random" && (
            <>
              <label className="txt-label">{isZh ? "顶点数" : "V"}<input className="txt" type="number" min={2} max={12} value={config.n} onChange={(e) => onChange({ ...config, n: Math.max(2, Math.min(12, Number(e.target.value))) })} /></label>
              <label className="txt-label">{isZh ? "密度" : "p"}<input className="txt" type="number" min={0} max={1} step={0.05} value={config.p} onChange={(e) => onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })} /></label>
              <label className="chk"><input type="checkbox" checked={config.directed} onChange={(e) => onChange({ ...config, directed: e.target.checked })} />{isZh ? "有向" : "directed"}</label>
              <label className="chk"><input type="checkbox" checked={config.weighted} onChange={(e) => onChange({ ...config, weighted: e.target.checked })} />{isZh ? "加权" : "weighted"}</label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor() { return FLOYD_CODE; },
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