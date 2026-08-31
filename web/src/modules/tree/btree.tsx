import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bTreeInsertSteps,
  bTreeDeleteOnTree,
  bTreeLayout,
  BTREE_SEARCH_CODE,
  BTREE_INSERT_CODE,
  BTREE_DELETE_CODE,
  type BNode,
  type BStep,
  type BTreeSnap,
} from "../../lib/btree";
import { GraphCanvas, type GraphCanvasScene } from "../../components/canvas/GraphCanvas";

type Mode = "build" | "delete" | "search";
type Cfg = {
  values: number[];
  m: number;
  mode: Mode;
  target: number;
  work?: BTreeSnap | null;
  applied?: boolean;
};
const DEFAULT: Cfg = {
  values: [52, 14, 61, 8, 20, 29, 45, 66, 72, 95],
  m: 4,
  mode: "build",
  target: 20,
};
const CODE: Record<Mode, Text[]> = {
  build: BTREE_INSERT_CODE,
  delete: BTREE_DELETE_CODE,
  search: BTREE_SEARCH_CODE,
};

const BOX = { x0: 26, y0: 24, w: 708, h: 400 };

function bScene(
  nodes: BNode[],
  focus: number | null,
  root: number,
  extra?: Partial<GraphCanvasScene>,
): GraphCanvasScene {
  const pos = bTreeLayout(nodes, root, BOX);
  return {
    current: focus,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: "",
      keys: n.keys,
      x: pos[n.id]?.x ?? 0,
      y: pos[n.id]?.y ?? 0,
    })),
    edges: nodes.flatMap((n) =>
      n.children.map((c) => ({ u: n.id, v: c })),
    ),
    root,
    ...(extra ?? {}),
  };
}

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const m = Math.min(5, Math.max(3, cfg.m));
  const values = cfg.values.filter((v) => Number.isFinite(v));
  if (values.length === 0) {
    return [
      {
        line: 0,
        caption: T("值序列为空", "empty value sequence"),
        scene: bScene([], null, 0),
      },
    ];
  }
  const base: BTreeSnap = cfg.work ?? { nodes: [], root: 0 };
  if (cfg.mode === "build") {
    if ((cfg.applied && !!cfg.work) || cfg.work?.nodes.length) {
      const n = cfg.work!.nodes.reduce((s, x) => s + x.keys.length, 0);
      return [
        {
          line: 4,
          caption: T(
            `当前 B${m} 树 · 键 ${n} 个（改值后重播建树）`,
            `current B${m} tree · ${n} keys (tweak values to rebuild)`,
          ),
          scene: bScene(cfg.work!.nodes, null, cfg.work!.root),
        },
      ];
    }
    const steps = bTreeInsertSteps(values, m);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: bScene(s.nodes, s.focus, s.root),
    }));
  }
  // search / delete：未建树先自动建树
  if (base.nodes.length === 0) {
    if (cfg.mode === "search") {
      return [
        {
          line: 0,
          caption: T("请先播「建树」获得一棵 B 树", "play Build (init) first"),
          scene: bScene([], null, 0),
        },
      ];
    }
    const st = bTreeInsertSteps(values, m);
    const built: BTreeSnap = { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root };
    return [...st]
      .concat(
        bTreeDeleteOnTree(built.nodes, built.root, m, cfg.target).steps,
      )
      .map((s, i) => ({
        line: s.line,
        caption: s.msg,
        scene: bScene(
          s.nodes,
          s.focus,
          s.root,
          i < st.length - 1 ? {} : undefined,
        ),
      }));
  }
  if (cfg.mode === "search") {
    // B 树查找：借 build 的插入帧不够——这里用简化定位帧（沿键下探）
    const nodes = base.nodes;
    const steps: BStep[] = [];
    let p = base.root;
    let found = false;
    while (true) {
      const i = lowerBoundLoc(nodes[p].keys, cfg.target);
      steps.push({
        line: 0,
        nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
        visible: nodes.length,
        root: base.root,
        focus: p,
        edge: null,
        msg: {
          zh: `${nodes[p].keys.includes(cfg.target) ? `命中 ${cfg.target} ∈ ` : `下探 `}[${nodes[p].keys.join(",")}]$`,
          en: `${nodes[p].keys.includes(cfg.target) ? `hit ${cfg.target} in ` : `descend `}[${nodes[p].keys.join(",")}]`,
        },
      });
      if (nodes[p].keys.includes(cfg.target)) {
        found = true;
        break;
      }
      if (nodes[p].children.length === 0) break;
      p = nodes[p].children[i];
    }
    if (!found) {
      steps.push({
        line: 2,
        nodes: nodes.map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] })),
        visible: nodes.length,
        root: base.root,
        focus: null,
        edge: null,
        msg: { zh: `$x=${cfg.target}$ 不存在`, en: `not found` },
      });
    }
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: bScene(s.nodes, s.focus, s.root),
    }));
  }
  // delete
  if (cfg.applied && cfg.work) {
    return [
      {
        line: 5,
        caption: T(
          `删除已完成 · 当前树（改参数后重播）`,
          `deleted · current tree (tweak to replay)`,
        ),
        scene: bScene(cfg.work.nodes, null, cfg.work.root),
      },
    ];
  }
  const out = bTreeDeleteOnTree(base.nodes, base.root, m, cfg.target);
  return out.steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: bScene(s.nodes, s.focus, s.root),
  }));
}

/** 本地 lowerBound：返回 x 应处位置（keys.includes 兼容重复键场景） */
function lowerBoundLoc(keys: number[], x: number): number {
  let lo = 0,
    hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function applyOnEnd(cfg: Cfg): Cfg | null {
  if (cfg.applied) return null;
  const values = cfg.values.filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const m = Math.min(5, Math.max(3, cfg.m));
  let result: BTreeSnap;
  if (cfg.mode === "build") {
    const st = bTreeInsertSteps(values, m);
    result = { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root };
  } else if (cfg.mode === "delete") {
    const base: BTreeSnap =
      cfg.work && cfg.work.nodes.length
        ? cfg.work
        : { nodes: bTreeInsertSteps(values, m)[bTreeInsertSteps(values, m).length - 1].nodes, root: bTreeInsertSteps(values, m)[bTreeInsertSteps(values, m).length - 1].root };
    result = bTreeDeleteOnTree(base.nodes, base.root, m, cfg.target).result;
  } else return null;
  return { ...cfg, work: result, applied: true };
}

export const treeBTreeModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "btree",
  title: T("B 树", "B-Tree"),
  desc: T(
    "建树（逐键插入 + 满节点分裂，m=3/4/5 可调，m=3 即 2-3 树）/ 查找 / 删除（借 + 合并）；货架节点 = 一行多键；播完自动应用为新版本",
    "build (insert + split; order m=3/4/5, m=3 is 2-3 tree) · search · delete (borrow + merge); shelf nodes hold multiple keys; auto-applies on play end",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const pool = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return { ...c, values: pool.slice(0, 8 + Math.floor(Math.random() * 3)), work: null, applied: false };
  },
  onPlayEnd: applyOnEnd,
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
              onChange({ ...config, mode: e.target.value as Mode, applied: false })
            }
          >
            <option value="build">{t(T("建树", "Build"))}</option>
            <option value="search">{t(T("查找", "Search"))}</option>
            <option value="delete">{t(T("删除", "Delete"))}</option>
          </select>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
          >
            <span>{t(T("阶 m", "Order"))}</span>
            <select
              className="txt"
              value={config.m}
              onChange={(e) =>
                onChange({
                  ...config,
                  m: Number(e.target.value),
                  work: null,
                  applied: false,
                })
              }
            >
              <option value={3}>3 (2-3 树)</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          {(config.mode === "delete" || config.mode === "search") && (
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}
            >
              <span>
                {config.mode === "delete" ? t(T("删值", "Key")) : t(T("目标", "Target"))}
              </span>
              <input
                className="txt"
                type="number"
                style={{ width: 56 }}
                value={config.target}
                onChange={(e) =>
                  onChange({ ...config, target: Number(e.target.value), applied: false })
                }
              />
            </label>
          )}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
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
                  if (vs.length) {
                    onChange({ ...config, values: vs, work: null, applied: false });
                    e.currentTarget.blur();
                  }
                }
              }}
            />
            <button
              className="ghost"
              onClick={() => {
                const vs = draft
                  .split(/[\s,，、]+/)
                  .map((s) => Number(s.trim()))
                  .filter((v) => Number.isFinite(v));
                if (vs.length) {
                  onChange({ ...config, values: vs, work: null, applied: false });
                }
              }}
            >
              {t(T("应用值", "Apply"))}
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