import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Text } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";

// =====================================================================
// 章节占位工厂: 用同一套「聚合 + 子卡片」骨架生成知识模块占位。
//   先出占位, 后续逐卡替换为真实实现(见各 chapter 文件)。
// =====================================================================

export type StubItem = { zh: string; en: string };
export type StubGroup = {
  v: string;
  zh: string;
  en: string;
  items: StubItem[];
  note?: { zh: string; en: string };
};
export type ChapterSpec = {
  id: string;
  title: Text;
  desc: Text;
  tags: string[];
  groups: StubGroup[];
  reuse?: { zh: string; en: string };
};

export function makeChapterStub(spec: ChapterSpec): ModuleDef<any, { subMode: string }> {
  const groups = spec.groups;
  const map: Record<string, ModuleDef> = {};
  for (const g of groups) {
    const Render = ({ config, t }: any) => {
      const grp = groups.find((x) => x.v === config?.subMode) ?? groups[0];
      const isZh = t(T("中文", "en")) !== "en";
      return (
        <div style={{ maxWidth: 760, margin: "28px auto", padding: "22px 26px", border: "1.5px dashed #c7d2fe", borderRadius: 16, background: "#f8faff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: "#4338ca" }}>{isZh ? grp.zh : grp.en}</span>
            <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>{isZh ? "建设中" : "WIP"}</span>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", margin: "8px 0 14px" }}>{isZh ? "占位页 — 规划内容如下:" : "Placeholder — planned content:"}</div>
          <ul style={{ margin: 0, paddingLeft: 20, color: "#334155", fontSize: 13, lineHeight: 2 }}>
            {grp.items.map((it, i) => <li key={i}>{isZh ? it.zh : it.en}</li>)}
          </ul>
          {(grp.note || spec.reuse) && (
            <div style={{ marginTop: 14, fontSize: 12, color: "#94a3b8" }}>
              {grp.note ? (isZh ? grp.note.zh : grp.note.en) : (spec.reuse && (isZh ? spec.reuse.zh : spec.reuse.en))}
            </div>
          )}
        </div>
      );
    };
    map[g.v] = {
      id: g.v,
      title: T(g.zh, g.en),
      tags: spec.tags,
      defaultConfig: {} as unknown as never,
      generate: () => [{ caption: T(`${g.zh}(占位)`, `${g.en} (WIP)`), scene: { subMode: g.v } }] as never,
      Render: Render as never,
    } as unknown as ModuleDef;
  }
  const activeOf = (s: unknown) => map[s as string] ?? map[groups[0].v];
  const subKeyOf = (s: unknown) => (map[s as string] ? (s as string) : groups[0].v);
  const safeCfg = (s: unknown, c: any) => ({ ...((activeOf(s) as any).defaultConfig ?? {}), ...(c as any), subMode: subKeyOf(s) });
  const DEFAULT = { subMode: groups[0].v };

  return {
    id: spec.id,
    title: spec.title,
    desc: spec.desc,
    tags: spec.tags,
    interactive: true,
    defaultConfig: DEFAULT as never,
    Controls({ config, onChange, t }: any) {
      const isZh = t(T("中文", "en")) !== "en";
      const sub = subKeyOf(config.subMode);
      return (
        <div style={{ display: "grid", gap: 8, width: "100%" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{t(spec.title).toUpperCase()}</span>
            <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
              {groups.map((g) => <option key={g.v} value={g.v}>{isZh ? g.zh : g.en}</option>)}
            </select>
          </div>
          {(() => { const m = activeOf(sub) as any; return m.Controls ? createElement(m.Controls as any, { config: safeCfg(sub, config), onChange, t }) : null; })()}
        </div>
      ) as unknown as never;
    },
    generate(config: any) {
      const safe = safeCfg((config as any).subMode, config);
      const m = activeOf((config as any).subMode) as any;
      const res: any = m.generate(safe);
      const frames: any[] = Array.isArray(res) ? res : res?.frames ?? [];
      return frames.length ? frames : [{ caption: spec.title, scene: safe }];
    },
    Render(props: any) {
      const safe = safeCfg((props.config as any).subMode, props.config);
      const m = activeOf((props.config as any).subMode) as any;
      return createElement(m.Render as any, { ...(props as any), config: safe } as any);
    },
  } as unknown as ModuleDef<any, { subMode: string }>;
}
