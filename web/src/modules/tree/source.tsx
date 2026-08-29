import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import {
  Graph,
  bstFromValues,
  completeTree,
  binToGraph,
  type BinNode,
  type Vec2,
} from "../../lib/graph";

/** 从“图创建”页导入的快照（GraphStudio 持久化的图状态） */
export type ImportedGraph = {
  n: number;
  spec: string;
  labels: string[];
  directed: boolean;
  root: number;
};
/** 树的来源：随机生成 或 从图创建导入（导入需校验二叉树 / 完全二叉树） */
export type TreeCfg = {
  source: "random" | "graph";
  values: number[];
  imp: ImportedGraph | null;
};
/** 解析结果：统一为 BinNode[]（根=0, BFS 重编号）+ 布局 + 数字值 */
export type Resolved = {
  ok: boolean;
  error?: string;
  nodes: BinNode[];
  labels: string[];
  g: Graph;
  pos: Vec2[];
  values: number[];
  isComplete: boolean;
};

export const TREE_BOX = { x0: 30, y0: 24, w: 700, h: 400 };

function isCompleteNodes(nodes: BinNode[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const L = 2 * i + 1 < nodes.length ? 2 * i + 1 : null;
    const R = 2 * i + 2 < nodes.length ? 2 * i + 2 : null;
    if ((nodes[i].left ?? null) !== L) return false;
    if ((nodes[i].right ?? null) !== R) return false;
  }
  return true;
}

export function resolveTree(
  cfg: TreeCfg,
  opts: { requireComplete?: boolean; requireNumeric?: boolean } = {},
): Resolved {
  const err = (e: string): Resolved => ({
    ok: false,
    error: e,
    nodes: [],
    labels: [],
    g: new Graph(1),
    pos: [],
    values: [],
    isComplete: false,
  });
  if (cfg.source === "random") {
    if (cfg.values.length === 0)
      return {
        ok: true,
        error: undefined,
        nodes: [],
        labels: [],
        g: new Graph(1),
        pos: [],
        values: [],
        isComplete: false,
      };
    const nodes = opts.requireComplete
      ? completeTree(cfg.values)
      : bstFromValues(cfg.values);
    const labels = nodes.map((n) => String(n.val));
    const g = binToGraph(nodes);
    const pos = g.layoutTree(0, TREE_BOX).pos;
    const isComplete = isCompleteNodes(nodes);
    if (opts.requireComplete && !isComplete)
      return err("随机树不是完全二叉树（调整序列长度/顺序）");
    return {
      ok: true,
      nodes,
      labels,
      g,
      pos,
      values: nodes.map((n) => n.val),
      isComplete,
    };
  }
  // 从图创建导入：必须校验 树 →（可选）二叉树 →（可选）完全二叉树
  const imp = cfg.imp;
  if (!imp) return err("请先在“图创建”页保存一张图，再点“导入当前图”");
  const gr = new Graph(imp.n, { directed: imp.directed, labels: imp.labels });
  const r = gr.fromSpec(imp.spec);
  if (!r.ok) return err(r.error ?? "导入的边无法解析");
  if (!gr.isTree()) return err("导入的不是树：应有 n−1 条边且无环");
  if (gr.n === 1) {
    const g1 = binToGraph([
      { id: 0, val: Number(imp.labels[0] ?? 0), left: null, right: null },
    ]);
    return {
      ok: true,
      nodes: g1
        ? [{ id: 0, val: Number(imp.labels[0] ?? 0), left: null, right: null }]
        : [],
      labels: [imp.labels[0] ?? "0"],
      g: g1,
      pos: g1.layoutTree(0, TREE_BOX).pos,
      values: [Number(imp.labels[0] ?? 0)],
      isComplete: true,
    };
  }
  const root = imp.root >= 0 && imp.root < gr.n ? imp.root : 0;
  const { parent } = gr.bfs(root);
  const childs: number[][] = Array.from({ length: gr.n }, () => []);
  const order = gr.bfs(root).order;
  for (const v of order)
    if (v !== root && parent[v] !== -1) childs[parent[v]].push(v);
  if (childs.some((c) => c.length > 2))
    return err("不是二叉树：某顶点有超过 2 个子节点");
  const idOf = new Map(order.map((v, i) => [v, i]));
  const nodes = order.map((v, i) => {
    const L = childs[v][0],
      R2 = childs[v][1];
    return {
      id: i,
      val: Number(imp.labels[v]),
      left: L === undefined ? null : idOf.get(L)!,
      right: R2 === undefined ? null : idOf.get(R2)!,
    };
  });
  const isComplete = isCompleteNodes(nodes);
  if (opts.requireComplete && !isComplete)
    return err("不是完全二叉树（自左向右填满）");
  if (opts.requireNumeric && nodes.some((n) => !Number.isFinite(n.val)))
    return err("需要有数字标签（当前含非数字顶点）");
  const labels = order.map((v) => imp.labels[v]);
  const g = binToGraph(nodes);
  const pos = g.layoutTree(0, TREE_BOX).pos;
  return {
    ok: true,
    nodes,
    labels,
    g,
    pos,
    values: nodes.map((n) => n.val),
    isComplete,
  };
}

/** 读取“图创建”页最近保存的图快照（localStorage） */
export function loadGraphStudio(): ImportedGraph | null {
  try {
    const raw = localStorage.getItem("graph-studio:last");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.n !== "number" || typeof s.edgeSpec !== "string") return null;
    return {
      n: s.n,
      spec: s.edgeSpec,
      labels: Array.isArray(s.labels)
        ? s.labels
        : Array.from({ length: s.n }, (_, i) => String(i)),
      directed: !!s.directed,
      root: typeof s.root === "number" ? s.root : 0,
    };
  } catch {
    return null;
  }
}

/** 共享的「树的来源」控件：随机生成 / 从图创建导入（含校验提示） */
export function SourcePanel({
  cfg,
  onChange,
  t,
  requireComplete,
}: {
  cfg: TreeCfg;
  onChange: (c: TreeCfg) => void;
  t: (x: Text) => string;
  requireComplete?: boolean;
}) {
  const isZh = t(T("中文", "en")) !== "en";
  const [err, setErr] = useState<string | null>(null);
  const importGraph = () => {
    const imp = loadGraphStudio();
    if (!imp) {
      setErr(isZh ? "图创建里还没有可导入的图" : "No graph in studio");
      return;
    }
    setErr(null);
    onChange({ ...cfg, source: "graph", imp });
  };
  const rows: React.ReactNode[] = [
    <div
      key="src"
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
        {isZh ? "树的来源" : "SOURCE"}
      </span>
      <label
        style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
      >
        <select
          className="txt"
          value={cfg.source}
          onChange={(e) =>
            onChange({ ...cfg, source: e.target.value as TreeCfg["source"] })
          }
        >
          <option value="random">{t(T("随机生成", "Random"))}</option>
          <option value="graph">
            {t(T("从图创建导入", "Import from Graph Studio"))}
          </option>
        </select>
      </label>
      {cfg.source === "graph" && (
        <button className="ghost" onClick={importGraph}>
          ⤓ {t(T("导入当前图", "Import now"))}
        </button>
      )}
      {requireComplete && (
        <span style={{ fontSize: 11, color: "#b45309" }}>
          {t(T("需完全二叉树", "needs complete tree"))}
        </span>
      )}
      {cfg.source === "graph" && cfg.imp && (
        <span style={{ fontSize: 11, color: "#64748b" }}>
          {cfg.imp.n} 顶点 · {cfg.imp.spec}
        </span>
      )}
    </div>,
  ];
  if (cfg.source === "random") {
    rows.push(
      <div
        key="vals"
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
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#475569",
            letterSpacing: ".04em",
          }}
        >
          {isZh ? "参数" : "PARAMS"}
        </span>
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <span>{t(T("节点值", "Values"))}</span>
          <input
            className="txt"
            value={cfg.values.join(",")}
            onChange={(e) =>
              onChange({
                ...cfg,
                values: e.target.value
                  .split(/[,，\s]+/)
                  .map(Number)
                  .filter(Number.isFinite),
              })
            }
            style={{ width: 160 }}
          />
        </label>
        <button
          className="ghost"
          onClick={() => onChange({ ...cfg, values: randSeq() })}
        >
          ↻ {t(T("重新生成", "Regenerate"))}
        </button>
        <button
          className="ghost"
          onClick={() => onChange({ ...cfg, values: [] })}
        >
          {t(T("清空", "Clear"))}
        </button>
      </div>,
    );
  }
  return (
    <div style={{ display: "grid", gap: 8, width: "100%" }}>
      {rows}
      {err && (
        <div
          style={{
            color: "#dc2626",
            fontSize: 12,
            padding: "6px 10px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 10,
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}

export function randSeq(len = 5 + Math.floor(Math.random() * 4)): number[] {
  const pool = Array.from({ length: 15 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, len);
}

/** 场景辅助：BinNode 快照 → GraphCanvasScene（供 BstStep / 静态树通用） */
export function binScene(
  nodes: BinNode[],
  hl: {
    current?: number | null;
    exploring?: number | null;
    visited?: number[];
    frontier?: number[];
    edge?: [number, number] | null;
    order?: number[];
  },
  root = 0,
  annotate?: Record<number, string>,
) {
  const g = binToGraph(nodes);
  const pos = g.layoutTree(root, TREE_BOX).pos;
  const edges = nodes.flatMap((n, i) => [
    ...(n.left === null ? [] : [{ u: i, v: n.left }]),
    ...(n.right === null ? [] : [{ u: i, v: n.right }]),
  ]);
  return {
    recent: null,
    current: hl.current ?? null,
    exploring: hl.exploring ?? null,
    visited: hl.visited ?? [],
    frontier: hl.frontier ?? [],
    order: hl.order ?? [],
    edge: hl.edge ?? null,
    nodes: nodes.map((n, i) => ({
      id: i,
      label: String(n.val),
      x: pos[i]?.x ?? 0,
      y: pos[i]?.y ?? 0,
    })),
    edges,
    root,
    directed: false,
    annotate,
  };
}
