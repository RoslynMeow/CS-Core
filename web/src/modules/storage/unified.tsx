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

export const storageUnifiedModule: ModuleDef<any, Cfg> = {
  id: "storage",
  title: T("存储结构 · 综合", "Storage · Comprehensive"),
  desc: T("一站式存储：顺序表/链表(单/循环/双向)/栈/队列/哈希/矩阵，下拉切换", "All-in-one storage"),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const m = MAP[c.subMode] as any;
    return m.randomize ? { ...c, ...m.randomize(c) } : c;
  },
  onPlayEnd: ((cfg: Cfg) => {
    const m = MAP[cfg.subMode] as any;
    return m.onPlayEnd ? m.onPlayEnd(cfg) : null;
  }) as any,
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const active = MAP[config.subMode] as any;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>存储</span>
          <select className="txt" value={config.subMode} onChange={(e) => { const m = MAP[e.target.value as SubMode] as any; onChange({ ...config, ...(m.defaultConfig as any), subMode: e.target.value as SubMode } as any); }} style={{ minWidth: 180, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖全部存储" : "one chapter"}</span>
        </div>
        {active?.Controls && createElement(active.Controls as any, { config: config as any, onChange: onChange as any, t })}
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    const m = MAP[(cfg as Cfg).subMode] as any;
    return m.codeFor ? m.codeFor(cfg) : m.code ?? [];
  },
  generate(config) {
    const m = MAP[(config as Cfg).subMode] as any;
    return m.generate(config);
  },
  Render(props) {
    const m = MAP[(props.config as Cfg).subMode] as any;
    return createElement(m.Render as any, props as any);
  },
  Side: ((props: any) => {
    const m = MAP[(props.config as Cfg).subMode] as any;
    return m.Side ? createElement(m.Side as any, props as any) : null;
  }) as any,
};
