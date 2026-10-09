import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import { T, type Text } from "../../i18n/lang";
import type { ModuleDef, FramesOrInfinite } from "../../engine/types";

export function Panel({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "ui-monospace, monospace", background: "#fff" }}>
      <thead>
        <tr>{head.map((h, i) => <th key={i} style={{ padding: "6px 10px", textAlign: "left", color: "#475569", borderBottom: "2px solid #e2e8f0", fontSize: 12 }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, k) => (
          <tr key={k} style={{ background: k % 2 ? "#f8fafc" : "#fff" }}>
            {r.map((c, i) => <td key={i} style={{ padding: "5px 10px", borderBottom: "1px solid #f1f5f9", color: i === 0 ? "#0f172a" : "#475569", fontWeight: i === 0 ? 700 : 400 }}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  const c = tone === "warn" ? { bg: "#fef3c7", bd: "#fde68a", fg: "#92400e" } : { bg: "#eef2ff", bd: "#c7d2fe", fg: "#4338ca" };
  return <div style={{ padding: "10px 14px", borderRadius: 10, background: c.bg, border: `1px solid ${c.bd}`, fontSize: 13, color: c.fg, lineHeight: 1.7 }}>{children}</div>;
}

export function Chips({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
      {items.map(([n, d]) => (
        <div key={n} style={{ flex: "1 1 150px", minWidth: 130, padding: "10px 12px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 13 }}>{n}</div>
          {d && <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{d}</div>}
        </div>
      ))}
    </div>
  );
}

export function isZh(t: (x: { zh: string; en: string }) => string): boolean {
  return t(T("中文", "en")) !== "en";
}

export function NumField({ label, value, onChange, min = 0, max = 1e9, step = 1, width = 100 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; width?: number;
}) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        style={{ width }} />
    </label>
  );
}

export function TextField({ label, value, onChange, width = 160, mono = true, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; width?: number; mono?: boolean; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ width, fontFamily: mono ? "ui-monospace, monospace" : undefined }} />
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      {children}
    </div>
  );
}

export function Steps({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map(([a, b]) => (
        <div key={a} style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <span style={{ fontWeight: 800, color: "#3730a3", width: 104, flexShrink: 0 }}>{a}</span>
          <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
        </div>
      ))}
    </div>
  );
}

export type SubDef = {
  title: Text;
  desc?: Text;
  defaultConfig?: Record<string, unknown>;
  Controls?: ComponentType<any>;
  Render: ComponentType<any>;
  /** 逐帧动画（可选）：提供 generate 时该子模式显示播放条 + 伪代码；Render 需读取 scene */
  generate?: (config: any) => FramesOrInfinite<any>;
  code?: Text[];
  codeFor?: (config: any) => Text[];
};

export type GroupDef<V extends string> = { label: string; opts: { v: V; zh: string; en: string }[] };

// 统一「子模式聚合」章节工厂：与 computer-organization/data 等章节同构，
// 每个 GROUPS 选项由 registry 包装成独立知识点卡（id = `${chapterId}/${v}`）。
// 子模式若提供 generate 则为逐帧动画（播放条 + 伪代码）；否则为单帧交互式演示。
export function makeChapter<V extends string>(spec: {
  id: string;
  title: Text;
  desc: Text;
  tags: string[];
  groups: GroupDef<V>[];
  subs: Record<V, SubDef>;
  /** 覆盖布局：有动画子模式时默认 false（显示播放条）；纯交互章节可设 true */
  interactive?: boolean;
}): { module: ModuleDef<any, { subMode: V } & Record<string, any>>; GROUPS: GroupDef<V>[] } {
  const keys = Object.keys(spec.subs) as V[];
  const first = keys[0];
  const animated = keys.some((k) => !!spec.subs[k].generate);
  const activeOf = (sub: unknown): SubDef => (spec.subs as Record<string, SubDef>)[sub as string] ?? spec.subs[first];
  const subKeyOf = (sub: unknown): V => ((spec.subs as Record<string, SubDef>)[sub as string] ? (sub as V) : first);
  const safeCfg = (sub: unknown, config: any): any => {
    const d = (activeOf(sub).defaultConfig ?? {}) as any;
    return { ...d, ...(config as any), subMode: subKeyOf(sub) };
  };

  const module: ModuleDef<any, any> = {
    id: spec.id,
    title: spec.title,
    desc: spec.desc,
    tags: spec.tags,
    interactive: spec.interactive ?? !animated,
    defaultConfig: { subMode: first, ...(spec.subs[first].defaultConfig ?? {}) },
    Controls(props: any) {
      const { config, onChange, t, embedded } = props;
      const zh = isZh(t);
      const sub = subKeyOf(config.subMode);
      const active = activeOf(sub);
      const safe = safeCfg(sub, config);
      if (embedded && !active.Controls) return null;
      return (
        <div style={{ display: "grid", gap: 8, width: "100%" }}>
          {!embedded && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{zh ? spec.title.zh : spec.title.en}</span>
              <select className="txt" value={sub} style={{ minWidth: 200, fontWeight: 700 }}
                onChange={(e) => {
                  const key = subKeyOf(e.target.value);
                  onChange({ ...config, ...(spec.subs[key].defaultConfig ?? {}), subMode: key });
                }}>
                {spec.groups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.opts.map((o) => <option key={o.v} value={o.v}>{zh ? o.zh : o.en}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          {active.Controls && createElement(active.Controls as any, { config: safe, onChange, t })}
        </div>
      ) as unknown as never;
    },
    generate(config) {
      const safe = safeCfg((config as any).subMode, config);
      const active = activeOf((config as any).subMode);
      if (active.generate) return active.generate(safe) as never;
      return [{ caption: active.title, scene: safe }] as never;
    },
    codeFor(config) {
      const safe = safeCfg((config as any).subMode, config);
      const active = activeOf((config as any).subMode);
      return (active.codeFor ? active.codeFor(safe) : active.code) ?? [];
    },
    Render(props: any) {
      const safe = safeCfg((props.config as any).subMode, props.config);
      const active = activeOf((props.config as any).subMode);
      return createElement(active.Render as any, { ...props, config: safe }) as unknown as never;
    },
  };

  return { module, GROUPS: spec.groups };
}
