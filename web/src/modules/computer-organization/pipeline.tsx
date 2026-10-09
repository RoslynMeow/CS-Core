import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef, Frame } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// 流水线与指令级并行 · 单模块聚合
//   对应 tex/ComputerOrganization/chapters/pipeline.tex
//   principle(时空图) / stages(五级时空图·动画) / hazards(冒险与转发)
//   / branch(2-bit 预测器·动画) / limit(CPI 计算)
// =====================================================================

type SubMode = "principle" | "stages" | "hazards" | "branch" | "limit";

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#4338ca", lineHeight: 1.7 }}>{children}</div>;
}

const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  IF: { bg: "#dbeafe", fg: "#1d4ed8" },
  ID: { bg: "#dcfce7", fg: "#15803d" },
  EX: { bg: "#fef3c7", fg: "#b45309" },
  MEM: { bg: "#fae8ff", fg: "#a21caf" },
  WB: { bg: "#ffe4e6", fg: "#be123c" },
  "·": { bg: "#f1f5f9", fg: "#94a3b8" },
};

function Cell({ s, hl }: { s: string; hl?: boolean }) {
  const c = STAGE_COLOR[s] ?? { bg: "#f1f5f9", fg: "#94a3b8" };
  return (
    <div style={{ minWidth: 30, textAlign: "center", padding: "3px 4px", borderRadius: 6, fontSize: 11, fontWeight: 800, fontFamily: "ui-monospace, monospace", background: c.bg, color: c.fg, boxShadow: hl ? "0 0 0 2px #4338ca" : "none", transform: hl ? "scale(1.08)" : "none", transition: "all .15s" }}>
      {s === "·" ? "·" : s}
    </div>
  );
}

/** 时空图: rows = 每条指令的阶段序列(从 c0 起, null 表示空白); current 高亮当前周期列 */
function Schedule({ rows, cycles, current }: { rows: { label: string; cells: (string | null)[] }[]; cycles?: number; current?: number }) {
  const n = cycles ?? Math.max(...rows.map((r) => r.cells.length));
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "inline-grid", gap: 3, minWidth: "max-content" }}>
        <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${n}, 34px)`, gap: 3, fontSize: 10, color: "#94a3b8" }}>
          <div />
          {Array.from({ length: n }, (_, i) => <div key={i} style={{ textAlign: "center", fontWeight: i === current ? 900 : 400, color: i === current ? "#4338ca" : "#94a3b8" }}>{i + 1}</div>)}
        </div>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: `64px repeat(${n}, 34px)`, gap: 3, alignItems: "center" }}>
            <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#334155", fontWeight: 700 }}>{r.label}</div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i}>{r.cells[i] ? <Cell s={r.cells[i] as string} hl={i === current} /> : <div style={{ height: 20, borderRadius: 6, background: i === current ? "#eef2ff" : "transparent", border: i === current ? "1px dashed #c7d2fe" : "1px solid transparent" }} />}</div>
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
// stages: 五级流水线时空图 (逐周期动画)
// ---------------------------------------------------------------------
const STAGES = ["IF", "ID", "EX", "MEM", "WB"];
type StageScene = { n: number; cycle: number; total: number };

function StagesControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const n = config?.n ?? 5;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 13 }}>{isZh ? "指令数" : "Instructions"}</span>
      <input type="range" min={2} max={8} value={n} onChange={(e) => onChange({ ...config, n: Number(e.target.value) })} />
      <b style={{ fontFamily: "ui-monospace, monospace", color: "#4338ca" }}>{n}</b>
    </div>
  );
}
function StagesRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? {}) as StageScene;
  const n = Math.max(2, Math.min(8, s.n || 5));
  const total = n + 4;
  const cur = Math.max(0, Math.min(total - 1, s.cycle ?? 0));
  const rows = Array.from({ length: n }, (_, i) => ({
    label: `I${i + 1}`,
    cells: Array.from({ length: total }, (_, c) => {
      const st = c - i;
      return st >= 0 && st < 5 ? STAGES[st] : null;
    }),
  }));
  const active = Array.from({ length: n }, (_, i) => {
    const st = cur - i;
    return st >= 0 && st < 5 ? `I${i + 1}·${STAGES[st]}` : null;
  }).filter(Boolean) as string[];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {STAGES.map((k) => (
          <div key={k} style={{ padding: "4px 12px", borderRadius: 8, fontWeight: 800, fontSize: 12, background: STAGE_COLOR[k].bg, color: STAGE_COLOR[k].fg }}>{k}</div>
        ))}
      </div>
      <Schedule rows={rows} cycles={total} current={cur} />
      <div style={{ textAlign: "center", fontWeight: 800, color: "#4338ca", fontSize: 14 }}>
        {isZh ? `第 ${cur + 1} / ${total} 周期` : `cycle ${cur + 1} / ${total}`}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#334155" }}>
        {active.map((a) => (<span key={a} style={{ padding: "3px 10px", borderRadius: 8, background: "#eef2ff", border: "1px solid #c7d2fe" }}>{a}</span>))}
      </div>
      <Note>{isZh ? "每个时钟周期各指令同时推进一级 (IF→ID→EX→MEM→WB)；单发射下每周期一条进入 IF、一条离开 WB，稳态吞吐 = 1 条/周期。" : "Each cycle every instruction advances one stage; single-issue steady-state throughput = 1 instr/cycle."}</Note>
    </Panel>
  );
}
function stagesGenerate(config: any): Frame<StageScene>[] {
  const n = Math.max(2, Math.min(8, (config?.n | 0) || 5));
  const total = n + 4;
  const frames: Frame<StageScene>[] = [];
  for (let c = 0; c < total; c++) {
    const active: string[] = [];
    for (let i = 0; i < n; i++) {
      const st = c - i;
      if (st >= 0 && st < 5) active.push(`I${i + 1}:${STAGES[st]}`);
    }
    const line = c === 0 ? 0 : c < 4 ? 1 : c < total - 1 ? 2 : 3;
    frames.push({
      line,
      caption: T(`第 ${c + 1}/${total} 周期：${active.join("  ")}`, `cycle ${c + 1}/${total}: ${active.join("  ")}`),
      scene: { n, cycle: c, total },
    });
  }
  return frames;
}
const STAGES_CODE = [
  T("$c \\gets 0$：I1 进入 IF", "$c \\gets 0$: I1 enters IF"),
  T("填充：每周期新指令进入 IF", "fill: a new instruction enters IF each cycle"),
  T("满流水：五级同时工作", "steady: all five stages busy"),
  T("$n+4$ 周期后全部排空", "$n+4$ cycles to drain"),
];

// ---------------------------------------------------------------------
// hazards: 冒险
// ---------------------------------------------------------------------
function HazardsControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
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
// branch: 2-bit 预测器 (逐次分支动画)
// ---------------------------------------------------------------------
const BP_STATES = [
  { name: "强不跳", en: "strongly NT" },
  { name: "弱不跳", en: "weakly NT" },
  { name: "弱跳", en: "weakly T" },
  { name: "强跳", en: "strongly T" },
];
const bpPred = (s: number) => (s >= 2 ? 1 : 0);
const BP_PATTERNS = [
  { v: "TTNTNTT", zh: "长跳后噪声", en: "run then noise" },
  { v: "TNTNTNT", zh: "交替跳/不跳", en: "alternating" },
  { v: "NNTTNNTT", zh: "成对模式", en: "paired" },
];
const BRANCH_CODE = [
  T("$state \\gets 01$（弱不跳）", "$state \\gets 01$ (weakly NT)"),
  T("预测 $= (state \\ge 2)$", "predict $= (state \\ge 2)$"),
  T("实际结果 → $state$ 饱和加减", "outcome → saturating state update"),
  T("预测错误 → 冲刷 + 惩罚", "mispredict → flush + penalty"),
];
type BpStep = { out: number; pred: number; before: number; after: number; correct: boolean };
type BranchScene = { step: number; total: number; pattern: number[]; state: number; pred: number; outcome: number; correct: boolean; steps: BpStep[]; penalty: number; penPer: number };

function BranchControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "分支序列" : "Pattern"}</span>
        <select className="txt" value={config.pattern} onChange={(e) => onChange({ ...config, pattern: e.target.value })} style={{ fontWeight: 700 }}>
          {BP_PATTERNS.map((p) => <option key={p.v} value={p.v}>{isZh ? p.zh : p.en} ({p.v})</option>)}
        </select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{isZh ? "错误惩罚" : "Penalty"}</span>
        <input type="range" min={1} max={5} value={config.penalty} onChange={(e) => onChange({ ...config, penalty: Number(e.target.value) })} />
        <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.penalty}</b>
      </label>
    </div>
  );
}
function BranchRender({ scene, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const s = (scene ?? {}) as BranchScene;
  const steps = s.steps ?? [];
  const state = s.state ?? 1;
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        <b>{isZh ? "2-bit 饱和计数器" : "2-bit saturating counter"}</b>{isZh ? "：连续两次预测错误才翻转方向, 抗噪声。" : ": flips only after two consecutive misses."}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {BP_STATES.map((st, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              padding: "8px 12px", borderRadius: 12, textAlign: "center", minWidth: 88,
              border: `2px solid ${i === state ? "#4f46e5" : "#cbd5e1"}`,
              background: i === state ? "#eef2ff" : "#fff",
              boxShadow: i === state ? "0 0 0 3px rgba(79,70,229,0.15)" : "none",
              transition: "all .2s",
            }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 900, color: "#1e293b" }}>{i.toString(2).padStart(2, "0")}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{isZh ? st.name : st.en}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: bpPred(i) ? "#b45309" : "#15803d" }}>{bpPred(i) ? (isZh ? "预测跳" : "T") : (isZh ? "预测不跳" : "NT")}</div>
            </div>
            {i < 3 && <span style={{ color: "#cbd5e1", padding: "0 4px" }}>→</span>}
          </div>
        ))}
      </div>
      {steps.length > 0 && (
        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
          {steps.map((h, i) => (
            <span key={i} title={`actual=${h.out} pred=${h.pred}`} style={{ width: 22, height: 22, lineHeight: "22px", textAlign: "center", borderRadius: 6, fontSize: 12, fontWeight: 800, fontFamily: "ui-monospace, monospace", background: h.correct ? "#dcfce7" : "#fee2e2", color: h.correct ? "#15803d" : "#b91c1c" }}>
              {h.out ? "T" : "N"}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span>{isZh ? "当前预测" : "prediction"} = <b style={{ color: bpPred(state) ? "#b45309" : "#15803d" }}>{bpPred(state) ? (isZh ? "跳" : "T") : (isZh ? "不跳" : "NT")}</b></span>
        <span>{isZh ? "预测错误" : "misses"} = <b style={{ color: "#b91c1c" }}>{steps.filter((x) => !x.correct).length}</b> / {steps.length}</span>
        <span>{isZh ? "累计惩罚" : "penalty"} = <b style={{ color: "#b91c1c", fontFamily: "ui-monospace, monospace" }}>{s.penalty ?? 0}</b> {isZh ? "周期" : "cyc"}</span>
      </div>
      <Note>{isZh ? "预测正确流水线不停顿；预测错误则冲刷错误路径并付出惩罚（≈ 流水深度）。状态朝实际结果饱和加减。" : "Correct prediction → no stall; mispredict → flush + penalty (≈ pipeline depth). State saturates toward the outcome."}</Note>
    </Panel>
  );
}
function branchGenerate(config: any): Frame<BranchScene>[] {
  const pat = String(config?.pattern ?? "TTNTNTT");
  const pattern = pat.split("").map((ch) => (ch === "T" || ch === "1" ? 1 : 0));
  const penPer = Math.max(1, Math.min(5, (config?.penalty | 0) || 2));
  let state = 1;
  let penalty = 0;
  const steps: BpStep[] = [];
  const frames: Frame<BranchScene>[] = [];
  frames.push({
    line: 0,
    caption: T("初始状态 $01$（弱不跳）", "initial state $01$ (weakly NT)"),
    scene: { step: -1, total: pattern.length, pattern, state, pred: bpPred(state), outcome: 0, correct: true, steps: [], penalty: 0, penPer },
  });
  pattern.forEach((out, k) => {
    const before = state;
    const pred = bpPred(state);
    const correct = pred === out;
    if (!correct) penalty += penPer;
    state = out ? Math.min(3, state + 1) : Math.max(0, state - 1);
    steps.push({ out, pred, before, after: state, correct });
    frames.push({
      line: correct ? 2 : 3,
      caption: T(
        `第 ${k + 1} 次：预测${pred ? "跳" : "不跳"}，实际${out ? "跳" : "不跳"} → ${correct ? "命中" : "错误 (+" + penPer + ")"}`,
        `#${k + 1}: predict ${pred ? "T" : "NT"}, actual ${out ? "T" : "NT"} → ${correct ? "hit" : "miss (+" + penPer + ")"}`,
      ),
      scene: { step: k, total: pattern.length, pattern, state, pred, outcome: out, correct, steps: [...steps], penalty, penPer },
    });
  });
  return frames;
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
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  principle: { id: "principle", title: T("流水线原理", "Principle"), defaultConfig: { n: 5 }, Controls: PrincipleControls as never, generate: () => [{ caption: T("流水线时空图", "Pipeline space-time"), scene: {} }] as never, Render: PrincipleRender as never } as unknown as ModuleDef,
  stages: { id: "stages", title: T("五级流水线", "5-Stage"), defaultConfig: { n: 5 }, Controls: StagesControls as never, generate: stagesGenerate as never, code: STAGES_CODE, Render: StagesRender as never } as unknown as ModuleDef,
  hazards: { id: "hazards", title: T("流水线冒险", "Hazards"), defaultConfig: { kind: "data", fix: "forward" }, Controls: HazardsControls as never, generate: () => [{ caption: T("流水线冒险", "Pipeline hazards"), scene: {} }] as never, Render: HazardsRender as never } as unknown as ModuleDef,
  branch: { id: "branch", title: T("分支预测", "Branch Prediction"), defaultConfig: { pattern: "TTNTNTT", penalty: 2 }, Controls: BranchControls as never, generate: branchGenerate as never, code: BRANCH_CODE, Render: BranchRender as never } as unknown as ModuleDef,
  limit: { id: "limit", title: T("性能极限", "Limits"), defaultConfig: { branchPct: 20, missPct: 30, penalty: 3 }, Controls: LimitControls as never, generate: () => [{ caption: T("流水线性能极限", "Pipeline performance limits"), scene: {} }] as never, Render: LimitRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "原理", opts: [
    { v: "principle", zh: "时空图", en: "Space-time" },
    { v: "stages", zh: "五级流水线", en: "5-Stage" },
  ]},
  { label: "冒险", opts: [
    { v: "hazards", zh: "流水线冒险", en: "Hazards" },
    { v: "branch", zh: "分支预测", en: "Prediction" },
  ]},
  { label: "进阶", opts: [
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
  desc: T("时空图 / 五级流水线 / 冒险与转发 / 分支预测 / CPI 极限。", "Space-time / 5-stage / hazards & forwarding / branch prediction / CPI limits."),
  tags: ["computer-organization", "pipeline"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "流水线" : "PIPELINE"}</span>
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
    return frames.length ? frames : [{ caption: T("流水线", "Pipeline"), scene: safe }];
  },
  codeFor(config) {
    return (activeOf((config as Cfg).subMode).code ?? []) as never;
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
