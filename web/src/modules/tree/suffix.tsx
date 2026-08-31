import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  suffixTrieBuildSteps,
  suffixTreeFrames,
  type TrieNode,
  type TrieStep,
} from "../../lib/trie";
import { GraphCanvas, type GraphCanvasScene } from "../../components/canvas/GraphCanvas";

// ---------- 后缀树（两段式）：后缀字典树 → 压缩后缀树 ----------

type Mode = "build" | "search";
type Cfg = {
  text: string;
  target: string;
  mode: Mode;
};
const DEFAULT: Cfg = { text: "banana", target: "ana", mode: "build" };
const CODE: Record<Mode, Text[]> = {
  build: [
    T("后缀字典树：插入 $s+\\$$ 的全部后缀 $s_i..s_n$", "suffix trie: insert every suffix of $s+\\$$ ($\\$$ = terminator)"),
    T("merge 单子路径 $u \\to$ 父边  // 边标签 = 子串", "merge single-child $u \\to$ parent edge  // edge label = substring"),
    T("// 后缀树完成：边标 = 后缀；$LCS$/回文关键结构", "// suffix tree done: edge = suffix; key for $LCS$/palindromes"),
  ],
  search: [
    T("沿边标签匹配子串（可能跨字符）", "match substring along edge labels"),
    T("命中 → 后缀存在  // 出现次数 = 叶数", "hit → substring exists  // count = #leaves"),
  ],
};

const BOX = { x0: 26, y0: 24, w: 708, h: 400 };

/** TrieNode 快照 → GraphCanvasScene（字符节点；压缩后边标签 = 子串） */
function trieScene(
  nodes: TrieNode[],
  focus: number | null,
  edgeLabels?: Record<string, string>,
  extra?: Partial<GraphCanvasScene>,
): GraphCanvasScene {
  const pos = layout(nodes);
  // 词尾（$ 或后缀结束）节点用蓝 tone 标出
  const tone: Record<number, number> = {};
  nodes.forEach((n) => {
    if (n.isEnd) tone[n.id] = 1;
  });
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
    ...(Object.keys(tone).length ? { tone } : {}),
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
  const stepY = Math.min(64, Math.max(38, BOX.h / Math.max(2, maxDepth + 1)));
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
  return pos;
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const s = cfg.text.trim();
  if (!s) {
    return [
      {
        line: 0,
        caption: T("请输入字符串（如 banana）", "enter a string (e.g. banana)"),
        scene: trieScene([], null),
      },
    ];
  }
  if (cfg.mode === "build") {
    // 阶段 1：后缀字典树
    const trieSteps = suffixTrieBuildSteps(s);
    const frames: Frame<GraphCanvasScene>[] = trieSteps.map((st) => ({
      line: st.line,
      caption: st.msg,
      scene: trieScene(st.nodes, st.focus),
    }));
    const base = trieSteps[trieSteps.length - 1].nodes;
    // 阶段 2：逐步压缩 → 后缀树（每帧 = 一次单子路径合并；边标签 = 子串）
    const compressed = suffixTreeFrames(base, 0);
    compressed.forEach((f, i) => {
      frames.push({
        line: 1,
        caption: T(
          `压缩 ${i + 1}/${compressed.length}：合并单子路径 → 边标签=子串`,
          `compress ${i + 1}/${compressed.length}: merge single-child paths → edge=substring`,
        ),
        scene: trieScene(f.nodes, null, f.edgeLabels),
      });
    });
    const last = compressed[compressed.length - 1];
    frames.push({
      line: 2,
      caption: T(
        `后缀树完成：“${s}” · 节点 ${last.nodes.length} · 叶 = 后缀数 $n+1=${s.length + 1}$`,
        `suffix tree done: "${s}" · ${last.nodes.length} nodes · leaves = suffixes ${s.length + 1}`,
      ),
      scene: trieScene(last.nodes, null, last.edgeLabels),
    });
    return frames;
  }
  // search：先在未压缩后缀字典树上沿字符匹配（演示子串存在性 + 出现次数）
  if (!cfg.target) {
    return [
      {
        line: 0,
        caption: T("请输入要查的子串", "enter a substring to search"),
        scene: trieScene([], null),
      },
    ];
  }
  const trieSteps = suffixTrieBuildSteps(s);
  const base = trieSteps[trieSteps.length - 1].nodes;
  const steps: TrieStep[] = [];
  steps.push({
    line: 0,
    nodes: base.map((n) => ({ ...n, children: { ...n.children } })),
    visible: base.length,
    root: 0,
    focus: null,
    edge: null,
    msg: { zh: `查子串 “${cfg.target}” ∈ 后缀树（“${s}”）`, en: `search "${cfg.target}" in suffix tree of "${s}"` },
  });
  let p: number | null = 0;
  let ok = true;
  for (const ch of cfg.target) {
    const c: number | undefined =
      p === null ? undefined : base[p].children[ch];
    if (c === undefined) {
      ok = false;
      steps.push({
        line: 1,
        nodes: base.map((n) => ({ ...n, children: { ...n.children } })),
        visible: base.length,
        root: 0,
        focus: p,
        edge: null,
        msg: { zh: `字符 ${ch} 无此孩子 → “${cfg.target}” 不是后缀/不出现`, en: `no child '${ch}' → not a substring` },
      });
      break;
    }
    p = c;
    steps.push({
      line: 1,
      nodes: base.map((n) => ({ ...n, children: { ...n.children } })),
      visible: base.length,
      root: 0,
      focus: p,
      edge: [p, base[p].parent!],
      msg: { zh: `匹配 ${ch} → 现在 ${cfg.target.slice(0, cfg.target.indexOf(ch) + 1)}`, en: `match '${ch}'` },
    });
  }
  if (ok) {
    // 出现次数 = 该 →路径下叶子数（含 $ 深度的词尾节点）
    const visited: number[] = [];
    const stack = [p as number];
    while (stack.length) {
      const u = stack.pop()!;
      if (Object.keys(base[u].children).length === 0) visited.push(u);
      for (const v of Object.values(base[u].children)) stack.push(v);
    }
    steps.push({
      line: 2,
      nodes: base.map((n) => ({ ...n, children: { ...n.children } })),
      visible: base.length,
      root: 0,
      focus: null,
      edge: null,
      msg: {
        zh: `“${cfg.target}” 出现 ${visited.length} 次（=该子树后缀叶数）`,
        en: `"${cfg.target}" occurs ${visited.length} time(s)`,
      },
    });
  }
  return steps.map((st) => ({
    line: st.line,
    caption: st.msg,
    scene: trieScene(st.nodes, st.focus),
  }));
}

export const SuffixTreeModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "suffix-tree",
  title: T("后缀树", "Suffix Tree"),
  desc: T(
    "两段式建树(后缀字典树 → 压缩成后缀树，边标签=子串)/ 子串查找(带出现次数)；$$$ 结束符；Ukkonen 在线算法留作讲义延伸",
    "two-stage build (suffix trie → compressed suffix tree, edge=substring) · substring search with occurrence count; $ terminator; Ukkonen's online algorithm deferred to notes",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const pool = ["banana", "mississippi", "ababa", "aardvark", "kate", "cababcab"];
    return { ...c, text: pool[Math.floor(Math.random() * pool.length)] };
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
            <option value="search">{t(T("查子串", "Search"))}</option>
          </select>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
          >
            <span>{t(T("字符串", "String"))}</span>
            <input
              className="txt"
              style={{ width: 110 }}
              value={config.text}
              onChange={(e) => onChange({ ...config, text: e.target.value })}
            />
          </label>
          {config.mode === "search" && (
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
            >
              <span>{t(T("子串", "Sub"))}</span>
              <input
                className="txt"
                style={{ width: 76 }}
                value={config.target}
                onChange={(e) =>
                  onChange({ ...config, target: e.target.value.trim() })
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
  Render({ scene, t }) {
    return <GraphCanvas scene={scene} t={t} />;
  },
};