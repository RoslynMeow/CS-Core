import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  Graph,
  levelOrderSteps,
  LEVEL_CODE,
  type AlgoStep,
  type BinNode,
} from "../../lib/graph";
import {
  TONE_FILL,
  HL_RING,
  type GraphCanvasScene,
} from "../../components/canvas/GraphCanvas";
import {
  SourcePanel,
  randSeq,
  impScene,
  TreeCanvas,
  binScene,
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

/** FNV-1a 哈希：同一 values → 同一棵树（换模式不重新生成） */
function hashSeed(arr: number[]): number {
  let h = 2166136261;
  for (const x of arr) {
    h ^= x & 0xffffffff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** mulberry32 确定性伪随机（替代 Math.random，保证“随机生成”后才换树） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机多叉树（每节点 0..3 个孩子，BFS 建），标签为节点号 */
function randPoly(n: number, rand: () => number): { g: Graph; root: number } {
  const g = new Graph(n, { directed: false, labels: undefined });
  const root = 0;
  let next = 1;
  const queue = [root];
  let head = 0;
  while (head < queue.length && next < n) {
    const u = queue[head++];
    const k = Math.min(1 + Math.floor(rand() * 3), n - next - 1);
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
  tone?: Record<number, number>,
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
    ...(tone ? { tone } : {}),
  };
}

/** 术语配色：0=根, 1=内部节点, 2=叶子, 3=不在当前根树中（与根不连通，灰色） */
function treeTone(g: Graph, root: number): Record<number, number> {
  const n = g.n;
  const { parent, order } = g.bfs(root);
  const childCount = Array(n).fill(0);
  for (const v of order)
    if (v !== root && parent[v] !== -1) childCount[parent[v]]++;
  const reachable = new Set(order);
  const tone: Record<number, number> = {};
  for (let v = 0; v < n; v++)
    tone[v] = reachable.has(v)
      ? v === root
        ? 0
        : childCount[v] === 0
          ? 2
          : 1
      : 3;
  return tone;
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
      frontier: extraVisit, // 「后代/兄弟」等步骤：相关节点以天蓝环高亮
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

/** 森林/多叉树 → 二叉树（左孩子右兄弟）；多棵树根连成右兄弟链 */
function polyToBin(g: Graph, root: number, labels: string[]): BinNode[] {
  const { children, order, roots } = forestBfs(g, root);
  const idOf = new Map(order.map((v, i) => [v, i]));
  const bin: BinNode[] = order.map((v, i) => {
    const raw = labels[v] ?? String(v + 1);
    const num = Number(raw);
    return {
      id: i,
      val: Number.isFinite(num) ? num : 0, // 非数字标签存到 label，val 保持数字类型
      label: raw,
      left: null,
      right: null,
    };
  });
  for (const v of order) {
    const kids = children[v];
    if (kids.length) {
      bin[idOf.get(v)!].left = idOf.get(kids[0])!;
      for (let k = 0; k + 1 < kids.length; k++)
        bin[idOf.get(kids[k])!].right = idOf.get(kids[k + 1])!;
    }
  }
  // 森林：各棵树根依次连成右兄弟链（LCRS 的森林表示）
  for (let k = 1; k < roots.length; k++)
    bin[idOf.get(roots[k - 1])!].right = idOf.get(roots[k])!;
  return bin;
}

/** 森林/多叉树 → LCRS 二叉树演示帧：0 原始 → 1 长子标示 → 2 转换结果（L/R 边标注） */
function forestFrames(
  g: Graph,
  root: number,
  labels: string[],
): Frame<GraphCanvasScene>[] {
  const { parent, children, order, roots } = forestBfs(g, root);
  const bin = polyToBin(g, root, labels);
  const S = (i: number) => labels[i] ?? String(i);
  // “长子”节点（将成为左孩子）以天蓝标示
  const firstKids = order.filter(
    (v) => parent[v] !== -1 && children[parent[v]][0] === v,
  );
  const empty: AlgoStep = {
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: { zh: "", en: "" },
  };
  // LCRS 结果：边标 L（左孩子/长子）、R（右孩子/右兄弟链）
  const edgeLabels: Record<string, string> = {};
  bin.forEach((nd, i) => {
    if (nd.left !== null) edgeLabels[`${i}-${nd.left}`] = "L";
    if (nd.right !== null) edgeLabels[`${i}-${nd.right}`] = "R";
  });
  const sc = binScene(bin, {}, 0);
  return [
    {
      line: 0,
      caption: T(
        `原始森林 / 多叉树 · ${roots.length} 棵：根 ${roots.map(S).join(", ")}`,
        `original forest / poly tree · ${roots.length} tree(s): roots ${roots.map(S).join(", ")}`,
      ),
      scene: polyScene(g, root, empty),
    },
    {
      line: 1,
      caption: T(
        `长子 → 左孩子（天蓝节点）；其余孩子 → 右兄弟链`,
        `first child → left (cyan); following children → right-sibling chain`,
      ),
      scene: polyScene(g, root, { ...empty, frontier: firstKids }),
    },
    {
      line: 2,
      caption: T(
        `LCRS 完成：$left=长子$、$right=兄弟$，树根右链成一颗二叉树（L=左孩子 R=右兄弟）`,
        `LCRS done: left=first child, right=next sibling; roots chained via right (L=left child, R=right sibling)`,
      ),
      scene: {
        ...sc,
        edgeLabels,
        nodes: sc.nodes.map((n, i) => ({
          ...n,
          label: String(bin[i].label ?? bin[i].val),
        })),
      },
    },
  ];
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
    if (cfg.mode === "terms")
      return termsSteps(g, root, g.labels).map((s) => ({
        line: s.line,
        caption: s.msg,
        scene: polyScene(g, root, s, undefined, treeTone(g, root)),
      }));
    if (cfg.mode === "forest") return forestFrames(g, root, g.labels);
    const steps: AlgoStep[] =
      cfg.mode === "level"
        ? levelOrderSteps(g, root, g.labels, forestBfs(g, root).roots.slice(1))
        : cfg.mode === "pre"
          ? preSteps(g, root, g.labels)
          : postSteps(g, root, g.labels);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: polyScene(g, root, s),
    }));
  }

  // random：同一 values → 同一棵树（只有“随机生成”才换新树）
  const n = Math.max(2, cfg.values.length);
  const { g, root } = randPoly(n, mulberry32(hashSeed(cfg.values)));
  const labels = g.labels;
  if (cfg.mode === "terms")
    return termsSteps(g, root, labels).map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: polyScene(g, root, s, undefined, treeTone(g, root)),
    }));
  if (cfg.mode === "forest") return forestFrames(g, root, labels);
  const steps: AlgoStep[] =
    cfg.mode === "level"
      ? levelOrderSteps(g, root, labels, forestBfs(g, root).roots.slice(1))
      : cfg.mode === "pre"
        ? preSteps(g, root, labels)
        : postSteps(g, root, labels);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: polyScene(g, root, s),
  }));
}

/** 点击节点 → 该节点在树上的相关属性（父 / 孩子 / 度 / 深度 / 高度 / 祖先 / 后代 / 兄弟） */
type NodeInfo = {
  id: number;
  label: string;
  isRoot: boolean;
  /** 是否在当前根树中（与根连通） */
  inTree: boolean;
  parent: number | null;
  children: number[];
  /** 孩子数（树语义）；不在树中时为邻居数 */
  degree: number;
  /** 图语义的邻居数 */
  neighbors: number;
  /** 所在连通分量大小 */
  compSize: number;
  depth: number;
  height: number;
  subSize: number;
  ancestors: number[];
  siblings: number[];
  tone: number;
};

function inspectNode(scene: GraphCanvasScene, id: number): NodeInfo | null {
  const n = scene.nodes.length;
  if (n === 0 || id < 0 || id >= n) return null;
  const root =
    typeof scene.root === "number" && scene.root >= 0 ? scene.root : 0;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of scene.edges) {
    adj[e.u].push(e.v);
    adj[e.v].push(e.u);
  }
  const parent = Array(n).fill(-1);
  const children: number[][] = Array.from({ length: n }, () => []);
  const depth = Array(n).fill(0);
  const order: number[] = [];
  const seen = new Set<number>([root]);
  const q = [root];
  for (let head = 0; head < q.length; head++) {
    const u = q[head];
    order.push(u);
    for (const v of adj[u])
      if (!seen.has(v)) {
        seen.add(v);
        parent[v] = u;
        children[u].push(v);
        depth[v] = depth[u] + 1;
        q.push(v);
      }
  }
  // 不在当前根树中的节点（与根不连通）：给出仍可用的信息（邻居数 / 所在连通分量）
  if (id !== root && parent[id] === -1) {
    const compSeen = new Set<number>([id]);
    const cq = [id];
    for (let h = 0; h < cq.length; h++)
      for (const v of adj[cq[h]])
        if (!compSeen.has(v)) {
          compSeen.add(v);
          cq.push(v);
        }
    return {
      id,
      label: scene.nodes[id].label,
      isRoot: false,
      inTree: false,
      parent: null,
      children: [],
      degree: adj[id].length,
      neighbors: adj[id].length,
      compSize: compSeen.size,
      depth: 0,
      height: 0,
      subSize: 0,
      ancestors: [],
      siblings: [],
      tone: scene.tone?.[id] ?? 3,
    };
  }
  // 高度（子树）：以该节点为根的最长路径（边数）
  const height = Array(n).fill(0);
  for (const u of [...order].reverse())
    for (const c of children[u]) height[u] = Math.max(height[u], height[c] + 1);
  // 后代数（子树大小，含自身）
  let subSize = 0;
  const st = [id];
  while (st.length) {
    const u = st.pop()!;
    subSize++;
    for (const c of children[u]) st.push(c);
  }
  const ancestors: number[] = [];
  let x = parent[id];
  while (x !== -1) {
    ancestors.unshift(x);
    x = parent[x];
  }
  const siblings =
    parent[id] === -1 ? [] : children[parent[id]].filter((c) => c !== id);
  const tone =
    scene.tone?.[id] ?? (id === root ? 0 : children[id].length === 0 ? 2 : 1);
  return {
    id,
    label: scene.nodes[id].label,
    isRoot: id === root,
    inTree: true,
    parent: parent[id] === -1 ? null : parent[id],
    children: children[id],
    degree: children[id].length,
    neighbors: adj[id].length,
    compSize: order.length,
    depth: depth[id],
    height: height[id],
    subSize,
    ancestors,
    siblings,
    tone,
  };
}

/** 角色图例（与 GraphCanvas.TONE_FILL 顺序一致） */
const ROLES = [
  { tone: 0, zh: "根（无父）", en: "root (no parent)" },
  { tone: 1, zh: "内部节点（有孩子）", en: "internal (has children)" },
  { tone: 2, zh: "叶子（无孩子）", en: "leaf (no children)" },
  {
    tone: 3,
    zh: "不在当前根树中（与根不连通）",
    en: "not in the rooted tree (disconnected)",
  },
] as const;
const KIND: [string, string][] = [
  ["根", "root"],
  ["内部节点", "internal node"],
  ["叶子", "leaf"],
  ["不在树中", "outside the rooted tree"],
];

function Swatch({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        display: "inline-block",
        flexShrink: 0,
        background: ring ? "transparent" : color,
        border: ring ? `2.5px solid ${color}` : "none",
      }}
    />
  );
}

/** 术语模式右侧面板：插图例（替代伪代码位置）+ 点击节点后的属性卡 */
function TermsSide({
  scene,
  t,
  inspected,
  onInspect,
}: {
  scene: GraphCanvasScene;
  t: (x: Text) => string;
  inspected?: number | null;
  onInspect?: (id: number | null) => void;
}) {
  const info = inspected == null ? null : inspectNode(scene, inspected);
  const S = (i: number) => String(scene.nodes[i]?.label ?? i);
  const kv = (k: string, v: string) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: "1px solid #26324d",
        padding: "3px 0",
      }}
    >
      <span style={{ color: "#94a3b8" }}>{k}</span>
      <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{v}</span>
    </div>
  );
  return (
    <div className="panel pseudo" style={{ minHeight: 0 }}>
      <div className="panel-title">
        {t(T("图例 · 节点分类", "Legend · Node kinds"))}
      </div>
      <div
        className="code"
        style={{
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {ROLES.map((r) => (
          <div
            key={r.tone}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Swatch color={TONE_FILL[r.tone]} />
            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
              {t(T(r.zh, r.en))}
            </span>
          </div>
        ))}
        <div style={{ height: 1, background: "#1e293b", margin: "4px 0" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <Swatch color={HL_RING.current} ring />
          <span>
            {t(
              T("播放中：当前节点（琥珀环）", "playing: current (amber ring)"),
            )}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <Swatch color={HL_RING.visited} ring />
          <span>
            {t(T("已讲解 / 访问（绿环）", "already visited (green ring)"))}
          </span>
        </div>
        <div style={{ height: 1, background: "#1e293b", margin: "4px 0" }} />
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
          {t(
            T(
              "点击画布任一节点 → 这里显示该节点的属性（父 / 度 / 深度 / 高度 / 祖先 / 后代 / 兄弟）",
              "Click any canvas node to show its properties (parent / degree / depth / height / ancestors / subtree / siblings)",
            ),
          )}
        </div>
        {info && (
          <div
            style={{
              marginTop: 4,
              padding: "10px 12px",
              background: "#16213a",
              border: "1px solid #2b3a5e",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Swatch color={TONE_FILL[info.tone]} />
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>
                {t(T("节点", "Node"))} {info.label}
              </span>
              <button
                className="ghost"
                style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }}
                onClick={() => onInspect?.(null)}
              >
                ✕ {t(T("清除", "Clear"))}
              </button>
            </div>
            {info.inTree ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2px 14px",
                  }}
                >
                  {kv(
                    t(T("类型", "Kind")),
                    t(T(KIND[info.tone][0], KIND[info.tone][1])),
                  )}
                  {kv(
                    t(T("父", "Parent")),
                    info.parent == null ? "—" : S(info.parent),
                  )}
                  {kv(
                    t(T("孩子", "Children")),
                    info.children.length
                      ? info.children.map(S).join(", ")
                      : "—",
                  )}
                  {kv(t(T("度（孩子数）", "Degree")), String(info.degree))}
                  {kv(t(T("深度", "Depth")), String(info.depth))}
                  {kv(t(T("高度（子树）", "Height")), String(info.height))}
                  {kv(
                    t(T("后代数（子树大小）", "Subtree size")),
                    String(info.subSize),
                  )}
                  {kv(
                    t(T("兄弟", "Siblings")),
                    info.siblings.length
                      ? info.siblings.map(S).join(", ")
                      : "—",
                  )}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#cbd5e1",
                    lineHeight: 1.7,
                  }}
                >
                  <div>
                    <span style={{ color: "#94a3b8" }}>
                      {t(T("祖先", "Ancestors"))}：
                    </span>
                    {info.ancestors.length
                      ? info.ancestors.map(S).join(" → ")
                      : "—"}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "2px 14px",
                  }}
                >
                  {kv(t(T("类型", "Kind")), t(T(KIND[3][0], KIND[3][1])))}
                  {kv(
                    t(T("度（邻居数）", "Degree (neighbors)")),
                    String(info.neighbors),
                  )}
                  {kv(
                    t(T("所在连通分量", "Component size")),
                    String(info.compSize),
                  )}
                  {kv(t(T("父", "Parent")), "—")}
                  {kv(t(T("孩子", "Children")), "—")}
                  {kv(t(T("深度", "Depth")), "—")}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#fecaca",
                    lineHeight: 1.7,
                  }}
                >
                  {t(
                    T(
                      "该节点与当前根不连通，不属于这棵根树（灰色）— 树上属性（父/深度/高度/祖先/后代/兄弟）对它不适用",
                      "This node is disconnected from the current root, so it is not part of this rooted tree (gray) — tree properties (parent/depth/height/ancestors/subtree/siblings) do not apply",
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 全森林 BFS：以 root 为首，其余每个连通分量各自成根（多叉/森林通用） */
function forestBfs(
  g: Graph,
  root: number,
): {
  parent: number[];
  children: number[][];
  order: number[];
  roots: number[];
} {
  const adj = g.adj();
  const parent = Array(g.n).fill(-1);
  const children: number[][] = Array.from({ length: g.n }, () => []);
  const order: number[] = [];
  const roots: number[] = [];
  const seen = Array(g.n).fill(false);
  const build = (s: number) => {
    seen[s] = true;
    roots.push(s);
    const q = [s];
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      order.push(u);
      for (const [v] of adj[u])
        if (!seen[v]) {
          seen[v] = true;
          parent[v] = u;
          children[u].push(v);
          q.push(v);
        }
    }
  };
  if (root >= 0 && root < g.n && !seen[root]) build(root);
  for (let i = 0; i < g.n; i++) if (!seen[i]) build(i);
  return { parent, children, order, roots };
}

/** 先根遍历（多叉/森林通用） */
function preSteps(g: Graph, root: number, labels: string[]): AlgoStep[] {
  const { children, roots } = forestBfs(g, root);
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
      order: [...visited], // 徽标 = 已访问序（播放中不漂移）
      edge,
      msg: { zh, en },
    });
  const rec = (u: number): void => {
    visited.push(u);
    push(0, u, null, null, `先根访问 ${S(u)}`, `pre visit ${S(u)}`);
    for (const c of children[u]) {
      push(1, u, c, [u, c], `先根：进子树 ${S(c)}`, `pre: into ${S(c)}`);
      rec(c);
    }
    push(2, null, u, null, `回到 ${S(u)}`, `back to ${S(u)}`);
  };
  for (const r of roots) rec(r);
  return steps;
}

/** 后根遍历（多叉/森林通用） */
function postSteps(g: Graph, root: number, labels: string[]): AlgoStep[] {
  const { children, roots } = forestBfs(g, root);
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
      order: [...visited],
      edge,
      msg: { zh, en },
    });
  const rec = (u: number): void => {
    for (const c of children[u]) {
      push(0, u, c, [u, c], `后根：进子树 ${S(c)}`, `post: into ${S(c)}`);
      rec(c);
    }
    visited.push(u);
    push(1, u, null, null, `后根访问 ${S(u)}`, `post visit ${S(u)}`);
  };
  for (const r of roots) rec(r);
  return steps;
}

const CODE: Record<Mode, Text[]> = {
  terms: [], // 术语无算法 → 右侧显示图例 / 节点属性
  pre: [
    T("$visit(u)$  // 先访问根", "$visit(u)$  // visit root first"),
    T(
      "for each child $c$ of $u$: $preorder(c)$",
      "for each child $c$ of $u$: $preorder(c)$",
    ),
    T("// 子树访问完，回到 $u$", "// back to u after subtrees"),
  ],
  post: [
    T(
      "for each child $c$ of $u$: $postorder(c)$",
      "for each child $c$ of $u$: $postorder(c)$",
    ),
    T("$visit(u)$  // 子树之后访问根", "$visit(u)$  // visit root last"),
  ],
  level: LEVEL_CODE, // 库自带 8 行层序伪代码（行号 0..7 与帧对齐）
  forest: [
    T(
      "$F=(T_1,\\ldots,T_k)$  // 原始森林 / 树",
      "$F=(T_1,\\ldots,T_k)$  // original forest / tree",
    ),
    T(
      "$left(u)\\gets u_1$  // 长子 → 左孩子",
      "$left(u)\\gets u_1$  // first child → left",
    ),
    T(
      "$right(u_i)\\gets u_{i+1}$；树根右链  // 次子 → 右兄弟链 → 一颗二叉树",
      "$right(u_i)\\gets u_{i+1}$; chain roots  // LCRS",
    ),
  ],
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
    // 只有“随机生成”（或允许的入口）才换新树：改 values → 新种子 → 新树
    return {
      ...c,
      source: "random",
      values: randSeq(),
      confirmed: true,
      work: null,
    };
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
  Render({ scene, t, config, onChange, inspected, onInspect }) {
    // 只有「术语」模式允许点击节点查看属性；其它模式画布无交互
    const clickable = config?.mode === "terms";
    return (
      <TreeCanvas
        scene={scene}
        t={t}
        config={config}
        onChange={onChange}
        selected={clickable ? inspected : null}
        onNodeClick={clickable ? onInspect : undefined}
      />
    );
  },
  Side: TermsSide,
};
