import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 流水线与指令级并行 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/pipeline.tex
//   principle(时空图) / stages(五级+流水寄存器) / hazards(冒险与转发)
//   / branch(2-bit 预测器) / ooo(超标量·乱序) / limit(CPI 计算)
// =====================================================================

type SubMode = "principle" | "stages" | "hazards" | "branch" | "ooo" | "limit";

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

const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  IF: { bg: "#dbeafe", fg: "#1d4ed8" },
  ID: { bg: "#dcfce7", fg: "#15803d" },
  EX: { bg: "#fef3c7", fg: "#b45309" },
  MEM: { bg: "#fae8ff", fg: "#a21caf" },
  WB: { bg: "#ffe4e6", fg: "#be123c" },
  "·": { bg: "#f1f5f9", fg: "#94a3b8" },
};

function Cell({ s }: { s: string }) {
  const c = STAGE_COLOR[s] ?? { bg: "#f1f5f9", fg: "#94a3b8" };
  return (
    <div style={{ minWidth: 30, textAlign: "center", padding: "3px 4px", borderRadius: 6, fontSize: 11, fontWeight: 800, fontFamily: "ui-monospace, monospace", background: c.bg, color: c.fg }}>
      {s === "·" ? "·" : s}
    </div>
  );
}

/** 时空图: rows = 每条指令的阶段序列(从 c0 起, null 表示空白) */
function Schedule({ rows, cycles }: { rows: { label: string; cells: (string | null)[] }[]; cycles?: number }) {
  const n = cycles ?? Math.max(...rows.map((r) => r.cells.length));
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "inline-grid", gap: 3, minWidth: "max-content" }}>
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${n}, 34px)`, gap: 3, fontSize: 10, color: "#94a3b8" }}>
          <div />
          {Array.from({ length: n }, (_, i) => <div key={i} style={{ textAlign: "center" }}>{i + 1}</div>)}
        </div>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: `64px repeat(${n}, 34px)`, gap: 3, alignItems: "center" }}>
            <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#334155", fontWeight: 700 }}>{r.label}</div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i}>{r.cells[i] ? <Cell s={r.cells[i] as string} /> : <div style={{ height: 20 }} />}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// principle: 时空图
// ---------------------------------------------------------------------
function PrincipleControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "指令数" : "INSTR"}</span>
      <input type="range" min={2} max={8} value={config.n} onChange={(e) => onChange({ ...config, n: Number(e.target.value) })} />
      <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#4338ca" }}>{config.n}</span>
    </div>
  );
}
function PrincipleRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const n = Math.max(2, Math.min(8, config.n | 0));
  const stages = ["IF", "ID", "EX", "MEM", "WB"];
  const rows = Array.from({ length: n }, (_, i) => ({
    label: `I${i + 1}`,
    cells: Array.from({ length: n + 4 }, (_, c) => {
      const s = c - i; // 第 i 条指令在 cycle c 处于第 s 级(0-based)
      return s >= 0 && s < 5 ? stages[s] : null;
    }),
  }));
  const serial = 5 * n;
  const pipe = n + 4;
  const speedup = (serial / pipe).toFixed(2);
  return (
    <Panel>
      <Schedule rows={rows} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 13 }}>
        <span>{isZh ? "串行" : "Serial"} = <b>{serial}</b> {isZh ? "周期" : "cyc"}</span>
        <span>{isZh ? "流水线" : "Pipeline"} = <b>{pipe}</b> {isZh ? "周期" : "cyc"}</span>
        <span style={{ color: "#4338ca" }}>{isZh ? "加速比" : "Speedup"} ≈ <b>{speedup}</b></span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? `填充 ${"= 4 周期"}, 排空 ${"= 4 周期"}; 指令越多, 稳定区占比越大, 加速比越接近 5` : "Fill/drain = 4 cycles each; more instructions → speedup nears 5"}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// stages: 五级 + 流水寄存器
// ---------------------------------------------------------------------
function StagesRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const stages: [string, string, string, string][] = isZh
    ? [
      ["IF", "取指", "PC → 指令存储器, 取出 32 位指令", "PC+4 → IF/ID"],
      ["ID", "译码", "寄存器堆读 rs/rt, 符号扩展立即数", "值 → ID/EX"],
      ["EX", "执行", "ALU 运算 / 地址计算 / 比较", "结果 → EX/MEM"],
      ["MEM", "访存", "读写数据存储器 (仅 lw/sw)", "数据 → MEM/WB"],
      ["WB", "写回", "结果写回寄存器堆", "—"],
    ]
    : [
      ["IF", "Fetch", "PC → IM, fetch instruction", "PC+4 → IF/ID"],
      ["ID", "Decode", "read rs/rt, sign-extend", "values → ID/EX"],
      ["EX", "Execute", "ALU op / address / compare", "result → EX/MEM"],
      ["MEM", "Memory", "read/write data memory", "data → MEM/WB"],
      ["WB", "Write-back", "write register file", "—"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {stages.map(([k, zh, desc, reg]) => (
          <div key={k} style={{ flex: "1 1 170px", minWidth: 160, padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${STAGE_COLOR[k].fg}33`, background: STAGE_COLOR[k].bg }}>
            <div style={{ fontWeight: 900, color: STAGE_COLOR[k].fg, fontSize: 13 }}>{k} <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.8 }}>{zh}</span></div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 4, lineHeight: 1.7 }}>{desc}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{reg}</div>
          </div>
        ))}
      </div>
      <Table
        head={isZh ? ["流水寄存器", "携带内容"] : ["Pipeline register", "Carries"]}
        rows={isZh
          ? [["IF/ID", "PC+4, 指令字"], ["ID/EX", "rs/rt 值, 立即数, 控制信号"], ["EX/MEM", "ALUOut, 写寄存器号, 控制信号"], ["MEM/WB", "ALUOut / 读出的数据"]]
          : [["IF/ID", "PC+4, instruction"], ["ID/EX", "rs/rt values, imm, control"], ["EX/MEM", "ALUOut, dest reg, control"], ["MEM/WB", "ALUOut / loaded data"]]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// hazards: 冒险
// ---------------------------------------------------------------------
function HazardsControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "冒险" : "HAZARD"}</span>
      <select className="txt" value={config.kind} onChange={(e) => onChange({ ...config, kind: e.target.value })} style={{ fontWeight: 700 }}>
        <option value="data">{isZh ? "数据冒险" : "Data"}</option>
        <option value="structural">{isZh ? "结构冒险" : "Structural"}</option>
        <option value="control">{isZh ? "控制冒险" : "Control"}</option>
      </select>
      {config.kind === "data" && (
        <select className="txt" value={config.fix} onChange={(e) => onChange({ ...config, fix: e.target.value })} style={{ fontWeight: 700 }}>
          <option value="forward">{isZh ? "转发 (forwarding)" : "Forwarding"}</option>
          <option value="stall">{isZh ? "停顿 (stall)" : "Stall"}</option>
        </select>
      )}
    </div>
  );
}
function HazardsRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const kind = config.kind as string;
  if (kind === "data") {
    const forward = config.fix === "forward";
    const rows = forward
      ? [
        { label: "add r1", cells: ["IF", "ID", "EX", "MEM", "WB"] },
        { label: "sub ..r1", cells: [null, "IF", "ID", "EX", "MEM", "WB"] },
        { label: "and ..r1", cells: [null, null, "IF", "ID", "EX", "MEM", "WB"] },
      ]
      : [
        { label: "add r1", cells: ["IF", "ID", "EX", "MEM", "WB"] },
        { label: "sub ..r1", cells: [null, "IF", "ID", "·", "·", "EX", "MEM", "WB"] },
      ];
    return (
      <Panel>
        <div style={{ fontSize: 13, color: "#334155" }}>
          <b>{isZh ? "数据冒险 (RAW)" : "Data hazard (RAW)"}</b>
          {isZh ? ": 后续指令在 EX 阶段需要前一条在 EX 才产出、尚未写回的值。" : ": a later instruction needs a value still in the pipe."}
        </div>
        <Schedule rows={rows} />
        {forward ? (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#dcfce7", border: "1px solid #16a34a", fontSize: 13, color: "#15803d" }}>
            {isZh ? "转发: 把 add 的 EX/MEM 结果经旁路直接送到 sub 的 EX 输入, 无需气泡, 流水线不中断。" : "Forwarding: bypass EX/MEM result to sub's EX input — no bubble."}
          </div>
        ) : (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fee2e2", border: "1px solid #ef4444", fontSize: 13, color: "#b91c1c" }}>
            {isZh ? "停顿: sub 必须等到 add 写回才能读 r1, 插入 2 个气泡(·), 流水线被拖慢。" : "Stall: insert 2 bubbles until add writes back."}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          {isZh ? "load-use 冒险: lw 后面紧跟使用其结果的指令, 即使有转发也需 1 个气泡。" : "load-use needs 1 bubble even with forwarding."}
        </div>
      </Panel>
    );
  }
  if (kind === "structural") {
    return (
      <Panel>
        <div style={{ fontSize: 13, color: "#334155" }}>
          <b>{isZh ? "结构冒险" : "Structural hazard"}</b>
          {isZh ? ": 两条指令在同一周期争用同一硬件资源。例如单端口存储器同时被取指与访存使用。" : ": two instructions contend for one resource in the same cycle."}
        </div>
        <Schedule rows={[
          { label: "lw", cells: ["IF", "ID", "EX", "MEM", "WB"] },
          { label: "instr", cells: [null, "IF", "ID", "EX", "MEM", "WB"] },
        ]} />
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef3c7", border: "1px solid #f59e0b", fontSize: 13, color: "#92400e" }}>
          {isZh ? "对策: 指令/数据存储器分开(哈佛结构)、加端口、或插入停顿。" : "Fixes: separate I/D memories (Harvard), more ports, or stall."}
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        <b>{isZh ? "控制冒险" : "Control hazard"}</b>
        {isZh ? ": 分支结果要到 EX 才知道, 若预测错误, 已取入的错误路径指令必须清空。" : ": branch resolved in EX; wrong-path instructions must be flushed."}
      </div>
      <Schedule rows={[
        { label: "beq", cells: ["IF", "ID", "EX", "MEM", "WB"] },
        { label: "I+1 错", cells: [null, "IF", "ID", "·", "·", "·"] },
        { label: "I+2 错", cells: [null, null, "IF", "·", "·", "·"] },
        { label: "target", cells: [null, null, null, null, "IF", "ID", "EX"] },
      ]} />
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fee2e2", border: "1px solid #ef4444", fontSize: 13, color: "#b91c1c" }}>
        {isZh ? "清空错误路径(·); 代价 = 流水深度。用分支预测/延迟槽降低损失。" : "Flush wrong path (·); penalty = pipeline depth. Predict to reduce."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// branch: 2-bit 预测器
// ---------------------------------------------------------------------
const BP_STATES = [
  { name: "强不跳", en: "strongly NT" },
  { name: "弱不跳", en: "weakly NT" },
  { name: "弱跳", en: "weakly T" },
  { name: "强跳", en: "strongly T" },
];
const bpPred = (s: number) => (s >= 2 ? 1 : 0);
function BranchRender({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const state: number = config.state ?? 0;
  const hist: { out: number; pred: number; state: number }[] = config.hist ?? [];
  const outcome = (o: 0 | 1) => {
    const next = o === 1 ? Math.min(3, state + 1) : Math.max(0, state - 1);
    onChange({ ...config, state: next, hist: [...hist, { out: o, pred: bpPred(state), state: next }].slice(-12) });
  };
  const reset = () => onChange({ ...config, state: 1, hist: [] });
  const correct = hist.filter((h) => h.out === h.pred).length;
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        <b>{isZh ? "2-bit 饱和计数器" : "2-bit saturating counter"}</b>{isZh ? ": 连续两次预测错误才翻转方向, 抗噪声。" : ": flips only after two consecutive misses."}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {BP_STATES.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              padding: "8px 12px", borderRadius: 12, textAlign: "center", minWidth: 88,
              border: `2px solid ${i === state ? "#4f46e5" : "#cbd5e1"}`,
              background: i === state ? "#eef2ff" : "#fff",
              boxShadow: i === state ? "0 0 0 3px rgba(79,70,229,0.15)" : "none",
            }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 900, color: "#1e293b" }}>{i.toString(2).padStart(2, "0")}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{isZh ? s.name : s.en}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: bpPred(i) ? "#b45309" : "#15803d" }}>{bpPred(i) ? (isZh ? "预测跳" : "T") : (isZh ? "预测不跳" : "NT")}</div>
            </div>
            {i < 3 && <span style={{ color: "#cbd5e1", padding: "0 4px" }}>→</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, alignSelf: "center" }}>{isZh ? "实际结果:" : "Outcome:"}</span>
        <button className="ghost" style={{ background: "#dcfce7", borderColor: "#16a34a", color: "#15803d" }} onClick={() => outcome(1)}>{isZh ? "跳转 (T)" : "Taken"}</button>
        <button className="ghost" style={{ background: "#fee2e2", borderColor: "#ef4444", color: "#b91c1c" }} onClick={() => outcome(0)}>{isZh ? "不跳 (N)" : "Not taken"}</button>
        <button className="ghost" onClick={reset}>{isZh ? "复位" : "Reset"}</button>
      </div>
      <div style={{ fontSize: 13, textAlign: "center", color: "#475569" }}>
        {isZh ? `当前预测: ${bpPred(state) ? "跳转" : "不跳"}　历史: ${hist.length} 次, 命中 ${correct}` : `Prediction: ${bpPred(state) ? "T" : "NT"}　history ${hist.length}, hit ${correct}`}
      </div>
      {hist.length > 0 && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
          {hist.map((h, i) => (
            <span key={i} title={`实际=${h.out}`} style={{ width: 22, height: 22, lineHeight: "22px", textAlign: "center", borderRadius: 6, fontSize: 12, fontWeight: 800, fontFamily: "ui-monospace, monospace", background: h.out === h.pred ? "#dcfce7" : "#fee2e2", color: h.out === h.pred ? "#15803d" : "#b91c1c" }}>
              {h.out ? "T" : "N"}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// ooo: 超标量与乱序
// ---------------------------------------------------------------------
function OooRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const items: [string, string][] = isZh
    ? [
      ["超标量", "每周期发射多条指令, 配多套功能单元 (多发射)"],
      ["动态调度", "记分牌 / Tomasulo: 保留站 + 寄存器重命名, 乱序执行"],
      ["精确异常", "重排序缓冲 ROB: 按序提交, 保证异常点精确"],
      ["乱序完成", "指令乱序执行, 但按程序顺序退休 (in-order retire)"],
      ["限制", "窗口大小、分支预测准确率、访存依赖"],
    ]
    : [
      ["Superscalar", "issue multiple instructions per cycle"],
      ["Dynamic scheduling", "scoreboard / Tomasulo: RS + register renaming"],
      ["Precise exceptions", "reorder buffer (ROB): in-order commit"],
      ["Out-of-order completion", "execute OoO, retire in program order"],
      ["Limits", "window size, branch accuracy, memory dependencies"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["概念", "要点"] : ["Concept", "Point"]} rows={items} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// limit: CPI 计算
// ---------------------------------------------------------------------
function LimitControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "分支比例" : "Branch %"}</span>
        <input type="range" min={0} max={50} value={config.branchPct} onChange={(e) => onChange({ ...config, branchPct: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.branchPct}%</b>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "预测错误率" : "Mispredict %"}</span>
        <input type="range" min={0} max={100} value={config.missPct} onChange={(e) => onChange({ ...config, missPct: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.missPct}%</b>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "惩罚" : "Penalty"}</span>
        <input type="range" min={1} max={10} value={config.penalty} onChange={(e) => onChange({ ...config, penalty: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.penalty}</b>
      </label>
    </div>
  );
}
function LimitRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const stall = (config.branchPct / 100) * (config.missPct / 100) * config.penalty;
  const cpi = 1 + stall;
  const speedup = 1 / cpi;
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{CPI} = 1 + \\text{停顿率} = 1 + \\frac{${config.branchPct}}{100}\\times\\frac{${config.missPct}}{100}\\times ${config.penalty}$`} />
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>{isZh ? "有效 CPI" : "Effective CPI"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>{cpi.toFixed(2)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>{isZh ? "相对理想加速" : "vs ideal"}</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#b45309", fontFamily: "ui-monospace, monospace" }}>{(speedup * 100).toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.9 }}>
        {isZh
          ? "理想 CPI = 1; 实际 CPI = 1 + 停顿。分支越多、预测越差、流水越深, 停顿越大。"
          : "Ideal CPI = 1; actual = 1 + stalls. More branches / worse prediction / deeper pipeline → more stalls."}
      </div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  principle: { id: "principle", title: T("流水线原理", "Principle"), defaultConfig: { n: 5 }, Controls: PrincipleControls as never, generate: () => [{ caption: T("流水线时空图", "Pipeline space-time"), scene: {} }] as never, Render: PrincipleRender as never } as unknown as ModuleDef,
  stages: { id: "stages", title: T("五级流水线", "5-Stage"), defaultConfig: {}, generate: () => [{ caption: T("经典五级流水线", "Classic 5-stage pipeline"), scene: {} }] as never, Render: StagesRender as never } as unknown as ModuleDef,
  hazards: { id: "hazards", title: T("流水线冒险", "Hazards"), defaultConfig: { kind: "data", fix: "forward" }, Controls: HazardsControls as never, generate: () => [{ caption: T("流水线冒险", "Pipeline hazards"), scene: {} }] as never, Render: HazardsRender as never } as unknown as ModuleDef,
  branch: { id: "branch", title: T("分支预测", "Branch Prediction"), defaultConfig: { state: 1, hist: [] }, generate: () => [{ caption: T("分支预测器", "Branch predictor"), scene: {} }] as never, Render: BranchRender as never } as unknown as ModuleDef,
  ooo: { id: "ooo", title: T("超标量与乱序", "Superscalar & OoO"), defaultConfig: {}, generate: () => [{ caption: T("超标量与乱序执行", "Superscalar & OoO"), scene: {} }] as never, Render: OooRender as never } as unknown as ModuleDef,
  limit: { id: "limit", title: T("性能极限", "Limits"), defaultConfig: { branchPct: 20, missPct: 30, penalty: 3 }, Controls: LimitControls as never, generate: () => [{ caption: T("流水线性能极限", "Pipeline performance limits"), scene: {} }] as never, Render: LimitRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "原理", opts: [
    { v: "principle", zh: "时空图", en: "Space-time" },
    { v: "stages", zh: "五级流水线", en: "5-Stage" },
  ]},
  { label: "冒险", opts: [
    { v: "hazards", zh: "流水线冒险", en: "Hazards" },
    { v: "branch", zh: "分支预测", en: "Prediction" },
  ]},
  { label: "进阶", opts: [
    { v: "ooo", zh: "超标量/乱序", en: "Superscalar" },
    { v: "limit", zh: "性能极限", en: "Limits" },
  ]},
];

const DEFAULT: Cfg = { subMode: "principle", ...(SUB.principle as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.principle;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "principle";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const pipelineModule: ModuleDef<any, Cfg> = {
  id: "pipeline",
  title: T("流水线", "Pipeline"),
  desc: T("时空图 / 五级 / 冒险与转发 / 分支预测 / 超标量与乱序 / CPI 极限。", "Space-time / 5-stage / hazards & forwarding / branch prediction / OoO / CPI limits."),
  tags: ["computer-organization", "pipeline"],
  interactive: true,
  defaultConfig: DEFAULT,
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "流水线" : "PIPELINE"}</span>
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
    return frames.length ? frames : [{ caption: T("流水线", "Pipeline"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
