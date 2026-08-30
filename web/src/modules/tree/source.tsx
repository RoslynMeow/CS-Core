import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import type { Frame } from "../../engine/types";
import {
  Graph,
  bstFromValues,
  completeTree,
  binToGraph,
  binBf,
  type BinNode,
  type TreeSnap,
  type Vec2,
} from "../../lib/graph";
import {
  GraphCanvas,
  type GraphCanvasScene,
} from "../../components/canvas/GraphCanvas";

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
  /** 当前 imp 是否已被用户确认导入（未确认时画布虚化预览，点击画布确认） */
  confirmed: boolean;
  /** 工作版本：用户在页面内插入/删除/重建后的树快照（null=未修改，随来源派生）
   *  方案A：修改后记为新版本；「导入当前图」覆盖回原图（置 null） */
  work?: TreeSnap | null;
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

/** 图创建快照 → 原始图形场景（不做树校验，无效图也能显示并说明原因） */
export function impScene(imp: ImportedGraph | null): GraphCanvasScene | null {
  if (!imp || imp.n <= 0) return null;
  const g = new Graph(imp.n, { directed: imp.directed, labels: imp.labels });
  const r = g.fromSpec(imp.spec);
  if (!r.ok) return null;
  const root = imp.root >= 0 && imp.root < imp.n ? imp.root : 0;
  const isTree = g.isTree();
  const pos = isTree
    ? g.layoutTree(root, TREE_BOX).pos
    : g.layoutCircle(
        TREE_BOX.x0 + TREE_BOX.w / 2,
        TREE_BOX.y0 + TREE_BOX.h / 2,
        Math.min(TREE_BOX.w, TREE_BOX.h) / 2 - 46,
      );
  return {
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    root: isTree ? root : null,
    directed: imp.directed,
    nodes: Array.from({ length: imp.n }, (_, i) => ({
      id: i,
      label: imp.labels[i] ?? String(i),
      x: pos[i]?.x ?? 0,
      y: pos[i]?.y ?? 0,
    })),
    edges: g.edges.map((e) => ({ u: e.u, v: e.v, weight: e.weight })),
  };
}

/**
 * "从图创建导入" 的预览帧：
 * - 未确认且有效 → 虚化预览（点击画布导入）
 * - 未确认但无效 → 原样显示 + 原因 + 去图创建（不虚化，避免误导入）
 * - 已确认但无效 → 原样显示 + 原因 + 去图创建
 * - 有效且已确认 → null（走正常动画帧）
 */
export function importPreviewFrames(
  cfg: TreeCfg,
  opts: { requireComplete?: boolean; requireNumeric?: boolean } = {},
): Frame<GraphCanvasScene>[] | null {
  if (cfg.source !== "graph") return null;
  const scene = impScene(cfg.imp);
  if (!scene) return null; // 图创建为空 → 走 resolveTree 的“请先保存一张图”提示
  const r = resolveTree(cfg, opts);
  const ok = r.ok && r.nodes.length > 0;
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
  if (!ok) {
    return [
      {
        line: 0,
        caption: T(
          r.error ?? "图不符合当前要求",
          r.error ?? "graph does not meet the requirement",
        ),
        scene: { ...scene, error: r.error ?? "图不符合当前要求" },
      },
    ];
  }
  return null;
}

/** 二叉树模块共用画布：虚化预览（点击导入）· 无效图红色横幅（原因 + 去图创建） */
export function TreeCanvas<C extends TreeCfg>({
  scene,
  t,
  config,
  onChange,
}: {
  scene: GraphCanvasScene;
  t: (x: Text) => string;
  config?: C;
  onChange?: (c: C) => void;
}) {
  const isGraph = config?.source === "graph";
  const importing = scene.blurred && isGraph && !!config;
  return (
    <GraphCanvas
      scene={scene}
      hint={
        scene.blurred
          ? t(
              T(
                "虚化预览 · 点击画布导入",
                "Blurred preview · click the canvas to import",
              ),
            )
          : undefined
      }
      onClick={
        importing ? () => onChange?.({ ...config, confirmed: true }) : undefined
      }
      notice={
        scene.error && isGraph ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
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
              style={{
                color: "#b91c1c",
                borderColor: "#fecaca",
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
              }}
              onClick={() => {
                const imp = loadGraphStudio();
                onChange?.({
                  ...config,
                  source: "graph",
                  imp,
                  confirmed: !!imp,
                  work: null,
                });
              }}
            >
              ↻ {t(T("重新载入", "Reload"))}
            </button>
          </div>
        ) : scene.warn ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              color: "#92400e",
              padding: "8px 14px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              maxWidth: "92%",
            }}
          >
            ⚠ {t(scene.warn)}
          </div>
        ) : undefined
      }
    />
  );
}

/** 共享的「树的来源」控件：一行式 — 来源下拉 + 「从图编辑中导入」「随机生成」两按钮
 *  不再提供节点值手动输入（随机生成即可）；默认来源为「从图导入」 */
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
  const importGraph = (confirm: boolean) => {
    const imp = loadGraphStudio();
    if (!imp) {
      setErr(
        isZh ? "图创建里还没有可导入的图" : "No graph saved in Graph Studio",
      );
      return;
    }
    setErr(null);
    // 导入覆盖用户修改：work 置 null 回到原图版本
    onChange({ ...cfg, source: "graph", imp, confirmed: confirm, work: null });
  };
  const random = () =>
    onChange({
      ...cfg,
      source: "random",
      values: randSeq(),
      confirmed: true,
      work: null,
    });
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
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
        {isZh ? "来源" : "SRC"}
      </span>
      <select
        className="txt"
        value={cfg.source}
        onChange={(e) => {
          const v = e.target.value as TreeCfg["source"];
          if (v === "graph") {
            // 选择即载入图创建里的图（未确认 → 画布虚化预览，点击画布导入）；无图则提示
            importGraph(false);
          } else {
            random();
          }
        }}
      >
        <option value="graph">
          {t(T("从图创建导入", "From Graph Studio"))}
        </option>
        <option value="random">{t(T("随机生成", "Random"))}</option>
      </select>
      <button
        className="ghost"
        onClick={() => importGraph(true)}
        title={isZh ? "立即导入图创建里保存的图" : "Import saved graph now"}
      >
        ⤓ {t(T("从图编辑中导入", "Import graph"))}
      </button>
      <button
        className="ghost"
        onClick={random}
        title={isZh ? "随机生成一棵新树" : "Generate a random tree"}
      >
        ↻ {t(T("随机生成", "Randomize"))}
      </button>
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
      {err && <span style={{ fontSize: 11, color: "#dc2626" }}>{err}</span>}
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

/** AVL 平衡因子标注：node id → bf 字符串（+1 / 0 / -1 …），画布节点下方小字 */
export function bfAnn(nodes: BinNode[]): Record<number, string> {
  const bf = binBf(nodes);
  const ann: Record<number, string> = {};
  for (let i = 0; i < bf.length; i++)
    ann[i] = bf[i] > 0 ? `+${bf[i]}` : String(bf[i]);
  return ann;
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
  // 单子节点修正：layoutTree 把独生子与父节点居中到同一横坐标 → 退化成竖直“直线”；
  // 这里按左右方向把独生子错开成“阶梯链”，退化链/偏斜树一眼可辨，普通单子节点也不再重叠
  if (nodes.length > 0) {
    const dep: number[] = Array(nodes.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      const l = nodes[i].left;
      const r = nodes[i].right;
      if (l !== null) dep[l] = dep[i] + 1;
      if (r !== null) dep[r] = dep[i] + 1;
    }
    const maxDep = Math.max(0, ...dep);
    const step = Math.min(
      52,
      Math.max(18, (TREE_BOX.w - 80) / Math.max(1, 2 * maxDep)),
    );
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i];
      const only = u.left === null ? u.right : u.right === null ? u.left : null;
      if (only !== null) {
        pos[only].x = pos[i].x + (u.left === only ? -step : step);
      }
    }
  }
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
