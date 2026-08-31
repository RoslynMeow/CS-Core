import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import type { BinNode, BstStep, TreeSnap } from "../../lib/graph";
import {
  splayInsertSteps,
  splaySearchOnTree,
  splayInsertOne,
  splayDeleteOnTree,
  SPLAY_INSERT_CODE,
  SPLAY_DELETE_CODE,
  SPLAY_CODE,
} from "../../lib/splay";
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
  target: 3,
  x: 5,
};

const VIEW_CODE: Text[] = [T("查看当前树", "view current tree")];
const CODE: Record<Mode, Text[]> = {
  view: VIEW_CODE,
  // 伸展树没有独立的查找伪代码：查找 = 定位 + splay 旋转（用 SPLAY_CODE 高亮旋转类型）
  search: SPLAY_CODE,
  build: SPLAY_INSERT_CODE,
  insert: SPLAY_INSERT_CODE,
  delete: SPLAY_DELETE_CODE,
};

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
  // 建树 = 初始化：已建树（work 存在）时静态展示当前树；
  // 未建树（无 work）的 mode=build → 双面板建树动画
  if ((cfg.mode === "build" && built) || (cfg.applied && built)) {
    const appliedTxt =
      cfg.applied && cfg.mode !== "build"
        ? T(
            `当前树 · ${base.nodes.length} 节点 · 已应用该操作（改参数后重播）`,
            `current tree · ${base.nodes.length} nodes · op applied (tweak params to replay)`,
          )
        : T(
            `当前树 · ${base.nodes.length} 节点 · 查找/插入/删除后热点会旋转到根`,
            `current tree · ${base.nodes.length} nodes · search/insert/delete splay hot node to root`,
          );
    return [{ line: 0, caption: appliedTxt, scene: binScene(base.nodes, {}, base.root) }];
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
  let searchResult: TreeSnap | null = null;
  if (cfg.mode === "search") {
    const out = splaySearchOnTree(base.nodes, base.root, cfg.target);
    steps = out.steps;
    searchResult = out.result;
  } else if (cfg.mode === "build") steps = splayInsertSteps(res.values);
  else if (cfg.mode === "insert")
    steps = splayInsertOne(base.nodes, base.root, cfg.x).steps;
  else steps = splayDeleteOnTree(base.nodes, base.root, cfg.target).steps;
  // 建树：双面板动画
  if (cfg.mode === "build") {
    return buildDualFrames(
      steps,
      res.values,
      base.nodes,
      T("伸展树 · 正在建立", "Splay tree · building"),
      undefined,
      cfg.source === "graph"
        ? T("图编辑导入的树 · 输入", "Imported tree · input")
        : undefined,
    );
  }
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(s.nodes, { current: s.focus, edge: s.edge }, s.root),
  }));
}

/** 播完自动应用：建树/插入/删除/查找 结束即把结果写入 work。
 *  注意：伸展树「查找」也会 splay 热点到根 → 树结构变了，同样要写回！ */
function applyOnEnd(cfg: Cfg): Cfg | null {
  if (cfg.applied) return null;
  const res = resolveTree(cfg, { requireNumeric: true });
  if (!res.ok || res.values.length === 0) return null;
  const base: TreeSnap = cfg.work ?? { nodes: res.nodes, root: 0 };
  let result: TreeSnap;
  if (cfg.mode === "build") {
    const st = splayInsertSteps(res.values);
    result = { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root };
  } else if (cfg.mode === "search") {
    result = splaySearchOnTree(base.nodes, base.root, cfg.target).result;
  } else if (cfg.mode === "insert") {
    result = splayInsertOne(base.nodes, base.root, cfg.x).result;
  } else if (cfg.mode === "delete") {
    result = splayDeleteOnTree(base.nodes, base.root, cfg.target).result;
  } else return null;
  return { ...cfg, work: result, applied: true };
}

export const treeSplayModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-splay",
  title: T("伸展树", "Splay Tree"),
  desc: T(
    "建树（初始化）/ 查找 / 插入 / 删除；每次操作后热点节点 zig/zig-zig/zig-zag 旋转到根（查找也重排树！）；摊还 O(log n)；播完自动应用为新版本（导入当前图可覆盖回原图）",
    "build (init) · search · insert · delete; hot node rotates to the root via zig/zig-zig/zig-zag after every op (search also reshapes the tree!); amortized O(log n); auto-applies on play end (import to revert)",
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