import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { avlInsertSteps, AVL_CODE, type BstStep } from "../../lib/graph";
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

type Cfg = TreeCfg;
const DEFAULT: Cfg = {
  source: "random",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
  confirmed: true,
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
  const steps: BstStep[] = avlInsertSteps(res.values);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: binScene(s.nodes, { current: s.focus, edge: s.edge }, s.root),
  }));
}

export const treeAvlModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-avl",
  title: T("AVL 树", "AVL Tree"),
  desc: T(
    "插入后保持平衡：LL/LR/RR/RL 旋转（库 avlInsertSteps）",
    "balanced insert: LL/LR/RR/RL rotations",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq() };
  },
  Controls({ config, onChange, t }) {
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <SourcePanel
          cfg={config}
          onChange={(c) => onChange({ ...config, ...c })}
          t={t}
        />
      </div>
    ) as unknown as never;
  },
  code: AVL_CODE as never,
  generate(config) {
    return buildFrames(config);
  },
  Render({ scene, t, config, onChange }) {
    return (
      <TreeCanvas scene={scene} t={t} config={config} onChange={onChange} />
    );
  },
};
