import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  heapInsertSteps,
  heapDeleteTopSteps,
  heapBuildSteps,
  heapSortSteps,
  HEAP_INSERT_CODE,
  HEAP_DELETE_CODE,
  HEAP_BUILD_CODE,
  HEAP_SORT_CODE,
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

type Mode = "build" | "insert" | "delete" | "sort";
type Cfg = TreeCfg & { mode: Mode; x: number };
const DEFAULT: Cfg = {
  source: "graph",
  values: [70, 40, 60, 10, 30, 50, 20],
  imp: null,
  confirmed: true,
  mode: "build",
  x: 55,
};

const CODE: Record<Mode, Text[]> = {
  build: HEAP_BUILD_CODE as unknown as Text[],
  insert: HEAP_INSERT_CODE as unknown as Text[],
  delete: HEAP_DELETE_CODE as unknown as Text[],
  sort: HEAP_SORT_CODE as unknown as Text[],
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const pv = importPreviewFrames(cfg, {
    requireNumeric: true,
    requireComplete: true,
  });
  if (pv) return pv;
  const res = resolveTree(cfg, { requireNumeric: true, requireComplete: true });
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
  let steps: HeapStep[];
  if (cfg.mode === "build") steps = heapBuildSteps(res.values);
  else if (cfg.mode === "insert") steps = heapInsertSteps(res.values, cfg.x);
  else if (cfg.mode === "delete") steps = heapDeleteTopSteps(res.values);
  else steps = heapSortSteps(res.values);

  // 堆：数组 → 完全二叉树渲染（annotate = 数组下标），当前/探索 = a/b
  const toScene = (v: number[], a: number | null, b: number | null) => {
    const nodes = v.map((val, i) => ({
      id: i,
      val,
      left: 2 * i + 1 < v.length ? 2 * i + 1 : null,
      right: 2 * i + 2 < v.length ? 2 * i + 2 : null,
    }));
    const ann: Record<number, string> = {};
    v.forEach((_, i) => (ann[i] = String(i)));
    return binScene(nodes, { current: a, exploring: b }, 0, ann);
  };
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: toScene(s.values, s.a, s.b),
  }));
}

export const treeHeapModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-heap",
  title: T("二叉堆 · Heap", "Binary Heap"),
  desc: T(
    "建堆 / 上滤插入 / 下滤删顶 / 堆排序；需完全二叉树",
    "build · insert · delete-top · sort; needs complete tree",
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
            {isZh ? "操作" : "OP"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="build">{t(T("建堆", "Build"))}</option>
            <option value="insert">{t(T("插入", "Insert"))}</option>
            <option value="delete">{t(T("删除堆顶", "Delete top"))}</option>
            <option value="sort">{t(T("堆排序", "Heap sort"))}</option>
          </select>
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
            requireComplete
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
