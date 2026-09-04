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
  buildDualFrames,
  type TreeCfg,
} from "./source";

type Mode = "view" | "search" | "build" | "insert" | "delete";
type Cfg = TreeCfg & {
  mode: Mode;
  target: number;
  x: number;
  /** 播完自动应用标记：操作结果已写入 work；保持所选操作、静态展示结果，改参数后重播 */
  applied?: boolean;
};
const DEFAULT: Cfg = {
  source: "graph",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
  mode: "build",
  target: NaN,
  x: NaN,
};

const VIEW_CODE: Text[] = [T("$view$ // 查看当前树", "$view$ // view current tree")];
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
  // 建树 = 初始化：已建树（work 存在，含随机播完自动应用 / 图导入后已应用操作）时静态展示当前树；
  // 未建树（无 work）的 mode=build → 走下方双面板建树动画（随机序列或图导入的自定义树作左侧输入树）。
  // 播完自动应用（applied）后保持所选操作不变、静态展示结果树，避免重播时重复插入/删除；
  // applied 仅在 applyOnEnd 写入 work 时同时置位，导入/重新载入（work 置 null）后自动失效
  if ((cfg.mode === "build" && !!cfg.work) || (cfg.applied && !!cfg.work)) {
    const appliedTxt =
      cfg.applied && cfg.mode !== "build"
        ? T(
            `当前树 · ${base.nodes.length} 节点 · 已应用该操作（改参数后重播）`,
            `current tree · ${base.nodes.length} nodes · op applied (tweak params to replay)`,
          )
        : T(
            `当前树 · ${base.nodes.length} 节点 · 可选 查找/插入/删除（播完自动应用）`,
            `current tree · ${base.nodes.length} nodes · pick search/insert/delete`,
          );
    return [
      {
        line: 0,
        caption: appliedTxt,
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
  // 搜索/删除/插入 的参数未填写（默认空）：提示输入，不执行算法
  if (
    (cfg.mode === "search" || cfg.mode === "delete") &&
    Number.isNaN(cfg.target)
  ) {
    return [
      {
        line: 0,
        caption: T(
          "请输入查找值 / 删值后再执行",
          "enter a target / key before executing",
        ),
        scene: binScene(base.nodes, {}, base.root),
      },
    ];
  }
  if (cfg.mode === "insert" && Number.isNaN(cfg.x)) {
    return [
      {
        line: 0,
        caption: T("请输入插值后再执行", "enter a value before executing"),
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
  // 建树：双面板动画 — 左：输入树（随机生成的值树 / 图编辑导入的自定义树；已插入节点逐颗“拆走”、下一个高亮），
  // 右：正在建立的 BST 树（新节点从输入树位置“飞”过来 + 流动光束）
  const frames: Frame<GraphCanvasScene>[] =
    cfg.mode === "build"
      ? buildDualFrames(
          steps,
          res.values,
          base.nodes,
          T("BST 树 · 正在建立", "BST tree · building"),
          undefined,
          cfg.source === "graph"
            ? T("图编辑导入的树 · 输入", "Imported tree · input")
            : undefined,
        )
      : steps.map((s) => ({
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

/** 播完自动应用：建树/插入/删除 结束即把结果写入 work（新版本）；
 *  保持所选操作不回跳「建树」（applied 标记后静态展示结果，改参数重播）；
 *  不提供手动按钮；仅「从图编辑中导入」会把 work 置 null 覆盖回原图 */
function applyOnEnd(cfg: Cfg): Cfg | null {
  // 已应用过：重播（拉回首帧再播）不再重复应用
  if (cfg.applied) return null;
  if (cfg.mode === "insert" && Number.isNaN(cfg.x)) return null;
  if (
    (cfg.mode === "search" || cfg.mode === "delete") &&
    Number.isNaN(cfg.target)
  )
    return null;
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
  return { ...cfg, work: result, applied: true };
}

export const treeBstModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-bst",
  title: T("二叉搜索树", "Binary Search Tree"),
  desc: T(
    "建树（初始化）/ 查找 / 插入 / 删除；插入 = 往当前树加一个节点；播完自动应用为新版本（导入当前图可覆盖回原图）",
    "build (init) · search · insert · delete; insert adds a node to the current tree; auto-applies on play end (import to revert)",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq(), work: null, applied: false };
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
              onChange({
                ...config,
                mode: e.target.value as Mode,
                applied: false,
              })
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
                value={Number.isNaN(config.target) ? "" : config.target}
                onChange={(e) =>
                  onChange({
                    ...config,
                    target:
                      e.target.value === "" ? NaN : Number(e.target.value),
                    applied: false,
                  })
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
                  onChange({
                    ...config,
                    x: Number(e.target.value),
                    applied: false,
                  })
                }
              />
            </label>
          )}
          {/* 来源仅在「建树」时可选择：查找/插入/删除在建好的树上操作，不允许改来源 */}
          {config.mode === "build" && (
            <SourcePanel
              cfg={config}
              onChange={(c) => onChange({ ...config, ...c, applied: false })}
              t={t}
            />
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
