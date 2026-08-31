import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bPlusInsertSteps,
  bTreeLayout,
  bPlusLeaves,
  lowerBound,
  BTREE_SEARCH_CODE,
  BTREE_INSERT_CODE,
  type BNode,
  type BStep,
  type BTreeSnap,
} from "../../lib/btree";
import { GraphCanvas, type GraphCanvasScene } from "../../components/canvas/GraphCanvas";

type Mode = "build" | "search" | "range";
type Cfg = {
  values: number[];
  m: number;
  mode: Mode;
  target: number;
  lo: number;
  hi: number;
  work?: BTreeSnap | null;
};
const DEFAULT: Cfg = {
  values: [8, 15, 20, 29, 36, 42, 51, 58, 63, 70, 77, 85, 90],
  m: 4,
  mode: "build",
  target: 42,
  lo: 20,
  hi: 63,
};
const CODE: Record<Mode, Text[]> = {
  build: BTREE_INSERT_CODE,
  search: BTREE_SEARCH_CODE,
  range: [
    T("$range(l, r)$：先找 $l$ 的下界叶", "range(l, r): locate the leaf for l"),
    T("沿叶子右链扫描 $\to$ 收集 $[l, r]$（虚线=叶子链）", "scan the leaf chain → collect $[l, r]$ (dashed = leaf chain)"),
    T("// 范围查询只扫叶子，$O(k+\\log n)$", "// range scan touches leaves only, $O(k+\\log n)$"),
  ],
};

const BOX = { x0: 26, y0: 24, w: 708, h: 400 };
/** 内部节点 / 叶子 tone：内=黄(2) 叶=蓝(1)?换用清晰的教学配色：内部=实底白、叶=蓝底白字 */
const LEAF_TONE = 1;

/** BNode 快照 → GraphCanvasScene：货架渲染 + 内部/叶子双色调 + 叶子右链虚线边 */
function bScene(
  nodes: BNode[],
  focus: number | null,
  root: number,
  rangeHl?: Set<number>,
): GraphCanvasScene {
  const pos = bTreeLayout(nodes, root, BOX);
  const leaves = bPlusLeaves(nodes);
  const tone: Record<number, number> = {};
  nodes.forEach((n) => {
    if (n.children.length === 0) tone[n.id] = LEAF_TONE; // 叶子蓝
  });
  // 叶子链虚线边（u→v）
  const chainEdges: { u: number; v: number; dashed: boolean }[] = [];
  for (let i = 0; i + 1 < leaves.length; i++)
    chainEdges.push({ u: leaves[i], v: leaves[i + 1], dashed: true });
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  const chainSet = new Set(chainEdges.map((e) => edgeKey(e.u, e.v)));
  // 范围查询：命中叶子天蓝环
  const frontier =
    rangeHl && rangeHl.size
      ? Array.from(rangeHl).filter((id) => nodes[id]?.children.length === 0)
      : [];
  return {
    current: focus,
    exploring: null,
    visited: [],
    frontier,
    order: [],
    edge: null,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: "",
      keys: n.keys,
      x: pos[n.id]?.x ?? 0,
      y: pos[n.id]?.y ?? 0,
    })),
    edges: [
      ...nodes.flatMap((n) =>
        n.children.map((c) => ({
          u: n.id,
          v: c,
          dashed: chainSet.has(edgeKey(n.id, c)),
        })),
      ),
      ...chainEdges,
    ],
    root,
    ...(Object.keys(tone).length ? { tone } : {}),
  };
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const m = Math.min(5, Math.max(3, cfg.m));
  const values = cfg.values.filter((v) => Number.isFinite(v));
  if (values.length === 0)
    return [
      {
        line: 0,
        caption: T("值序列为空", "empty value sequence"),
        scene: bScene([], null, 0),
      },
    ];
  if (cfg.mode === "build") {
    if (cfg.work?.nodes.length) {
      const n = cfg.work.nodes.reduce((s, x) => s + x.keys.length, 0);
      const leaves = bPlusLeaves(cfg.work.nodes).length;
      return [
        {
          line: 4,
          caption: T(
            `当前 B+ 树 · 内层节点数 ${cfg.work.nodes.length - leaves} · 叶 ${leaves} 个 · 键 ${n} 个`,
            `current B+ tree · internal ${cfg.work.nodes.length - leaves} · leaves ${leaves} · keys ${n}`,
          ),
          scene: bScene(cfg.work.nodes, null, cfg.work.root),
        },
      ];
    }
    const steps = bPlusInsertSteps(values, m);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: bScene(s.nodes, s.focus, s.root),
    }));
  }
  const base: BTreeSnap =
    cfg.work && cfg.work.nodes.length
      ? cfg.work
      : { nodes: bPlusInsertSteps(values, m)[bPlusInsertSteps(values, m).length - 1].nodes, root: bPlusInsertSteps(values, m)[bPlusInsertSteps(values, m).length - 1].root };
  if (cfg.mode === "search") {
    // 沿索引下探 → 叶命中
    const nodes = base.nodes;
    const steps: BStep[] = [];
    let p = base.root;
    let found = false;
    while (true) {
      const i = lowerBound(nodes[p].keys, cfg.target);
      const hitInNode = nodes[p].keys.includes(cfg.target);
      steps.push({
        line: 0,
        nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
        visible: nodes.length,
        root: base.root,
        focus: p,
        edge: null,
        msg: {
          zh: `${hitInNode ? `叶 ${p} 命中 ${cfg.target} ∈ ` : `下探激活扇区 `}[${nodes[p].keys.join(",")}]$`,
          en: `${hitInNode ? `leaf ${p} hit ${cfg.target} in ` : `descend via `}[${nodes[p].keys.join(",")}]`,
        },
      });
      if (hitInNode) {
        found = true;
        break;
      }
      if (nodes[p].children.length === 0) break;
      p = nodes[p].children[i];
    }
    if (!found)
      steps.push({
        line: 2,
        nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
        visible: nodes.length,
        root: base.root,
        focus: null,
        edge: null,
        msg: { zh: `$x=${cfg.target}$ 不存在`, en: `not found` },
      });
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: bScene(s.nodes, s.focus, s.root),
    }));
  }
  // range：找下界叶 → 沿叶子链扫描收集 [lo, hi]
  const nodes = base.nodes;
  const steps: BStep[] = [];
  const leaves = bPlusLeaves(nodes);
  // 定位 lo 所在叶（last leaf with max < lo 的下一叶）
  let p = base.root;
  let loLeaf = -1;
  while (nodes[p].children.length > 0) {
    const i = lowerBound(nodes[p].keys, cfg.lo);
    steps.push({
      line: 0,
      nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
      visible: nodes.length,
      root: base.root,
      focus: p,
      edge: null,
      msg: { zh: `找 $l=${cfg.lo}$ 下界 → 索引层扇区 ${i}`, en: `locate l=${cfg.lo}` },
    });
    p = nodes[p].children[i];
  }
  const targetLeaf = leaves.find((L) => nodes[L].keys.some((k) => k >= cfg.lo)) ?? leaves[leaves.length - 1];
  loLeaf = targetLeaf;
  steps.push({
    line: 1,
    nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
    visible: nodes.length,
    root: base.root,
    focus: loLeaf,
    edge: null,
    msg: {
      zh: `下界叶 → ${nodes[loLeaf].keys.join(",")}`,
      en: `lower-bound leaf: ${nodes[loLeaf].keys.join(",")}`,
    },
  });
  // 沿叶子链扫描
  const hit = new Set<number>();
  const collected: number[] = [];
  let done = false;
  for (const L of leaves.slice(leaves.indexOf(loLeaf))) {
    for (const k of nodes[L].keys) {
      if (k >= cfg.lo) {
        hit.add(L);
        if (k <= cfg.hi) collected.push(k);
        else {
          done = true;
          break;
        }
      }
    }
    if (done) break;
    if (L !== loLeaf)
      steps.push({
        line: 1,
        nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
        visible: nodes.length,
        root: base.root,
        focus: L,
        edge: null,
        msg: { zh: `叶子链 → 叶 ${L}：[${nodes[L].keys.join(",")}]`, en: `leaf chain → leaf ${L}: [${nodes[L].keys.join(",")}]` },
      });
  }
  steps.push({
    line: 2,
    nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
    visible: nodes.length,
    root: base.root,
    focus: null,
    edge: null,
    msg: {
      zh: `范围 $[${cfg.lo}, ${cfg.hi}]$ → ${collected.length ? collected.join(", ") : "∅"}`,
      en: `range [${cfg.lo}, ${cfg.hi}] → ${collected.length ? collected.join(", ") : "∅"}`,
    },
  });
  return steps.map((s, i) => ({
    line: s.line,
    caption: s.msg,
    scene: bScene(
      s.nodes,
      s.focus,
      s.root,
      i === steps.length - 1 && collected.length ? hit : undefined,
    ),
  }));
}

export const BPlusModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "btree-plus",
  title: T("B+ 树", "B+ Tree"),
  desc: T(
    "建树（键全在叶，内层只放索引键，叶满分裂）· 查找 · 范围查询（沿叶子右链虚线扫描，$O(k+\\log n)$）；叶子蓝色 + 虚线右链为 B+ 特色",
    "build (keys only in leaves, internal = index; split on full leaf) · search · range query (scan dashed leaf chain, $O(k+\\log n)$); blue leaves + dashed right chain are the B+ signature",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const pool = Array.from({ length: 26 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const values = pool.slice(0, 10 + Math.floor(Math.random() * 5)).sort((a, b) => a - b);
    return { ...c, values, work: null };
  },
  onPlayEnd(cfg) {
    if (cfg.mode !== "build") return null;
    const values = cfg.values.filter((v) => Number.isFinite(v));
    if (!values.length) return null;
    const m = Math.min(5, Math.max(3, cfg.m));
    const st = bPlusInsertSteps(values, m);
    return { ...cfg, work: { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root } };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const [draft, setDraft] = useState(config.values.join(", "));
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
            <option value="range">{t(T("范围查询", "Range"))}</option>
          </select>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
          >
            <span>{t(T("阶 m", "Order"))}</span>
            <select
              className="txt"
              value={config.m}
              onChange={(e) =>
                onChange({ ...config, m: Number(e.target.value), work: null })
              }
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          {(config.mode === "search" || config.mode === "range") && (
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
            >
              <span>
                {config.mode === "search" ? t(T("目标", "Key")) : t(T("下界 l", "lower l"))}
              </span>
              <input
                className="txt"
                type="number"
                style={{ width: 52 }}
                value={config.mode === "search" ? config.target : config.lo}
                onChange={(e) =>
                  onChange({
                    ...config,
                    ...(config.mode === "search"
                      ? { target: Number(e.target.value) }
                      : { lo: Number(e.target.value) }),
                  })
                }
              />
            </label>
          )}
          {config.mode === "range" && (
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
            >
              <span>{t(T("上界 h", "upper h"))}</span>
              <input
                className="txt"
                type="number"
                style={{ width: 52 }}
                value={config.hi}
                onChange={(e) => onChange({ ...config, hi: Number(e.target.value) })}
              />
            </label>
          )}
          {config.mode === "build" && (
            <div
              style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
            >
              <input
                className="txt"
                style={{ width: 200 }}
                defaultValue={draft}
                placeholder={isZh ? "值序列（逗号分隔）" : "values, comma separated"}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const vs = draft
                      .split(/[\s,，、]+/)
                      .map((s) => Number(s.trim()))
                      .filter((v) => Number.isFinite(v));
                    if (vs.length)
                      onChange({ ...config, values: vs, work: null });
                    e.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const vs = draft
                    .split(/[\s,，、]+/)
                    .map((s) => Number(s.trim()))
                    .filter((v) => Number.isFinite(v));
                  if (vs.length)
                    onChange({ ...config, values: vs, work: null });
                }}
              >
                {t(T("应用值", "Apply"))}
              </button>
            </div>
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