import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 计算机系统概述 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/intro.tex
//   vonneumann(冯·诺依曼) / layers(层次结构) / perf(性能计算) / amdahl(Amdahl)
// =====================================================================

type SubMode = "vonneumann" | "layers" | "perf" | "amdahl";

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
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
function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// vonneumann
// ---------------------------------------------------------------------
function VonNeumannRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const parts: [string, string, string][] = isZh
    ? [["运算器 ALU", "算术与逻辑运算", "#dbeafe"], ["控制器 CU", "取指 / 译码 / 控制数据流", "#dcfce7"], ["存储器", "存放程序与数据", "#fef3c7"], ["输入设备", "键盘 / 鼠标 / 传感器", "#fce7f3"], ["输出设备", "显示器 / 打印机 / 网卡", "#ede9fe"]]
    : [["ALU", "arithmetic & logic", "#dbeafe"], ["Control Unit", "fetch / decode / control", "#dcfce7"], ["Memory", "program + data", "#fef3c7"], ["Input", "keyboard / sensors", "#fce7f3"], ["Output", "display / NIC", "#ede9fe"]];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {parts.map(([n, d, bg]) => (
          <div key={n} style={{ flex: "1 1 150px", minWidth: 140, padding: "12px 14px", borderRadius: 12, background: bg, border: "1px solid #e2e8f0" }}>
            <div style={{ fontWeight: 900, color: "#1e293b", fontSize: 13 }}>{n}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
        <span style={{ padding: "6px 12px", borderRadius: 999, background: "#eef2ff", border: "1px solid #c7d2fe" }}>{isZh ? "运算器 + 控制器 = CPU" : "ALU + CU = CPU"}</span>
        <span style={{ padding: "6px 12px", borderRadius: 999, background: "#eef2ff", border: "1px solid #c7d2fe" }}>{isZh ? "程序与数据同存储器 → 存储程序" : "program + data in one memory → stored program"}</span>
      </div>
      <div style={{ padding: "12px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 2 }}>
        <MathText text={isZh
          ? "$\\text{计算机} = \\text{CPU} + \\text{存储器} + \\text{I/O}$；$\\text{Fetch} \\to \\text{Decode} \\to \\text{Execute}$"
          : "$\\text{Computer} = \\text{CPU} + \\text{Memory} + \\text{I/O}$; $\\text{Fetch} \\to \\text{Decode} \\to \\text{Execute}$"} />
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// layers
// ---------------------------------------------------------------------
function LayersRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const layers: [string, string][] = isZh
    ? [["应用层", "高级语言程序 (C / Java / Python)"], ["系统软件层", "编译器 / 操作系统"], ["指令集层", "ISA — 软件与硬件的接口"], ["微体系结构层", "流水线 / 缓存 / 乱序执行"], ["数字逻辑层", "门电路 / 寄存器 / 加法器"], ["物理器件层", "晶体管 / 导线 / 集成电路"]]
    : [["Application", "high-level programs (C / Java / Python)"], ["System software", "compiler / OS"], ["ISA layer", "software–hardware interface"], ["Microarchitecture", "pipeline / cache / OoO"], ["Digital logic", "gates / registers / adders"], ["Device", "transistors / wires / ICs"]];
  return (
    <Panel>
      <div style={{ display: "grid", gap: 4 }}>
        {layers.map(([n, d], i) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderRadius: 10, background: `hsl(${230 - i * 8}, 70%, ${96 - i * 3}%)`, border: "1px solid #e2e8f0" }}>
            <span style={{ fontWeight: 800, color: "#3730a3", fontSize: 13, width: 112 }}>{n}</span>
            <span style={{ fontSize: 13, color: "#475569" }}>{d}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// perf
// ---------------------------------------------------------------------
const PERF_DEFAULT = { ic: 1e9, cpi: 1.5, freqGhz: 2.5 };
function PerfControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const num = (label: string, key: string, min: number, max: number, step: number, unit: string) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" type="number" min={min} max={max} step={step} value={config[key]} onChange={(e) => onChange({ ...config, [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) })} style={{ width: 110 }} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{unit}</span>
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      {num(isZh ? "指令数 IC" : "Instructions", "ic", 1, 1e12, 1e9, isZh ? "条" : "insns")}
      {num("CPI", "cpi", 0.1, 20, 0.1, isZh ? "周期/条" : "cyc/insn")}
      {num(isZh ? "主频" : "Clock", "freqGhz", 0.1, 10, 0.1, "GHz")}
    </div>
  );
}
function PerfRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const f = config.freqGhz * 1e9;
  const cycles = config.ic * config.cpi;
  const time = cycles / f;
  const mips = f / (config.cpi * 1e6);
  const clkPs = (1 / f) * 1e12;
  const rows: React.ReactNode[][] = isZh
    ? [
      ["时钟周期 T_clk", `${clkPs.toFixed(2)} ps`, "1 / 主频"],
      ["总周期数", `${cycles.toExponential(3)}`, "IC × CPI"],
      ["CPU 执行时间", `${(time * 1000).toFixed(3)} ms`, "IC × CPI × T_clk"],
      ["MIPS", `${mips.toFixed(2)}`, "主频 / (CPI × 10⁶)"],
    ]
    : [
      ["Clock period T_clk", `${clkPs.toFixed(2)} ps`, "1 / freq"],
      ["Total cycles", `${cycles.toExponential(3)}`, "IC × CPI"],
      ["CPU time", `${(time * 1000).toFixed(3)} ms`, "IC × CPI × Tclk"],
      ["MIPS", `${mips.toFixed(2)}`, "freq / (CPI × 10⁶)"],
    ];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T = IC \times CPI \times T_{clk} = \dfrac{IC \times CPI}{f}$" />
      </div>
      <Table head={isZh ? ["指标", "值", "公式"] : ["Metric", "Value", "Formula"]} rows={rows} />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "减小执行时间的三条路: 减指令数(编译/ISA)、降 CPI(流水线/乱序)、提主频(工艺)。" : "Three levers: fewer instructions, lower CPI, higher frequency."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// amdahl
// ---------------------------------------------------------------------
const AMDAHL_DEFAULT = { parallelPct: 80, speedupN: 4 };
function AmdahlControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "可并行比例" : "Parallel %"}</span>
        <input type="range" min={0} max={100} value={config.parallelPct} onChange={(e) => set({ parallelPct: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.parallelPct}%</b>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "并行度 n" : "n"}</span>
        <input type="range" min={1} max={64} value={config.speedupN} onChange={(e) => set({ speedupN: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.speedupN}</b>
      </label>
    </div>
  );
}
function AmdahlRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const f = config.parallelPct / 100;
  const n = config.speedupN;
  const s = 1 / ((1 - f) + f / n);
  const limit = f < 1 ? 1 / (1 - f) : Infinity;
  const width = Math.min(100, (s / 10) * 100);
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$S = \\dfrac{1}{(1-${config.parallelPct}\\% ) + \\dfrac{${config.parallelPct}\\%}{${n}}}$`} />
      </div>
      <div style={{ textAlign: "center", fontSize: 26, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>{`S = ${s.toFixed(2)}×`}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#64748b", width: 60 }}>1×</span>
        <div style={{ flex: 1, height: 18, background: "#f1f5f9", borderRadius: 9, overflow: "hidden" }}>
          <div style={{ width: `${width}%`, height: "100%", background: "#4f46e5" }} />
        </div>
        <span style={{ fontSize: 11, color: "#64748b", width: 44, textAlign: "right" }}>10×</span>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fde68a", fontSize: 13, color: "#92400e" }}>
        {isZh
          ? `串行部分 ${(100 - config.parallelPct)}% 决定了加速上限: 即使 n → ∞, $S_{max} = ${limit === Infinity ? "∞" : limit.toFixed(2)}$。`
          : `The serial ${100 - config.parallelPct}% caps speedup: as n → ∞, Smax = ${limit === Infinity ? "∞" : limit.toFixed(2)}.`}
      </div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  vonneumann: { id: "vonneumann", title: T("冯·诺依曼", "von Neumann"), defaultConfig: {}, generate: () => [{ caption: T("冯·诺依曼体系结构", "von Neumann architecture"), scene: {} }] as never, Render: VonNeumannRender as never } as unknown as ModuleDef,
  layers: { id: "layers", title: T("层次结构", "Layers"), defaultConfig: {}, generate: () => [{ caption: T("计算机层次结构", "Layers of a computer"), scene: {} }] as never, Render: LayersRender as never } as unknown as ModuleDef,
  perf: { id: "perf", title: T("性能评价", "Performance"), defaultConfig: PERF_DEFAULT, Controls: PerfControls as never, generate: () => [{ caption: T("性能评价指标", "Performance metrics"), scene: {} }] as never, Render: PerfRender as never } as unknown as ModuleDef,
  amdahl: { id: "amdahl", title: T("Amdahl 定律", "Amdahl"), defaultConfig: AMDAHL_DEFAULT, Controls: AmdahlControls as never, generate: () => [{ caption: T("Amdahl 定律", "Amdahl's law"), scene: {} }] as never, Render: AmdahlRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "体系", opts: [
    { v: "vonneumann", zh: "冯·诺依曼", en: "von Neumann" },
    { v: "layers", zh: "层次结构", en: "Layers" },
  ]},
  { label: "性能", opts: [
    { v: "perf", zh: "性能评价", en: "Performance" },
    { v: "amdahl", zh: "Amdahl 定律", en: "Amdahl" },
  ]},
];

const DEFAULT: Cfg = { subMode: "vonneumann", ...(SUB.vonneumann as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.vonneumann;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "vonneumann";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const introModule: ModuleDef<any, Cfg> = {
  id: "computer-overview",
  title: T("计算机概述", "Overview"),
  desc: T("冯·诺依曼 / 五大部件 / 层次结构 / 性能指标 T=IC×CPI×Tclk / Amdahl 定律。", "von Neumann / five units / layers / performance / Amdahl's law."),
  tags: ["computer-organization", "intro"],
  interactive: true,
  defaultConfig: DEFAULT,
  Controls({ config, onChange, t, embedded }: any) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    if (embedded && !active?.Controls) return null;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        {!embedded && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "计算机概述" : "OVERVIEW"}</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
        </div>}
        {active?.Controls && createElement(active.Controls as any, { config: safe as any, onChange: onChange as any, t })}
      </div>
    ) as unknown as never;
  },
  generate(config) {
    const safe = safeCfg((config as Cfg).subMode, config as Cfg);
    const m = activeOf((config as Cfg).subMode) as any;
    const res: any = m.generate(safe);
    const frames: any[] = Array.isArray(res) ? res : res?.frames ?? [];
    return frames.length ? frames : [{ caption: T("计算机概述", "Overview"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
