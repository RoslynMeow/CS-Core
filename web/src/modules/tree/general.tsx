import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  Graph,
  levelOrderSteps,
  binToGraph,
  type AlgoStep,
  type BinNode,
} from "../../lib/graph";
import type { GraphCanvasScene } from "../../components/canvas/GraphCanvas";
import {
  SourcePanel,
  randSeq,
  impScene,
  TreeCanvas,
  TREE_BOX,
  type TreeCfg,
} from "./source";

type Mode = "terms" | "pre" | "post" | "level" | "forest";
type Cfg = TreeCfg & { mode: Mode };
const DEFAULT: Cfg = {
  source: "graph",
  values: [1, 2, 3, 4, 5, 6, 7, 8],
  imp: null,
  confirmed: true,
  mode: "terms",
};

/** 随机多叉树（每节点 0..3 个孩子，BFS 建），标签为节点号 */
function randPoly(n: number): { g: Graph; root: number } {
  const g = new Graph(n, { directed: false, labels: undefined });
  const root = 0;
  let next = 1;
  const queue = [root];
  let head = 0;
  while (head < queue.length && next < n) {
    const u = queue[head++];
    const k = Math.min(1 + Math.floor(Math.random() * 3), n - next - 1);
    for (let c = 0; c < k && next < n; c++) {
      g.addEdge(u, next);
      queue.push(next);
      next++;
    }
  }
  g.labels = Array.from({ length: n }, (_, i) => String(i + 1));
  return { g, root };
}

/** 多叉树 → GraphCanvasScene（直接布局，不要求二叉） */
function polyScene(
  g: Graph,
  root: number,
  hl: AlgoStep,
  ann?: Record<number, string>,
): GraphCanvasScene {
  const pos = g.layoutTree(root, TREE_BOX).pos;
  return {
    ...hl,
    root: root,
    directed: false,
    nodes: Array.from({ length: g.n }, (_, i) => ({
      id: i,
      label: g.labels[i] ?? String(i),
      x: pos[i]?.x ?? 0,
      y: pos[i]?.y ?? 0,
    })),
    edges: g.edges.map((e) => ({ u: e.u, v: e.v, weight: e.weight })),
    annotate: ann,
  };
}

/** 术语演示：逐帧高亮 根/父/子/度/深度/祖先/后代/高度 */
function termsSteps(g: Graph, root: number, labels: string[]): AlgoStep[] {
  const n = g.n;
  const { parent, order } = g.bfs(root);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v++)
    if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const layer = Array(n).fill(0);
  for (const u of order) for (const c of children[u]) layer[c] = layer[u] + 1;
  const S = (i: number) => labels[i] ?? String(i);
  const steps: AlgoStep[] = [];
  const visited: number[] = [];
  const push = (
    line: number,
    current: number | null,
    exploring: number | null,
    extraVisit: number[],
    edge: [number, number] | null,
    zh: string,
    en: string,
  ) =>
    steps.push({
      line,
      current,
      exploring,
      visited: [...visited],
      frontier: [],
      order: [...visited, ...(current === null ? [] : [current])],
      edge,
      msg: { zh, en },
    });
  // 根
  visited.push(root);
  push(0, root, null, [], null, `根 = ${S(root)}（无父）`, `root = ${S(root)}`);
  // 每个节点：父/度/深度 + 祖先链 / 后代
  for (const u of order.slice(1)) {
    const p = parent[u];
    // 祖先链（根到自身为止：bfs 里 parent[root] = root）
    const anc: number[] = [];
    let x = u;
    while (x !== -1 && x !== root) {
      anc.push(x);
      x = parent[x];
    }
    anc.push(root);
    push(
      1,
      u,
      p,
      [],
      [p, u],
      `父(${S(u)}) = ${S(p)} · 度 = ${children[u].length} · 深度 = ${layer[u]}`,
      `parent=${S(p)} · deg=${children[u].length} · depth=${layer[u]}`,
    );
    visited.push(u);
  }
  // 后代（以某个叶子为例展示子树）
  const sub = order[order.length - 1];
  const subNodes: number[] = [sub];
  const stack = [sub];
  while (stack.length) {
    const u = stack.pop()!;
    for (const c of children[u]) {
      subNodes.push(c);
      stack.push(c);
    }
  }
  push(
    2,
    null,
    null,
    subNodes,
    null,
    `后代(${S(sub)}) = {${subNodes.map(S).join(", ")}}（子树）`,
    `subtree(${S(sub)}) = {${subNodes.map(S).join(", ")}}`,
  );
  const maxLayer = Math.max(0, ...layer);
  push(
    3,
    null,
    null,
    [],
    null,
    `树高 = ${maxLayer}（最大深度）`,
    `height = ${maxLayer}`,
  );
  // 森林：随机一个节点展示其兄弟
  const br = order.find((u) => children[parent[u]]?.length > 1);
  if (br !== undefined && parent[br] !== -1) {
    const sib = children[parent[br]].filter((c) => c !== br);
    push(
      4,
      br,
      parent[br],
      sib,
      [br, parent[br]],
      `兄弟(${S(br)}) = {${sib.map(S).join(", ")}}`,
      `siblings(${S(br)}) = {${sib.map(S).join(", ")}}`,
    );
  }
  return steps;
}

/** 森林/多叉树 → 二叉树（左孩子右兄弟） */
function polyToBin(g: Graph, root: number, labels: string[]): BinNode[] {
  const n = g.n;
  const { parent, order } = g.bfs(root);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v++)
    if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const idOf = new Map(order.map((v, i) => [v, i]));
  const bin: BinNode[] = order.map((v, i) => ({
    id: i,
    val: Number(labels[v] ?? v + 1),
    left: null,
    right: null,
  }));
  for (const v of order) {
    const kids = children[v];
    if (kids.length) {
      bin[idOf.get(v)!].left = idOf.get(kids[0])!;
      for (let k = 0; k + 1 < kids.length; k++)
        bin[idOf.get(kids[k])!].right = idOf.get(kids[k + 1])!;
    }
  }
  return bin;
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  // 从图创建导入：直接复用 impScene（不要求二叉，多叉/森林都可以）
  if (cfg.source === "graph") {
    const scene = impScene(cfg.imp);
    if (!scene)
      return [
        {
          line: 0,
          caption: T(
            "请先在“图创建”页保存一张树图，再点“导入当前图”",
            "Save a tree in Graph Studio first, then import",
          ),
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
    const ok = scene.nodes.length > 0;
    if (!cfg.confirmed && ok)
      return [
        {
          line: 0,
          caption: T(
            "已载入「图创建」里保存的图（虚化预览）：点击画布导入",
            "Loaded saved graph (blurred): click the canvas to import",
          ),
          scene: { ...scene, blurred: true },
        },
      ];
    // 已确认：按导入树跑遍历（root = 场景根）
    const g = new Graph(scene.nodes.length, {
      directed: false,
      labels: scene.nodes.map((nd) => nd.label),
    });
    for (const e of scene.edges) g.addEdge(e.u, e.v);
    const root =
      typeof scene.root === "number" && scene.root >= 0 ? scene.root : 0;
    const hl = (s: AlgoStep) => s;
    const mk = (s: AlgoStep) => ({
      line: s.line,
      caption: s.msg,
      scene: polyScene(g, root, hl(s)),
    });
    if (cfg.mode === "terms") return termsSteps(g, root, g.labels).map(mk);
    if (cfg.mode === "forest") {
      const bin = polyToBin(g, root, g.labels);
      const g2 = binToGraph(bin);
      const pos2 = g2.layoutTree(0, TREE_BOX).pos;
      return [
        {
          line: 0,
          caption: T(
            `原始多叉树 → 左孩子右兄弟二叉树`,
            `poly tree → left-child right-sibling binary tree`,
          ),
          scene: polyScene(g, root, {
            line: 0,
            current: null,
            exploring: null,
            visited: [],
            frontier: [],
            order: [],
            edge: null,
            msg: { zh: "", en: "" },
          }),
        },
        {
          line: 1,
          caption: T(
            `2 步：长女为左孩子，次子们为右链（兄弟）`,
            `step 2: first child = left, following children = right chain (siblings)`,
          ),
          scene: {
            ...polyScene(g2, 0, {
              line: 1,
              current: null,
              exploring: null,
              visited: [],
              frontier: [],
              order: [],
              edge: null,
              msg: { zh: "", en: "" },
            }),
            root: 0,
            nodes: bin.map((nd, i) => ({
              id: i,
              label: String(nd.val),
              x: pos2[i]?.x ?? 0,
              y: pos2[i]?.y ?? 0,
            })),
          },
        },
      ];
    }
    const steps: AlgoStep[] =
      cfg.mode === "level"
        ? levelOrderSteps(g, root, g.labels)
        : [
            cfg.mode === "pre"
              ? preSteps(g, root, g.labels)
              : postSteps(g, root, g.labels),
          ].flat();
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: polyScene(g, root, s),
    }));
  }

  // random：随机多叉树
  const n = 6 + Math.floor(Math.random() * 4);
  const { g, root } = randPoly(n);
  const labels = g.labels;
  if (cfg.mode === "terms")
    return termsSteps(g, root, labels).map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: polyScene(g, root, s),
    }));
  if (cfg.mode === "forest") {
    const bin = polyToBin(g, root, labels);
    const g2 = binToGraph(bin);
    const pos2 = g2.layoutTree(0, TREE_BOX).pos;
    return [
      {
        line: 0,
        caption: T(
          `原始多叉树 → 左孩子右兄弟二叉树`,
          `poly tree → LCRS binary`,
        ),
        scene: polyScene(g, root, {
          line: 0,
          current: null,
          exploring: null,
          visited: [],
          frontier: [],
          order: [],
          edge: null,
          msg: { zh: "", en: "" },
        }),
      },
      {
        line: 1,
        caption: T(
          `长女 → 左孩子；其余孩子 → 右链（兄弟）`,
          `first child → left; siblings → right chain`,
        ),
        scene: {
          ...polyScene(g2, 0, {
            line: 1,
            current: null,
            exploring: null,
            visited: [],
            frontier: [],
            order: [],
            edge: null,
            msg: { zh: "", en: "" },
          }),
          root: 0,
          nodes: bin.map((nd, i) => ({
            id: i,
            label: String(nd.val),
            x: pos2[i]?.x ?? 0,
            y: pos2[i]?.y ?? 0,
          })),
        },
      },
    ];
  }
  const steps: AlgoStep[] =
    cfg.mode === "level"
      ? levelOrderSteps(g, root, labels)
      : cfg.mode === "pre"
        ? preSteps(g, root, labels)
        : postSteps(g, root, labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: polyScene(g, root, s),
  }));
}

/** 先根遍历（多叉通用） */
function preSteps(g: Graph, root: number, labels: string[]): AlgoStep[] {
  const n = g.n;
  const { parent } = g.bfs(root);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v++)
    if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const steps: AlgoStep[] = [];
  const visited: number[] = [];
  const S = (i: number) => labels[i] ?? String(i);
  const push = (
    line: number,
    current: number | null,
    exploring: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
  ) =>
    steps.push({
      line,
      current,
      exploring,
      visited: [...visited],
      frontier: [],
      order: [...visited, ...(current === null ? [] : [current])],
      edge,
      msg: { zh, en },
    });
  const rec = (u: number): void => {
    push(0, u, null, null, `访问根 ${S(u)}`, `visit ${S(u)}`);
    visited.push(u);
    for (const c of children[u]) {
      push(1, c, u, [u, c], `先根：子 ${S(c)}`, `pre: child ${S(c)}`);
      rec(c);
    }
    push(2, null, u, null, `回到 ${S(u)}`, `back to ${S(u)}`);
  };
  rec(root);
  return steps;
}

/** 后根遍历（多叉通用） */
function postSteps(g: Graph, root: number, labels: string[]): AlgoStep[] {
  const n = g.n;
  const { parent } = g.bfs(root);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v++)
    if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const steps: AlgoStep[] = [];
  const visited: number[] = [];
  const S = (i: number) => labels[i] ?? String(i);
  const push = (
    line: number,
    current: number | null,
    exploring: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
  ) =>
    steps.push({
      line,
      current,
      exploring,
      visited: [...visited],
      frontier: [],
      order: [...visited, ...(current === null ? [] : [current])],
      edge,
      msg: { zh, en },
    });
  const rec = (u: number): void => {
    for (const c of children[u]) {
      push(0, c, u, [u, c], `后根：子 ${S(c)}`, `post: child ${S(c)}`);
      rec(c);
    }
    push(1, u, null, null, `访问叶子/根 ${S(u)}`, `visit ${S(u)}`);
    visited.push(u);
  };
  rec(root);
  return steps;
}

const CODE: Record<Mode, Text[]> = {
  terms: [], // 术语无算法 → 不显示伪代码
  pre: [T("先根遍历（根 → 各子树）", "preorder (root → subtrees)")],
  post: [T("后根遍历（子树 → 根）", "postorder (subtrees → root)")],
  level: [T("层序（队列逐层）", "level order (queue, layer by layer)")],
  forest: [T("多叉树 → 左孩子右兄弟二叉树", "poly tree → LCRS binary")],
};

export const generalTreeModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "general-tree",
  title: T("通用树结构", "General Tree"),
  desc: T(
    "术语（根/父/子/兄弟/度/深度/祖先/后代）· 先根/后根/层序遍历 · 多叉/森林导入 · 左孩子右兄弟转二叉树",
    "terms (root/parent/child/sibling/degree/depth/ancestor/descendant) · pre/post/level order · poly tree & forest → LCRS binary",
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
            {isZh ? "模式" : "MODE"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            {(
              [
                ["terms", "术语", "Terms"],
                ["pre", "先根", "Pre-order"],
                ["post", "后根", "Post-order"],
                ["level", "层序", "Level"],
                ["forest", "森林→二叉树", "Forest→Binary"],
              ] as [Mode, string, string][]
            ).map(([v, z, e]) => (
              <option key={v} value={v}>
                {t(T(z, e))}
              </option>
            ))}
          </select>
          <SourcePanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c })}
            t={t}
            requireComplete={false}
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
