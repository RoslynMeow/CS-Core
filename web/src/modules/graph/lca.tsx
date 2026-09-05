import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { lcaBinaryLiftingSteps, LCA_CODE, type LCAStep } from "../../lib/graph";
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

type Cfg = GraphCfg & { u: number; v: number };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 10,
  p: 0.2,
  directed: false,
  weighted: false,
  connected: true,
  seed: 55,
  root: 0,
  u: 3,
  v: 7,
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
      caption: T("空图：请先随机生成或导入一张树", "empty graph"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  if (!g.isTree()) {
    return [{
      line: 0,
      caption: T("LCA 倍增法要求输入是树（无环连通图）；请在图创建中构建树或随机生成树", "LCA requires a tree"),
      scene: { current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, nodes: [], edges: [] },
    }];
  }
  const u = Math.min(Math.max(0, cfg.u), g.n - 1);
  const v = Math.min(Math.max(0, cfg.v), g.n - 1);
  const root = Math.min(Math.max(0, cfg.root), g.n - 1);
  const steps: LCAStep[] = lcaBinaryLiftingSteps(g, root, u, v, g.labels);
  const importGraph = cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  return steps.map((s) => {
    const annotate: Record<number, string> = {};
    s.depth.forEach((d, i) => { annotate[i] = `d=${d}`; });
    const picked: [number, number][] = [];
    if (s.lca !== null && s.u !== s.v) {
      // 显示从 u、v 向上跳到 LCA 的路径
      let uu = s.u, vv = s.v;
      const up = s.up;
      const LOG = up[0].length;
      if (s.depth[uu] > s.depth[vv]) [uu, vv] = [vv, uu];
      // uu 是较浅的
      for (let j = LOG - 1; j >= 0; j--) {
        if (up[vv][j] !== -1 && s.depth[up[vv][j]] >= s.depth[uu]) {
          picked.push([vv, up[vv][j]]);
          vv = up[vv][j];
        }
      }
      if (uu !== vv) {
        for (let j = LOG - 1; j >= 0; j--) {
          if (up[uu][j] !== -1 && up[uu][j] !== up[vv][j]) {
            picked.push([uu, up[uu][j]]);
            picked.push([vv, up[vv][j]]);
            uu = up[uu][j];
            vv = up[vv][j];
          }
        }
        if (up[uu][0] !== -1) {
          picked.push([uu, up[uu][0]]);
          picked.push([vv, up[vv][0]]);
        }
      }
    }
    const scene = graphScene(
      g,
      {
        current: s.current,
        exploring: s.exploring,
        visited: s.lca !== null ? [s.lca] : [],
        frontier: [],
        order: [],
        edge: s.edge,
      },
      { root, annotate, picked, ...(importGraph ? { import: importGraph } : { layout: "tree" }) },
    );
    return { line: s.line, caption: { zh: s.msg.zh, en: s.msg.en }, scene };
  });
}

export const graphLCAModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-lca",
  title: T("LCA 最近公共祖先 (倍增)", "LCA Binary Lifting"),
  desc: T(
    "倍增法预处理 O(V log V)，查询 O(log V)；up[v][j] = v 的 2^j 祖先；先对齐深度再同步上跳；适用于树上路径查询、距离、K-th 祖先",
    "Binary lifting: preprocess O(V log V), query O(log V); up[v][j] = 2^j-th ancestor; align depths then lift together; for tree path queries, distance, k-th ancestor",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...randomCfg(c), u: Math.min(c.n - 1, Math.max(0, Math.floor(c.n * 0.3))), v: Math.min(c.n - 1, Math.max(1, Math.floor(c.n * 0.7))) };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const n = config.n;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>{isZh ? "查询节点" : "QUERY NODES"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.u} onChange={(e) => onChange({ ...config, u: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "u" : "u"}</span>
          <select className="txt" style={{ minWidth: 70 }} value={config.v} onChange={(e) => onChange({ ...config, v: Number(e.target.value) })}>
            {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + (i % 26))}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "v" : "v"}</span>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "可点画布顶点切换" : "click vertex on canvas"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <GraphSourcePanel cfg={config} onChange={(c) => onChange({ ...config, ...c })} t={t} constraints={{ mustBeTree: true, hint: isZh ? "LCA 要求树（无环连通）" : "LCA needs a tree" }} />
          {config.source === "random" && (
            <>
              <label className="txt-label">{isZh ? "顶点数" : "V"}<input className="txt" type="number" min={2} max={20} value={config.n} onChange={(e) => onChange({ ...config, n: Math.max(2, Math.min(20, Number(e.target.value))) })} /></label>
              <label className="txt-label">{isZh ? "密度" : "p"}<input className="txt" type="number" min={0} max={1} step={0.05} value={config.p} onChange={(e) => onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })} /></label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor() { return LCA_CODE; },
  generate(config) { return buildFrames(config); },
  Render({ scene, t, config, onChange }) {
    return (
      <GraphCanvasWrap
        scene={scene}
        t={t}
        config={config}
        selected={config ? config.u : null}
        onNodeClick={config && onChange ? (id) => onChange({ ...config, u: id }) : undefined}
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};