import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { bubbleModule, selectionModule, insertionModule } from "./sortBasic";
import { shellModule, mergeModule, quickModule } from "./sortFast";
import { heapModule, countingModule, radixModule, bucketModule } from "./sortExtra";
import { seqSearchModule, binSearchModule, interpSearchModule, blockSearchModule } from "./search";

type SubMode =
  | "bubble-sort" | "selection-sort" | "insertion-sort" | "shell-sort" | "merge-sort"
  | "quick-sort" | "heap-sort" | "counting-sort" | "radix-sort" | "bucket-sort"
  | "sequential-search" | "binary-search" | "interpolation-search" | "block-search";

const MAP: Record<SubMode, ModuleDef> = {
  "bubble-sort": bubbleModule as unknown as ModuleDef,
  "selection-sort": selectionModule as unknown as ModuleDef,
  "insertion-sort": insertionModule as unknown as ModuleDef,
  "shell-sort": shellModule as unknown as ModuleDef,
  "merge-sort": mergeModule as unknown as ModuleDef,
  "quick-sort": quickModule as unknown as ModuleDef,
  "heap-sort": heapModule as unknown as ModuleDef,
  "counting-sort": countingModule as unknown as ModuleDef,
  "radix-sort": radixModule as unknown as ModuleDef,
  "bucket-sort": bucketModule as unknown as ModuleDef,
  "sequential-search": seqSearchModule as unknown as ModuleDef,
  "binary-search": binSearchModule as unknown as ModuleDef,
  "interpolation-search": interpSearchModule as unknown as ModuleDef,
  "block-search": blockSearchModule as unknown as ModuleDef,
};

const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "排序", opts: [
    { v: "bubble-sort", zh: "冒泡", en: "Bubble" },
    { v: "selection-sort", zh: "选择", en: "Selection" },
    { v: "insertion-sort", zh: "插入", en: "Insertion" },
    { v: "shell-sort", zh: "希尔", en: "Shell" },
    { v: "merge-sort", zh: "归并", en: "Merge" },
    { v: "quick-sort", zh: "快排", en: "Quick" },
    { v: "heap-sort", zh: "堆排", en: "Heap" },
    { v: "counting-sort", zh: "计数", en: "Counting" },
    { v: "radix-sort", zh: "基数", en: "Radix" },
    { v: "bucket-sort", zh: "桶排", en: "Bucket" },
  ]},
  { label: "查找", opts: [
    { v: "sequential-search", zh: "顺序", en: "Sequential" },
    { v: "binary-search", zh: "二分", en: "Binary" },
    { v: "interpolation-search", zh: "插值", en: "Interp" },
    { v: "block-search", zh: "分块", en: "Block" },
  ]},
];

type Cfg = { subMode: SubMode; [k: string]: any };
const DEFAULT: Cfg = { subMode: "bubble-sort", ...(bubbleModule as any).defaultConfig };

// 兜底：未知 subMode 回退冒泡，缺失字段用子模块默认值补齐，保证页面永不白屏
function activeOf(sub: unknown): ModuleDef {
  return ((MAP as Record<string, ModuleDef>)[sub as string] ?? bubbleModule) as unknown as ModuleDef;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "bubble-sort";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  return { ...((m.defaultConfig as any) ?? {}), ...(config as any), subMode: subKeyOf(sub) };
}

export const arrayUnifiedModule: ModuleDef<any, Cfg> = {
  id: "array-algorithms",
  title: T("数组算法", "Array Algorithms"),
  desc: T("冒泡 / 选择 / 插入 / 希尔 / 归并 / 快排 / 堆排 / 计数 / 基数 / 桶排 / 顺序 / 二分 / 插值 / 分块", "Sorts / searches on arrays"),
  tags: ["algorithms"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const safe = safeCfg(c.subMode, c);
    const m = activeOf(c.subMode) as any;
    if (!m.randomize) return safe;
    return { ...safe, ...m.randomize(safe), subMode: safe.subMode };
  },
  onPlayEnd: ((cfg: Cfg) => {
    const m = activeOf(cfg.subMode) as any;
    return m.onPlayEnd ? m.onPlayEnd(safeCfg(cfg.subMode, cfg)) : null;
  }) as any,
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>数组算法</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 180, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖排序与查找" : "sorts & searches"}</span>
        </div>
        {active?.Controls && createElement(active.Controls as any, { config: safe as any, onChange: onChange as any, t })}
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    const safe = safeCfg((cfg as Cfg).subMode, cfg as Cfg);
    const m = activeOf((cfg as Cfg).subMode) as any;
    const r = m.codeFor ? m.codeFor(safe) : m.code;
    return r ?? [];
  },
  generate(config) {
    const safe = safeCfg((config as Cfg).subMode, config as Cfg);
    const m = activeOf((config as Cfg).subMode) as any;
    return m.generate(safe);
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
  Side: ((props: any) => {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return m.Side ? createElement(m.Side as any, { ...props, config: safe } as any) : null;
  }) as any,
};
