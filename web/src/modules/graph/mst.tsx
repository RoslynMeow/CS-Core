import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  primSteps,
  kruskalSteps,
  PRIM_CODE,
  KRUSKAL_CODE,
  type PrimStep,
  type KruskalStep,
} from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import { type ImportedGraph } from "../tree/source";
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

type Mode = "prim" | "kruskal";
type Cfg = GraphCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "random",
  imp: null,
  confirmed: true,
  n: 7,
  p: 0.28,
  directed: false,
  weighted: true, // MST 须加权（最小权重和）
  connected: true, // MST 须连通（否则展示不连通分支）
  seed: 33,
  root: 0,
  mode: "prim",
};

/** PrimStep → 场景：T 中节点 = 绿环（inTree），候选 cand = 天蓝，annotate = key；picked = 树边 */
function primScene(
  s: PrimStep,
  g: Awaited<ReturnType<typeof randGraph>>,
  root: number,
  importGraph: ImportedGraph | null,
): GraphCanvasScene {
  const ann: Record<number, string> = {};
  for (let i = 0; i < g.n; i++)
    ann[i] = Number.isFinite(s.key[i]) ? `k:${s.key[i]}` : "∞";
  const picked: Array<[number, number]> = [];
  for (let v = 0; v < g.n; v++)
    if (s.inTree[v] && s.parent[v] >= 0 && s.parent[v] !== v)
      picked.push([s.parent[v], v]);
  return graphScene(
    g,
    {
      current: s.current,
      exploring: s.exploring,
      visited: [...s.visited], // = inTree → 绿环
      frontier: [...s.frontier], // 候选 cand → 天蓝
      order: [...s.order],
      edge: s.edge,
    },
    { root, annotate: ann, picked, ...(importGraph ? { import: importGraph } : {}) },
  );
}

/** KruskalStep → 场景：MST 已接受边 = picked（绿色加粗），正在检查边 = edge */
function kruskalScene(
  s: KruskalStep,
  g: Awaited<ReturnType<typeof randGraph>>,
  root: number,
  importGraph: ImportedGraph | null,
): GraphCanvasScene {
  const picked: Array<[number, number]> = s.picked as Array<[number, number]>;
  return graphScene(
    g,
    {
      current: s.current,
      exploring: s.exploring,
      visited: [...s.visited],
      frontier: [...s.frontier],
      order: [...s.order],
      edge: s.edge,
    },
    { root, picked, ...(importGraph ? { import: importGraph } : {}) },
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
        caption: T("空图：请先随机生成或导入一张无权/无向图", "empty graph"),
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
  const importGraph =
    cfg.source === "graph" ? (cfg.imp as ImportedGraph | null) : null;
  if (cfg.mode === "prim") {
    const root = Math.min(Math.max(0, res.root), g.n - 1);
    return primSteps(g, root, g.labels).map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: primScene(s as PrimStep, g, root, importGraph),
    }));
  }
  return kruskalSteps(g, g.labels).map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: kruskalScene(s as KruskalStep, g, res.root, importGraph),
  }));
}

export const graphMstModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "graph-mst",
  title: T("最小生成树 MST", "Minimum Spanning Tree"),
  desc: T(
    "Prim（贪心 + 已确定集）与 Kruskal（按权重升序 + 并查集）两种求最小生成树；绿色加粗边 = 已选入 MST",
    "Prim (greedy settled set) vs Kruskal (sort by weight + union-find); green bold edges = picked into the MST",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...randomCfg(c), mode: c.mode };
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
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="prim">{t(T("Prim（贪心）", "Prim"))}</option>
            <option value="kruskal">{t(T("Kruskal（并查集）", "Kruskal"))}</option>
          </select>
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
              <label className="chk">
                <input
                  type="checkbox"
                  checked={config.weighted}
                  onChange={(e) =>
                    onChange({ ...config, weighted: e.target.checked })
                  }
                />
                {isZh ? "加权" : "weighted"}
              </label>
            </>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    return cfg.mode === "prim" ? PRIM_CODE : KRUSKAL_CODE;
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