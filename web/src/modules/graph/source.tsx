import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import type { Frame } from "../../engine/types";
import { Graph, alphaLabels, type Vec2 } from "../../lib/graph";
import {
  GraphCanvas,
  type GraphCanvasScene,
} from "../../components/canvas/GraphCanvas";
import {
  StateBar,
  type AlgoCellState,
  type AlgoStateRow,
  type AlgoTable,
} from "../../components/canvas/StateBar";
import {
  loadGraphStudio,
  type ImportedGraph,
} from "../tree/source";
import { GraphEditorModal } from "../../components/GraphEditorModal";

/** 图的来源：随机生成 或 从图创建导入（导入不要求树，任意图皆可） */
export type GraphCfg = {
  source: "random" | "graph";
  imp: ImportedGraph | null;
  /** 当前 imp 是否已被用户确认导入（未确认时画布虚化预览，点击画布确认） */
  confirmed: boolean;
  // 随机生成参数
  n: number; // 顶点数
  p: number; // 边密度（通用图）
  directed: boolean; // 有向 / 无向
  weighted: boolean; // 加权
  connected: boolean; // 随机取连通图（树/稀疏骨架，便于遍历/最短路/MST 起点展示）
  /** 随机种子：同 param 不同种子 → 不同图；同种子换模式不重新生成（BFS/DFS 共用同一图） */
  seed: number;
  /** 遍历/最短路/MST 的起点顶点 */
  root: number;
};

/** mulberry32 确定性伪随机（同 seed → 同图；仅 randomize 换 seed） */
function mulberry32(a: number): () => number {
  let state = a >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const GRAPH_BOX = { x0: 24, y0: 20, w: 712, h: 404 };

/** 解析结果：Graph（成功）+ 标签 + 起点 */
export type GraphResolved = {
  ok: boolean;
  error?: string;
  g: Graph;
  labels: string[];
  root: number;
};

/** 顶点标签：字母序（与 GraphStudio 的 alpha 一致） */
export function graphLabels(n: number): string[] {
  return alphaLabels(n);
}

/**
 * 确定性随机图生成（同 seed → 同图；仅换 seed 才换新图，换模式不重新生成）。
 *  - connected：以一棵树（n−1 条边，每顶点连到一个更小随机父）为骨架保证连通，无孤岛；
 *    便于遍历/最短路/MST 从任一顶点起步。再加密度 p 的额外边。
 *  - 非连通：完全按密度 p 随机加边（可能有孤立顶点）。
 */
export function randGraph(cfg: GraphCfg): Graph {
  const g = new Graph(cfg.n, {
    directed: cfg.directed,
    weighted: cfg.weighted,
    labels: graphLabels(cfg.n),
  });
  const rand = mulberry32(cfg.seed);
  const w = () => (cfg.weighted ? 1 + Math.floor(rand() * 9) : 1);
  const key = (a: number, b: number) =>
    cfg.directed ? `${a},${b}` : a < b ? `${a},${b}` : `${b},${a}`;
  const used = new Set<string>();
  const add = (a: number, b: number) => {
    const k = key(a, b);
    if (used.has(k) || a === b) return;
    used.add(k);
    g.addEdge(a, b, w());
  };
  // 树骨架（连通）：顶点 i 挂到 0..i-1 中的随机父
  if (cfg.connected && g.n > 0) {
    for (let i = 1; i < g.n; i++) add(i, Math.floor(rand() * i));
  }
  // 额外边：按密度 p（有向：有序对全配对；无向：只枚举 i<j）
  for (let i = 0; i < g.n; i++) {
    const jStart = cfg.directed ? 0 : i + 1;
    for (let j = jStart; j < g.n; j++) {
      if (i === j) continue;
      if (rand() < cfg.p) add(i, j);
    }
  }
  return g;
}

/** 换一张随机图：返回新 cfg（换 seed；仅随机知识点参数，不动模式） */
export function randomCfg(cfg: GraphCfg): GraphCfg {
  return {
    ...cfg,
    source: "random",
    confirmed: true,
    seed: (Math.random() * 0x1fffffff) >>> 0,
  };
}

/**
 * 确定性随机 DAG（有向无环；仅拓扑排序用）：
 *  随机排列 + 脊链保证连通，再按密度 p 加“前向边”（拓扑序下标小→大，天然无环）。
 *  同 seed → 同图；仅换 seed 才换新图。
 */
export function randDag(cfg: GraphCfg): Graph {
  const n = cfg.n;
  const g = new Graph(n, {
    directed: true,
    weighted: cfg.weighted,
    labels: graphLabels(n),
  });
  const rand = mulberry32(cfg.seed);
  const w = () => (cfg.weighted ? 1 + Math.floor(rand() * 9) : 1);
  // 随机排列作为拓扑序
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const used = new Set<string>();
  const addFwd = (a: number, b: number) => {
    const k = `${a},${b}`;
    if (used.has(k)) return;
    used.add(k);
    g.addEdge(a, b, w());
  };
  // 脊链：perm[0]→perm[1]→… 保证弱连通
  for (let i = 0; i + 1 < n; i++) addFwd(perm[i], perm[i + 1]);
  // 前向边（概率 p）：拓扑序下标小→大，不会成环
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (rand() < cfg.p) addFwd(perm[i], perm[j]);
  return g;
}

/** 是否为有向无环图（DAG）：拓扑排序前置校验 */
export function isDag(g: Graph): boolean {
  if (!g.directed) return false; // 拓扑排序只针对有向图
  return !g.hasDirectedCycle();
}

/** 从图创建导入：构建 Graph，不做树校验（任意图皆可） */
export function fromImport(imp: ImportedGraph | null): GraphResolved {
  if (!imp) return err("请先在“图创建”页保存一张图，再点“导入当前图”");
  const g = new Graph(imp.n, {
    directed: imp.directed,
    labels: imp.labels,
  });
  const r = g.fromSpec(imp.spec);
  if (!r.ok) return err(r.error ?? "导入的边无法解析");
  const root = imp.root >= 0 && imp.root < imp.n ? imp.root : 0;
  return { ok: true, g, labels: imp.labels, root };
}

function err(e: string): GraphResolved {
  return { ok: false, error: e, g: new Graph(1), labels: [], root: 0 };
}

/** 读取“图创建”最近保存的图（本地存储），与 tree/source 共用 */
export function loadGraph(): ImportedGraph | null {
  return loadGraphStudio();
}

/** 布局 + 场景：图（可选树形/环形）→ GraphCanvasScene
 *  opts.import：给定时无视 layout，完全复刻用户在图创建选的布局 + 手动位置 */
export function graphScene(
  g: Graph,
  hl: {
    current?: number | null;
    exploring?: number | null;
    visited?: number[];
    frontier?: number[];
    order?: number[];
    edge?: [number, number] | null;
  },
  opts: {
    root?: number;
    annotate?: Record<number, string>;
    tone?: Record<number, number>;
    layout?: "auto" | "tree" | "force" | "circle";
    /** 从图创建导入：按保存的 layout+manual 精确定位（与图创建所见一致） */
    import?: ImportedGraph | null;
    /** MST 已选边（Prim 的 T 边 / Kruskal accepted）：绿色加粗 */
    picked?: Array<[number, number]>;
  } = {},
): GraphCanvasScene {
  const root = opts.root ?? 0;
  const center = {
    x: GRAPH_BOX.x0 + GRAPH_BOX.w / 2,
    y: GRAPH_BOX.y0 + GRAPH_BOX.h / 2,
  };
  const isTree = g.isTree();
  let pos: Vec2[];
  const imp = opts.import;
  if (imp && imp.layout) {
    // 复刻 GraphStudio：tree→layoutTree / circle·free→layoutCircle（力导向已下线，旧存档 force 按环形），手动位置覆盖
    const layout = (imp.layout as string) === "force" ? "circle" : imp.layout;
    if (layout === "tree")
      pos = g.layoutTree(root, {
        x0: 20,
        y0: 10,
        w: 720,
        h: 420,
      }).pos;
    else
      pos = g.layoutCircle(380, 220, 174);
    if (imp.manual) {
      pos = pos.map((p, i) => imp.manual![i] ?? p);
    }
  } else {
    const layout = opts.layout ?? "auto";
    if (layout === "tree" || (layout === "auto" && isTree))
      pos = g.layoutTree(root, GRAPH_BOX).pos;
    else
      pos = g.layoutCircle(
        center.x,
        center.y,
        Math.min(GRAPH_BOX.w, GRAPH_BOX.h) / 2 - 50,
      );
  }
  const nodes = Array.from({ length: g.n }, (_, i) => ({
    id: i,
    label: g.labels[i] ?? String(i),
    x: pos[i]?.x ?? 0,
    y: pos[i]?.y ?? 0,
  }));
  const edges = g.edges.map((e) => ({
    u: e.u,
    v: e.v,
    weight: e.weight,
  }));
  return {
    current: hl.current ?? null,
    exploring: hl.exploring ?? null,
    visited: hl.visited ?? [],
    frontier: hl.frontier ?? [],
    order: hl.order ?? [],
    edge: hl.edge ?? null,
    nodes,
    edges,
    directed: g.directed,
    root: isTree ? root : null,
    annotate: opts.annotate,
    ...(opts.tone ? { tone: opts.tone } : {}),
    ...(opts.picked && opts.picked.length ? { picked: opts.picked } : {}),
  };
}

/**
 * "从图创建导入" 的预览帧：与 tree/source 一致
 *  - 未确认且有效 → 虚化预览（点击画布导入）
 *  - 未确认但无效 → 原样显示 + 原因 + 去图创建
 *  - 有效且已确认 → null（走正常动画帧）
 */
export function importPreviewFrames(
  cfg: GraphCfg,
): Frame<GraphCanvasScene>[] | null {
  if (cfg.source !== "graph") return null;
  const scene = graphScene(
    fromImport(cfg.imp).g,
    {},
    { root: cfg.root, ...(cfg.source === "graph" ? { import: cfg.imp } : {}) },
  );
  if (!cfg.imp || cfg.imp.n <= 0) return null; // 图创建为空 → 走正常帧的“请先保存”提示
  const ok = cfg.imp.n > 0;
  if (!cfg.confirmed && ok) {
    return [
      {
        line: 0,
        caption: T(
          "已载入「图创建」里保存的图（虚化预览）：点击画布导入后即可播放动画",
          "Loaded your saved Graph Studio graph (blurred): click the canvas to import, then play",
        ),
        scene: { ...scene, blurred: true },
      },
    ];
  }
  const res = fromImport(cfg.imp);
  if (!res.ok) {
    return [
      {
        line: 0,
        caption: T(
          res.error ?? "图不符合当前要求",
          res.error ?? "graph does not meet the requirement",
        ),
        scene: { ...scene, error: res.error ?? "图不符合当前要求" },
      },
    ];
  }
  return null;
}

/** 构建算法帧带的状态数组面板：邻接表（含权重）+ 邻接矩阵（内存布局形态）+ 按顶点分列的值表（dist/prev/key…）
 *  每个算法帧把快照放进 scene.stateTables，GraphCanvasWrap 会渲染在画布下方。
 *  - adjText：(u)=>u 的邻接串（含权重，如 “B(5), C(2)”）；缺省自动从 g 生成
 *  - matrix：邻接矩阵（每行每顶点一格：∞ / 0 / 权重），“内存布局”形态
 *  - arrays：顶点对齐数值行，如 [{ name: "dist", values, hl }] */
export function algoStateTables(opts: {
  labels: string[];      // 顶点标签
  adjText?: (u: number) => string; // 每顶点邻接串（如 “B(5), C(2)”）；缺省自动生成
  /** 邻接矩阵（内存布局形态）：n×n，∞ / 0 / 权重 */
  matrix?: (string | number)[][];
  /** 顶点对齐数组行，如 [{ name: "dist", values: [0,3,∞], hl: [3,1,0] }] */
  arrays?: { name: string; values: (number | string)[]; hl?: AlgoCellState[] }[];
}): AlgoTable[] {
  const tables: AlgoTable[] = [];
  const rows: AlgoStateRow[] = opts.labels.map((lab, u) => ({
    name: lab,
    text: opts.adjText ? opts.adjText(u) : "—",
  }));
  tables.push({ title: "邻接", rows });
  // 邻接矩阵 = 内存布局形态（∞=无邻边，数字=权重）
  if (opts.matrix) {
    tables.push({
      title: "邻接矩阵",
      header: opts.labels,
      rows: opts.matrix.map((row, u) => ({
        name: opts.labels[u] ?? String(u),
        cells: row.map((v, c) =>
          typeof v === "number" && !Number.isFinite(v)
            ? "∞"
            : opts.labels[c] + "/" + (typeof v === "number" && !Number.isFinite(v) ? "∞" : v),
        ),
      })),
    });
  }
  if (opts.arrays && opts.arrays.length) {
    tables.push({
      title: "数值",
      header: opts.labels,
      rows: opts.arrays.map((a) => ({
        name: a.name,
        cells: a.values.map((v) =>
          typeof v === "number" && !Number.isFinite(v) ? "∞" : String(v),
        ),
        ...(a.hl ? { hl: a.hl } : {}),
      })),
    });
  }
  return tables;
}

/** 图模块共用画布：虚化预览（点击导入）· 无效图红色横幅（原因 + 去图创建） */
export function GraphCanvasWrap({
  scene,
  t,
  config,
  onChange,
  selected,
  onNodeClick,
}: {
  scene: GraphCanvasScene;
  t: (x: Text) => string;
  config?: GraphCfg;
  onChange?: (c: GraphCfg) => void;
  /** 当前被选中/定位节点 id（图：起点等，画紫色虚线环） */
  selected?: number | null;
  /** 点击顶点回调（虚化预览时由整张画布负责“点击导入”） */
  onNodeClick?: (id: number) => void;
}) {
  const isGraph = config?.source === "graph";
  const importing = scene.blurred && isGraph && !!config;
  return (
    <>
      <GraphCanvas
        scene={scene}
        t={t}
        selected={selected}
        onNodeClick={onNodeClick}
        hint={
          scene.blurred
            ? t(T("虚化预览 · 点击画布导入", "Blurred preview · click the canvas to import"))
            : undefined
        }
        onClick={
          importing ? () => onChange?.({ ...config, confirmed: true }) : undefined
        }
        notice={
          scene.error && isGraph ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{scene.error}</span>
              <a
                href="#/graph"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "#b91c1c",
                  background: "#fff",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                ✎ {t(T("去图创建修改", "Edit in Graph Studio"))}
              </a>
              <button
                className="ghost"
                style={{ color: "#b91c1c", borderColor: "#fecaca", padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}
                onClick={() => {
                  const imp = loadGraph();
                  onChange?.({ ...config, source: "graph", imp, confirmed: !!imp });
                }}
              >
                ↻ {t(T("重新载入", "Reload"))}
              </button>
            </div>
          ) : undefined
        }
      />
      {/* 存储数组面板：邻接表 + dist/prev/key/uf 等，随帧刷新 */}
      <StateBar tables={scene.stateTables} />
    </>
  );
}

/** 共享的「图的来源」控件：来源下拉 + 「从图编辑中导入」「随机生成」两按钮 + 随机参数（顶点数/密度/有向/加权/连通） */
export function GraphSourcePanel({
  cfg,
  onChange,
  t,
  constraints,
}: {
  cfg: GraphCfg;
  onChange: (c: GraphCfg) => void;
  t: (x: Text) => string;
  constraints?: { mustBeDirected?: boolean; mustBeTree?: boolean; hint?: string };
}) {
  const isZh = t(T("中文", "en")) !== "en";
  const [err, setErr] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const importGraph = (confirm: boolean) => {
    const imp = loadGraph();
    if (!imp) {
      setErr(isZh ? "图创建里还没有可导入的图" : "No graph saved in Graph Studio");
      return;
    }
    setErr(null);
    onChange({ ...cfg, source: "graph", imp, confirmed: confirm });
  };
  const random = () =>
    onChange({ ...randomCfg(cfg) });
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: ".04em" }}>
        {isZh ? "来源" : "SRC"}
      </span>
      <button className="ghost" onClick={() => importGraph(false)} title={isZh ? "先虚影预览，点击画布再确认导入" : "Preview then click canvas to confirm"}>
        ⤓ {t(T("从图创建导入", "Import graph"))}
      </button>
      <button className="ghost" onClick={() => setEditorOpen(true)} title={isZh ? "在当前页直接编辑图，无需跳转" : "Edit graph in place"}>
        ✎ {t(T("在当前页编辑", "Edit here"))}
      </button>
      <button className="ghost" onClick={random} title={isZh ? "随机生成一张新图" : "Generate a random graph"}>
        ↻ {t(T("随机生成", "Randomize"))}
      </button>
      {cfg.source === "graph" && cfg.imp && (
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {cfg.imp.n} 顶点 · {cfg.imp.spec}
        </span>
      )}
      {err && <span style={{ fontSize: 11, color: "#dc2626" }}>{err}</span>}
      {editorOpen && (
        <GraphEditorModal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          initialGraph={cfg.source === "graph" && cfg.imp ? cfg.imp : (() => { try { const raw = localStorage.getItem("graph-studio:last"); if (raw) { const s = JSON.parse(raw); return { n: s.n, spec: s.edgeSpec, labels: s.labels, directed: !!s.directed, root: s.root ?? 0, layout: s.layout, manual: s.manual }; } } catch {} return null; })()}
          constraints={constraints}
          onConfirm={(g) => onChange({ ...cfg, source: "graph", imp: g, confirmed: true })}
          title={isZh ? "图编辑器 · 当前算法" : "Graph Editor"}
        />
      )}
    </div>
  );
}