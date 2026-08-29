import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { levelOrderSteps, LEVEL_CODE, type AlgoStep } from "../../lib/graph";
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

type Cfg = TreeCfg;
const DEFAULT: Cfg = {
  source: "random",
  values: [4, 2, 6, 1, 3, 5, 7],
  imp: null,
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
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
        },
      },
    ];
  }
  const steps: AlgoStep[] = levelOrderSteps(res.g, 0, res.labels);
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

export const treeLevelModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-level",
  title: T("二叉树 · 层序", "Binary Tree Level-order"),
  desc: T(
    "按层出队逐层打印；树可随机生成或从图创建导入（需是二叉树）",
    "level-order by layer; random or imported binary tree",
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
  code: LEVEL_CODE as never,
  generate(config) {
    return buildFrames(config);
  },
  Render({ scene }) {
    return <GraphCanvas scene={scene} />;
  },
};
