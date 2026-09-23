import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 处理器: 控制器 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/cpu_control.tex
//   signals(控制信号生成) / alucontrol(ALU 控制) / hardwired(硬布线 vs 微程序)
//   / cycles(单周期 vs 多周期)
// =====================================================================

type SubMode = "signals" | "alucontrol" | "hardwired" | "cycles";

type CtlVal = "0" | "1" | "x";
type SigKey = "RegDst" | "RegWrite" | "ALUSrc" | "MemRead" | "MemWrite" | "MemtoReg" | "Branch";
type CtrlInstr = {
  name: string;
  fmt: "R" | "I";
  op: number;
  funct?: number;
  aluOp: "00" | "01" | "10";
  alu: string;
  sig: Record<SigKey, CtlVal>;
  action: { zh: string; en: string };
};

const R = (name: string, funct: number, alu: string): CtrlInstr => ({
  name, fmt: "R", op: 0x00, funct, aluOp: "10", alu,
  sig: { RegDst: "1", RegWrite: "1", ALUSrc: "0", MemRead: "0", MemWrite: "0", MemtoReg: "0", Branch: "0" },
  action: { zh: `读 $rs/$rt → ALU ${alu} → 写回 $rd = 结果`, en: `read rs/rt → ALU ${alu} → write $rd` },
});

const CTRL_INSTR: CtrlInstr[] = [
  R("add", 0x20, "add"),
  R("sub", 0x22, "sub"),
  R("and", 0x24, "and"),
  R("or", 0x25, "or"),
  R("slt", 0x2a, "slt"),
  {
    name: "lw", fmt: "I", op: 0x23, aluOp: "00", alu: "add",
    sig: { RegDst: "0", RegWrite: "1", ALUSrc: "1", MemRead: "1", MemWrite: "0", MemtoReg: "1", Branch: "0" },
    action: { zh: "读 $rs + 符号扩展(offset) → 访存读出 → 写回 $rt", en: "addr = rs + SignExt(offset) → load → write $rt" },
  },
  {
    name: "sw", fmt: "I", op: 0x2b, aluOp: "00", alu: "add",
    sig: { RegDst: "x", RegWrite: "0", ALUSrc: "1", MemRead: "0", MemWrite: "1", MemtoReg: "x", Branch: "0" },
    action: { zh: "读 $rs + 符号扩展(offset) → 将 $rt 写入存储器 (不写回)", en: "addr = rs + SignExt(offset) → store $rt (no WB)" },
  },
  {
    name: "beq", fmt: "I", op: 0x04, aluOp: "01", alu: "sub",
    sig: { RegDst: "x", RegWrite: "0", ALUSrc: "0", MemRead: "0", MemWrite: "0", MemtoReg: "x", Branch: "1" },
    action: { zh: "ALU 做减法($rs-$rt); 相等则 PC ← PC+4+offset×4, 否则 PC+4", en: "ALU subtract; if equal PC ← PC+4+offset×4 else PC+4" },
  },
];

const SIG_INFO: Record<SigKey, { zh: string; en: string }> = {
  RegDst: { zh: "写回目标寄存器 (rt / rd)", en: "write register (rt / rd)" },
  RegWrite: { zh: "写使能寄存器堆", en: "register-file write enable" },
  ALUSrc: { zh: "ALU 第二操作数来源 (寄存器 / 立即数)", en: "ALU operand 2 (register / immediate)" },
  MemRead: { zh: "读数据存储器", en: "data-memory read" },
  MemWrite: { zh: "写数据存储器", en: "data-memory write" },
  MemtoReg: { zh: "写回数据来源 (ALU / 存储器)", en: "write-back source (ALU / memory)" },
  Branch: { zh: "条件分支使能", en: "branch enable" },
};

// ALU 控制: ALUOp 与 funct → ALU 操作 (tex 表)
const ALU_TABLE: { aluOp: string; funct: string; op: string; instr: string; instrEn: string }[] = [
  { aluOp: "00", funct: "—", op: "add", instr: "lw / sw", instrEn: "lw / sw" },
  { aluOp: "01", funct: "—", op: "sub", instr: "beq", instrEn: "beq" },
  { aluOp: "10", funct: "100000", op: "add", instr: "add", instrEn: "add" },
  { aluOp: "10", funct: "100010", op: "sub", instr: "sub", instrEn: "sub" },
  { aluOp: "10", funct: "100100", op: "and", instr: "and", instrEn: "and" },
  { aluOp: "10", funct: "100101", op: "or", instr: "or", instrEn: "or" },
  { aluOp: "10", funct: "101010", op: "slt", instr: "slt", instrEn: "slt" },
];

// ---------------------------------------------------------------------
// 公共
// ---------------------------------------------------------------------
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
  return <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

function SigBadge({ v }: { v: CtlVal }) {
  const style = v === "1"
    ? { background: "#dcfce7", color: "#15803d", border: "1.5px solid #16a34a" }
    : v === "0"
      ? { background: "#f1f5f9", color: "#64748b", border: "1.5px solid #cbd5e1" }
      : { background: "#fef3c7", color: "#b45309", border: "1.5px solid #f59e0b" };
  return <span style={{ display: "inline-block", minWidth: 26, textAlign: "center", padding: "1px 6px", borderRadius: 6, fontFamily: "ui-monospace, monospace", fontWeight: 800, fontSize: 13, ...style }}>{v === "x" ? "×" : v}</span>;
}

// ---------------------------------------------------------------------
// signals: 指令 → 控制信号
// ---------------------------------------------------------------------
function SignalsControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.instr} onChange={(e) => onChange({ ...config, instr: e.target.value })} style={{ fontWeight: 700 }}>
        {CTRL_INSTR.map((i) => <option key={i.name} value={i.name}>{`${i.name} (${i.fmt})`}</option>)}
      </select>
    </div>
  );
}

function SignalsRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const ins = CTRL_INSTR.find((i) => i.name === config.instr) ?? CTRL_INSTR[0];
  const keys = Object.keys(SIG_INFO) as SigKey[];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 800, color: "#1e293b" }}>
        {`${ins.name}  ·  op=0x${ins.op.toString(16).padStart(2, "0")}${ins.funct !== undefined ? ` funct=0x${ins.funct.toString(16)}` : ""}`}
      </div>
      <Table head={isZh ? ["控制信号", "值", "作用"] : ["Signal", "Value", "Effect"]} rows={keys.map((k) => [<span key={k} style={{ fontFamily: "ui-monospace, monospace" }}>{k}</span>, <SigBadge key={k} v={ins.sig[k]} />, isZh ? SIG_INFO[k].zh : SIG_INFO[k].en])} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", alignItems: "baseline", fontSize: 13 }}>
        <span><b>ALUOp</b> = <span style={{ fontFamily: "ui-monospace, monospace", color: "#4338ca", fontWeight: 800 }}>{ins.aluOp}</span>{ins.aluOp === "10" ? " (由 funct 决定)" : ins.aluOp === "00" ? " (加)" : " (减)"}</span>
        <span><b>ALU 操作</b> = <span style={{ fontFamily: "ui-monospace, monospace", color: "#b45309", fontWeight: 800 }}>{ins.alu}</span></span>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3" }}>
        {isZh ? ins.action.zh : ins.action.en}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        {isZh ? "× = 不必关心 (don't care)" : "× = don't care"}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// alucontrol: ALUOp + funct → ALU 操作
// ---------------------------------------------------------------------
const R_TYPE_FUNCTS = ALU_TABLE.filter((r) => r.aluOp === "10");
function AluControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>ALUOp</span>
      <select className="txt" value={config.aluOp} onChange={(e) => set({ aluOp: e.target.value })} style={{ fontWeight: 700 }}>
        <option value="00">00</option>
        <option value="01">01</option>
        <option value="10">10</option>
      </select>
      {config.aluOp === "10" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>funct</span>
          <select className="txt" value={config.funct} onChange={(e) => set({ funct: e.target.value })} style={{ fontWeight: 700 }}>
            {R_TYPE_FUNCTS.map((r) => <option key={r.funct} value={r.funct}>{`${r.funct} (${r.instrEn})`}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function AluRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const row = config.aluOp === "10"
    ? ALU_TABLE.find((r) => r.aluOp === "10" && r.funct === config.funct) ?? R_TYPE_FUNCTS[0]
    : ALU_TABLE.find((r) => r.aluOp === config.aluOp) ?? ALU_TABLE[0];
  const rows: (string | number)[][] = ALU_TABLE.map((r) => [
    r.aluOp, r.funct, r.op, isZh ? r.instr : r.instrEn,
    r.aluOp === row.aluOp && r.funct === row.funct ? "◀" : "",
  ]);
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{ALU 操作} = f(\\text{ALUOp}=${config.aluOp}${config.aluOp === "10" ? `,\\ \\text{funct}=${config.funct}` : ""})$`} />
      </div>
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900, color: "#b45309", fontFamily: "ui-monospace, monospace" }}>
        {`→ ${row.op}`}
      </div>
      <Table head={["ALUOp", "funct", isZh ? "ALU 操作" : "ALU op", isZh ? "指令" : "Instr", ""]} rows={rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// hardwired: 硬布线 vs 微程序
// ---------------------------------------------------------------------
function HardwiredRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: (string | number)[][] = isZh
    ? [
      ["实现", "组合逻辑门直接译码 opcode/funct", "微指令序列存于控制存储器 ROM"],
      ["速度", "快 (信号延迟 = 门延迟)", "慢 (每步访控制存储器)"],
      ["灵活性", "差, 改指令集要改电路", "好, 改微程序即可"],
      ["适用", "RISC (定长/简单指令)", "CISC (复杂指令, 如 x86)"],
    ]
    : [
      ["Impl", "combinational logic on opcode/funct", "microinstructions in control ROM"],
      ["Speed", "fast (gate delay)", "slower (fetch microcode)"],
      ["Flexibility", "poor (redesign for new ISA)", "good (edit microcode)"],
      ["Fit", "RISC", "CISC (x86)"],
    ];
  return (
    <Panel>
      <div style={{ padding: "10px 14px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", textAlign: "center" }}>
        <MathText text={`$\\text{控制信号} = f(\\text{opcode},\\ \\text{funct},\\ \\text{状态标志})$`} />
      </div>
      <Table head={isZh ? ["特征", "硬布线控制器", "微程序控制器"] : ["Aspect", "Hardwired", "Microprogrammed"]} rows={rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// cycles: 单周期 vs 多周期
// ---------------------------------------------------------------------
function CyclesRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: (string | number)[][] = isZh
    ? [
      ["CPI", "1", "3–5 (视指令而定)"],
      ["时钟周期", "由最慢指令(lw)决定", "由最慢阶段决定"],
      ["硬件重复", "有 (多个加法器等)", "少 (组件可复用)"],
      ["性能", "差", "好于单周期"],
      ["复杂度", "低", "中"],
    ]
    : [
      ["CPI", "1", "3–5 (per instr)"],
      ["Cycle", "set by slowest instr (lw)", "set by slowest stage"],
      ["HW duplication", "yes (multiple adders)", "little (reuse)"],
      ["Performance", "poor", "better than single"],
      ["Complexity", "low", "medium"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["特征", "单周期", "多周期"] : ["Aspect", "Single-cycle", "Multi-cycle"]} rows={rows} />
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };
const sigDefault = { instr: "add" };
const aluDefault = { aluOp: "10", funct: "100000" };

const SUB: Record<SubMode, ModuleDef> = {
  signals: { id: "signals", title: T("控制信号", "Control Signals"), defaultConfig: sigDefault, Controls: SignalsControls as never, generate: () => [{ caption: T("指令 → 控制信号", "Instruction → control signals"), scene: {} }] as never, Render: SignalsRender as never } as unknown as ModuleDef,
  alucontrol: { id: "alucontrol", title: T("ALU 控制", "ALU Control"), defaultConfig: aluDefault, Controls: AluControls as never, generate: () => [{ caption: T("ALUOp + funct → ALU 操作", "ALUOp + funct → ALU op"), scene: {} }] as never, Render: AluRender as never } as unknown as ModuleDef,
  hardwired: { id: "hardwired", title: T("硬布线 vs 微程序", "Hardwired vs Micro"), defaultConfig: {}, generate: () => [{ caption: T("控制器实现方式", "Control implementation"), scene: {} }] as never, Render: HardwiredRender as never } as unknown as ModuleDef,
  cycles: { id: "cycles", title: T("单周期 vs 多周期", "Single vs Multi"), defaultConfig: {}, generate: () => [{ caption: T("单周期 vs 多周期", "Single vs multi-cycle"), scene: {} }] as never, Render: CyclesRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "控制", opts: [
    { v: "signals", zh: "控制信号", en: "Signals" },
    { v: "alucontrol", zh: "ALU 控制", en: "ALU Control" },
  ]},
  { label: "实现", opts: [
    { v: "hardwired", zh: "硬布线 vs 微程序", en: "Hardwired/Micro" },
    { v: "cycles", zh: "单周期 vs 多周期", en: "Single/Multi" },
  ]},
];

const DEFAULT: Cfg = { subMode: "signals", ...(SUB.signals as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.signals;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "signals";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const cpuControlModule: ModuleDef<any, Cfg> = {
  id: "cpu-control",
  title: T("控制器", "Control Unit"),
  desc: T("控制信号生成 / ALU 控制 / 硬布线 vs 微程序 / 单周期 vs 多周期。", "Control signal generation / ALU control / hardwired vs microprogrammed / single vs multi-cycle."),
  tags: ["computer-organization", "cpu"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "控制器" : "CONTROL UNIT"}</span>
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
    return frames.length ? frames : [{ caption: T("控制器", "Control Unit"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
