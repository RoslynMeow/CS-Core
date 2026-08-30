import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  treeTraverseSteps,
  levelOrderSteps,
  LEVEL_CODE,
  type AlgoStep,
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

type Mode = "pre" | "in" | "post" | "level";
type Cfg = TreeCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "graph",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
  mode: "pre",
};

// 每模式各自完整、从 line0 开始的递归遍历伪代码
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
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  // 旧合并页存档防御：mode 可能残留 heap-* 等非法值 → 归一化到当前模式集
  const mode: Mode = (["pre", "in", "post", "level"] as Mode[]).includes(
    cfg.mode as Mode,
  )
    ? (cfg.mode as Mode)
    : DEFAULT.mode;
  const c: Cfg = { ...cfg, mode };
  const pv = importPreviewFrames(c, { requireNumeric: false });
  if (pv) return pv;
  const res = resolveTree(c, { requireNumeric: false });
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
          current: null,
          exploring: null,
          visited: [],
          frontier: [],
          order: [],
          edge: null,
          nodes: [],
          edges: [],
          ...(c.source === "graph" ? { error: res.error ?? "" } : {}),
        },
      },
    ];
  }
  const { g, labels, nodes } = res;
  const steps: AlgoStep[] =
    mode === "level"
      ? levelOrderSteps(g, 0, labels)
      : treeTraverseSteps(g, mode, 0, labels);
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

export const treeTraverseModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree",
  title: T("二叉树 · 遍历", "Binary Tree · Traversal"),
  desc: T(
    "前序 / 中序 / 后序 / 层序遍历二叉树；树可随机生成或从图创建导入（须为二叉树）",
    "preorder · inorder · postorder · level-order; random or imported binary tree",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq() };
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
            {isZh ? "遍历" : "ORDER"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            {(["pre", "in", "post", "level"] as Mode[]).map((m) => (
              <option key={m} value={m}>
                {t(
                  T(
                    m === "pre"
                      ? "前序"
                      : m === "in"
                        ? "中序"
                        : m === "post"
                          ? "后序"
                          : "层序",
                    m,
                  ),
                )}
              </option>
            ))}
          </select>
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
    // 旧合并页存档防御：与 buildFrames 一致，mode 可能残留 heap-* 等非法值 → 归一化，避免 CODE[cfg.mode] 为 undefined
    const mode: Mode = (["pre", "in", "post", "level"] as Mode[]).includes(
      cfg.mode as Mode,
    )
      ? (cfg.mode as Mode)
      : DEFAULT.mode;
    return CODE[mode];
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
