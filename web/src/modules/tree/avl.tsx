import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  avlInsertSteps,
  avlInsertOne,
  avlDeleteOnTree,
  bstFromValues,
  bstSearchOnTree,
  BST_SEARCH_CODE,
  AVL_CODE,
  AVL_DELETE_CODE,
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
  bfAnn,
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
  target: 3,
  x: 5,
};

const CODE: Record<Mode, Text[]> = {
  view: [T("查看当前树", "view current tree")],
  search: BST_SEARCH_CODE as unknown as Text[],
  build: AVL_CODE as unknown as Text[],
  insert: AVL_CODE as unknown as Text[],
  delete: AVL_DELETE_CODE as unknown as Text[],
};

const ViewCode = CODE.view; // 兼容旧存档 mode:"view" 的伪代码
void ViewCode; // 仅触发类型检查，避免 unused 告警

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg, { requireNumeric: true });
  if (pv) return pv;
  const res = resolveTree(cfg, { requireNumeric: true });
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
  // 建树 = 初始化：已建树（或图来源）时静态展示当前树（替代原「查看」）；旧存档 mode:"view" 同此。
  // 播完自动应用（applied）后保持所选操作不变、静态展示结果树，避免重播时重复插入/删除；
  // applied 仅在 applyOnEnd 写入 work 时同时置位，导入/重新载入（work 置 null）后自动失效
  if ((cfg.mode === "build" || (cfg.applied && !!cfg.work)) && built) {
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
        scene: binScene(base.nodes, {}, base.root, bfAnn(base.nodes)),
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
        scene: binScene(base.nodes, {}, base.root, bfAnn(base.nodes)),
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
        scene: binScene(base.nodes, {}, base.root, bfAnn(base.nodes)),
      },
    ];
  }
  let steps: BstStep[];
  if (cfg.mode === "search")
    steps = bstSearchOnTree(base.nodes, base.root, cfg.target);
  else if (cfg.mode === "build") steps = avlInsertSteps(res.values);
  else if (cfg.mode === "insert")
    steps = avlInsertOne(base.nodes, base.root, cfg.x).steps;
  else steps = avlDeleteOnTree(base.nodes, base.root, cfg.target).steps;
  // 建树：双面板动画 — 左：随机生成的输入树（已插入节点逐颗“拆走”、下一个高亮），
  // 右：正在建立的 AVL 树（新节点从输入树位置“飞”过来 + 流动光束）
  if (cfg.mode === "build") {
    return buildDualFrames(
      steps,
      res.values,
      bstFromValues(res.values),
      T("AVL 树 · 正在建立", "AVL tree · building"),
      bfAnn,
    );
  }
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(
      s.nodes,
      { current: s.focus, edge: s.edge },
      s.root,
      bfAnn(s.nodes),
    ),
  }));
}

/** 播完自动应用：建树/插入/删除 结束即把结果写入 work（新版本）；
 *  保持所选操作不回跳「建树」（applied 标记后静态展示结果，改参数重播）；
 *  不提供手动按钮；仅「从图编辑中导入」会把 work 置 null 覆盖回原图 */
function applyOnEnd(cfg: Cfg): Cfg | null {
  // 已应用过：重播（拉回首帧再播）不再重复应用
  if (cfg.applied) return null;
  const res = resolveTree(cfg, { requireNumeric: true });
  if (!res.ok || res.values.length === 0) return null;
  const base: TreeSnap = cfg.work ?? { nodes: res.nodes, root: 0 };
  let result: TreeSnap;
  if (cfg.mode === "build") {
    const st = avlInsertSteps(res.values);
    result = { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root };
  } else if (cfg.mode === "insert") {
    result = avlInsertOne(base.nodes, base.root, cfg.x).result;
  } else if (cfg.mode === "delete") {
    result = avlDeleteOnTree(base.nodes, base.root, cfg.target).result;
  } else return null;
  return { ...cfg, work: result, applied: true };
}

export const treeAvlModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-avl",
  title: T("AVL 树", "AVL Tree"),
  desc: T(
    "建树（初始化）/ 查找 / 插入 / 删除；插入、删除自动 LL/LR/RR/RL 旋转重平衡；播完自动保存为新版本（导入当前图可覆盖回原图）",
    "build (init) · search · insert · delete; auto rotations; auto-applies on play end (import to revert)",
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
                value={config.target}
                onChange={(e) =>
                  onChange({
                    ...config,
                    target: Number(e.target.value),
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
                onChange={(e) => {
                  const c = {
                    ...config,
                    x: Number(e.target.value),
                    applied: false,
                  };
                  onChange(c);
                }}
              />
            </label>
          )}
          <SourcePanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c, applied: false })}
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
