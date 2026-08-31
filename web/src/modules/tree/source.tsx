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
  type BstStep,
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
  selected,
  onNodeClick,
}: {
  scene: GraphCanvasScene;
  t: (x: Text) => string;
  config?: C;
  onChange?: (c: C) => void;
  /** 画布选中节点（右侧属性面板联动） */
  selected?: number | null;
  onNodeClick?: (id: number) => void;
}) {
  const isGraph = config?.source === "graph";
  const importing = scene.blurred && isGraph && !!config;
  return (
    <GraphCanvas
      scene={scene}
      onNodeClick={onNodeClick}
      selected={selected}
      t={t}
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

/** 布局：BinNode 树 → 节点坐标（含单子节点“阶梯链”修正），box 为画布区域 */
export function treePositions(
  nodes: BinNode[],
  root: number,
  box: { x0: number; y0: number; w: number; h: number },
): Vec2[] {
  const g = binToGraph(nodes);
  const pos = g.layoutTree(root, box).pos;
  // 单子节点修正：layoutTree 把独生子与父节点居中到同一横坐标 → 退化成竖直“直线”；
  // 这里按左右方向把独生子连同其整棵子树错开成“阶梯链”，退化链/偏斜树一眼可辨，
  // 普通单子节点也不再重叠；整棵子树一起平移 → 父节点仍居中于子树中心，不会出现
  // “独生子被甩开、子树残留在原位”的歪斜（子树整体相对几何不变）
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
      Math.max(18, (box.w - 80) / Math.max(1, 2 * maxDep)),
    );
    // 收集 u 的整棵子树（含 u 自身）的节点 id
    const subTree = (u: number): number[] => {
      const out: number[] = [];
      const st = [u];
      while (st.length) {
        const v = st.pop()!;
        out.push(v);
        if (nodes[v].left !== null) st.push(nodes[v].left);
        if (nodes[v].right !== null) st.push(nodes[v].right);
      }
      return out;
    };
    for (let i = 0; i < nodes.length; i++) {
      const u = nodes[i];
      const only = u.left === null ? u.right : u.right === null ? u.left : null;
      if (only !== null) {
        const dir = u.left === only ? -1 : 1;
        const target = pos[i].x + dir * step;
        const delta = target - pos[only].x;
        for (const v of subTree(only)) pos[v].x += delta;
      }
    }
  }
  return pos;
}

/** 双面板建树（AVL/BST）画布分区：左=随机生成的输入树，右=正在建立的树 */
export const DUAL_PANEL = {
  left: { x0: 16, y0: 40, w: 352, h: 384 },
  right: { x0: 392, y0: 40, w: 352, h: 384 },
};
/** 左面板（输入树）节点 id 偏移：与右面板（目标树）id 空间隔离 */
export const SRC_OFF = 2000;

/** 双面板场景：左=输入树（已插入的拆成空心，下一个蓝色高亮），
 *  右=正在建立的树（新节点从输入树位置“飞”过来 + 流动光束）
 *  - consumed：已从输入树拆走的节点数（左面板前 consumed 个空心）
 *  - next：输入树中“即将插入”的节点（蓝色高亮，null=全部插完）
 *  - fly / flyFrom：本轮刚“拆”到目标树的节点 id 及其输入树坐标（飞入动画起点） */
export function dualBuildScene(opts: {
  src: BinNode[];
  nodes: BinNode[];
  root: number;
  focus: number | null;
  edge: [number, number] | null;
  consumed: number;
  next: number | null;
  fly: number | null;
  flyFrom: Vec2 | null;
  appeared: boolean;
  annotate?: Record<number, string>;
  titleR: Text;
  titleL?: Text;
  warn?: Text;
}): GraphCanvasScene {
  const srcPos = treePositions(opts.src, 0, DUAL_PANEL.left);
  const pos = treePositions(opts.nodes, opts.root, DUAL_PANEL.right);
  const nodes: GraphCanvasScene["nodes"] = [];
  for (let i = 0; i < opts.src.length; i++) {
    nodes.push({
      id: SRC_OFF + i,
      label: String(opts.src[i].val),
      x: srcPos[i]?.x ?? 0,
      y: srcPos[i]?.y ?? 0,
      hollow: i < opts.consumed,
    });
  }
  for (let i = 0; i < opts.nodes.length; i++) {
    nodes.push({
      id: i,
      label: String(opts.nodes[i].val),
      x: pos[i]?.x ?? 0,
      y: pos[i]?.y ?? 0,
      fly:
        opts.fly === i && opts.flyFrom !== null
          ? { x: opts.flyFrom.x, y: opts.flyFrom.y }
          : undefined,
    });
  }
  const edges: { u: number; v: number; beam?: boolean }[] = [];
  for (let i = 0; i < opts.nodes.length; i++) {
    const n = opts.nodes[i];
    if (n.left !== null) edges.push({ u: i, v: n.left });
    if (n.right !== null) edges.push({ u: i, v: n.right });
  }
  // 光束：左面板被拆节点 → 右面板新节点（流动虚线，体现“拆过去”)
  if (opts.fly !== null && opts.fly >= 0 && opts.flyFrom !== null) {
    edges.push({ u: SRC_OFF + opts.fly, v: opts.fly, beam: true });
  }
  return {
    current: opts.appeared && opts.fly !== null ? opts.fly : opts.focus,
    exploring: null,
    visited: [],
    frontier:
      opts.next !== null && opts.next >= 0 && opts.next < opts.src.length
        ? [SRC_OFF + opts.next]
        : [],
    order: [],
    edge: opts.edge,
    nodes,
    edges,
    root: opts.root,
    directed: false,
    annotate: opts.annotate,
    ...(opts.warn ? { warn: opts.warn } : {}),
    panel: {
      left:
        opts.titleL ?? {
          zh: "随机生成的树 · 输入",
          en: "Random tree · input",
        },
      right: opts.titleR,
    },
  };
}

/** 建树双面板帧序列：左=随机生成的输入树（已插入节点逐颗“拆走”、下一个高亮），
 *  右=正在建立的 AVL/BST 树（新节点带飞入动画 + 光束飞过来）
 *  关键：bstInsertSteps / avlInsertSteps 的节点 id = 插入顺序（0,1,2,…），
 *  且 bstFromValues(values) 也是同样 id → 左面板 SRC_OFF+i 与右面板 i 是同一个值 */
export function buildDualFrames(
  steps: BstStep[],
  values: number[],
  src: BinNode[],
  titleR: Text,
  annotate?: (nodes: BinNode[]) => Record<number, string>,
  titleL?: Text,
): Frame<GraphCanvasScene>[] {
  const srcPos = treePositions(src, 0, DUAL_PANEL.left);
  let inserted = 0;
  let inPost = false; // 处于“刚插完、正在做后续处理（平衡检查/旋转）”阶段 → 光束指向该节点
  return steps.map((s) => {
    const phaseStart = s.line === 0 && s.focus === null;
    if (phaseStart || s.line === 7) inPost = false; // 新值宣布 / 完成 → 关闭光束
    const appeared = s.visible > inserted;
    if (appeared) {
      inserted = s.visible;
      inPost = true;
    }
    const flyId = inPost && inserted > 0 ? inserted - 1 : null; // 本轮刚插入的节点
    return {
      line: s.line,
      caption: s.msg,
      scene: dualBuildScene({
        src,
        nodes: s.nodes,
        root: s.root,
        focus: s.focus,
        edge: s.edge,
        consumed: s.visible,
        next: s.visible < values.length ? s.visible : null,
        fly: flyId,
        flyFrom:
          flyId !== null && flyId >= 0 && flyId < srcPos.length
            ? srcPos[flyId]
            : null,
        appeared,
        annotate: annotate ? annotate(s.nodes) : undefined,
        titleR,
        titleL,
      }),
    };
  });
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
  const pos = treePositions(nodes, root, TREE_BOX);
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
