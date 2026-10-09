import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 处理器: 数据通路 · 单模块聚合 · 分步数据流
//   对应 tex/ComputerOrganization/chapters/cpu_datapath.tex
//   components(数据流·可播放) / exec(逐级数据流·可播放) / full(完整通路·可播放) / critical(关键路径·可播放)
//   复用: 指令系统的 R/I 格式与操作数; 控制器章的控制信号。
// =====================================================================

type SubMode = "components" | "exec" | "full" | "critical";
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
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
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
// 数据通路示意: 组件 / 连线 高亮 (SVG)
// ---------------------------------------------------------------------
type DNode = { id: string; label: string; zh: string; en: string; x: number; y: number; w: number; h: number };
type DWire = { id: string; d: string };

function Diagram({ nodes, wires, activeNodes, activeWires, values, width, height, zh }: {
  nodes: DNode[]; wires: DWire[]; activeNodes: string[]; activeWires: string[]; values: Record<string, string>; width: number; height: number; zh: boolean;
}) {
  const onN = new Set(activeNodes);
  const onW = new Set(activeWires);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="dp-on" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#4f46e5" /></marker>
        <marker id="dp-off" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#cbd5e1" /></marker>
      </defs>
      {wires.map((w) => {
        const on = onW.has(w.id);
        return <path key={w.id} d={w.d} fill="none" stroke={on ? "#4f46e5" : "#cbd5e1"} strokeWidth={on ? 2.4 : 1.5} markerEnd={on ? "url(#dp-on)" : "url(#dp-off)"} />;
      })}
      {nodes.map((n) => {
        const on = onN.has(n.id);
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} fill={on ? "#eef2ff" : "#ffffff"} stroke={on ? "#4f46e5" : "#cbd5e1"} strokeWidth={on ? 2.2 : 1.4} />
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 - 2} textAnchor="middle" fontSize={13} fontWeight={800} fill={on ? "#3730a3" : "#475569"}>{n.label}</text>
            <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 13} textAnchor="middle" fontSize={9.5} fill="#94a3b8">{zh ? n.zh : n.en}</text>
            {values[n.id] && <text x={n.x + n.w / 2} y={n.y + n.h + 14} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={9.5} fill="#b45309">{values[n.id]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------
// components: 数据在组件间流动 (PC→IM→Registers→ALU→DM→Registers)
// ---------------------------------------------------------------------
const COMP_NODES: DNode[] = [
  { id: "PC", label: "PC", zh: "程序计数器", en: "PC", x: 20, y: 80, w: 90, h: 56 },
  { id: "IM", label: "IM", zh: "指令存储器", en: "Instr. mem", x: 150, y: 80, w: 90, h: 56 },
  { id: "REG", label: "RegFile", zh: "寄存器堆", en: "Register file", x: 290, y: 60, w: 90, h: 96 },
  { id: "ALU", label: "ALU", zh: "运算器", en: "ALU", x: 430, y: 80, w: 90, h: 56 },
  { id: "DM", label: "DM", zh: "数据存储器", en: "Data mem", x: 580, y: 80, w: 90, h: 56 },
];
const COMP_WIRES: DWire[] = [
  { id: "PC-IM", d: "M 110 108 L 146 108" },
  { id: "IM-REG", d: "M 240 108 L 286 108" },
  { id: "REG-ALU", d: "M 380 108 L 426 108" },
  { id: "ALU-DM", d: "M 520 108 L 576 108" },
  { id: "DM-REG", d: "M 625 136 L 625 190 L 335 190 L 335 156" },
];
type CompScene = { active: string[]; wires: string[]; val: Record<string, string>; step: number; instr: string };
const COMP_STEPS: { active: string[]; wires: string[]; val: Record<string, string>; cap: [string, string] }[] = [
  { active: ["PC", "IM"], wires: ["PC-IM"], val: { PC: "0x00400000" }, cap: ["取指: PC → 指令存储器", "Fetch: PC → IM"] },
  { active: ["IM", "REG"], wires: ["IM-REG"], val: { IM: "lw $t3, 8($t2)" }, cap: ["译码: 指令 → 寄存器堆 (读 rs)", "Decode: instruction → register file (read rs)"] },
  { active: ["REG", "ALU"], wires: ["REG-ALU"], val: { REG: "$t2 = 0x00000100" }, cap: ["读源操作数: 寄存器堆 → ALU", "Read operands: register file → ALU"] },
  { active: ["ALU", "DM"], wires: ["ALU-DM"], val: { ALU: "addr = 0x00000108" }, cap: ["执行: ALU 计算地址 → 数据存储器", "Execute: ALU address → data memory"] },
  { active: ["DM", "REG"], wires: ["DM-REG"], val: { DM: "[0x108] = 0xDEADBEEF", REG: "$t3 ← 0xDEADBEEF" }, cap: ["访存/写回: 数据存储器 → 寄存器堆", "Memory/write-back: data memory → register file"] },
];
function generateComponents(_cfg: any): Frame<CompScene>[] {
  return COMP_STEPS.map((st, i) => ({
    line: i,
    caption: T(st.cap[0], st.cap[1]),
    scene: { active: st.active, wires: st.wires, val: st.val, step: i, instr: "lw $t3, 8($t2)" },
  }));
}
const COMP_CODE = [
  T("$PC \\to IM[PC] \\to IR$", "$PC \\to IM[PC] \\to IR$"),
  T("$IR \\to RegFile\\ (\\text{读}\\ rs)$", "$IR \\to RegFile$ (read rs)"),
  T("$rs \\gets RegFile[rs]$", "$rs \\gets RegFile[rs]$"),
  T("$ALUOut \\gets rs + sext \\to Addr$", "$ALUOut \\gets rs + sext \\to Addr$"),
  T("$Data \\gets Mem[ALUOut]$", "$Data \\gets Mem[ALUOut]$"),
];
function ComponentsRender({ scene, t }: any) {
  const zh = t(T("中文", "en")) !== "en";
  const s = (scene ?? {}) as CompScene;
  return (
    <Panel>
      <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{s.instr}</div>
      <Diagram nodes={COMP_NODES} wires={COMP_WIRES} activeNodes={s.active ?? []} activeWires={s.wires ?? []} values={s.val ?? {}} width={720} height={220} zh={zh} />
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 1.7 }}>
        {zh ? "数据沿通路逐级流动: 程序计数器提供地址 → 指令存储器取指 → 寄存器堆读操作数 → ALU 运算 → 数据存储器访存 → 写回寄存器堆。" : "Data flows stage by stage: PC provides the address → IM fetches → register file reads operands → ALU computes → data memory access → write back."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// full: 完整单周期数据通路 (逐步传播并高亮活动连线/组件)
// ---------------------------------------------------------------------
const FULL_NODES: DNode[] = [
  { id: "PC", label: "PC", zh: "程序计数器", en: "PC", x: 20, y: 50, w: 70, h: 46 },
  { id: "IM", label: "IM", zh: "指令存储器", en: "Instr. mem", x: 120, y: 50, w: 80, h: 46 },
  { id: "REG", label: "RegFile", zh: "寄存器堆", en: "Register file", x: 250, y: 26, w: 90, h: 104 },
  { id: "CTRL", label: "Control", zh: "控制器", en: "Control", x: 120, y: 190, w: 80, h: 46 },
  { id: "SEXT", label: "SignExt", zh: "符号扩展", en: "Sign-ext", x: 250, y: 190, w: 90, h: 40 },
  { id: "MUX", label: "MUX", zh: "ALUSrc 选择", en: "ALUSrc", x: 400, y: 150, w: 54, h: 36 },
  { id: "ALU", label: "ALU", zh: "运算器", en: "ALU", x: 475, y: 50, w: 80, h: 58 },
  { id: "DM", label: "DM", zh: "数据存储器", en: "Data mem", x: 620, y: 50, w: 80, h: 58 },
  { id: "WBMUX", label: "WBMUX", zh: "写回选择", en: "MemtoReg", x: 475, y: 205, w: 80, h: 40 },
];
const FULL_WIRES: DWire[] = [
  { id: "PC-IM", d: "M 90 73 L 116 73" },
  { id: "IM-REG", d: "M 200 73 L 246 73" },
  { id: "IM-CTRL", d: "M 160 96 L 160 186" },
  { id: "REG-ALU", d: "M 340 55 L 440 55 L 440 66 L 471 66" },
  { id: "SEXT-MUX", d: "M 340 210 L 372 210 L 372 168 L 396 168" },
  { id: "MUX-ALU", d: "M 454 168 L 465 168 L 465 90 L 471 90" },
  { id: "ALU-DM", d: "M 555 79 L 616 79" },
  { id: "ALU-WB", d: "M 515 108 L 515 201" },
  { id: "DM-WB", d: "M 660 108 L 660 225 L 559 225" },
  { id: "WB-REG", d: "M 515 245 L 515 262 L 295 262 L 295 134" },
];
type FullScene = { active: string[]; wires: string[]; signals: string[]; val: Record<string, string>; step: number; instr: string };
const FULL_STEPS: { add: string[]; wires: string[]; signals: string[]; val: Record<string, string>; cap: [string, string] }[] = [
  { add: ["PC", "IM"], wires: ["PC-IM"], signals: [], val: { PC: "PC=0x00400000", IM: "IR: lw $t3,8($t2)" }, cap: ["取指: PC → 指令存储器 → IR", "Fetch: PC → IM → IR"] },
  { add: ["CTRL", "REG"], wires: ["IM-REG", "IM-CTRL"], signals: ["RegWrite"], val: { REG: "$t2=0x100" }, cap: ["译码: 指令 → 控制器/寄存器堆", "Decode: instruction → control / register file"] },
  { add: ["SEXT", "MUX", "ALU"], wires: ["REG-ALU", "SEXT-MUX", "MUX-ALU"], signals: ["ALUSrc=1"], val: { ALU: "addr=0x108" }, cap: ["执行: 符号扩展 + ALUSrc 选择 → ALU 算地址", "Execute: sign-extend + ALUSrc → ALU address"] },
  { add: ["DM"], wires: ["ALU-DM"], signals: ["MemRead=1"], val: { DM: "[0x108]=0xDEADBEEF" }, cap: ["访存: 读数据存储器", "Memory: read data memory"] },
  { add: ["WBMUX"], wires: ["DM-WB", "WB-REG"], signals: ["RegWrite=1", "MemtoReg=1"], val: { REG: "$t3 ← 0xDEADBEEF" }, cap: ["写回: 数据 → 寄存器堆 (PC ← PC+4)", "Write-back: data → register file (PC ← PC+4)"] },
];
function generateFull(_cfg: any): Frame<FullScene>[] {
  let active: string[] = []; let wires: string[] = []; let signals: string[] = []; let val: Record<string, string> = {};
  return FULL_STEPS.map((st, i) => {
    active = [...active, ...st.add];
    wires = [...wires, ...st.wires];
    signals = [...signals, ...st.signals];
    val = { ...val, ...st.val };
    return { line: i, caption: T(st.cap[0], st.cap[1]), scene: { active: [...active], wires: [...wires], signals: [...signals], val: { ...val }, step: i, instr: "lw $t3, 8($t2)" } };
  });
}
const FULL_CODE = [
  T("$PC \\to IM \\to IR$", "$PC \\to IM \\to IR$"),
  T("$IR \\to \\text{控制器};\\ RegFile[rs,rt]$", "$IR \\to control; RegFile[rs,rt]$"),
  T("$sext \\gets SignExt(imm);\\ ALUOut \\gets rs + sext$", "$sext \\gets SignExt(imm); ALUOut \\gets rs + sext$"),
  T("$Data \\gets Mem[ALUOut]$", "$Data \\gets Mem[ALUOut]$"),
  T("$RegFile[rt] \\gets Data;\\ PC \\gets PC+4$", "$RegFile[rt] \\gets Data; PC \\gets PC+4$"),
];
function FullRender({ scene, t }: any) {
  const zh = t(T("中文", "en")) !== "en";
  const s = (scene ?? {}) as FullScene;
  return (
    <Panel>
      <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{s.instr}</div>
      <Diagram nodes={FULL_NODES} wires={FULL_WIRES} activeNodes={s.active ?? []} activeWires={s.wires ?? []} values={s.val ?? {}} width={800} height={285} zh={zh} />
      {(s.signals ?? []).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {(s.signals ?? []).map((sig) => (
            <span key={sig} style={{ padding: "3px 10px", borderRadius: 999, background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", fontSize: 12, fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{sig}</span>
          ))}
        </div>
      )}
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 1.7 }}>
        {zh ? "单周期: 一个时钟周期内数据沿通路传播完成 取指→译码→执行→访存→写回; 时钟周期须容纳最慢路径 (lw)。" : "Single-cycle: data propagates through the whole path in one clock; the cycle must cover the slowest path (lw)."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// critical: 关键路径延迟累加
// ---------------------------------------------------------------------
type CritPart = { id: string; zh: string; en: string; ps: number };
const CRIT_PARTS: CritPart[] = [
  { id: "IF", zh: "取指 (PC→IM)", en: "Fetch (PC→IM)", ps: 230 },
  { id: "ID", zh: "译码/读寄存器", en: "Decode / RF read", ps: 150 },
  { id: "EX", zh: "执行/地址计算", en: "Execute / address", ps: 200 },
  { id: "MEM", zh: "数据访存", en: "Data memory", ps: 250 },
  { id: "WB", zh: "写回建立", en: "Write-back setup", ps: 20 },
];
const CRIT_TOTAL = CRIT_PARTS.reduce((s, p) => s + p.ps, 0);
type CritScene = { step: number; parts: CritPart[]; total: number; done?: boolean };
const CRIT_CAPS: [string, string][] = [
  ["关键路径从 PC → 指令存储器开始, 累加 $t_{IF}$", "Critical path starts at PC → IM; add $t_{IF}$"],
  ["加上译码与寄存器堆读延迟 $t_{ID}$", "+ decode & register-read delay $t_{ID}$"],
  ["加上 ALU 执行/地址计算延迟 $t_{EX}$", "+ ALU execute delay $t_{EX}$"],
  ["加上数据存储器访问延迟 $t_{MEM}$ (最慢一级)", "+ data-memory delay $t_{MEM}$ (slowest)"],
  ["加上写回建立延迟 $t_{WB}$", "+ write-back setup delay $t_{WB}$"],
  ["累计 = 时钟周期 $T_{clk}$, 由最慢指令 (lw) 决定", "Total = clock period $T_{clk}$, set by slowest path (lw)"],
];
function generateCritical(_cfg: any): Frame<CritScene>[] {
  const frames: Frame<CritScene>[] = CRIT_PARTS.map((_, i) => ({
    line: i,
    caption: T(CRIT_CAPS[i][0], CRIT_CAPS[i][1]),
    scene: { step: i, parts: CRIT_PARTS, total: CRIT_TOTAL },
  }));
  frames.push({ line: 5, caption: T(CRIT_CAPS[5][0], CRIT_CAPS[5][1]), scene: { step: CRIT_PARTS.length - 1, parts: CRIT_PARTS, total: CRIT_TOTAL, done: true } });
  return frames;
}
const CRIT_CODE = [
  T("$t_{IF} = t_{PC} + t_{IM}$", "$t_{IF} = t_{PC} + t_{IM}$"),
  T("$t_{ID} = t_{RFread}$", "$t_{ID} = t_{RFread}$"),
  T("$t_{EX} = t_{ALU} + t_{mux}$", "$t_{EX} = t_{ALU} + t_{mux}$"),
  T("$t_{MEM} = t_{DM}$", "$t_{MEM} = t_{DM}$"),
  T("$t_{WB} = t_{RFsetup}$", "$t_{WB} = t_{RFsetup}$"),
  T("$T_{clk} = \\sum_i t_i$", "$T_{clk} = \\sum_i t_i$"),
];
function CriticalRender({ scene, t }: any) {
  const zh = t(T("中文", "en")) !== "en";
  const s = (scene ?? { step: 0, parts: CRIT_PARTS, total: CRIT_TOTAL }) as CritScene;
  const parts = s.parts ?? CRIT_PARTS;
  const cum = parts.slice(0, s.step + 1).reduce((a, p) => a + p.ps, 0);
  const slowest = parts.reduce((m, p) => (p.ps > m.ps ? p : m), parts[0]);
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        {zh ? "关键路径 (lw): 逐级累加延迟, 最终决定时钟周期。" : "Critical path (lw): delays accumulate to fix the clock period."}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "flex-end", justifyContent: "center", flexWrap: "wrap" }}>
        {parts.map((p, i) => {
          const on = i <= s.step;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 96, padding: "8px 6px", borderRadius: 10, textAlign: "center", border: `2px solid ${on ? "#4f46e5" : "#e2e8f0"}`, background: on ? "#eef2ff" : "#fafafa", opacity: on ? 1 : 0.5, transition: "all .15s" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#4338ca" }}>{p.id}</div>
                <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.4 }}>{zh ? p.zh : p.en}</div>
                <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#b45309", fontWeight: 800 }}>{p.ps} ps</div>
              </div>
              {i < parts.length - 1 && <span style={{ color: "#c7d2fe", padding: "0 3px" }}>›</span>}
            </div>
          );
        })}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 4 }}>
          <span>{zh ? "累计延迟" : "Accumulated"}</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>{cum} / {s.total} ps</span>
        </div>
        <div style={{ height: 16, borderRadius: 8, background: "#f1f5f9", overflow: "hidden" }}>
          <div style={{ width: `${(cum / s.total) * 100}%`, height: "100%", background: "#4f46e5", transition: "width .2s" }} />
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: s.done ? "#dcfce7" : "#fef3c7", border: `1px solid ${s.done ? "#86efac" : "#fde68a"}`, fontSize: 13, color: s.done ? "#15803d" : "#92400e" }}>
        {zh
          ? `时钟周期 T_clk ≥ ${s.total} ps, 由最长延迟路径决定 (最慢的 ${slowest.id} 级为 ${slowest.ps} ps); add 只走前三段却同样等待整个周期。`
          : `T_clk ≥ ${s.total} ps, set by the longest path (slowest stage ${slowest.id} = ${slowest.ps} ps); add uses only 3 stages yet waits the full cycle.`}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
        <MathText text={zh ? "$\\text{加速比} \\approx \\text{流水线级数}$" : "$speedup \\approx \\#stages$"} />
      </div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  components: { id: "components", title: T("数据通路组件", "Components"), defaultConfig: {}, code: COMP_CODE, generate: (c: any) => generateComponents(c) as never, Render: ComponentsRender as never } as unknown as ModuleDef,
  exec: { id: "exec", title: T("指令执行", "Execution"), defaultConfig: DP_DEFAULT, Controls: ExecControls as never, codeFor: (c: any) => codeForInstr((c as DpCfg).instr) as never, generate: (c: any) => generateExec(c as DpCfg) as never, Render: ExecRender as never } as unknown as ModuleDef,
  full: { id: "full", title: T("完整数据通路", "Full Datapath"), defaultConfig: {}, code: FULL_CODE, generate: (c: any) => generateFull(c) as never, Render: FullRender as never } as unknown as ModuleDef,
  critical: { id: "critical", title: T("关键路径", "Critical Path"), defaultConfig: {}, code: CRIT_CODE, generate: (c: any) => generateCritical(c) as never, Render: CriticalRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "单周期", opts: [
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
