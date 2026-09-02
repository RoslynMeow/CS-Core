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
    { v: "positional-expansion", zh: "展开", en: "Expansion" },
    { v: "positional-successor", zh: "后继", en: "Successor" },
    { v: "positional-addition", zh: "加法", en: "Addition" },
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

export const dataUnifiedModule: ModuleDef<any, Cfg> = {
  id: "data-representation",
  title: T("数据的表示 · 综合", "Data Representation · Comprehensive"),
  desc: T("一站式数据的表示：位权/展开/后继/加法/进制转换/无符号/补码/IEEE754/字符编码/字符串，下拉切换", "All-in-one data representation"),
  tags: ["computer-organization"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>数据的表示</span>
          <select className="txt" value={config.subMode} onChange={(e) => { const m = MAP[e.target.value as SubMode] as any; onChange({ ...config, ...(m.defaultConfig as any), subMode: e.target.value as SubMode } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#64748b" }}>{isZh ? "一章覆盖全部数据的表示" : "one chapter"}</span>
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
