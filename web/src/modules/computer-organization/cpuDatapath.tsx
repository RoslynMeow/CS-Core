import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 处理器: 数据通路 · 单模块聚合 · 分步数据流
//   对应 tex/ComputerOrganization/chapters/cpu_datapath.tex
//   overview / components / exec(逐级数据流·可播放) / full / critical
//   复用: 指令系统的 R/I 格式与操作数; 控制器章的控制信号。
// =====================================================================

type SubMode = "overview" | "components" | "exec" | "full" | "critical";
type InstrName = "add" | "lw" | "sw" | "beq";
const INSTR: { name: InstrName; kind: "R" | "I"; args: string }[] = [
  { name: "add", kind: "R", args: "$rd, $rs, $rt" },
  { name: "lw", kind: "I", args: "$rt, off($rs)" },
  { name: "sw", kind: "I", args: "$rt, off($rs)" },
  { name: "beq", kind: "I", args: "$rs, $rt, label" },
];
const instrOf = (n: string) => INSTR.find((i) => i.name === n) ?? INSTR[0];

const REG = [
  "$zero", "$at", "$v0", "$v1", "$a0", "$a1", "$a2", "$a3",
  "$t0", "$t1", "$t2", "$t3", "$t4", "$t5", "$t6", "$t7",
  "$s0", "$s1", "$s2", "$s3", "$s4", "$s5", "$s6", "$s7",
  "$t8", "$t9", "$k0", "$k1", "$gp", "$sp", "$fp", "$ra",
];
const rn = (n: number) => `${REG[n] ?? "?"}#${n}`;
const hx = (n: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
const s32 = (n: number) => n | 0;

const STAGES = [
  { key: "IF", zh: "取指", en: "Fetch" },
  { key: "ID", zh: "译码", en: "Decode" },
  { key: "EX", zh: "执行", en: "Execute" },
  { key: "MEM", zh: "访存", en: "Memory" },
  { key: "WB", zh: "写回", en: "Write-back" },
];

type Item = { k: string; v: string };
type StageScene = { key: string; zh: string; en: string; items: Item[]; done: boolean; active: boolean; empty?: boolean };
type DpScene = { instr: string; kind: "R" | "I"; stage: number; stages: StageScene[]; flow: string };

// ---------------------------------------------------------------------
// 数据流计算: 给定指令与操作数状态, 产出逐级快照
// ---------------------------------------------------------------------
type DpCfg = {
  instr: InstrName;
  rs: number; rt: number; rd: number;
  rsVal: number; rtVal: number; memVal: number; pc: number; imm: number;
};
const DP_DEFAULT: DpCfg = { instr: "lw", rs: 2, rt: 3, rd: 1, rsVal: 0x100, rtVal: 0x2a, memVal: 0xdeadbeef, pc: 0x00400000, imm: 8 };

function codeForInstr(name: InstrName): ReturnType<typeof T>[] {
  if (name === "add") return [
    T("$PC \\to IM[PC] \\to IR$", "$PC \\to IM[PC] \\to IR$"),
    T("$rs, rt \\gets RegFile[rs, rt]$", "$rs, rt \\gets RegFile[rs, rt]$"),
    T("$ALUOut \\gets rs + rt$", "$ALUOut \\gets rs + rt$"),
    T("// 无访存", "// no memory access"),
    T("$RegFile[rd] \\gets ALUOut$; $PC \\gets PC+4$", "$RegFile[rd] \\gets ALUOut$; $PC \\gets PC+4$"),
  ];
  if (name === "lw") return [
    T("$PC \\to IM[PC] \\to IR$", "$PC \\to IM[PC] \\to IR$"),
    T("$rs \\gets RegFile[rs]$; $sext \\gets SignExt(imm)$", "$rs, sext$"),
    T("$ALUOut \\gets rs + sext$", "$ALUOut \\gets rs + sext$"),
    T("$Data \\gets Mem[ALUOut]$", "$Data \\gets Mem[ALUOut]$"),
    T("$RegFile[rt] \\gets Data$; $PC \\gets PC+4$", "$RegFile[rt] \\gets Data$; $PC \\gets PC+4$"),
  ];
  if (name === "sw") return [
    T("$PC \\to IM[PC] \\to IR$", "$PC \\to IM[PC] \\to IR$"),
    T("$rs, rt \\gets RegFile[rs, rt]$; $sext \\gets SignExt(imm)$", "$rs, rt, sext$"),
    T("$ALUOut \\gets rs + sext$", "$ALUOut \\gets rs + sext$"),
    T("$Mem[ALUOut] \\gets rt$", "$Mem[ALUOut] \\gets rt$"),
    T("$PC \\gets PC+4$", "$PC \\gets PC+4$"),
  ];
  return [
    T("$PC \\to IM[PC] \\to IR$", "$PC \\to IM[PC] \\to IR$"),
    T("$rs, rt \\gets RegFile[rs, rt]$; $sext \\gets SignExt(imm)$", "$rs, rt, sext$"),
    T("$zero \\gets (rs - rt = 0)$", "$zero \\gets (rs - rt = 0)$"),
    T("$target \\gets PC+4 + (sext \\ll 2)$", "$target \\gets PC+4 + (sext \\ll 2)$"),
    T("if $zero$: $PC \\gets target$ else $PC \\gets PC+4$", "branch update PC"),
  ];
}

function generateExec(cfg: DpCfg): Frame<DpScene>[] {
  const ins = instrOf(cfg.instr);
  const immExt = (cfg.imm << 16) >> 16;
  const rsVal = s32(cfg.rsVal);
  const rtVal = s32(cfg.rtVal);
  const a = s32(rsVal + rtVal);
  const addr = s32(rsVal + immExt);
  const diff = s32(rsVal - rtVal);
  const zero = diff === 0;
  const target = s32(cfg.pc + 4 + (immExt << 2));
  const pcNext = cfg.instr === "beq" && zero ? target : cfg.pc + 4;

  const mk = (stageNo: number, items: (Item | null)[], empty?: boolean): StageScene => {
    const s = STAGES[stageNo - 1];
    return { key: s.key, zh: s.zh, en: s.en, items: items.filter((x): x is Item => !!x), active: false, done: false, empty };
  };

  // 各级完整信息
  const ifItems: Item[] = [
    { k: "PC", v: hx(cfg.pc) },
    { k: "IM[PC]", v: `${ins.name} (32-bit)` },
    { k: "IR", v: `${ins.name} ${ins.args}` },
  ];
  let idItems: Item[] = [];
  if (ins.kind === "R") idItems = [
    { k: rn(cfg.rs), v: hx(rsVal) },
    { k: rn(cfg.rt), v: hx(rtVal) },
    { k: "rd", v: rn(cfg.rd) },
  ];
  else if (cfg.instr === "lw") idItems = [
    { k: rn(cfg.rs), v: hx(rsVal) },
    { k: "SignExt", v: `${immExt} (${hx(immExt)})` },
    { k: "rt", v: rn(cfg.rt) },
  ];
  else if (cfg.instr === "sw") idItems = [
    { k: rn(cfg.rs), v: hx(rsVal) },
    { k: rn(cfg.rt), v: hx(rtVal) },
    { k: "SignExt", v: `${immExt}` },
  ];
  else idItems = [
    { k: rn(cfg.rs), v: hx(rsVal) },
    { k: rn(cfg.rt), v: hx(rtVal) },
    { k: "SignExt", v: `${immExt}` },
  ];

  let exItems: Item[]; let flow = "";
  if (ins.kind === "R") {
    exItems = [{ k: "ALU A", v: hx(rsVal) }, { k: "ALU B", v: hx(rtVal) }, { k: "ALUOut", v: hx(a) }];
    flow = `${ins.name}: ${hx(rsVal)} + ${hx(rtVal)} = ${hx(a)}`;
  } else if (cfg.instr === "lw" || cfg.instr === "sw") {
    exItems = [{ k: "ALU A", v: hx(rsVal) }, { k: "ALU B", v: `${immExt}` }, { k: "ALUOut", v: hx(addr) }];
    flow = `地址 = ${hx(rsVal)} + ${immExt} = ${hx(addr)}`;
  } else {
    exItems = [{ k: "ALU A", v: hx(rsVal) }, { k: "ALU B", v: hx(rtVal) }, { k: "ALUOut", v: `${diff}` }, { k: "zero", v: zero ? "1" : "0" }];
    flow = `比较 ${hx(rsVal)} - ${hx(rtVal)} = ${diff} → ${zero ? "相等" : "不等"}`;
  }

  let memItems: Item[] = []; let memEmpty = false;
  if (cfg.instr === "lw") memItems = [{ k: "Mem[", v: hx(addr) }, { k: "Data", v: hx(cfg.memVal) }, { k: "MemRead", v: "1" }];
  else if (cfg.instr === "sw") memItems = [{ k: "Mem[", v: hx(addr) }, { k: "write", v: hx(rtVal) }, { k: "MemWrite", v: "1" }];
  else { memItems = [{ k: "", v: "无访存" }]; memEmpty = true; }

  let wbItems: Item[]; let wbEmpty = false;
  if (cfg.instr === "add") wbItems = [{ k: `RegFile[${rn(cfg.rd)}]`, v: hx(a) }];
  else if (cfg.instr === "lw") wbItems = [{ k: `RegFile[${rn(cfg.rt)}]`, v: hx(cfg.memVal) }];
  else { wbItems = [{ k: "", v: cfg.instr === "sw" ? "无写回 (存储)" : "无写回 (分支)" }]; wbEmpty = true; }

  const full: StageScene[] = [
    mk(1, ifItems),
    mk(2, idItems),
    mk(3, exItems),
    mk(4, memItems, memEmpty),
    mk(5, wbItems, wbEmpty),
  ];
  const caps: [string, string][] = [
    [`取指: PC=${hx(cfg.pc)} → 指令存储器 → IR = ${ins.name}`, `Fetch: PC=${hx(cfg.pc)} → IM → IR = ${ins.name}`],
    [`译码: 读寄存器, 符号扩展立即数`, `Decode: read registers, sign-extend immediate`],
    [flow, flow],
    [cfg.instr === "lw" ? `访存: Data = Mem[${hx(addr)}] = ${hx(cfg.memVal)}` : cfg.instr === "sw" ? `访存: Mem[${hx(addr)}] ← ${hx(rtVal)}` : `访存: 跳过 (非 lw/sw)`, cfg.instr === "lw" ? `Memory read ${hx(cfg.memVal)}` : cfg.instr === "sw" ? `Memory write ${hx(rtVal)}` : `Skip memory`],
    [wbEmpty ? `写回: 无; PC ← ${hx(pcNext)}` : `写回 ${wbItems[0].k} ← ${wbItems[0].v}; PC ← ${hx(pcNext)}`, `Write-back; PC ← ${hx(pcNext)}`],
  ];

  return full.map((_, i) => {
    const stages = full.map((s, j) => ({ ...s, done: j < i, active: j === i }));
    return { caption: T(caps[i][0], caps[i][1]), scene: { instr: ins.name, kind: ins.kind, stage: i + 1, stages, flow } } as Frame<DpScene>;
  });
}

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
  return <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}

// ---------------------------------------------------------------------
// exec 控件: 指令 + 操作数
// ---------------------------------------------------------------------
function ExecControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as DpCfg;
  const set = (p: Partial<DpCfg>) => onChange({ ...cfg, ...p });
  const num = (label: string, key: keyof DpCfg, min: number, max: number) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" type="number" min={min} max={max} value={cfg[key] as number}
        onChange={(e) => set({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) } as Partial<DpCfg>)}
        style={{ width: 78 }} />
    </label>
  );
  const val = (label: string, key: keyof DpCfg) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input className="txt" value={`0x${((cfg[key] as number) >>> 0).toString(16)}`}
        onChange={(e) => set({ [key]: parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ""), 16) || 0 } as Partial<DpCfg>)}
        style={{ width: 108, fontFamily: "ui-monospace, monospace" }} />
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={cfg.instr} onChange={(e) => set({ instr: e.target.value as InstrName })} style={{ fontWeight: 700 }}>
        {INSTR.map((i) => <option key={i.name} value={i.name}>{`${i.name} ${i.args}`}</option>)}
      </select>
      {num("$rs", "rs", 0, 31)}
      {num("$rt", "rt", 0, 31)}
      {cfg.instr === "add" && num("$rd", "rd", 0, 31)}
      {cfg.instr !== "add" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <span>{isZh ? "偏移" : "off"}</span>
          <input className="txt" type="number" value={cfg.imm} onChange={(e) => set({ imm: Number(e.target.value) || 0 })} style={{ width: 84 }} />
        </label>
      )}
      {val("$rs val", "rsVal")}
      {val("$rt val", "rtVal")}
      {cfg.instr === "lw" && val(isZh ? "内存值" : "Mem", "memVal")}
      {cfg.instr === "beq" && val("PC", "pc")}
    </div>
  );
}

// ---------------------------------------------------------------------
// exec 渲染: 五级横向数据通路
// ---------------------------------------------------------------------
function ExecRender({ scene: _scene, t, config }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const scene = _scene as DpScene;
  const cfg = config as DpCfg;
  const stages = scene?.stages ?? [];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 13, color: "#475569" }}>
        <b style={{ fontFamily: "ui-monospace, monospace", color: "#1e293b" }}>{`${instrOf(scene?.instr ?? cfg.instr).name} ${instrOf(scene?.instr ?? cfg.instr).args}`}</b>
        {scene?.flow && <span>　—　{scene.flow}</span>}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "stretch", overflowX: "auto", paddingBottom: 4 }}>
        {stages.map((st, i) => {
          const active = st.active;
          const dim = !st.done && !st.active;
          return (
            <div key={st.key} style={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
              <div style={{
                flex: 1, minWidth: 150, borderRadius: 12, padding: "8px 10px",
                border: `1.8px solid ${active ? "#4f46e5" : dim ? "#e2e8f0" : "#c7d2fe"}`,
                background: active ? "#eef2ff" : dim ? "#fafafa" : "#f8faff",
                boxShadow: active ? "0 0 0 3px rgba(79,70,229,0.15)" : "none",
                opacity: dim ? 0.5 : 1, transition: "all .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: active ? "#4338ca" : "#64748b" }}>{st.key}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{isZh ? st.zh : st.en}</span>
                </div>
                <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                  {st.items.length === 0
                    ? <span style={{ fontSize: 12, color: "#cbd5e1" }}>?</span>
                    : st.items.map((it, k) => (
                      <div key={k} style={{ display: "flex", gap: 6, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                        {it.k && <span style={{ color: "#94a3b8" }}>{it.k}</span>}
                        <span style={{ color: "#0f172a", fontWeight: 700, marginLeft: "auto", textAlign: "right" }}>{it.v}</span>
                      </div>
                    ))}
                </div>
              </div>
              {i < stages.length - 1 && <span style={{ color: "#c7d2fe", fontSize: 16, padding: "0 2px" }}>›</span>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
        {isZh ? "点「下一步/播放」逐级观察数据流; 当前级高亮" : "Step through; active stage highlighted"}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 静态卡
// ---------------------------------------------------------------------
function OverviewRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <Panel>
      <div style={{ padding: "12px 16px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 2 }}>
        {isZh
          ? "单周期 CPU 在「一个时钟周期」内完成 取指 → 译码 → 执行 → 访存 → 写回 全部操作。CPI = 1, 但时钟周期由最慢指令(如 lw)决定; 简单指令(add)也被迫等待同样长的周期, 效率低 —— 这是流水线的直接动机。"
          : "A single-cycle CPU completes fetch → decode → execute → memory → write-back in one clock cycle. CPI = 1, but the cycle is limited by the slowest instruction (lw); simple add waits the same long cycle — the motivation for pipelining."}
      </div>
    </Panel>
  );
}

function ComponentsRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["程序计数器 (PC)", "存放下一条指令地址", "PCWrite"],
      ["指令存储器", "按地址取指令", "—"],
      ["寄存器堆", "32 个 32 位通用寄存器", "RegWrite"],
      ["ALU", "算术 / 逻辑运算", "ALUOp, ALUSrc"],
      ["数据存储器", "读写数据", "MemRead, MemWrite"],
      ["多路选择器 (MUX)", "选择数据来源", "选择信号"],
      ["符号扩展单元", "16-bit → 32-bit 扩展", "—"],
    ]
    : [
      ["PC", "next instruction address", "PCWrite"],
      ["Instruction memory", "fetch by address", "—"],
      ["Register file", "32 × 32-bit GPRs", "RegWrite"],
      ["ALU", "arithmetic / logic", "ALUOp, ALUSrc"],
      ["Data memory", "load / store", "MemRead, MemWrite"],
      ["MUX", "select data source", "select"],
      ["Sign extension", "16 → 32 bit", "—"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["组件", "功能", "控制信号"] : ["Component", "Function", "Control"]} rows={rows} />
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{isZh ? "控制信号由控制器按 opcode/funct 生成 (见「控制器」模块)。" : "Control signals generated by the control unit (see Control Unit module)."}</div>
    </Panel>
  );
}

function FullRender({ scene: _scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const stages: [string, string, string][] = isZh
    ? [
      ["IF", "取指", "PC → 指令存储器, 取出 32 位指令"],
      ["ID", "译码", "寄存器堆读 rs/rt, 符号扩展立即数"],
      ["EX", "执行", "ALU 运算 / 地址计算 / 比较"],
      ["MEM", "访存", "读写数据存储器 (仅 lw/sw)"],
      ["WB", "写回", "ALU 结果或存储器数据写回寄存器堆"],
    ]
    : [
      ["IF", "Fetch", "PC → IM, fetch 32-bit instruction"],
      ["ID", "Decode", "read rs/rt, sign-extend immediate"],
      ["EX", "Execute", "ALU op / address / compare"],
      ["MEM", "Memory", "read/write data memory (lw/sw)"],
      ["WB", "Write-back", "ALU result or memory data → register file"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {stages.map(([k, zh, desc]) => (
          <div key={k} style={{ flex: "1 1 160px", minWidth: 150, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #c7d2fe", background: "#f8faff" }}>
            <div style={{ fontWeight: 900, color: "#4338ca", fontSize: 13 }}>{k} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>{zh}</span></div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.6 }}>{desc}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>
        {isZh ? "组件经 MUX 与总线连接; 控制信号由控制器按 opcode/funct 生成。" : "Components wired via MUX/bus; control signals from opcode/funct."}
      </div>
    </Panel>
  );
}

function CriticalRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const parts = isZh
    ? [["IF 取指", 80], ["ID 译码", 60], ["EX 执行", 70], ["MEM 访存", 90], ["WB 写回", 50]]
    : [["IF Fetch", 80], ["ID Decode", 60], ["EX Execute", 70], ["MEM Memory", 90], ["WB WB", 50]];
  const total = parts.reduce((s, p) => s + (p[1] as number), 0);
  const max = Math.max(...parts.map((p) => p[1] as number));
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        {isZh ? "时钟周期 = 最长指令路径。下面按阶段耗时示意 (lw 需走完全部五级):" : "Cycle = worst-case instruction path (lw traverses all 5 stages):"}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {parts.map(([name, w]) => (
          <div key={name as string} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 92, fontSize: 12, color: "#475569" }}>{name as string}</span>
            <div style={{ flex: 1, height: 16, background: "#f1f5f9", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ width: `${((w as number) / max) * 100}%`, height: "100%", background: (w as number) === max ? "#4f46e5" : "#a5b4fc" }} />
            </div>
            <span style={{ width: 40, textAlign: "right", fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#475569" }}>{w as number}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef3c7", border: "1px solid #fde68a", fontSize: 13, color: "#92400e" }}>
        {isZh
          ? `总延迟 ≈ ${total} (相对单位); 简单指令 add 只用到前三级, 却被拖到 ${total} 的周期 → 利用率低。`
          : `Total ≈ ${total}; add only uses 3 stages yet waits the full cycle.`}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8" }}><MathText text={isZh ? "$\\text{加速比} = \\frac{\\text{串行时间}}{\\text{流水线时间}} \\approx \\text{级数}$" : "$speedup \\approx \\#stages$"} /></div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  overview: { id: "overview", title: T("单周期概述", "Overview"), defaultConfig: {}, generate: () => [{ caption: T("单周期 CPU 概述", "Single-cycle overview"), scene: {} }] as never, Render: OverviewRender as never } as unknown as ModuleDef,
  components: { id: "components", title: T("数据通路组件", "Components"), defaultConfig: {}, generate: () => [{ caption: T("数据通路组件", "Datapath components"), scene: {} }] as never, Render: ComponentsRender as never } as unknown as ModuleDef,
  exec: { id: "exec", title: T("指令执行", "Execution"), defaultConfig: DP_DEFAULT, Controls: ExecControls as never, codeFor: (c: any) => codeForInstr((c as DpCfg).instr) as never, generate: (c: any) => generateExec(c as DpCfg) as never, Render: ExecRender as never } as unknown as ModuleDef,
  full: { id: "full", title: T("完整数据通路", "Full Datapath"), defaultConfig: {}, generate: () => [{ caption: T("完整单周期数据通路", "Complete datapath"), scene: {} }] as never, Render: FullRender as never } as unknown as ModuleDef,
  critical: { id: "critical", title: T("关键路径", "Critical Path"), defaultConfig: {}, generate: () => [{ caption: T("关键路径与性能", "Critical path & performance"), scene: {} }] as never, Render: CriticalRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "单周期", opts: [
    { v: "overview", zh: "概述", en: "Overview" },
    { v: "components", zh: "数据通路组件", en: "Components" },
    { v: "exec", zh: "指令执行", en: "Execution" },
    { v: "full", zh: "完整数据通路", en: "Full Datapath" },
    { v: "critical", zh: "关键路径", en: "Critical Path" },
  ]},
];

const DEFAULT: Cfg = { subMode: "exec", ...(SUB.exec as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.exec;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "exec";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const cpuDatapathModule: ModuleDef<any, Cfg> = {
  id: "cpu-datapath",
  title: T("数据通路", "Datapath"),
  desc: T("单周期 CPU: 组件 / R-lw-sw-beq 逐级数据流(可播放) / 完整通路 / 关键路径。", "Single-cycle CPU: components / R-lw-sw-beq staged dataflow / critical path."),
  tags: ["computer-organization", "cpu"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "数据通路" : "DATAPATH"}</span>
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
    return frames.length ? frames : [{ caption: T("数据通路", "Datapath"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
