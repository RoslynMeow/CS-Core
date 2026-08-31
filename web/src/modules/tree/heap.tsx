import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  completeTree,
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
type Cfg = TreeCfg & { mode: Mode; x: number | ""; applied?: boolean };
const DEFAULT: Cfg = {
  source: "graph",
  values: [70, 40, 60, 10, 30, 50, 20],
  imp: null,
  confirmed: true,
  mode: "build",
  x: "", // 插值不预填（也不给 placeholder）：由用户自行填写
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
  // 堆：数组 → 完全二叉树渲染（annotate = 数组下标），当前/探索 = a/b
  const toScene = (
    v: number[],
    a: number | null,
    b: number | null,
    fly?: HeapStep["fly"],
  ) => {
    const nodes = v.map((val, i) => ({
      id: i,
      val,
      left: 2 * i + 1 < v.length ? 2 * i + 1 : null,
      right: 2 * i + 2 < v.length ? 2 * i + 2 : null,
    }));
    const ann: Record<number, string> = {};
    v.forEach((_, i) => (ann[i] = String(i)));
    const scene = binScene(nodes, { current: a, exploring: b }, 0, ann);
    // 末元素上移的飞行动画：幽灵节点从 src 位置线性插值飞向 dst（根）位置
    if (fly) {
      const from = scene.nodes[fly.src];
      const to = scene.nodes[fly.dst];
      if (from && to) {
        // 根（dst）与末位（src）在原位暂时置空：root 已被记走、末元素已在途中
        scene.nodes[fly.dst].label = "";
        scene.nodes[fly.src].label = "";
        // 幽灵节点：携带末元素值，琥珀色（exploring）突出飞行中的元素
        scene.nodes.push({
          id: -1,
          label: String(fly.val),
          x: from.x + (to.x - from.x) * fly.t,
          y: from.y + (to.y - from.y) * fly.t,
        });
        scene.exploring = -1;
        scene.current = null;
      }
    }
    return scene;
  };
  // 旧合并页存档防御：与 codeFor 一致，mode 可能残留非法值 → 归一化
  const mode: Mode = (["build", "insert", "delete", "sort"] as Mode[]).includes(
    cfg.mode as Mode,
  )
    ? (cfg.mode as Mode)
    : DEFAULT.mode;
  // 工作版本优先：插入/删除/建堆 播完自动写回 work（null=随来源派生）
  const base: number[] = cfg.work
    ? cfg.work.nodes.map((n) => n.val)
    : res.values;
  const built = !!cfg.work || cfg.source === "graph";
  // 已应用过（applied+work）：静态展示结果堆，避免重播时重复插入/删除；
  // 注意：mode==="build" 不在此静态化——「建堆」始终播放 heapBuildSteps 动画
  //（图来源/随机来源的完全二叉树都未必是堆，需下滤调整）；
  // applied 仅在 applyOnEnd 写入 work 时同时置位，导入/重新载入（work 置 null）后自动失效
  if (cfg.applied && !!cfg.work) {
    const appliedTxt =
      cfg.applied && mode !== "build"
        ? T(
            `当前堆 · ${base.length} 节点 · 已应用该操作（改参数后重播）`,
            `current heap · ${base.length} nodes · op applied (tweak params to replay)`,
          )
        : T(
            `当前堆 · ${base.length} 节点 · 可选 插入/删除堆顶/堆排序（播完自动应用）`,
            `current heap · ${base.length} nodes · pick insert/delete/sort`,
          );
    return [{ line: 0, caption: appliedTxt, scene: toScene(base, null, null) }];
  }
  // 无建堆（非图来源）不再单帧提示：自动先播建堆再执行所选操作（随机序列→先下滤成堆→再插入/删除/排序）
  let steps: HeapStep[];
  if (mode === "build") {
    steps = heapBuildSteps(base);
  } else if (!built) {
    const buildSteps = heapBuildSteps(base);
    const heapBase: number[] = buildSteps[buildSteps.length - 1].values;
    if (mode === "insert") {
      if (cfg.x === "") {
        return [
          {
            line: 0,
            caption: T(
              "请先在「插值」输入框填写要插入的值",
              "Enter a value to insert first",
            ),
            scene: toScene(base, null, null),
          },
        ];
      }
      const x: number = cfg.x; // 空值已提前返回 → 收窄为 number
      steps = [...buildSteps, ...heapInsertSteps(heapBase, x)];
    } else if (mode === "delete") {
      steps = [...buildSteps, ...heapDeleteTopSteps(heapBase)];
    } else {
      steps = [...buildSteps, ...heapSortSteps(heapBase)];
    }
  } else if (mode === "insert") {
    if (cfg.x === "") {
      return [
        {
          line: 0,
          caption: T(
            "请先在「插值」输入框填写要插入的值",
            "Enter a value to insert first",
          ),
          scene: toScene(base, null, null),
        },
      ];
    }
    steps = heapInsertSteps(base, cfg.x);
  } else if (mode === "delete") steps = heapDeleteTopSteps(base);
  else steps = heapSortSteps(base);
  return steps.map((s) => ({
    line: s.line,
    caption: s.msg,
    scene: toScene(s.values, s.a, s.b, s.fly ?? undefined),
  }));
}

/** 播完自动应用：建堆/插入/删除堆顶 结束即把结果数组写回 work（新版本）；
 *  保持所选操作不回跳「建堆」（applied 标记后静态展示结果，改参数重播）；
 *  堆排序结果非堆，不写回；不提供手动按钮；仅「从图编辑中导入」会把 work 置 null 覆盖回原图 */
function applyOnEnd(cfg: Cfg): Cfg | null {
  // 已应用过：重播（拉回首帧再播）不再重复应用
  if (cfg.applied) return null;
  const res = resolveTree(cfg, { requireNumeric: true, requireComplete: true });
  if (!res.ok || res.values.length === 0) return null;
  const base: number[] = cfg.work
    ? cfg.work.nodes.map((n) => n.val)
    : res.values;
  // 未建堆：自动先建堆再操作（与 buildFrames 组合帧一致），保证写回的是合法堆结果
  const built = !!cfg.work || cfg.source === "graph";
  const heapBase: number[] = built
    ? base
    : heapBuildSteps(base)[heapBuildSteps(base).length - 1].values;
  let result: number[];
  if (cfg.mode === "build") {
    const st = heapBuildSteps(base);
    result = st[st.length - 1].values;
  } else if (cfg.mode === "insert") {
    if (cfg.x === "") return null;
    const st = heapInsertSteps(heapBase, cfg.x);
    result = st[st.length - 1].values;
  } else if (cfg.mode === "delete") {
    const st = heapDeleteTopSteps(heapBase);
    result = st[st.length - 1].values;
  } else return null; // sort：结果非堆，不写回
  // delete 删除的是堆顶（无参数可改）：不锁定 applied，播完写回后即可再点播放连续删除下一个
  return {
    ...cfg,
    work: { nodes: completeTree(result), root: 0 },
    applied: cfg.mode !== "delete",
  };
}

export const treeHeapModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "binary-tree-heap",
  title: T("二叉堆 · Heap", "Binary Heap"),
  desc: T(
    "建堆 / 上滤插入 / 下滤删顶 / 堆排序；需完全二叉树；播完自动保存为新版本（导入当前图可覆盖回原图）；删除堆顶可连续进行",
    "build · insert · delete-top · sort; needs complete tree; auto-applies on play end (import to revert); delete-top is repeatable",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  // 删除堆顶无参数：上次播放的结果（work/applied）不持久化，否则下次进入首帧直接是删过顶的堆
  persistExclude: ["work", "applied"],
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
                  onChange({
                    ...config,
                    x:
                      e.target.value === "" ? "" : Number(e.target.value),
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
            requireComplete
          />
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    // 旧合并页存档防御：与 buildFrames 一致，mode 可能残留 heap-* 等非法值 → 归一化，避免 CODE[cfg.mode] 为 undefined
    const mode: Mode = (["build", "insert", "delete", "sort"] as Mode[]).includes(
      cfg.mode as Mode,
    )
      ? (cfg.mode as Mode)
      : DEFAULT.mode;
    return CODE[mode];
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
