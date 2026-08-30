import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { treeTraverseSteps, type AlgoStep } from "../../lib/graph";
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

type Mode = "pre" | "in" | "post";
type Cfg = TreeCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "random",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
  mode: "pre",
};

// 每模式各自完整、从 line0 开始的递归遍历伪代码（与 treeTraverseSteps 行号对齐）
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
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg);
  if (pv) return pv;
  const res = resolveTree(cfg);
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
          ...(cfg.source === "graph" ? { error: res.error ?? "" } : {}),
        },
      },
    ];
  }
  const steps: AlgoStep[] = treeTraverseSteps(res.g, cfg.mode, 0, res.labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(res.nodes, {
      current: s.current,
      exploring: s.exploring,
      visited: s.visited,
      frontier: s.frontier,
      order: s.order,
      edge: s.edge,
    }),
  }));
}

export const treeTraversalModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-traverse",
  title: T("二叉树 · 遍历", "Binary Tree Traversal"),
  desc: T(
    "前序/中序/后序递归轨迹；树可随机生成或从图创建导入（需是二叉树）",
    "pre · in · post trace; random or imported binary tree",
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
        <SourcePanel
          cfg={config}
          onChange={(c) => onChange({ ...config, ...c })}
          t={t}
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
            {isZh ? "模式" : "MODE"}
          </span>
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span>{t(T("序", "Order"))}</span>
            <select
              className="txt"
              value={config.mode}
              onChange={(e) =>
                onChange({ ...config, mode: e.target.value as Mode })
              }
            >
              <option value="pre">{t(T("前序", "Preorder"))}</option>
              <option value="in">{t(T("中序", "Inorder"))}</option>
              <option value="post">{t(T("后序", "Postorder"))}</option>
            </select>
          </label>
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
