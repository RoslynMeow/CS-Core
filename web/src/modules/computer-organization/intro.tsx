import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 计算机系统概述 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/intro.tex
//   vonneumann(冯·诺依曼 执行周期 动画) / perf(性能计算) / amdahl(Amdahl)
// =====================================================================

type SubMode = "vonneumann" | "perf" | "amdahl";

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
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// vonneumann: Fetch → Decode → Execute 执行周期 (逐帧动画)
// ---------------------------------------------------------------------
type VNPhase = "fetch" | "decode" | "execute" | "writeback";
type VNScene = { phase: VNPhase; active: string[]; flow: "instr" | "ctrl" | "data" };

const VN_UNITS: { key: string; zh: string; en: string; dzh: string; den: string; bg: string }[] = [
  { key: "alu", zh: "运算器 ALU", en: "ALU", dzh: "算术与逻辑运算", den: "arithmetic & logic", bg: "#dbeafe" },
  { key: "cu", zh: "控制器 CU", en: "Control Unit", dzh: "取指 / 译码 / 控制数据流", den: "fetch / decode / control", bg: "#dcfce7" },
  { key: "mem", zh: "存储器", en: "Memory", dzh: "存放程序与数据", den: "program + data", bg: "#fef3c7" },
  { key: "in", zh: "输入设备", en: "Input", dzh: "键盘 / 鼠标 / 传感器", den: "keyboard / sensors", bg: "#fce7f3" },
  { key: "out", zh: "输出设备", en: "Output", dzh: "显示器 / 打印机 / 网卡", den: "display / NIC", bg: "#ede9fe" },
];

const VN_PHASE: Record<VNPhase, { bg: string; fg: string; zh: string; en: string }> = {
  fetch: { bg: "#dbeafe", fg: "#1e40af", zh: "① 取指 Fetch", en: "① Fetch" },
  decode: { bg: "#dcfce7", fg: "#166534", zh: "② 译码 Decode", en: "② Decode" },
  execute: { bg: "#fef3c7", fg: "#92400e", zh: "③ 执行 Execute", en: "③ Execute" },
  writeback: { bg: "#ede9fe", fg: "#5b21b6", zh: "④ 写回 Write-back", en: "④ Write-back" },
};

const VN_FLOW: Record<"instr" | "ctrl" | "data", { zh: string; en: string; color: string }> = {
  instr: { zh: "指令流", en: "instruction flow", color: "#2563eb" },
  ctrl: { zh: "控制流", en: "control flow", color: "#16a34a" },
  data: { zh: "数据流", en: "data flow", color: "#d97706" },
};

function VonNeumannRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? { phase: "fetch", active: [], flow: "instr" }) as VNScene;
  const ph = VN_PHASE[s.phase] ?? VN_PHASE.fetch;
  const flow = VN_FLOW[s.flow] ?? VN_FLOW.instr;
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: ph.bg, color: ph.fg, fontWeight: 800, fontSize: 14 }}>
        {isZh ? ph.zh : ph.en} · <span style={{ color: flow.color }}>{isZh ? flow.zh : flow.en}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {VN_UNITS.map((u) => {
          const on = s.active.includes(u.key);
          return (
            <div key={u.key} style={{ flex: "1 1 150px", minWidth: 140, padding: "12px 14px", borderRadius: 12, background: u.bg, border: `2px solid ${on ? "#4338ca" : "#e2e8f0"}`, boxShadow: on ? "0 0 0 3px #c7d2fe" : "none", transition: "all .2s", opacity: on ? 1 : 0.55 }}>
              <div style={{ fontWeight: 900, color: "#1e293b", fontSize: 13 }}>{isZh ? u.zh : u.en}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{isZh ? u.dzh : u.den}</div>
            </div>
          );
        })}
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

function vonneumannGenerate(_config: any): Frame<VNScene>[] {
  return [
    { line: 0, caption: T("取指：$PC \\to MAR \\to$ 存储器，指令 $\\to IR$", "Fetch: $PC \\to MAR \\to$ memory, instruction $\\to IR$"), scene: { phase: "fetch", active: ["cu", "mem"], flow: "instr" } },
    { line: 1, caption: T("译码：控制器分析 $IR$，产生控制信号", "Decode: the control unit decodes $IR$ and emits control signals"), scene: { phase: "decode", active: ["cu"], flow: "ctrl" } },
    { line: 2, caption: T("执行：运算器按控制信号对数据运算", "Execute: the ALU operates on data under the control signals"), scene: { phase: "execute", active: ["alu", "cu"], flow: "data" } },
    { line: 3, caption: T("写回：结果写回寄存器/存储器，$PC \\gets PC+1$", "Write-back: result written back, $PC \\gets PC+1$"), scene: { phase: "writeback", active: ["alu", "mem"], flow: "data" } },
  ];
}
const VONNEUMANN_CODE = [
  T("取指：$PC \\to MAR \\to$ 存储器，指令 $\\to IR$", "Fetch: $PC \\to MAR \\to$ memory, instruction $\\to IR$"),
  T("译码：控制器分析 $IR$，产生控制信号", "Decode: control unit analyses $IR$, emits control signals"),
  T("执行：运算器按控制信号运算", "Execute: ALU computes under control signals"),
  T("写回：结果写回，$PC \\gets PC+1$", "Write-back: store result, $PC \\gets PC+1$"),
];

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
  vonneumann: { id: "vonneumann", title: T("冯·诺依曼", "von Neumann"), defaultConfig: {}, generate: vonneumannGenerate, code: VONNEUMANN_CODE, Render: VonNeumannRender as never } as unknown as ModuleDef,
  perf: { id: "perf", title: T("性能评价", "Performance"), defaultConfig: PERF_DEFAULT, Controls: PerfControls as never, generate: () => [{ caption: T("性能评价指标", "Performance metrics"), scene: {} }] as never, Render: PerfRender as never } as unknown as ModuleDef,
  amdahl: { id: "amdahl", title: T("Amdahl 定律", "Amdahl"), defaultConfig: AMDAHL_DEFAULT, Controls: AmdahlControls as never, generate: () => [{ caption: T("Amdahl 定律", "Amdahl's law"), scene: {} }] as never, Render: AmdahlRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "体系", opts: [
    { v: "vonneumann", zh: "冯·诺依曼", en: "von Neumann" },
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
  desc: T("冯·诺依曼 / 五大部件 / 性能指标 T=IC×CPI×Tclk / Amdahl 定律。", "von Neumann / five units / performance / Amdahl's law."),
  tags: ["computer-organization", "intro"],
  interactive: false,
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
  codeFor(config) {
    const m = activeOf((config as Cfg).subMode) as any;
    return m.code ?? [];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
