import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 指令系统与汇编 · 单模块聚合 · 交互式
//   isa(ISA 概念 + RISC/CISC) → regs(MIPS 寄存器约定)
//   → format(R/I/J 指令格式: 位域编码器) → addressing(寻址方式)
//   → call(过程调用/栈帧·占位) → x86(简介)
//   对应 tex/ComputerOrganization/chapters/instruction_set.tex
// =====================================================================

type SubMode = "isa" | "regs" | "format" | "addressing" | "call" | "x86";

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
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
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

// ---------------------------------------------------------------------
// isa: 概念 + RISC/CISC
// ---------------------------------------------------------------------
function IsaRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const items: [string, string][] = isZh
    ? [
      ["寄存器组", "名称 / 数量 / 位宽"],
      ["指令格式", "操作码 + 操作数的编码方式"],
      ["寻址方式", "如何定位操作数 (寄存器 / 立即数 / 基址偏移 / PC 相对…)"],
      ["数据类型", "支持的整数 / 浮点数宽度"],
      ["I/O 模型", "内存映射 I/O / 独立 I/O"],
    ]
    : [
      ["Registers", "names / count / width"],
      ["Instruction format", "opcode + operand encoding"],
      ["Addressing modes", "how operands are located"],
      ["Data types", "supported integer / float widths"],
      ["I/O model", "memory-mapped / isolated I/O"],
    ];
  const rows: (string | number)[][] = isZh
    ? [
      ["指令长度", "定长 (如 32-bit)", "变长 (1–15 字节)"],
      ["指令数量", "少 (约 100 条)", "多 (约 300+ 条)"],
      ["寻址方式", "简单 (Load/Store 架构)", "复杂 (可直接访存运算)"],
      ["典型代表", "MIPS / ARM / RISC-V", "x86 / VAX"],
      ["硬件设计", "简洁, 易流水", "复杂, 需微程序"],
      ["编译负担", "重 (编译器优化关键)", "轻 (硬件承担更多)"],
    ]
    : [
      ["Length", "fixed (e.g. 32-bit)", "variable (1–15 bytes)"],
      ["Count", "few (~100)", "many (~300+)"],
      ["Addressing", "simple (Load/Store)", "complex (mem operands)"],
      ["Examples", "MIPS / ARM / RISC-V", "x86 / VAX"],
      ["Hardware", "simple, pipeline-friendly", "complex, microcode"],
      ["Compiler burden", "heavy (optimizer key)", "light (hardware does more)"],
    ];
  return (
    <Panel>
      <div style={{ padding: "10px 14px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 1.8 }}>
        <b>{isZh ? "指令集架构 (ISA)" : "Instruction Set Architecture (ISA)"}</b>
        {isZh ? " — 软件与硬件的接口。它定义:" : " — the software/hardware interface. It defines:"}
      </div>
      <Table head={isZh ? ["ISA 要素", "含义"] : ["ISA element", "Meaning"]} rows={items} />
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{isZh ? "RISC 与 CISC 对比" : "RISC vs CISC"}</div>
      <Table head={isZh ? ["特征", "RISC", "CISC"] : ["Feature", "RISC", "CISC"]} rows={rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// regs: MIPS 寄存器约定
// ---------------------------------------------------------------------
function RegsRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: (string | number)[][] = isZh
    ? [
      ["$0", "$zero", "恒为 0"],
      ["$1", "$at", "汇编器保留"],
      ["$2–$3", "$v0–$v1", "函数返回值"],
      ["$4–$7", "$a0–$a3", "函数参数"],
      ["$8–$15", "$t0–$t7", "临时变量 (caller-saved)"],
      ["$16–$23", "$s0–$s7", "保存变量 (callee-saved, 需恢复)"],
      ["$24–$25", "$t8–$t9", "临时变量"],
      ["$26–$27", "$k0–$k1", "内核保留"],
      ["$28", "$gp", "全局指针"],
      ["$29", "$sp", "栈指针"],
      ["$30", "$fp", "帧指针"],
      ["$31", "$ra", "返回地址"],
    ]
    : [
      ["$0", "$zero", "constant 0"],
      ["$1", "$at", "assembler reserved"],
      ["$2–$3", "$v0–$v1", "return values"],
      ["$4–$7", "$a0–$a3", "function arguments"],
      ["$8–$15", "$t0–$t7", "temporaries (caller-saved)"],
      ["$16–$23", "$s0–$s7", "saved (callee-saved)"],
      ["$24–$25", "$t8–$t9", "temporaries"],
      ["$26–$27", "$k0–$k1", "kernel reserved"],
      ["$28", "$gp", "global pointer"],
      ["$29", "$sp", "stack pointer"],
      ["$30", "$fp", "frame pointer"],
      ["$31", "$ra", "return address"],
    ];
  return (
    <Panel>
      <div style={{ padding: "10px 14px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 1.8 }}>
        {isZh
          ? "MIPS 是经典 RISC 架构: 32 个 32 位通用寄存器, $0 恒为 0, Load/Store 架构 (只有 lw/sw 访存)。"
          : "MIPS: 32 × 32-bit GPRs, $0 hardwired to 0, Load/Store architecture."}
      </div>
      <Table head={isZh ? ["寄存器号", "名称", "用途"] : ["No.", "Name", "Use"]} rows={rows} />
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
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "指令" : "INSTR"}</span>
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
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "寻址" : "MODE"}</span>
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
// call: 过程调用 / 栈帧 (占位)
// ---------------------------------------------------------------------
function CallRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const items = isZh
    ? [
      "jal my_func: $ra ← PC+4, 跳转; jr $ra 返回",
      "栈帧分配: addi $sp, $sp, -8",
      "保存现场: sw $ra / sw $s0 入栈",
      "恢复现场: lw $s0 / lw $ra, 释放 addi $sp, $sp, 8",
      "caller-saved ($t, $a) vs callee-saved ($s) 的保存责任",
    ]
    : [
      "jal my_func: $ra ← PC+4, jump; jr $ra returns",
      "Allocate frame: addi $sp, $sp, -8",
      "Save: sw $ra / sw $s0",
      "Restore: lw $s0 / lw $ra, then addi $sp, $sp, 8",
      "caller-saved ($t, $a) vs callee-saved ($s)",
    ];
  return (
    <div style={{ maxWidth: 720, margin: "28px auto", padding: "22px 26px", border: "1.5px dashed #c7d2fe", borderRadius: 16, background: "#f8faff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#4338ca" }}>{isZh ? "过程调用与栈帧" : "Procedure Call & Stack Frame"}</span>
        <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>{isZh ? "建设中" : "WIP"}</span>
      </div>
      <div style={{ fontSize: 13, color: "#64748b", margin: "8px 0 14px" }}>{isZh ? "占位页 — 规划内容如下:" : "Placeholder — planned content:"}</div>
      <ul style={{ margin: 0, paddingLeft: 20, color: "#334155", fontSize: 13, lineHeight: 2 }}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------
// x86: 简介
// ---------------------------------------------------------------------
function X86Render({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <Panel>
      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#fff", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 2 }}>
        {isZh ? (
          <>
            <b>x86</b> 是典型的 <b>CISC</b> 架构: 变长指令 (1–15 字节), 寄存器较少 (8 个通用寄存器, x86-64 扩展到 16 个),
            支持内存直接参与运算 (非 Load/Store)。<b>x86-64</b> 是目前桌面 / 服务器主流架构, 与 MIPS/RISC-V 的定长 RISC 风格形成对比。
          </>
        ) : (
          <>
            <b>x86</b> is a classic <b>CISC</b> architecture: variable-length instructions (1–15 bytes), few registers
            (8 GPRs, 16 in x86-64), memory operands allowed (not Load/Store). <b>x86-64</b> dominates desktop/servers,
            contrasting the fixed-length RISC style of MIPS/RISC-V.
          </>
        )}
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
  isa: { id: "isa", title: T("指令集架构", "ISA"), defaultConfig: {}, generate: () => [{ caption: T("ISA / RISC 与 CISC", "ISA / RISC vs CISC"), scene: {} }] as never, Render: IsaRender as never } as unknown as ModuleDef,
  regs: { id: "regs", title: T("MIPS 寄存器", "MIPS Registers"), defaultConfig: {}, generate: () => [{ caption: T("MIPS 寄存器约定", "MIPS register conventions"), scene: {} }] as never, Render: RegsRender as never } as unknown as ModuleDef,
  format: { id: "format", title: T("指令格式 R/I/J", "Instruction Formats"), defaultConfig: fmtDefault, Controls: FmtControls as never, generate: () => [{ caption: T("R/I/J 位域编码", "R/I/J bit-field encoding"), scene: {} }] as never, Render: FmtRender as never } as unknown as ModuleDef,
  addressing: { id: "addressing", title: T("寻址方式", "Addressing Modes"), defaultConfig: addrDefault, Controls: AddrControls as never, generate: () => [{ caption: T("寻址方式", "Addressing modes"), scene: {} }] as never, Render: AddrRender as never } as unknown as ModuleDef,
  call: { id: "call", title: T("过程调用", "Procedure Call"), defaultConfig: {}, generate: () => [{ caption: T("过程调用(占位)", "Procedure Call (WIP)"), scene: {} }] as never, Render: CallRender as never } as unknown as ModuleDef,
  x86: { id: "x86", title: T("x86 简介", "x86 Overview"), defaultConfig: {}, generate: () => [{ caption: T("x86 简介", "x86 overview"), scene: {} }] as never, Render: X86Render as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "接口", opts: [
    { v: "isa", zh: "ISA / RISC-CISC", en: "ISA" },
    { v: "regs", zh: "MIPS 寄存器", en: "Registers" },
  ]},
  { label: "指令", opts: [
    { v: "format", zh: "指令格式 R/I/J", en: "Formats" },
    { v: "addressing", zh: "寻址方式", en: "Addressing" },
    { v: "call", zh: "过程调用", en: "Proc Call" },
  ]},
  { label: "体系", opts: [
    { v: "x86", zh: "x86 简介", en: "x86" },
  ]},
];

const DEFAULT: Cfg = { subMode: "isa", ...(SUB.isa as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.isa;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "isa";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const instructionSetModule: ModuleDef<any, Cfg> = {
  id: "instruction-set",
  title: T("指令系统与汇编", "Instruction Set & Assembly"),
  desc: T("ISA / RISC-CISC / MIPS 寄存器 / R-I-J 指令格式 / 寻址方式 / 过程调用 / x86。", "ISA / RISC-CISC / MIPS registers / R-I-J formats / addressing / procedure call / x86."),
  tags: ["computer-organization", "isa"],
  interactive: true,
  defaultConfig: DEFAULT,
  randomize(c) {
    const safe = safeCfg(c.subMode, c);
    return safe;
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "指令系统" : "INSTRUCTION SET"}</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
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
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
