import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 指令系统与汇编 · 单模块聚合 · 交互式
//   regs(MIPS 寄存器约定, 逐帧读/写动画)
//   → format(R/I/J 指令格式: 位域编码器) → addressing(寻址方式)
//   → call(过程调用/栈帧, 逐步演示)
//   对应 tex/ComputerOrganization/chapters/instruction_set.tex
// =====================================================================

type SubMode = "regs" | "format" | "addressing" | "call";

const REG_NAMES = [
  "$zero", "$at", "$v0", "$v1", "$a0", "$a1", "$a2", "$a3",
  "$t0", "$t1", "$t2", "$t3", "$t4", "$t5", "$t6", "$t7",
  "$s0", "$s1", "$s2", "$s3", "$s4", "$s5", "$s6", "$s7",
  "$t8", "$t9", "$k0", "$k1", "$gp", "$sp", "$fp", "$ra",
];
const regName = (n: number) => `${REG_NAMES[n] ?? "?"}($${n})`;

// ---------------------------------------------------------------------
// 指令定义
// ---------------------------------------------------------------------
type Fmt = "R" | "I" | "J";
type InstrDef = { name: string; fmt: Fmt; op: number; funct?: number; args: string };
const INSTR: InstrDef[] = [
  { name: "add", fmt: "R", op: 0x00, funct: 0x20, args: "$rd, $rs, $rt" },
  { name: "sub", fmt: "R", op: 0x00, funct: 0x22, args: "$rd, $rs, $rt" },
  { name: "and", fmt: "R", op: 0x00, funct: 0x24, args: "$rd, $rs, $rt" },
  { name: "or", fmt: "R", op: 0x00, funct: 0x25, args: "$rd, $rs, $rt" },
  { name: "slt", fmt: "R", op: 0x00, funct: 0x2a, args: "$rd, $rs, $rt" },
  { name: "addi", fmt: "I", op: 0x08, args: "$rt, $rs, imm" },
  { name: "lw", fmt: "I", op: 0x23, args: "$rt, off($rs)" },
  { name: "sw", fmt: "I", op: 0x2b, args: "$rt, off($rs)" },
  { name: "beq", fmt: "I", op: 0x04, args: "$rs, $rt, label" },
  { name: "bne", fmt: "I", op: 0x05, args: "$rs, $rt, label" },
  { name: "j", fmt: "J", op: 0x02, args: "target" },
  { name: "jal", fmt: "J", op: 0x03, args: "target" },
];
const instrOf = (name: string) => INSTR.find((i) => i.name === name) ?? INSTR[0];

// ---------------------------------------------------------------------
// 位域编码: R/I/J 三格式
// ---------------------------------------------------------------------
type Field = { key: string; label: string; width: number; value: number; color: string; bg: string };
const FIELD_STYLE: Record<string, { color: string; bg: string }> = {
  op: { color: "#4338ca", bg: "#e0e7ff" },
  rs: { color: "#15803d", bg: "#dcfce7" },
  rt: { color: "#b45309", bg: "#fef3c7" },
  rd: { color: "#be185d", bg: "#fce7f3" },
  shamt: { color: "#0369a1", bg: "#e0f2fe" },
  funct: { color: "#6d28d9", bg: "#ede9fe" },
  imm: { color: "#b91c1c", bg: "#fee2e2" },
  target: { color: "#b91c1c", bg: "#fee2e2" },
};

function encodeFields(cfg: any): { fields: Field[]; bin: string; hex: string } {
  const ins = instrOf(cfg.instr);
  const max = (w: number) => (1 << w) - 1;
  const clamp = (v: number, w: number) => ((Number(v) || 0) & max(w)) >>> 0;
  const mk = (key: string, label: string, width: number, value: number): Field => ({
    key, label, width, value: clamp(value, width), ...FIELD_STYLE[key],
  });
  let fields: Field[];
  if (ins.fmt === "R") {
    fields = [
      mk("op", "op", 6, ins.op),
      mk("rs", "rs", 5, cfg.rs),
      mk("rt", "rt", 5, cfg.rt),
      mk("rd", "rd", 5, cfg.rd),
      mk("shamt", "shamt", 5, cfg.shamt),
      mk("funct", "funct", 6, ins.funct ?? 0),
    ];
  } else if (ins.fmt === "I") {
    fields = [
      mk("op", "op", 6, ins.op),
      mk("rs", "rs", 5, cfg.rs),
      mk("rt", "rt", 5, cfg.rt),
      mk("imm", "immediate", 16, cfg.imm),
    ];
  } else {
    fields = [
      mk("op", "op", 6, ins.op),
      mk("target", "address", 26, cfg.target),
    ];
  }
  const bin = fields.map((f) => f.value.toString(2).padStart(f.width, "0")).join("");
  const hex = parseInt(bin, 2).toString(16).toUpperCase().padStart(8, "0");
  return { fields, bin, hex };
}

// ---------------------------------------------------------------------
// 公共小组件
// ---------------------------------------------------------------------
function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// regs: MIPS 寄存器约定 + 寄存器文件读/写 (逐帧动画)
// ---------------------------------------------------------------------
type RegsPhase = "decode" | "read" | "exec" | "write";
type RegsScene = { phase: RegsPhase; rs: number; rt: number; rd: number; rsVal: number; rtVal: number; result: number; read: boolean; write: boolean };

const REGS_PHASE: Record<RegsPhase, { bg: string; fg: string; zh: string; en: string }> = {
  decode: { bg: "#eef2ff", fg: "#3730a3", zh: "译码：提取 $rs / rt / rd$", en: "Decode: extract $rs / rt / rd$" },
  read: { bg: "#dcfce7", fg: "#166534", zh: "读寄存器：两个读端口", en: "Read: two read ports" },
  exec: { bg: "#fef3c7", fg: "#92400e", zh: "执行：ALU 运算", en: "Execute: ALU operation" },
  write: { bg: "#dbeafe", fg: "#1e40af", zh: "写回：一个写端口", en: "Write-back: one write port" },
};

function regsGenerate(_config: any): Frame<RegsScene>[] {
  const rs = 17, rt = 18, rd = 8;
  const rsVal = 5, rtVal = 7, result = rsVal + rtVal;
  const base = { rs, rt, rd, rsVal, rtVal, result, read: false, write: false };
  return [
    { line: 0, caption: T("译码：$add\\ \\$t0, \\$s1, \\$s2$ → $rs=17, rt=18, rd=8$", "Decode: $add\\ \\$t0, \\$s1, \\$s2$ → $rs=17, rt=18, rd=8$"), scene: { ...base, phase: "decode" } },
    { line: 1, caption: T("读端口：$A \\gets R[rs]=5$, $B \\gets R[rt]=7$", "Read ports: $A \\gets R[rs]=5$, $B \\gets R[rt]=7$"), scene: { ...base, phase: "read", read: true } },
    { line: 2, caption: T("执行：$C \\gets A + B = 12$", "Execute: $C \\gets A + B = 12$"), scene: { ...base, phase: "exec", read: true } },
    { line: 3, caption: T("写端口：$R[rd] \\gets C = 12$", "Write port: $R[rd] \\gets C = 12$"), scene: { ...base, phase: "write", read: true, write: true } },
  ];
}
const REGS_CODE = [
  T("译码：取 $rs, rt, rd$", "Decode: get $rs, rt, rd$"),
  T("读端口：$A \\gets R[rs]$, $B \\gets R[rt]$", "Read: $A \\gets R[rs]$, $B \\gets R[rt]$"),
  T("运算：$C \\gets A + B$", "Compute: $C \\gets A + B$"),
  T("写端口：$R[rd] \\gets C$", "Write: $R[rd] \\gets C$"),
];

function RegsRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? { phase: "decode", rs: 17, rt: 18, rd: 8, rsVal: 0, rtVal: 0, result: 0, read: false, write: false }) as RegsScene;
  const ph = REGS_PHASE[s.phase] ?? REGS_PHASE.decode;
  const mark = (i: number) => {
    if (i === s.rd && (s.write || s.phase === "decode")) return { bg: "#dbeafe", bd: "#2563eb", fg: "#1e40af", tag: "W" };
    if (i === s.rs && (s.read || s.phase === "decode")) return { bg: "#dcfce7", bd: "#16a34a", fg: "#166534", tag: "A" };
    if (i === s.rt && (s.read || s.phase === "decode")) return { bg: "#ccfbf1", bd: "#0d9488", fg: "#115e59", tag: "B" };
    return { bg: "#f8fafc", bd: "#e2e8f0", fg: "#64748b", tag: "" };
  };
  const valOf = (i: number): string => {
    if (i === s.rs && s.read) return `${s.rsVal}`;
    if (i === s.rt && s.read) return `${s.rtVal}`;
    if (i === s.rd && s.write) return `${s.result}`;
    return "";
  };
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: ph.bg, color: ph.fg, fontWeight: 800, fontSize: 14 }}>{isZh ? ph.zh : ph.en}</div>
      <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#1e293b" }}>
        <b>add</b> {regName(s.rd)}, {regName(s.rs)}, {regName(s.rt)}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#475569" }}>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "#dcfce7", border: "1px solid #16a34a" }}>{isZh ? "读端口 A" : "Read A"} = {s.read ? s.rsVal : "—"}</span>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "#ccfbf1", border: "1px solid #0d9488" }}>{isZh ? "读端口 B" : "Read B"} = {s.read ? s.rtVal : "—"}</span>
          <span style={{ padding: "3px 8px", borderRadius: 6, background: "#eef2ff", border: "1px solid #4338ca" }}>ALU = {s.phase === "exec" || s.phase === "write" ? s.result : "—"}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, padding: 8, borderRadius: 12, background: "#0f172a" }}>
        {REG_NAMES.map((_, i) => {
          const m = mark(i);
          const v = valOf(i);
          return (
            <div key={i} style={{ padding: "5px 4px", borderRadius: 6, background: m.bg, border: `2px solid ${m.bd}`, textAlign: "center", transition: "all .15s" }}>
              <div style={{ fontSize: 9, color: "#94a3b8" }}>{`$${i}`}{m.tag ? ` · ${m.tag}` : ""}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: m.fg, fontFamily: "ui-monospace, monospace" }}>{REG_NAMES[i]}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: v ? "#0f172a" : "#cbd5e1", fontFamily: "ui-monospace, monospace" }}>{v || "·"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 1.8 }}>
        {isZh
          ? "MIPS 是经典 RISC 架构: 32 个 32 位通用寄存器, $0 恒为 0, Load/Store 架构 (只有 lw/sw 访存)。寄存器文件有 2 个读端口 + 1 个写端口。"
          : "MIPS: 32 × 32-bit GPRs, $0 hardwired to 0, Load/Store architecture. The register file has 2 read ports + 1 write port."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// format: R/I/J 位域编码器 (交互)
// ---------------------------------------------------------------------
function FmtControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const ins = instrOf(config.instr);
  const set = (p: any) => onChange({ ...config, ...p });
  const num = (label: string, key: string, min: number, max: number, value: number) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" type="number" min={min} max={max} value={value}
        onChange={(e) => set({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) })}
        style={{ width: 78 }} />
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.instr} onChange={(e) => set({ instr: e.target.value })} style={{ fontWeight: 700 }}>
        {INSTR.map((i) => <option key={i.name} value={i.name}>{`${i.name} (${i.fmt})`}</option>)}
      </select>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>{`${ins.name} ${ins.args}`}</span>
      {ins.fmt === "R" && <>
        {num("rs", "rs", 0, 31, config.rs)}
        {num("rt", "rt", 0, 31, config.rt)}
        {num("rd", "rd", 0, 31, config.rd)}
        {num("shamt", "shamt", 0, 31, config.shamt)}
      </>}
      {ins.fmt === "I" && <>
        {num("rs", "rs", 0, 31, config.rs)}
        {num("rt", "rt", 0, 31, config.rt)}
        {num(isZh ? "立即数" : "imm", "imm", -32768, 65535, config.imm)}
      </>}
      {ins.fmt === "J" && num(isZh ? "目标" : "target", "target", 0, 0x3ffffff, config.target)}
    </div>
  );
}

function FmtRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const ins = instrOf(config.instr);
  const { fields, bin, hex } = encodeFields(config);
  const groups = bin.match(/.{4}/g) ?? [];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: "#1e293b", fontFamily: "ui-monospace, monospace" }}>
        {`${ins.name} ${ins.args}`}
      </div>
      <div style={{ display: "flex", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
        {fields.map((f) => (
          <div key={f.key} style={{ flexGrow: f.width, flexBasis: 0, background: f.bg, borderRight: "1px solid #cbd5e1", padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: f.color }}>{f.label}</div>
            <div style={{ fontSize: 9, color: "#94a3b8" }}>{`${f.width}位`}</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: f.width >= 16 ? 14 : 16, fontWeight: 800, color: f.color, letterSpacing: 1 }}>
              {f.value.toString(2).padStart(f.width, "0")}
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>= {f.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#475569" }}>
          {groups.map((g, i) => <span key={i}>{g}{i < groups.length - 1 ? " " : ""}</span>)}
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 800, color: "#4338ca" }}>{`0x${hex}`}</span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.9 }}>
        {ins.fmt === "R" && (isZh
          ? `R 型: op=0x00, funct=0x${(ins.funct ?? 0).toString(16)}; 操作数全在寄存器。`
          : `R-type: op=0x00, funct=0x${(ins.funct ?? 0).toString(16)}; register operands.`)}
        {ins.fmt === "I" && (isZh
          ? `I 型: op=0x${ins.op.toString(16)}; 16 位立即数/偏移, 补码表示。`
          : `I-type: op=0x${ins.op.toString(16)}; 16-bit signed immediate/offset.`)}
        {ins.fmt === "J" && (isZh
          ? `J 型: op=0x${ins.op.toString(16)}; 目标 = PC 高 4 位拼接 26 位地址 ×4。`
          : `J-type: op=0x${ins.op.toString(16)}; target = {PC[31:28], addr, 00}.`)}
        {ins.fmt !== "J" && <span>　{`rs=${regName(config.rs)}${ins.fmt === "I" ? `, rt=${regName(config.rt)}` : ""}`}</span>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// addressing: 寻址方式
// ---------------------------------------------------------------------
type AddrMode = "reg" | "imm" | "base" | "pcrel" | "pseudo";
const ADDR: Record<AddrMode, { zh: string; en: string; eg: string }> = {
  reg: { zh: "寄存器寻址", en: "Register", eg: "add $1, $2, $3" },
  imm: { zh: "立即数寻址", en: "Immediate", eg: "addi $1, $2, 100" },
  base: { zh: "基址偏移寻址", en: "Base+Offset", eg: "lw $1, 8($2)" },
  pcrel: { zh: "PC 相对寻址", en: "PC-relative", eg: "beq $1, $2, label" },
  pseudo: { zh: "伪直接寻址", en: "Pseudo-direct", eg: "j addr" },
};

function AddrControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const set = (p: any) => onChange({ ...config, ...p });
  const hexIn = (label: string, key: string, value: number) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" value={`0x${(value >>> 0).toString(16)}`}
        onChange={(e) => set({ [key]: parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ""), 16) || 0 })}
        style={{ width: 110, fontFamily: "ui-monospace, monospace" }} />
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.mode} onChange={(e) => set({ mode: e.target.value as AddrMode })} style={{ fontWeight: 700 }}>
        {(Object.keys(ADDR) as AddrMode[]).map((m) => <option key={m} value={m}>{isZh ? ADDR[m].zh : ADDR[m].en}</option>)}
      </select>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>{ADDR[config.mode as AddrMode].eg}</span>
      {(config.mode === "base" || config.mode === "reg") && hexIn("$rs", "baseVal", config.baseVal)}
      {config.mode === "pcrel" && hexIn("PC", "pc", config.pc)}
      {config.mode === "pseudo" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>target</span>
          <input className="txt" type="number" min={0} max={0x3ffffff} value={config.target}
            onChange={(e) => set({ target: Math.max(0, Math.min(0x3ffffff, Number(e.target.value) || 0)) })}
            style={{ width: 110 }} />
        </label>
      )}
      {config.mode !== "reg" && config.mode !== "pseudo" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>{isZh ? "偏移/立即数" : "imm"}</span>
          <input className="txt" type="number" value={config.imm} onChange={(e) => set({ imm: Number(e.target.value) || 0 })} style={{ width: 90 }} />
        </label>
      )}
    </div>
  );
}

function AddrRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const hx = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase()}`;
  const mode = config.mode as AddrMode;
  let formula = "";
  let result = "";
  let detail = "";
  if (mode === "reg") {
    formula = `operand = R[rs]`;
    result = hx(config.baseVal);
  } else if (mode === "imm") {
    formula = `operand = imm`;
    result = `${config.imm} (${hx(config.imm)})`;
  } else if (mode === "base") {
    formula = `addr = R[rs] + imm`;
    result = hx((config.baseVal + config.imm) >>> 0);
    detail = `${hx(config.baseVal)} + ${config.imm}`;
  } else if (mode === "pcrel") {
    formula = `addr = PC + 4 + imm × 4`;
    result = hx((config.pc + 4 + config.imm * 4) >>> 0);
    detail = `${hx(config.pc)} + 4 + ${config.imm}×4`;
  } else {
    formula = `addr = { PC[31:28], target, 00 }`;
    const hi = config.pc & 0xf0000000;
    result = hx((hi | ((config.target << 2) >>> 0)) >>> 0);
    detail = `PC 高 4 位 ${hx(hi)} 拼接 target×4`;
  }
  return (
    <Panel>
      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#fff", border: "1px solid #e2e8f0", display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800, color: "#4338ca", fontSize: 14 }}>{isZh ? ADDR[mode].zh : ADDR[mode].en}</div>
        <div style={{ fontSize: 15 }}><MathText text={`$${formula}$`} /></div>
        {detail && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{detail}</div>}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e40af", fontFamily: "ui-monospace, monospace" }}>{`→ ${result}`}</div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// call: 过程调用 / 栈帧 (逐步演示)
// ---------------------------------------------------------------------
const CALL_CODE: { text: string; zh: string; en: string }[] = [
  { text: "li   $a0, 5", zh: "参数 $a0 = 5", en: "arg $a0 = 5" },
  { text: "jal  fact", zh: "$ra = PC+4; 跳转 fact", en: "$ra = PC+4; jump to fact" },
  { text: "move $v0, $t0", zh: "返回点: 取返回值", en: "return point: read result" },
  { text: "fact:", zh: "过程入口", en: "procedure entry" },
  { text: "addi $sp, $sp, -8", zh: "分配栈帧", en: "allocate frame" },
  { text: "sw   $ra, 4($sp)", zh: "保存返回地址", en: "save $ra" },
  { text: "sw   $s0, 0($sp)", zh: "保存 $s0", en: "save $s0" },
  { text: "   # 过程体 (计算 n!)", zh: "计算体", en: "body" },
  { text: "lw   $s0, 0($sp)", zh: "恢复 $s0", en: "restore $s0" },
  { text: "lw   $ra, 4($sp)", zh: "恢复 $ra", en: "restore $ra" },
  { text: "addi $sp, $sp, 8", zh: "释放栈帧", en: "free frame" },
  { text: "jr   $ra", zh: "返回调用者", en: "return" },
];
const CALL_RA = 0x00400008;
const CALL_FACT = 0x0040000c;
const SP0 = 0x7ffffffc;
const SP1 = 0x7ffffff4;
const SLOT_S0 = SP1;
const SLOT_RA = SP1 + 4;
const callHx = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;

type CallState = { pc: number; ra: number; sp: number; s0: number; v0: number; a0: number; t0: number; mem: Record<number, number> };
type CallStep = { line: number; state: CallState; zh: string; en: string };

function buildCallSteps(): CallStep[] {
  const steps: CallStep[] = [];
  const s: CallState = { pc: 0x00400000, ra: 0, sp: SP0, s0: 0xcafe, v0: 0, a0: 0, t0: 0, mem: {} };
  const push = (line: number, zh: string, en: string, patch: Partial<CallState> = {}) => {
    Object.assign(s, patch);
    steps.push({ line, state: { ...s, mem: { ...s.mem } }, zh, en });
  };
  push(0, "li: 参数 $a0 ← 5", "li: $a0 ← 5", { a0: 5 });
  push(1, "$ra ← 返回地址 0x00400008; PC → fact", "jal: $ra ← PC+4, jump to fact", { ra: CALL_RA, pc: CALL_FACT });
  push(4, "分配栈帧: $sp ← $sp − 8", "allocate frame: $sp −= 8", { sp: SP1 });
  push(5, `把 $ra 存入 4($sp) = ${callHx(SLOT_RA)}`, "sw $ra, 4($sp)", { mem: { ...s.mem, [SLOT_RA]: s.ra } });
  push(6, "把旧 $s0 = 0x0000CAFE 存入 0($sp)", "sw $s0, 0($sp)", { mem: { ...s.mem, [SLOT_S0]: s.s0 } });
  push(7, "过程体: 计算 5! → $t0 = 120", "body: compute 5! = 120 → $t0", { t0: 120 });
  push(8, "恢复 $s0 (从栈读回)", "restore $s0 from stack", { s0: s.mem[SLOT_S0] ?? s.s0 });
  push(9, "恢复 $ra (从栈读回)", "restore $ra from stack", { ra: s.mem[SLOT_RA] ?? s.ra });
  push(10, "释放栈帧: $sp ← $sp + 8", "free frame: $sp += 8", { sp: SP0 });
  push(11, "jr $ra: PC ← $ra, 返回调用者", "jr $ra: return to caller", { pc: CALL_RA });
  push(2, "返回点: $v0 ← $t0 = 120", "return point: $v0 ← 120", { v0: 120 });
  return steps;
}
const CALL_STEPS = buildCallSteps();

function CallControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const step = config.step ?? 0;
  const max = CALL_STEPS.length - 1;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <button className="ghost" disabled={step <= 0} onClick={() => onChange({ ...config, step: Math.max(0, step - 1) })}>{isZh ? "← 上一步" : "← Prev"}</button>
      <button className="ghost" onClick={() => onChange({ ...config, step: Math.min(max, step + 1) })}>{isZh ? "下一步 →" : "Next →"}</button>
      <button className="ghost" onClick={() => onChange({ ...config, step: 0 })}>{isZh ? "重置" : "Reset"}</button>
      <span style={{ fontSize: 12, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>{`${step + 1} / ${CALL_STEPS.length}`}</span>
    </div>
  );
}

function CallRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const step = Math.max(0, Math.min(CALL_STEPS.length - 1, config.step ?? 0));
  const cur = CALL_STEPS[step];
  const st = cur.state;
  const reg = (name: string, val: string, hot = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", borderRadius: 6, background: hot ? "#eef2ff" : "#f8fafc", border: `1px solid ${hot ? "#c7d2fe" : "#e2e8f0"}`, fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
      <span style={{ color: "#64748b" }}>{name}</span><span style={{ fontWeight: 700, color: "#0f172a" }}>{val}</span>
    </div>
  );
  return (
    <Panel>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1.4fr) minmax(220px,1fr)", gap: 12, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{isZh ? "代码" : "Code"}</div>
          <div style={{ display: "grid", gap: 2 }}>
            {CALL_CODE.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "3px 8px", borderRadius: 6, background: i === cur.line ? "#eef2ff" : "transparent", border: `1px solid ${i === cur.line ? "#c7d2fe" : "transparent"}`, fontFamily: "ui-monospace, monospace", fontSize: 12, color: i === cur.line ? "#3730a3" : "#475569", fontWeight: i === cur.line ? 700 : 400 }}>
                <span style={{ color: "#cbd5e1", width: 18, textAlign: "right" }}>{i}</span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{isZh ? "寄存器" : "Registers"}</div>
            <div style={{ display: "grid", gap: 3 }}>
              {reg("PC", callHx(st.pc), cur.line <= 1 || cur.line === 11)}
              {reg("$ra", callHx(st.ra), cur.line === 1 || cur.line === 9 || cur.line === 11)}
              {reg("$sp", callHx(st.sp), cur.line === 4 || cur.line === 10)}
              {reg("$s0", callHx(st.s0), cur.line === 6 || cur.line === 8)}
              {reg("$a0", `${st.a0}`, cur.line === 0)}
              {reg("$v0", `${st.v0}`, cur.line === 2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{isZh ? "栈 (栈帧)" : "Stack"}</div>
            <div style={{ display: "grid", gap: 3 }}>
              {[SLOT_RA, SLOT_S0].map((addr) => (
                <div key={addr} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", borderRadius: 6, background: addr in st.mem ? "#dcfce7" : "#f8fafc", border: `1px solid ${addr in st.mem ? "#16a34a" : "#e2e8f0"}`, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                  <span style={{ color: "#64748b" }}>{`${callHx(addr)}${addr === SLOT_RA ? " (4)" : " (0)"}`}</span>
                  <span style={{ fontWeight: 700 }}>{addr in st.mem ? callHx(st.mem[addr]) : "—"}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{`$sp = ${callHx(st.sp)}`}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3" }}>
        {isZh ? cur.zh : cur.en}
      </div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const fmtDefault = { instr: "add", rs: 1, rt: 2, rd: 3, shamt: 0, imm: 8, target: 4 };
const addrDefault = { mode: "base", baseVal: 0x1000, imm: 8, pc: 0x00400000, target: 4 };

const SUB: Record<SubMode, ModuleDef> = {
  regs: { id: "regs", title: T("MIPS 寄存器", "MIPS Registers"), defaultConfig: {}, generate: regsGenerate, code: REGS_CODE, Render: RegsRender as never } as unknown as ModuleDef,
  format: { id: "format", title: T("指令格式 R/I/J", "Instruction Formats"), defaultConfig: fmtDefault, Controls: FmtControls as never, generate: () => [{ caption: T("R/I/J 位域编码", "R/I/J bit-field encoding"), scene: {} }] as never, Render: FmtRender as never } as unknown as ModuleDef,
  addressing: { id: "addressing", title: T("寻址方式", "Addressing Modes"), defaultConfig: addrDefault, Controls: AddrControls as never, generate: () => [{ caption: T("寻址方式", "Addressing modes"), scene: {} }] as never, Render: AddrRender as never } as unknown as ModuleDef,
  call: { id: "call", title: T("过程调用", "Procedure Call"), defaultConfig: { step: 0 }, Controls: CallControls as never, generate: () => [{ caption: T("过程调用与栈帧", "Procedure call & stack frame"), scene: {} }] as never, Render: CallRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "接口", opts: [
    { v: "regs", zh: "MIPS 寄存器", en: "Registers" },
  ]},
  { label: "指令", opts: [
    { v: "format", zh: "指令格式 R/I/J", en: "Formats" },
    { v: "addressing", zh: "寻址方式", en: "Addressing" },
    { v: "call", zh: "过程调用", en: "Proc Call" },
  ]},
];

const DEFAULT: Cfg = { subMode: "regs", ...(SUB.regs as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.regs;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "regs";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const instructionSetModule: ModuleDef<any, Cfg> = {
  id: "instruction-set",
  title: T("指令系统与汇编", "Instruction Set & Assembly"),
  desc: T("MIPS 寄存器 / R-I-J 指令格式 / 寻址方式 / 过程调用。", "MIPS registers / R-I-J formats / addressing / procedure call."),
  tags: ["computer-organization", "isa"],
  interactive: false,
  defaultConfig: DEFAULT,
  randomize(c) {
    const safe = safeCfg(c.subMode, c);
    return safe;
  },
  Controls({ config, onChange, t, embedded }: any) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    if (embedded && !active?.Controls) return null;
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        {!embedded && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "指令系统" : "INSTRUCTION SET"}</span>
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
    return frames.length ? frames : [{ caption: T("指令系统", "Instruction Set"), scene: safe }];
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
