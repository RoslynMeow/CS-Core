import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bellmanFordSteps,
  BELLMAN_CODE,
  type BellmanStep,
} from "../../lib/graph";
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
  p: 0.3,
  directed: false,
  weighted: true,
  connected: true,
  seed: 44,
  root: 0,
};

/** BellmanStep → 场景：已更新 dist 的节点 = 绿环 + 节点下方 annotate 显示 dist；frontier = 当前轮已收敛集 */
function bellmanScene(
  s: BellmanStep,
  g: Awaited<ReturnType<typeof randGraph>>,
  root: number,
  importGraph: ImportedGraph | null,
): GraphCanvasScene {
  const ann: Record<number, string> = {};
  for (let i = 0; i < g.n; i++)
    ann[i] = Number.isFinite(s.dist[i]) ? String(s.dist[i]) : "∞";
  return graphScene(
    g,
    {
      current: s.current,
      exploring: s.exploring,
      visited: [...s.visited], // 已更新（有限 dist）
      frontier: [...s.frontier],
      order: [...s.order],
      edge: s.edge,
    },
    {
      root,
      annotate: ann,
      ...(importGraph ? { import: importGraph } : {}),
    },
  );
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg);
  if (pv) return pv;
  const res = fromImport(cfg.imp);
  const g = cfg.source === "random" ? randGraph(cfg) : res.g;
  if (!g || !res.ok) {
    return [
      {
        line: 0,
        caption: T(res.error ?? "请先选择来源", res.error ?? "pick a source"),
        scene: {
          current: null,
          exploring: null,
          visited: [],
          frontier: [],
          order: [],
          edge: null,
          nodes: [],
          edges: [],
          ...(cfg.source === "graph" ? { error: res.error ?? "" } : {}),
        },
      },
    ];
  }
  if (g.n === 0) {
    return [
      {
        line: 0,
        caption: T("空图：请先随机生成或导入一张加权图", "empty graph"),
        scene: {
          current: null,
          exploring: null,
          visited: [],
          frontier: [],
          order: [],
          edge: null,
          nodes: [],
          edges: [],
        },
      },
    ];
  }
  const root = Math.min(Math.max(0, cfg.root), g.n - 1);
  const importGraph =
    cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  const steps: BellmanStep[] = bellmanFordSteps(g, root, g.labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: bellmanScene(s, g, root, importGraph),
  }));
}

export const graphBellmanModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-bellman",
  title: T("Bellman-Ford 最短路径", "Bellman-Ford Shortest Path"),
  desc: T(
    "对全部边做 |V|−1 轮全量松弛后得到单源最短路；支持负权边（Dijkstra 不支持），能用第 |V| 轮检测负环",
    "relax every edge for |V|-1 passes to get single-source shortest paths; supports negative weights (Dijkstra doesn't), uses pass #|V| to detect negative cycles",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return randomCfg(c);
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const n = config.n;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: 12,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#4338ca",
              letterSpacing: ".04em",
            }}
          >
            {isZh ? "起点" : "START"}
          </span>
          <select
            className="txt"
            style={{ minWidth: 70 }}
            value={config.root}
            onChange={(e) =>
              onChange({ ...config, root: Number(e.target.value) })
            }
          >
            {Array.from({ length: n }, (_, i) => (
              <option key={i} value={i}>
                {resLabel(config, i)}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {isZh ? "也可点画布顶点换起点" : "or click a vertex on canvas"}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            flexWrap: "wrap",
          }}
        >
          <GraphSourcePanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c })}
            t={t}
          />
          {config.source === "random" && (
            <>
              <label className="txt-label">
                {isZh ? "顶点数" : "V"}
                <input
                  className="txt"
                  type="number"
                  min={2}
                  max={20}
                  value={config.n}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      n: Math.max(2, Math.min(20, Number(e.target.value))),
                    })
                  }
                />
              </label>
              <label className="txt-label">
                {isZh ? "密度" : "p"}
                <input
                  className="txt"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.p}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      p: Math.min(1, Math.max(0, Number(e.target.value))),
                    })
                  }
                />
              </label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor() {
    return BELLMAN_CODE;
  },
  generate(config) {
    return buildFrames(config);
  },
  Render({ scene, t, config, onChange }) {
    return (
      <GraphCanvasWrap
        scene={scene}
        t={t}
        config={config}
        selected={config ? config.root : null}
        onNodeClick={
          config && onChange
            ? (id) => onChange({ ...config, root: id })
            : undefined
        }
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};

function resLabel(cfg: Cfg, i: number): string {
  if (cfg.source === "graph" && cfg.imp && i < cfg.imp.labels.length)
    return cfg.imp.labels[i];
  return String.fromCharCode(65 + (i % 26));
}