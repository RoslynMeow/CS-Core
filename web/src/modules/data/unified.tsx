import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { positionalCoreModule } from "../positional/core";
import { baseConversionModule } from "../positional/baseConversion";
import { expansionModule } from "../positional/expansion";
import { successorModule } from "../positional/successor";
import { additionModule } from "../positional/addition";
import { unsignedIntModule } from "../numeric/unsignedInt";
import { twosComplementModule } from "../numeric/twosComplement";
import { ieee754Module } from "../numeric/ieee754";
import { characterEncodingModule } from "../text/characterEncoding";
import { stringOpsModule } from "../text/stringOps";

type SubMode = "positional-system" | "positional-expansion" | "positional-successor" | "positional-addition" | "base-conversion" | "unsigned-int" | "twos-complement" | "ieee754" | "character-encoding" | "string";
const MAP: Record<SubMode, ModuleDef> = {
  "positional-system": positionalCoreModule as unknown as ModuleDef,
  "positional-expansion": expansionModule as unknown as ModuleDef,
  "positional-successor": successorModule as unknown as ModuleDef,
  "positional-addition": additionModule as unknown as ModuleDef,
  "base-conversion": baseConversionModule as unknown as ModuleDef,
  "unsigned-int": unsignedIntModule as unknown as ModuleDef,
  "twos-complement": twosComplementModule as unknown as ModuleDef,
  "ieee754": ieee754Module as unknown as ModuleDef,
  "character-encoding": characterEncodingModule as unknown as ModuleDef,
  "string": stringOpsModule as unknown as ModuleDef,
};
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "位置制", opts: [
    { v: "positional-system", zh: "位权", en: "Positional" },
    { v: "base-conversion", zh: "进制转换", en: "BaseConv" },
  ]},
  { label: "数值", opts: [
    { v: "unsigned-int", zh: "无符号整数", en: "Unsigned" },
    { v: "twos-complement", zh: "补码", en: "TwosComp" },
    { v: "ieee754", zh: "IEEE754", en: "IEEE754" },
  ]},
  { label: "文本", opts: [
    { v: "character-encoding", zh: "字符编码", en: "Encoding" },
    { v: "string", zh: "字符串", en: "String" },
  ]},
];

type Cfg = { subMode: SubMode; [k: string]: any };
const DEFAULT: Cfg = { subMode: "positional-system", ...(positionalCoreModule as any).defaultConfig };

// 兜底：历史存档可能缺 subMode 或缺子模块字段（旧版“清空”曾丢 subMode）。
// 未知 subMode 回退到位权，缺失字段用子模块默认值补齐，保证页面永不白屏。
function activeOf(sub: unknown): ModuleDef {
  return ((MAP as Record<string, ModuleDef>)[sub as string] ?? positionalCoreModule) as unknown as ModuleDef;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "positional-system";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  const out = { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
  // 陈旧 mode（如别模块残留的 successor/encode）会取不到伪代码甚至走错分支；探测失败则回退本模块默认 mode
  if (typeof d.mode === "string" && typeof out.mode === "string" && out.mode !== d.mode && m.codeFor) {
    let ok = true;
    try {
      if (m.codeFor(out) == null) ok = false;
    } catch {
      ok = false;
    }
    if (!ok) out.mode = d.mode;
  }
  return out;
}

export const dataUnifiedModule: ModuleDef<any, Cfg> = {
  id: "data-representation",
  title: T("数据的表示", "Data Representation"),
  desc: T("位权 / 展开 / 后继 / 加法 / 进制转换 / 无符号 / 补码 / IEEE754 / 字符编码 / 字符串", "Positional / unsigned / twos-comp / IEEE754 / encoding / string"),
  tags: ["computer-organization"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>数据的表示</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖全部数据的表示" : "one chapter"}</span>
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
    const res: any = m.generate(safe);
    const frames: any[] = Array.isArray(res) ? res : res?.frames ?? [];
    if (frames.length > 0) {
      const last: any = frames[frames.length - 1];
      if (last?.caption && typeof last.caption.zh === "string" && !/完成|结果|done|result|命中|未找到|不存在|错误|失败|无环|有环|不可达|unreachable|not found|found|cycle|empty|空/.test(last.caption.zh)) {
        last.caption.zh += " 完成";
        if (typeof last.caption.en === "string") last.caption.en += " done";
      }
      const scene: any = last?.scene ?? {};
      if (!Array.isArray(scene.stateTables) || scene.stateTables.length === 0) {
        const resultVal = scene.value ?? scene.y ?? scene.cp ?? scene.len1 ?? scene.diff ?? (Array.isArray(scene.bits) ? scene.bits.join("") : undefined) ?? (Array.isArray(scene.digits) ? scene.digits.join(",") : undefined);
        if (resultVal !== undefined) {
          scene.stateTables = [{ title: "结果", rows: [{ name: "result", cells: [String(resultVal)] }] }];
        }
      }
    }
    return res;
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
