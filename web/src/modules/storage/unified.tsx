import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { sequentialListModule } from "./sequentialList";
import { linkedListModule } from "./linkedList";
import { circularLinkedListModule } from "./circularLinkedList";
import { doublyLinkedListModule } from "./doublyLinkedList";
import { hashTableModule } from "./hashTable";
import { matrixModule } from "./matrix";
import { stackModule } from "./stack";
import { queueModule } from "./queue";

type SubMode = "sequential-list" | "linked-list" | "circular-linked-list" | "doubly-linked-list" | "hash-table" | "matrix" | "stack" | "queue";
const MAP: Record<SubMode, ModuleDef> = {
  "sequential-list": sequentialListModule as unknown as ModuleDef,
  "linked-list": linkedListModule as unknown as ModuleDef,
  "circular-linked-list": circularLinkedListModule as unknown as ModuleDef,
  "doubly-linked-list": doublyLinkedListModule as unknown as ModuleDef,
  "hash-table": hashTableModule as unknown as ModuleDef,
  "matrix": matrixModule as unknown as ModuleDef,
  "stack": stackModule as unknown as ModuleDef,
  "queue": queueModule as unknown as ModuleDef,
};
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "线性表", opts: [
    { v: "sequential-list", zh: "顺序表", en: "SeqList" },
    { v: "linked-list", zh: "单链表", en: "Linked" },
    { v: "circular-linked-list", zh: "循环链表", en: "Circular" },
    { v: "doubly-linked-list", zh: "双向链表", en: "Doubly" },
    { v: "matrix", zh: "矩阵", en: "Matrix" },
  ]},
  { label: "栈队列散列", opts: [
    { v: "stack", zh: "栈", en: "Stack" },
    { v: "queue", zh: "队列", en: "Queue" },
    { v: "hash-table", zh: "哈希表", en: "Hash" },
  ]},
];

type Cfg = { subMode: SubMode; [k: string]: any };
const DEFAULT: Cfg = { subMode: "sequential-list", ...(sequentialListModule as any).defaultConfig };

// 兜底：历史存档可能缺 subMode 或缺子模块字段；未知 subMode 回退到顺序表，
// 缺失字段用子模块默认值补齐，陈旧 op 取不到伪代码时回退本模块默认 op，保证页面永不白屏。
function activeOf(sub: unknown): ModuleDef {
  return ((MAP as Record<string, ModuleDef>)[sub as string] ?? sequentialListModule) as unknown as ModuleDef;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "sequential-list";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  const out = { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
  if (typeof d.op === "string" && typeof out.op === "string" && out.op !== d.op && m.codeFor) {
    let ok = true;
    try {
      if (m.codeFor(out) == null) ok = false;
    } catch {
      ok = false;
    }
    if (!ok) out.op = d.op;
  }
  return out;
}

export const storageUnifiedModule: ModuleDef<any, Cfg> = {
  id: "storage",
  title: T("存储结构", "Storage"),
  desc: T("顺序表 / 链表(单 / 循环 / 双向) / 栈 / 队列 / 哈希 / 矩阵", "SeqList / Linked / Stack / Queue / Hash / Matrix"),
  tags: ["data-structures"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>存储</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 180, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖全部存储" : "one chapter"}</span>
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
