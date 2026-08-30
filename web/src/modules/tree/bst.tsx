import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bstFromValues,
  bstSearchOnTree,
  bstInsertOne,
  bstDeleteOnTree,
  bstInsertSteps,
  BST_SEARCH_CODE,
  BST_INSERT_CODE,
  BST_DELETE_CODE,
  type BstStep,
  type TreeSnap,
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

type Mode = "view" | "search" | "build" | "insert" | "delete";
type Cfg = TreeCfg & { mode: Mode; target: number; x: number };
const DEFAULT: Cfg = {
  source: "graph",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
  mode: "build",
  target: 3,
  x: 5,
};

const VIEW_CODE: Text[] = [T("查看当前树", "view current tree")];
const CODE: Record<Mode, Text[]> = {
  view: VIEW_CODE,
  search: BST_SEARCH_CODE as unknown as Text[],
  build: BST_INSERT_CODE as unknown as Text[],
  insert: BST_INSERT_CODE as unknown as Text[],
  delete: BST_DELETE_CODE as unknown as Text[],
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg, {
    requireNumeric: true,
    requireComplete: false,
  });
  if (pv) return pv;
  const res = resolveTree(cfg, {
    requireNumeric: true,
    requireComplete: false,
  });
  if (!res.ok || res.values.length === 0) {
    const cap = T(
      res.error ?? "空树 / 请选择来源",
      res.error ?? "empty / pick a source",
    );
    return [
      {
        line: 0,
        caption: cap,
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
  const base: TreeSnap = cfg.work ?? { nodes: res.nodes, root: 0 };
  const built = !!cfg.work || cfg.source === "graph";
  // 建树 = 初始化：已建树（或图来源）时静态展示当前树（替代原「查看」）；旧存档 mode:"view" 同此
  if (cfg.mode === "build" && built) {
    return [
      {
        line: 0,
        caption: T(
          `当前树 · ${base.nodes.length} 节点 · 可选 查找/插入/删除（播完自动应用）`,
          `current tree · ${base.nodes.length} nodes · pick search/insert/delete`,
        ),
        scene: binScene(base.nodes, {}, base.root),
      },
    ];
  }
  if (cfg.mode === "view") {
    return [
      {
        line: 0,
        caption: T(
          `当前树 · ${base.nodes.length} 节点 · 可选 查找/插入/删除`,
          `current tree · ${base.nodes.length} nodes · pick search/insert/delete`,
        ),
        scene: binScene(base.nodes, {}, base.root),
      },
    ];
  }
  // 无建树（非图来源）：其余操作先提示建树
  if (!built && cfg.mode !== "build") {
    return [
      {
        line: 0,
        caption: T(
          "请先建树：默认「建树」播放结束即初始化完成",
          "Build first: play the default Build (init) first",
        ),
        scene: binScene(base.nodes, {}, base.root),
      },
    ];
  }
  let steps: BstStep[];
  if (cfg.mode === "search")
    steps = bstSearchOnTree(base.nodes, base.root, cfg.target);
  else if (cfg.mode === "build") steps = bstInsertSteps(res.values);
  else if (cfg.mode === "insert")
    steps = bstInsertOne(base.nodes, base.root, cfg.x).steps;
  else steps = bstDeleteOnTree(base.nodes, base.root, cfg.target).steps;
  const frames: Frame<GraphCanvasScene>[] = steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(s.nodes, { current: s.focus, edge: s.edge }, s.root),
  }));
  // 退化链（偏斜树）提示：值序列升序时逐点插入必然退化为单链，画布呈“直线”，查找退化为 O(n)
  if (
    frames.length > 0 &&
    frames[0].scene.nodes.length > 1 &&
    base.nodes.length === frames[0].scene.nodes.length &&
    base.nodes.every((n) => n.left === null || n.right === null)
  ) {
    frames[0] = {
      ...frames[0],
      scene: {
        ...frames[0].scene,
        warn: T(
          "退化链（偏斜树）：值升序 → 每次插入都挂最右，画布呈直线，查找退化为 $O(n)$",
          "Skew chain: ascending values hang rightmost each time → a line; search degrades to $O(n)$",
        ),
      },
    };
  }
  return frames;
}

/** 播完自动应用：建树/插入/删除 结束即把结果写入 work（新版本）并切回「建树」静态展示；
 *  不提供手动按钮；仅「从图编辑中导入」会把 work 置 null 覆盖回原图 */
function applyOnEnd(cfg: Cfg): Cfg | null {
  const r = resolveTree(cfg, {
    requireNumeric: true,
    requireComplete: false,
  });
  if (!r.ok || r.values.length === 0) return null;
  const base: TreeSnap = cfg.work ?? { nodes: r.nodes, root: 0 };
  let result: TreeSnap;
  if (cfg.mode === "build") {
    result = { nodes: bstFromValues(r.values), root: 0 };
  } else if (cfg.mode === "insert") {
    result = bstInsertOne(base.nodes, base.root, cfg.x).result;
  } else if (cfg.mode === "delete") {
    const out = bstDeleteOnTree(base.nodes, base.root, cfg.target);
    if (!out.result.nodes.length && cfg.target !== base.nodes[0].val)
      return null;
    result = out.result;
  } else return null;
  return { ...cfg, work: result, mode: "build" };
}

export const treeBstModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-bst",
  title: T("二叉搜索树 · BST", "Binary Search Tree"),
  desc: T(
    "建树（初始化）/ 查找 / 插入 / 删除；插入 = 往当前树加一个节点；播完自动应用为新版本（导入当前图可覆盖回原图）",
    "build (init) · search · insert · delete; insert adds a node to the current tree; auto-applies on play end (import to revert)",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq(), work: null };
  },
  onPlayEnd: applyOnEnd,
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
            {isZh ? "操作" : "OP"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="build">{t(T("建树", "Build"))}</option>
            <option value="search">{t(T("查找", "Search"))}</option>
            <option value="insert">{t(T("插入", "Insert"))}</option>
            <option value="delete">{t(T("删除", "Delete"))}</option>
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
          {config.mode === "insert" && (
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
          <SourcePanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c })}
            t={t}
          />
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
