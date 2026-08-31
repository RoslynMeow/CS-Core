import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  bstSearchOnTree,
  BST_SEARCH_CODE,
  type BinNode,
  type BstStep,
  type TreeSnap,
} from "../../lib/graph";
import {
  rbInsertSteps,
  rbInsertOne,
  rbDeleteOnTree,
  RB_INSERT_CODE,
  RB_DELETE_CODE,
  bhAnn,
} from "../../lib/rbtree";
import {
  TONE_FILL,
  HL_RING,
  type GraphCanvasScene,
} from "../../components/canvas/GraphCanvas";
import {
  resolveTree,
  SourcePanel,
  randSeq,
  binScene,
  importPreviewFrames,
  TreeCanvas,
  buildDualFrames,
  type TreeCfg,
} from "./source";

type Mode = "view" | "search" | "build" | "insert" | "delete";
type Cfg = TreeCfg & {
  mode: Mode;
  target: number;
  x: number;
  /** 播完自动应用标记：操作结果已写入 work；保持所选操作、静态展示结果，改参数后重播 */
  applied?: boolean;
};
const DEFAULT: Cfg = {
  source: "graph",
  values: [7, 3, 18, 10, 22, 8, 11, 26, 2, 6, 13],
  imp: null,
  confirmed: true,
  mode: "build",
  target: 11,
  x: 5,
};

const VIEW_CODE: Text[] = [T("查看当前树", "view current tree")];
const CODE: Record<Mode, Text[]> = {
  view: VIEW_CODE,
  search: BST_SEARCH_CODE as unknown as Text[],
  build: RB_INSERT_CODE,
  insert: RB_INSERT_CODE,
  delete: RB_DELETE_CODE,
};

/** 红黑树着色：红节点 → tone 0（#dc2626），黑节点 → tone 4（#1e293b） */
const RB_TONE = { red: 0, black: 4 } as const;
function rbToneFor(nodes: BinNode[]): Record<number, number> {
  const tone: Record<number, number> = {};
  nodes.forEach((n, i) => (tone[i] = n.red ? RB_TONE.red : RB_TONE.black));
  return tone;
}
/** binScene + 红黑 tone：任何节点快照 → 画布场景（查找/插入/删除帧、静态树通用） */
function rbScene(
  nodes: BinNode[],
  hl: {
    current?: number | null;
    exploring?: number | null;
    visited?: number[];
    frontier?: number[];
    edge?: [number, number] | null;
    order?: number[];
  },
  root = 0,
  ann?: Record<number, string>,
): GraphCanvasScene {
  return { ...binScene(nodes, hl, root, ann), tone: rbToneFor(nodes) };
}

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
  const base: TreeSnap = cfg.work ?? { nodes: res.nodes, root: 0 };
  // 红黑树没有「导入即合法」：颜色只能由建树/插入/删除生成 → 必须 work 存在才算已建树
  const built = !!cfg.work;
  // 建树 = 初始化：已建树（work 存在）时静态展示当前树；
  // 未建树（无 work）的 mode=build → 双面板建树动画（随机序列或图导入的树作左侧输入树）
  if ((cfg.mode === "build" && built) || (cfg.applied && built)) {
    const appliedTxt =
      cfg.applied && cfg.mode !== "build"
        ? T(
            `当前树 · ${base.nodes.length} 节点 · 已应用该操作（改参数后重播）`,
            `current tree · ${base.nodes.length} nodes · op applied (tweak params to replay)`,
          )
        : T(
            `当前树 · ${base.nodes.length} 节点 · 红/黑合法（根黑·红红不相邻·黑高一致）`,
            `current RB tree · ${base.nodes.length} nodes · root black, no red-red, same black height`,
          );
    return [
      {
        line: 0,
        caption: appliedTxt,
        scene: rbScene(base.nodes, {}, base.root, bhAnn(base.nodes)),
      },
    ];
  }
  if (cfg.mode === "view") {
    return [
      {
        line: 0,
        caption: T(
          `当前树 · ${base.nodes.length} 节点 · 可选 查找/插入/删除`,
          `current tree · ${base.nodes.length} nodes · pick search/insert/delete`,
        ),
        scene: rbScene(base.nodes, {}, base.root, bhAnn(base.nodes)),
      },
    ];
  }
  // 无建树（非图来源）：其余操作先提示建树
  if (!built && cfg.mode !== "build") {
    return [
      {
        line: 0,
        caption: T(
          "请先建树：默认「建树」播放结束即初始化完成",
          "Build first: play the default Build (init) first",
        ),
        scene: rbScene(base.nodes, {}, base.root, bhAnn(base.nodes)),
      },
    ];
  }
  let steps: BstStep[];
  if (cfg.mode === "search")
    steps = bstSearchOnTree(base.nodes, base.root, cfg.target);
  else if (cfg.mode === "build") steps = rbInsertSteps(res.values);
  else if (cfg.mode === "insert")
    steps = rbInsertOne(base.nodes, base.root, cfg.x).steps;
  else steps = rbDeleteOnTree(base.nodes, base.root, cfg.target).steps;
  // 建树：双面板动画 — 左：输入树（随机生成 / 图导入；已插入节点逐颗“拆走”、下一个高亮），
  // 右：正在建立的红黑树（新节点从输入树位置“飞”过来 + 光束；红/黑 tone 着色）
  if (cfg.mode === "build") {
    return buildDualFrames(
      steps,
      res.values,
      base.nodes,
      T("红黑树 · 正在建立", "RB tree · building"),
      bhAnn,
      cfg.source === "graph"
        ? T("图编辑导入的树 · 输入", "Imported tree · input")
        : undefined,
      rbToneFor,
    );
  }
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: rbScene(
      s.nodes,
      { current: s.focus, edge: s.edge },
      s.root,
      bhAnn(s.nodes),
    ),
  }));
}

/** 播完自动应用：建树/插入/删除 结束即把结果写入 work（带颜色）；保持所选操作不回跳 */
function applyOnEnd(cfg: Cfg): Cfg | null {
  if (cfg.applied) return null;
  const res = resolveTree(cfg, { requireNumeric: true });
  if (!res.ok || res.values.length === 0) return null;
  const base: TreeSnap = cfg.work ?? { nodes: res.nodes, root: 0 };
  let result: TreeSnap;
  if (cfg.mode === "build") {
    const st = rbInsertSteps(res.values);
    result = { nodes: st[st.length - 1].nodes, root: st[st.length - 1].root };
  } else if (cfg.mode === "insert") {
    result = rbInsertOne(base.nodes, base.root, cfg.x).result;
  } else if (cfg.mode === "delete") {
    result = rbDeleteOnTree(base.nodes, base.root, cfg.target).result;
  } else return null;
  return { ...cfg, work: result, applied: true };
}

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

/** 右侧面板：红黑图例（替代伪代码占位）+ 点击节点 → 颜色/黑高/父/子/叔/兄弟 */
function RbSide({
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
  // BFS 重建父子关系（scene 只有 edges）
  const n = scene.nodes.length;
  const root =
    typeof scene.root === "number" && scene.root >= 0 ? scene.root : 0;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of scene.edges) {
    adj[e.u]?.push(e.v);
    adj[e.v]?.push(e.u);
  }
  const parent = Array(n).fill(-1);
  const children: number[][] = Array.from({ length: n }, () => []);
  const order: number[] = [];
  if (n > 0) {
    const seen = new Set<number>([root]);
    const q = [root];
    for (let head = 0; head < q.length; head++) {
      const u = q[head];
      order.push(u);
      for (const v of adj[u] ?? [])
        if (!seen.has(v)) {
          seen.add(v);
          parent[v] = u;
          children[u].push(v);
          q.push(v);
        }
    }
  }
  // 黑高：bh(u) = (u黑?1:0) + max(bh(子))；NIL=0；红黑树两子树黑高相等
  const bh = Array(n).fill(0);
  for (const u of [...order].reverse()) {
    const l = children[u][0],
      r = children[u][1];
    const lh = l === undefined ? 0 : bh[l];
    const rh = r === undefined ? 0 : bh[r];
    bh[u] = (scene.tone?.[u] === RB_TONE.red ? 0 : 1) + Math.max(lh, rh);
  }
  const info = inspected == null ? null : scene.nodes[inspected] ?? null;
  const isRed = info ? scene.tone?.[info.id] === RB_TONE.red : false;
  const S = (i: number) =>
    String(scene.nodes[i]?.label ?? i);
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
        {t(T("图例 · 红黑树", "Legend · Red-Black"))}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Swatch color={TONE_FILL[RB_TONE.red]} />
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
            {t(T("红节点", "Red node"))}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Swatch color={TONE_FILL[RB_TONE.black]} />
          <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
            {t(T("黑节点", "Black node"))}
          </span>
        </div>
        <div style={{ height: 1, background: "#1e293b", margin: "4px 0" }} />
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
          {t(
            T(
              "五条性质：①节点非红即黑 ②根黑 ③叶(NIL)黑 ④红红不相邻 ⑤任意节点到叶的所有路径黑高相等",
              "5 rules: ①red or black ②root black ③leaves(NIL) black ④no red-red ⑤equal black-height on every path",
            ),
          )}
        </div>
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
            {t(T("播放中：当前节点（琥珀环）", "playing: current (amber ring)"))}
          </span>
        </div>
        <div style={{ height: 1, background: "#1e293b", margin: "4px 0" }} />
        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
          {t(
            T(
              "节点下方 bh=黑高 标注；点击画布任一节点 → 显示颜色/黑高/父/子/叔/兄弟",
              "bh=black-height annotates every node; click a canvas node to inspect color / black-height / parent / children / uncle / siblings",
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
              <Swatch color={TONE_FILL[isRed ? RB_TONE.red : RB_TONE.black]} />
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "2px 14px",
              }}
            >
              {kv(
                t(T("颜色", "Color")),
                t(T(isRed ? "红 · RED" : "黑 · BLACK", isRed ? "RED" : "BLACK")),
              )}
              {kv(t(T("黑高（bh）", "Black-height")), String(bh[info.id] ?? 0))}
              {kv(
                t(T("父", "Parent")),
                parent[info.id] === -1 ? "—" : S(parent[info.id]),
              )}
              {kv(
                t(T("叔", "Uncle")),
                parent[info.id] === -1 || parent[parent[info.id]] === -1
                  ? "—"
                  : (() => {
                      const gp = parent[parent[info.id]];
                      const p = parent[info.id];
                      return S(children[gp][0] === p ? children[gp][1] : children[gp][0] ?? gp);
                    })(),
              )}
              {kv(
                t(T("左子", "Left")),
                children[info.id][0] === undefined
                  ? "NIL"
                  : S(children[info.id][0]),
              )}
              {kv(
                t(T("右子", "Right")),
                children[info.id][1] === undefined
                  ? "NIL"
                  : S(children[info.id][1]),
              )}
              {kv(
                t(T("兄弟", "Sibling")),
                parent[info.id] === -1
                  ? "—"
                  : (() => {
                      const c = children[parent[info.id]];
                      return c[0] === info.id
                        ? c[1] === undefined
                          ? "NIL"
                          : S(c[1])
                        : S(c[0]);
                    })(),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const treeRbModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-rb",
  title: T("红黑树 · RB", "Red-Black Tree"),
  desc: T(
    "建树（初始化）/ 查找 / 插入 / 删除；插入修复 case1-3、删除修复 case1-4（含二次替换与全部旋转）；红/黑着色 + 黑高标注；播完自动保存为新版本（导入当前图可覆盖回原图）",
    "build (init) · search · insert · delete; insert fixups case1-3, delete fixups case1-4; red/black coloring + black-height; auto-applies on play end (import to revert)",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    return { ...c, values: randSeq(), work: null, applied: false };
  },
  onPlayEnd: applyOnEnd,
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
              onChange({
                ...config,
                mode: e.target.value as Mode,
                applied: false,
              })
            }
          >
            <option value="build">{t(T("建树", "Build"))}</option>
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
                  : t(T("删值", "Key"))}
              </span>
              <input
                className="txt"
                type="number"
                style={{ width: 56 }}
                value={config.target}
                onChange={(e) =>
                  onChange({
                    ...config,
                    target: Number(e.target.value),
                    applied: false,
                  })
                }
              />
            </label>
          )}
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
                  onChange({
                    ...config,
                    x: Number(e.target.value),
                    applied: false,
                  })
                }
              />
            </label>
          )}
          <SourcePanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c, applied: false })}
            t={t}
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
    // 建树完成后允许点击节点查看颜色/黑高/叔/兄弟
    return (
      <TreeCanvas
        scene={scene}
        t={t}
        config={config}
        onChange={onChange}
        selected={inspected}
        onNodeClick={onInspect}
      />
    );
  },
  Side: RbSide,
};