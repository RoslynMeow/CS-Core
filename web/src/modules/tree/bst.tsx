import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bstSearchSteps,
  bstInsertSteps,
  bstDeleteSteps,
  BST_SEARCH_CODE,
  BST_INSERT_CODE,
  BST_DELETE_CODE,
  type BstStep,
} from "../../lib/graph";
import {
  GraphCanvas,
  type GraphCanvasScene,
} from "../../components/canvas/GraphCanvas";
import {
  resolveTree,
  SourcePanel,
  randSeq,
  binScene,
  type TreeCfg,
} from "./source";

type Mode = "search" | "insert" | "delete";
type Cfg = TreeCfg & { mode: Mode; target: number };
const DEFAULT: Cfg = {
  source: "random",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  mode: "search",
  target: 3,
};

const CODE: Record<Mode, Text[]> = {
  search: BST_SEARCH_CODE as unknown as Text[],
  insert: BST_INSERT_CODE as unknown as Text[],
  delete: BST_DELETE_CODE as unknown as Text[],
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
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
        },
      },
    ];
  }
  let steps: BstStep[];
  if (cfg.mode === "search") steps = bstSearchSteps(res.values, cfg.target);
  else if (cfg.mode === "insert") steps = bstInsertSteps(res.values);
  else steps = bstDeleteSteps(res.values, cfg.target);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(s.nodes, { current: s.focus, edge: s.edge }, s.root),
  }));
}

export const treeBstModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-bst",
  title: T("二叉搜索树 · BST", "Binary Search Tree"),
  desc: T(
    "查找 / 插入 / 删除；树可随机生成或从图创建导入（需是带数字标签的二叉树）",
    "search · insert · delete; random or imported",
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
            {isZh ? "操作" : "OP"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
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
                  : t(T("删值", "Del"))}
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
  Render({ scene }) {
    return <GraphCanvas scene={scene} />;
  },
};
