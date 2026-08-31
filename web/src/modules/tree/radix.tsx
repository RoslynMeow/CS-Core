import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  trieBuildSteps,
  trieSearchSteps,
  radixOf,
  compressible,
  type TrieNode,
  type TrieSnapshot,
} from "../../lib/trie";
import { GraphCanvas, type GraphCanvasScene } from "../../components/canvas/GraphCanvas";

// ---------- 基数树（压缩字典树）：普通 Trie 建树后逐条压缩单子路径 ----------

type Mode = "build" | "search";
type Cfg = {
  words: string[];
  target: string;
  mode: Mode;
};
const DEFAULT: Cfg = {
  words: ["romane", "romanus", "romulus", "rubens", "ruber", "rubicon", "rubicundus"],
  target: "ruber",
  mode: "build",
};
const CODE: Record<Mode, Text[]> = {
  build: [
    T("$Trie(w_1,\\ldots,w_k)$  // 先建普通字典树", "$Trie(w_1,\\ldots,w_k)$  // build plain trie first"),
    T("merge 单子路径 $u \\to$ 父边  // 边标签 = 子串", "merge single-child $u \\to$ parent edge  // edge label = substring"),
    T("// $Patricia$-完成：读边标还原词 $w_i$", "// $Patricia$ done; read edge labels to rebuild $w_i$"),
  ],
  search: [
    T("顺着边标签匹配 $w$（可能一次跨多个字符）", "follow edge labels matching $w$ (may skip chars)"),
    T("到叶或词尾 → 命中", "hit at leaf / word end"),
  ],
};

const BOX = { x0: 26, y0: 24, w: 708, h: 400 };

/** TrieNode 快照 → GraphCanvasScene（节点 = 字符；压缩后边标签 = 子串） */
function trieScene(
  nodes: TrieNode[],
  focus: number | null,
  edgeLabels?: Record<string, string>,
  extra?: Partial<GraphCanvasScene>,
): GraphCanvasScene {
  const pos = layout(nodes);
  return {
    current: focus,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.ch || "∅",
      x: pos[n.id]?.x ?? 0,
      y: pos[n.id]?.y ?? 0,
    })),
    edges: nodes.flatMap((n) =>
      Object.values(n.children).map((c) => ({ u: n.id, v: c })),
    ),
    ...(edgeLabels ? { edgeLabels } : {}),
    ...(extra ?? {}),
  };
}

/** 简易字符树布局：根左，孩子按子树叶子数水平分配 */
function layout(nodes: TrieNode[]): { x: number; y: number }[] {
  const pos: { x: number; y: number }[] = nodes.map(() => ({ x: 0, y: 0 }));
  if (nodes.length === 0) return pos;
  const leafOf = (u: number): number => {
    const ks = Object.keys(nodes[u].children);
    if (ks.length === 0) return 1;
    return ks.reduce((s, k) => s + leafOf(nodes[u].children[k]), 0);
  };
  const depth = (u: number): number => {
    let d = 0,
      v = u;
    while (nodes[v].parent !== null) {
      d++;
      v = nodes[v].parent!;
    }
    return d;
  };
  const maxDepth = nodes.reduce((m, n) => Math.max(m, depth(n.id)), 0);
  const total = leafOf(0);
  const stepY = Math.min(60, Math.max(36, BOX.h / Math.max(2, maxDepth + 1)));
  const alloc = (u: number, x0: number, x1: number) => {
    pos[u] = { x: (x0 + x1) / 2, y: BOX.y0 + depth(u) * stepY };
    const ks = Object.keys(nodes[u].children);
    if (ks.length === 0) return;
    const tot = ks.reduce((s, k) => s + leafOf(nodes[u].children[k]), 0);
    let cur = x0;
    for (const k of ks) {
      const c = nodes[u].children[k];
      const w = (leafOf(c) / tot) * (x1 - x0);
      alloc(c, cur, cur + w);
      cur += w;
    }
  };
  alloc(0, BOX.x0, BOX.x0 + BOX.w);
  void total;
  return pos;
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const words = cfg.words.filter(Boolean);
  if (words.length === 0) {
    return [
      {
        line: 0,
        caption: T("词表为空", "empty word list"),
        scene: trieScene([], null),
      },
    ];
  }
  if (cfg.mode === "build") {
    // 阶段 1：普通字典树（复用 trie 建树帧，line 0）
    const trieSteps = trieBuildSteps(words);
    const frames: Frame<GraphCanvasScene>[] = trieSteps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: trieScene(s.nodes, s.focus),
    }));
    // 阶段 2：逐条压缩单子路径（每压一条出一帧 + 边标签）
    let nodes: TrieNode[] = trieSteps[trieSteps.length - 1].nodes;
    const labels = radixOf(nodes, 0).label;
    const pushCompress = (n: TrieNode[], ed: Record<string, string>) => {
      const lbl = radixOf(n, 0).label;
      const edgeLabels: Record<string, string> = {};
      for (const nd of n)
        if (nd.parent !== null) {
          const from = lbl[nd.parent].length;
          edgeLabels[`${nd.parent}-${nd.id}`] = lbl[nd.id].slice(from);
        }
      frames.push({
        line: 1,
        caption: T(
          `压缩（${n.length} 节点，边标签=子串）：${words.length} 词`,
          `compress (${n.length} nodes, edge=substring): ${words.length} words`,
        ),
        scene: trieScene(n, null, edgeLabels),
      });
      void ed;
    };
    // 迭代合并单子非词尾节点到父（子串并入边标签）
    let guard = 0;
    while (guard++ < 40) {
      const cs = compressible(nodes);
      if (cs.length === 0) break;
      const target = cs[0];
      const tNode = nodes[target];
      const par = nodes[tNode.parent!];
      const [onlyCh, onlyId] = Object.entries(tNode.children)[0];
      par.children[tNode.ch + onlyCh] = onlyId;
      nodes[onlyId].parent = par.id;
      delete par.children[tNode.ch];
      const remNodes = nodes.filter((n) => n.id !== target);
      const map = new Map<number, number>();
      remNodes.forEach((n, i) => map.set(n.id, i));
      nodes = remNodes.map((n) => ({
        ...n,
        id: map.get(n.id)!,
        parent: n.parent === null ? null : map.get(n.parent!) ?? null,
        children: Object.fromEntries(
          Object.entries(n.children)
            .filter(([, v]) => map.has(v))
            .map(([k, v]) => [k, map.get(v)!]),
        ),
      }));
      pushCompress(nodes, {});
    }
    frames.push({
      line: 2,
      caption: T(
        `基数树完成：${words.length} 词 · ${nodes.length} 节点 · 读边标还原词`,
        `radix tree done: ${words.length} words · ${nodes.length} nodes`,
      ),
      scene: trieScene(nodes, null, (() => {
        const lbl = radixOf(nodes, 0).label;
        const ed: Record<string, string> = {};
        for (const nd of nodes)
          if (nd.parent !== null)
            ed[`${nd.parent}-${nd.id}`] = lbl[nd.id].slice(lbl[nd.parent].length);
        return ed;
      })()),
    });
    void labels;
    return frames;
  }
  // search：先在已压缩树上沿边标签匹配（复用 trie 的字符级查找帧，caption 提示跨字符）
  const trieSteps = trieBuildSteps(words);
  const base: TrieSnapshot = {
    nodes: trieSteps[trieSteps.length - 1].nodes,
    root: 0,
  };
  const steps = trieSearchSteps(base.nodes, base.root, cfg.target);
  return steps.map((s) => ({
    line: s.line >= 1 ? 1 : 0,
    caption: s.msg,
    scene: trieScene(s.nodes, s.focus),
  }));
}

export const RadixModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "radix-tree",
  title: T("基数树", "Radix Tree"),
  desc: T(
    "建树（先普通字典树 → 自动压缩单子路径成基数树，边标签=子串）/ 查找；与后缀树同源：路径压缩技巧",
    "build (plain trie → compress single-child paths into radix tree, edge=substring) · search; same compression trick as suffix tree",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return {
      ...c,
      words: ["apple", "app", "apply", "approx", "banana", "band", "bandit"],
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
            {isZh ? "操作" : "OP"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="build">{t(T("建树", "Build"))}</option>
            <option value="search">{t(T("查找", "Search"))}</option>
          </select>
          {config.mode === "search" && (
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
            >
              <span>{t(T("目标词", "Word"))}</span>
              <input
                className="txt"
                style={{ width: 76 }}
                value={config.target}
                onChange={(e) => onChange({ ...config, target: e.target.value.trim() })}
              />
            </label>
          )}
          <div
            style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
          >
            <input
              className="txt"
              style={{ width: 200 }}
              defaultValue={config.words.join(", ")}
              placeholder={isZh ? "词表（逗号分隔）" : "words, comma separated"}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const ws = e.currentTarget.value
                    .split(/[\s,，、]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (ws.length) onChange({ ...config, words: ws });
                  e.currentTarget.blur();
                }
              }}
            />
            <button
              className="ghost"
              onClick={() => {
                const el = document.querySelector<HTMLInputElement>(".txt");
                void el;
              }}
            >
              {t(T("回车应用词表", "Enter to apply"))}
            </button>
          </div>
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
  Render({ scene, t }) {
    return <GraphCanvas scene={scene} t={t} />;
  },
};