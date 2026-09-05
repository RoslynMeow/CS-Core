import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { topoSteps, TOPO_CODE, type AlgoStep } from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import {
  type GraphCfg,
  randDag,
  randomCfg,
  isDag,
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
  n: 8,
  p: 0.25,
  directed: true, // 拓扑排序只针对有向图
  weighted: false,
  connected: true,
  seed: 7,
  root: 0,
};

const empty = (error?: string): GraphCanvasScene => ({
  current: null,
  exploring: null,
  visited: [],
  frontier: [],
  order: [],
  edge: null,
  nodes: [],
  edges: [],
  ...(error ? { error } : {}),
});

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg);
  if (pv) return pv;

  // 图来源：随机 DAG 或从图创建导入（导入已由 fromImport 解析为 Graph）
  const res = fromImport(cfg.imp);
  const g = cfg.source === "random" ? randDag(cfg) : res.g;
  if (!g || !res.ok) {
    return [
      {
        line: 0,
        caption: T(
          res.error ?? "请先选择来源",
          res.error ?? "pick a source",
        ),
        scene: empty(cfg.source === "graph" ? res.error : undefined),
      },
    ];
  }
  // 拓扑排序前置校验：须为有向无环图（DAG）
  if (!g.directed || !isDag(g)) {
    const reason = g.directed
      ? "检测到有向环：拓扑排序只适用于 DAG（请在图创建去掉环）"
      : "拓扑排序只适用于有向图（请在图创建把图改为有向）";
    const reasonEn = g.directed
      ? "cycle detected: topological sort needs a DAG (remove the cycle in Graph Studio)"
      : "topological sort needs a directed graph (set it directed in Graph Studio)";
    return [
      {
        line: 0,
        caption: T(reason, reasonEn),
        scene: {
          ...graphScene(g, {}, {
                root: res.root,
                ...(cfg.source === "graph" ? { import: cfg.imp } : { layout: "force" }),
          }),
          ...(cfg.source === "graph" ? { error: reason } : {}),
        },
      },
    ];
  }
  if (g.n === 0) {
    return [
      {
        line: 0,
        caption: T("空图：请先随机生成或导入一张 DAG", "empty DAG"),
        scene: empty(),
      },
    ];
  }
  const root = Math.min(Math.max(0, res.root), g.n - 1);
  const steps: AlgoStep[] = topoSteps(g, g.labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: graphScene(
      g,
      {
        current: s.current,
        exploring: s.exploring,
        visited: s.visited,
        frontier: s.frontier,
        order: s.order,
        edge: s.edge,
      },
      {
        root,
        ...(cfg.source === "graph" ? { import: cfg.imp } : { layout: "force" }),
      },
    ),
  }));
}

export const graphTopoModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-toposort",
  title: T("拓扑排序", "Topological Sort"),
  desc: T(
    "Kahn 算法：计算入度 → 入度为 0 入队 → 输出拓扑序；仅适用于有向无环图（DAG），有环时给出提示",
    "Kahn: indegree → enqueue indegree-0 → emit topological order; for DAGs only, with a clear cycle message",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return randomCfg(c);
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
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
            {isZh ? "算法" : "ALGO"}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
            Kahn · {isZh ? "有向无环图 DAG" : "DAG"}
          </span>
          <span style={{ fontSize: 11, color: "#64748b" }}>
            {isZh
              ? "只须有向无环；可直接随机生成 DAG 或导入任意图（有环会提示）"
              : "needs a directed acyclic graph; random DAG or any imported graph (cycles flagged)"}
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
            constraints={{ mustBeDirected: true, hint: isZh ? "拓扑排序需 DAG（有向无环）" : "Topo needs DAG" }}
          />
          {config.source === "random" && (
            <>
              <label className="txt-label">
                {isZh ? "顶点数" : "V"}
                <input
                  className="txt"
                  type="number"
                  min={2}
                  max={24}
                  value={config.n}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      n: Math.max(2, Math.min(24, Number(e.target.value))),
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
    return TOPO_CODE;
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
        onChange={onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined}
      />
    );
  },
};