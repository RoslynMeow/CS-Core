import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bfsSteps,
  dfsSteps,
  BFS_CODE,
  DFS_CODE,
  type AlgoStep,
} from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
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

type Mode = "bfs" | "dfs";
type Cfg = GraphCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 8,
  p: 0.2,
  directed: false,
  weighted: false,
  connected: true,
  seed: 12,
  root: 0,
  mode: "bfs",
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg);
  if (pv) return pv;
  const res =
    cfg.source === "random"
      ? (() => {
          const g = randGraph(cfg);
          return { ok: true, g, labels: g.labels, root: cfg.root };
        })()
      : fromImport(cfg.imp);
  if (!res.ok) throw new Error("no-unreachable"); // not reached; preview handles
  if (res.g.n === 0) {
    return [
      {
        line: 0,
        caption: T("空图：请先随机生成或从图创建导入一张图", "empty graph"),
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
  const root = Math.min(Math.max(0, res.root), res.g.n - 1);
  const steps: AlgoStep[] =
    cfg.mode === "bfs"
      ? bfsSteps(res.g, root, res.labels)
      : dfsSteps(res.g, root, res.labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: graphScene(
      res.g,
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
        ...(cfg.source === "graph" ? { import: cfg.imp } : {}),
      },
    ),
  }));
}

export const graphTraverseModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-bfs-dfs",
  title: T("图的遍历", "Graph Traversal"),
  desc: T(
    "广度优先 (BFS) / 深度优先 (DFS) 遍历图；可随机生成或从图创建导入任意图（有向/无向均可）",
    "BFS / DFS traversal on a graph; random or imported from Graph Studio (directed or undirected)",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...(randomCfg(c) as GraphCfg), mode: c.mode };
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
            {isZh ? "遍历" : "TRAVERSE"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="bfs">{t(T("BFS 广度", "BFS"))}</option>
            <option value="dfs">{t(T("DFS 深度", "DFS"))}</option>
          </select>
          <label className="txt-label">
            {isZh ? "起点" : "start"}
            <select
              className="txt"
              style={{ minWidth: 60 }}
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
          </label>
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
                    onChange({ ...config, p: Math.min(1, Math.max(0, Number(e.target.value))) })
                  }
                />
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={config.directed}
                  onChange={(e) =>
                    onChange({ ...config, directed: e.target.checked })
                  }
                />
                {isZh ? "有向" : "directed"}
              </label>
              <label className="chk">
                <input
                  type="checkbox"
                  checked={config.connected}
                  onChange={(e) =>
                    onChange({ ...config, connected: e.target.checked })
                  }
                />
                {isZh ? "连通" : "connected"}
              </label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    return cfg.mode === "bfs" ? BFS_CODE : DFS_CODE;
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
        onChange={
          onChange ? ((c: GraphCfg) => onChange(c as Cfg)) : undefined
        }
      />
    );
  },
};

/** 起点标签：有向/无向后可用字母标签；取图中实际标签 */
function resLabel(cfg: Cfg, i: number): string {
  if (cfg.source === "graph" && cfg.imp && i < cfg.imp.labels.length)
    return cfg.imp.labels[i];
  // 随机图：字母序（与 randGraph 的 graphLabels 一致）
  return String.fromCharCode(65 + (i % 26));
}