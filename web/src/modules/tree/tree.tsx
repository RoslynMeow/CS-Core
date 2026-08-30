import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  treeTraverseSteps,
  levelOrderSteps,
  bstSearchSteps,
  bstInsertSteps,
  bstDeleteSteps,
  avlInsertSteps,
  heapInsertSteps,
  heapDeleteTopSteps,
  heapBuildSteps,
  heapSortSteps,
  LEVEL_CODE,
  BST_SEARCH_CODE,
  BST_INSERT_CODE,
  BST_DELETE_CODE,
  AVL_CODE,
  HEAP_INSERT_CODE,
  HEAP_DELETE_CODE,
  HEAP_BUILD_CODE,
  HEAP_SORT_CODE,
  type AlgoStep,
  type BstStep,
  type HeapStep,
} from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import {
  resolveTree,
  SourcePanel,
  randSeq,
  binScene,
  importPreviewFrames,
  TreeCanvas,
  type TreeCfg,
} from "./source";

type Group = "traverse" | "bst" | "avl" | "heap";
type Mode =
  | "pre"
  | "in"
  | "post"
  | "level"
  | "search"
  | "insert"
  | "delete"
  | "avl"
  | "heap-build"
  | "heap-insert"
  | "heap-delete"
  | "heap-sort";
type Cfg = TreeCfg & { group: Group; mode: Mode; target: number; x: number };
const DEFAULT: Cfg = {
  source: "random",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
  group: "traverse",
  mode: "pre",
  target: 3,
  x: 5,
};

// 每模式完整伪代码（数学形式；codeFor 按所选模式返回，行号与库步进对齐）
const CODE: Record<Mode, Text[]> = {
  pre: [
    T("$visit(u)$  // 前序", "$visit(u)$  // preorder"),
    T("$F(u_L)$  // 左", "$F(u_L)$  // left"),
    T("$F(u_R)$  // 右", "$F(u_R)$  // right"),
  ],
  in: [
    T("$F(u_L)$  // 左", "$F(u_L)$  // left"),
    T("$visit(u)$  // 中序", "$visit(u)$  // inorder"),
    T("$F(u_R)$  // 右", "$F(u_R)$  // right"),
  ],
  post: [
    T("$F(u_L)$  // 左", "$F(u_L)$  // left"),
    T("$F(u_R)$  // 右", "$F(u_R)$  // right"),
    T("$visit(u)$  // 后序", "$visit(u)$  // postorder"),
  ],
  level: LEVEL_CODE as unknown as Text[],
  search: BST_SEARCH_CODE as unknown as Text[],
  insert: BST_INSERT_CODE as unknown as Text[],
  delete: BST_DELETE_CODE as unknown as Text[],
  avl: AVL_CODE as unknown as Text[],
  "heap-build": HEAP_BUILD_CODE as unknown as Text[],
  "heap-insert": HEAP_INSERT_CODE as unknown as Text[],
  "heap-delete": HEAP_DELETE_CODE as unknown as Text[],
  "heap-sort": HEAP_SORT_CODE as unknown as Text[],
};

const TRAVERSE_MODES: Mode[] = ["pre", "in", "post", "level"];
const BST_MODES: Mode[] = ["search", "insert", "delete"];
const HEAP_MODES: Mode[] = [
  "heap-build",
  "heap-insert",
  "heap-delete",
  "heap-sort",
];
const modeOf = (g: Group, i: number) =>
  g === "traverse"
    ? TRAVERSE_MODES[i]
    : g === "bst"
      ? BST_MODES[i]
      : g === "avl"
        ? "avl"
        : HEAP_MODES[i];

// 堆：数组快照 → 完全二叉树场景（annotate = 数组下标）
function heapScene(
  v: number[],
  a: number | null,
  b: number | null,
): GraphCanvasScene {
  const nodes = v.map((val, i) => ({
    id: i,
    val,
    left: 2 * i + 1 < v.length ? 2 * i + 1 : null,
    right: 2 * i + 2 < v.length ? 2 * i + 2 : null,
  }));
  const ann: Record<number, string> = {};
  v.forEach((_, i) => (ann[i] = String(i)));
  return binScene(nodes, { current: a, exploring: b }, 0, ann);
}

const EMPTY: GraphCanvasScene = {
  current: null,
  exploring: null,
  visited: [],
  frontier: [],
  order: [],
  edge: null,
  nodes: [],
  edges: [],
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const isHeap = cfg.group === "heap";
  const opts = {
    requireComplete: isHeap,
    requireNumeric: cfg.group !== "traverse",
  };
  const pv = importPreviewFrames(cfg, opts);
  if (pv) return pv;
  const res = resolveTree(cfg, opts);
  if (!res.ok || res.nodes.length === 0) {
    const cap = T(
      res.error ?? "空树 / 请选择来源",
      res.error ?? "empty / pick a source",
    );
    return [
      {
        line: 0,
        caption: cap,
        scene: {
          ...EMPTY,
          ...(cfg.source === "graph" ? { error: res.error ?? "" } : {}),
        },
      },
    ];
  }
  const { g, labels, values, nodes } = res;

  // 遍历（前/中/后/层序）：AlgoStep 场景
  if (cfg.group === "traverse") {
    const steps: AlgoStep[] =
      cfg.mode === "level"
        ? levelOrderSteps(g, 0, labels)
        : treeTraverseSteps(g, cfg.mode as "pre" | "in" | "post", 0, labels);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: binScene(nodes, {
        current: s.current,
        exploring: s.exploring,
        visited: s.visited,
        frontier: s.frontier,
        order: s.order,
        edge: s.edge,
      }),
    }));
  }

  // BST / AVL：BstStep 场景（树快照逐帧变化）
  if (cfg.group === "bst" || cfg.group === "avl") {
    let steps: BstStep[];
    if (cfg.group === "avl") steps = avlInsertSteps(values);
    else if (cfg.mode === "search") steps = bstSearchSteps(values, cfg.target);
    else if (cfg.mode === "insert") steps = bstInsertSteps(values);
    else steps = bstDeleteSteps(values, cfg.target);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: binScene(s.nodes, { current: s.focus, edge: s.edge }, s.root),
    }));
  }

  // 堆：HeapStep 场景（完全二叉树，下标注释）
  let steps: HeapStep[];
  if (cfg.mode === "heap-build") steps = heapBuildSteps(values);
  else if (cfg.mode === "heap-insert") steps = heapInsertSteps(values, cfg.x);
  else if (cfg.mode === "heap-delete") steps = heapDeleteTopSteps(values);
  else steps = heapSortSteps(values);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: heapScene(s.values, s.a, s.b),
  }));
}

export const binaryTreeModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree",
  title: T("二叉树", "Binary Tree"),
  desc: T(
    "遍历(前/中/后/层序) · 二叉搜索树 · AVL · 二叉堆；树可随机生成或从图创建导入(须为二叉树/完全二叉树)",
    "traverse · BST · AVL · heap; random or imported binary tree",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq() };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const opts: { v: Group; zh: string; en: string }[] = [
      { v: "traverse", zh: "遍历", en: "Traverse" },
      { v: "bst", zh: "查找树 BST", en: "BST" },
      { v: "avl", zh: "平衡树 AVL", en: "AVL" },
      { v: "heap", zh: "二叉堆 Heap", en: "Heap" },
    ];
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <SourcePanel
          cfg={config}
          onChange={(c) => onChange({ ...config, ...c })}
          t={t}
          requireComplete={config.group === "heap"}
        />
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
            {isZh ? "类别" : "GROUP"}
          </span>
          <select
            className="txt"
            value={config.group}
            onChange={(e) =>
              onChange({
                ...config,
                group: e.target.value as Group,
                mode: modeOf(e.target.value as Group, 0),
              })
            }
          >
            {opts.map((o) => (
              <option key={o.v} value={o.v}>
                {t(T(o.zh, o.en))}
              </option>
            ))}
          </select>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#4338ca",
              letterSpacing: ".04em",
            }}
          >
            {isZh ? "模式" : "MODE"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            {config.group === "traverse" &&
              [
                ["pre", "前序", "Preorder"],
                ["in", "中序", "Inorder"],
                ["post", "后序", "Postorder"],
                ["level", "层序", "Level"],
              ].map(([v, z, e]) => (
                <option key={v} value={v}>
                  {t(T(z, e))}
                </option>
              ))}
            {config.group === "bst" &&
              [
                ["search", "查找", "Search"],
                ["insert", "插入", "Insert"],
                ["delete", "删除", "Delete"],
              ].map(([v, z, e]) => (
                <option key={v} value={v}>
                  {t(T(z, e))}
                </option>
              ))}
            {config.group === "avl" && (
              <option value="avl">{t(T("插入", "Insert"))}</option>
            )}
            {config.group === "heap" &&
              [
                ["heap-build", "建堆", "Build"],
                ["heap-insert", "上滤插入", "Insert"],
                ["heap-delete", "删顶下滤", "Delete top"],
                ["heap-sort", "堆排序", "Sort"],
              ].map(([v, z, e]) => (
                <option key={v} value={v}>
                  {t(T(z, e))}
                </option>
              ))}
          </select>
          {(config.mode === "search" || config.mode === "delete") && (
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span>
                {config.mode === "search"
                  ? t(T("目标", "Target"))
                  : t(T("删值", "Key"))}
              </span>
              <input
                className="txt"
                type="number"
                style={{ width: 56 }}
                value={config.target}
                onChange={(e) =>
                  onChange({ ...config, target: Number(e.target.value) })
                }
              />
            </label>
          )}
          {config.mode === "heap-insert" && (
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span>{t(T("插值", "Value"))}</span>
              <input
                className="txt"
                type="number"
                style={{ width: 56 }}
                value={config.x}
                onChange={(e) =>
                  onChange({ ...config, x: Number(e.target.value) })
                }
              />
            </label>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    return CODE[cfg.mode];
  },
  generate(config) {
    return buildFrames(config);
  },
  Render({ scene, t, config, onChange }) {
    return (
      <TreeCanvas scene={scene} t={t} config={config} onChange={onChange} />
    );
  },
};
