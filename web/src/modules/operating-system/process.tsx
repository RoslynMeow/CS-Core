import { T, type Text } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第2章 进程与线程
//   对应 tex/OperatingSystem/chapters/process.tex
//   process-model(进程模型与状态) / pcb(进程控制块·逐帧)
//   context-switch(上下文切换)
// =====================================================================

type SubMode = "process-model" | "pcb" | "context-switch";

// 用户驱动的「状态 / 数值」面板：展示当前步的关键取值，并提供推进按钮
function StepPanel({ t, title, rows, onNext, nextLabel, showNext }: {
  t: (x: Text) => string;
  title: string;
  rows: [string, string][];
  onNext?: () => void;
  nextLabel: string;
  showNext: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderRadius: 10, background: "#0f172a", color: "#e2e8f0", fontSize: 12 }}>
      <span style={{ fontWeight: 800, color: "#a5b4fc" }}>{title}</span>
      {rows.map(([k, v]) => (
        <span key={k} style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{k} = <b style={{ color: "#fde047" }}>{v}</b></span>
      ))}
      {showNext && onNext && (
        <button className="primary" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); onNext(); }}>{nextLabel}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// process-model (逐帧：五状态机转换)
// ---------------------------------------------------------------------
type ProcessState = "new" | "ready" | "running" | "blocked" | "terminated";
type ProcessScene = { state: ProcessState; event: string };

const MODEL_EVENTS: { id: string; zh: string; en: string; arrow: string }[] = [
  { id: "admitted", zh: "接纳", en: "Admit", arrow: "new → ready" },
  { id: "dispatch", zh: "调度", en: "Dispatch", arrow: "ready → running" },
  { id: "io-wait", zh: "等待 I/O", en: "Wait I/O", arrow: "running → blocked" },
  { id: "io-done", zh: "I/O 完成", en: "I/O done", arrow: "blocked → ready" },
  { id: "exit", zh: "退出", en: "Exit", arrow: "running → terminated" },
];

const MODEL_SEQUENCE = ["", "admitted", "dispatch", "io-wait", "io-done", "dispatch", "exit"];

function ProcessModelRender({ scene, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { state: "new", event: "" }) as ProcessScene;
  const cur = MODEL_EVENTS.find((e) => e.id === s.event);
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const nextEvent = MODEL_SEQUENCE[Math.min((step ?? 0) + 1, MODEL_SEQUENCE.length - 1)];
  const stateLabel = zh
    ? ({ new: "新建 new", ready: "就绪 ready", running: "运行 running", blocked: "阻塞 blocked", terminated: "终止 terminated" } as Record<ProcessState, string>)[s.state]
    : s.state;
  const nextLabel = T("点击事件芯片触发状态转换", "click an event chip to fire a transition");
  const states: { key: ProcessState; label: string; desc: string }[] = [
    { key: "new", label: zh ? "新建 new" : "new", desc: zh ? "PCB 已分配，尚未进入就绪队列" : "PCB allocated, not yet ready" },
    { key: "ready", label: zh ? "就绪 ready" : "ready", desc: zh ? "获得除 CPU 外的全部资源，等待调度" : "all resources but CPU; waiting to run" },
    { key: "running", label: zh ? "运行 running" : "running", desc: zh ? "占有 CPU，正在执行指令" : "owns the CPU, executing" },
    { key: "blocked", label: zh ? "阻塞 blocked" : "blocked", desc: zh ? "等待 I/O 或事件，CPU 空闲也不能运行" : "waiting for I/O; cannot run even if CPU idle" },
    { key: "terminated", label: zh ? "终止 terminated" : "terminated", desc: zh ? "执行完毕或被撤销，等待回收" : "finished or killed, awaiting reclamation" },
  ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {states.map((st) => {
          const on = st.key === s.state;
          return (
            <div key={st.key} style={{ flex: "1 1 150px", minWidth: 138, padding: "10px 12px", borderRadius: 12, textAlign: "center", background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`, boxShadow: on ? "0 0 0 3px rgba(99,102,241,.15)" : "none", transition: "all .2s" }}>
              <div style={{ fontWeight: 800, color: on ? "#4338ca" : "#1e293b", fontSize: 13 }}>{st.label}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{st.desc}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {MODEL_EVENTS.map((e) => {
          const on = e.id === s.event;
          const fire = e.id === nextEvent && canNext;
          return (
            <div key={e.id} onClick={fire ? (ev: any) => { ev.stopPropagation(); onNext(); } : undefined}
              style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 10, background: on ? "#eef2ff" : fire ? "#f5f3ff" : "#f8fafc", border: `1px solid ${on ? "#c7d2fe" : fire ? "#c4b5fd" : "#e2e8f0"}`, opacity: on || fire || !s.event ? 1 : 0.5, cursor: fire ? "pointer" : "default" }}>
              <span style={{ fontWeight: 800, color: on || fire ? "#4338ca" : "#3730a3", width: 104, flexShrink: 0 }}>{zh ? e.zh : e.en}</span>
              <span style={{ fontSize: 13, color: "#334155", fontFamily: "ui-monospace, monospace" }}>{e.arrow}</span>
              {fire && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#4338ca", whiteSpace: "nowrap" }}>{zh ? "点我触发" : "click"}</span>}
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("当前状态", "State")), stateLabel],
          [t(T("触发事件", "Event")), cur ? (zh ? cur.zh : cur.en) : "—"],
          [t(T("步骤", "Step")), `${(step ?? 0) + 1}/${count ?? 7}`],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "当前状态" : "State"}</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>{s.state}</span>
        {cur && <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? "触发事件" : "Event"}: {zh ? cur.zh : cur.en}（{cur.arrow}）</span>}
      </Row>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$new \to ready \to running \to \{ready,\ blocked\} \to terminated$" />
      </div>
      <Note>
        {zh
          ? "关键约束：阻塞不能直接回到运行，必须先回到就绪，再由调度程序决定；运行→就绪由时间片耗尽或被抢占触发。"
          : "Key rule: blocked never goes directly back to running—it must re-enter ready and be re-scheduled; running→ready is triggered by timeout or preemption."}
      </Note>
    </Panel>
  );
}

const MODEL_CODE = [
  T("state $\\gets$ new", "state $\\gets$ new"),
  T("admitted: new $\\to$ ready", "admitted: new $\\to$ ready"),
  T("dispatch: ready $\\to$ running", "dispatch: ready $\\to$ running"),
  T("io-wait: running $\\to$ blocked", "io-wait: running $\\to$ blocked"),
  T("io-done: blocked $\\to$ ready", "io-done: blocked $\\to$ ready"),
  T("exit: running $\\to$ terminated", "exit: running $\\to$ terminated"),
];

function processModelGenerate(_config: any): Frame<ProcessScene>[] {
  return [
    { line: 0, caption: T("$new$：PCB 已分配，尚未进入就绪队列", "$new$: PCB allocated, not yet ready"), scene: { state: "new", event: "" } },
    { line: 1, caption: T("接纳 admitted：$new \\to ready$", "admitted: $new \\to ready$"), scene: { state: "ready", event: "admitted" } },
    { line: 2, caption: T("调度 dispatch：$ready \\to running$", "dispatch: $ready \\to running$"), scene: { state: "running", event: "dispatch" } },
    { line: 3, caption: T("等待 I/O：$running \\to blocked$", "wait I/O: $running \\to blocked$"), scene: { state: "blocked", event: "io-wait" } },
    { line: 4, caption: T("I/O 完成：$blocked \\to ready$", "I/O done: $blocked \\to ready$"), scene: { state: "ready", event: "io-done" } },
    { line: 2, caption: T("再次调度：$ready \\to running$", "dispatch again: $ready \\to running$"), scene: { state: "running", event: "dispatch" } },
    { line: 5, caption: T("退出：$running \\to terminated$", "exit: $running \\to terminated$"), scene: { state: "terminated", event: "exit" } },
  ];
}

// ---------------------------------------------------------------------
// pcb (逐帧：上下文切换读写 PCB 各字段)
// ---------------------------------------------------------------------
type PcbOp = "read" | "write" | "rw";
type PcbField = { key: string; zh: string; en: string; value: string; op: PcbOp };
type PcbScene = { fields: PcbField[]; active: number };

const PCB_FIELDS: PcbField[] = [
  { key: "pid", zh: "进程标识 PID", en: "PID", value: "#1042 · PPID #1001", op: "read" },
  { key: "state", zh: "进程状态", en: "State", value: "running → ready", op: "write" },
  { key: "pc", zh: "程序计数器 PC", en: "Program counter", value: "0x0040F2", op: "rw" },
  { key: "regs", zh: "通用寄存器 / PSW", en: "Registers / PSW", value: "R0–R15 · EFLAGS", op: "rw" },
  { key: "mem", zh: "内存界限寄存器", en: "Memory limits", value: "base 0x1000 · limit 64K", op: "write" },
  { key: "files", zh: "打开文件表", en: "Open-file table", value: "stdin · stdout · data.txt", op: "read" },
];

const PCB_OP: Record<PcbOp, { bg: string; fg: string; zh: string; en: string }> = {
  read: { bg: "#dbeafe", fg: "#1e40af", zh: "读", en: "read" },
  write: { bg: "#fee2e2", fg: "#b91c1c", zh: "写", en: "write" },
  rw: { bg: "#ede9fe", fg: "#5b21b6", zh: "读/写", en: "read/write" },
};

function PcbRender({ scene, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { fields: PCB_FIELDS, active: -1 }) as PcbScene;
  const fields = s.fields ?? PCB_FIELDS;
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const active = s.active ?? -1;
  const cur = active >= 0 ? fields[active] : undefined;
  const curOp = cur ? (PCB_OP[cur.op] ?? PCB_OP.read) : undefined;
  const nextLabel = active >= fields.length - 1
    ? T("重新读写 PCB", "read/write PCB again")
    : T("点击 PCB 字段读/写", "click a PCB field to read/write");
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: "#0f172a", color: "#e2e8f0", fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
        {zh ? "进程控制块 PCB（进程 P1）" : "Process Control Block (process P1)"}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {fields.map((f, i) => {
          const on = i === active;
          const op = PCB_OP[f.op] ?? PCB_OP.read;
          const clickable = on && canNext;
          return (
            <div key={f.key} onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderRadius: 10, background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`, boxShadow: on ? "0 0 0 3px rgba(99,102,241,.15)" : "none", transition: "all .2s", cursor: clickable ? "pointer" : "default" }}>
              <span style={{ fontWeight: 800, color: on ? "#4338ca" : "#1e293b", fontSize: 13, width: 168, flexShrink: 0, fontFamily: "ui-monospace, monospace" }}>{zh ? f.zh : f.en}</span>
              <span style={{ fontSize: 12, color: "#475569", fontFamily: "ui-monospace, monospace", flex: 1 }}>{f.value}</span>
              <span style={{ padding: "2px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800, background: op.bg, color: op.fg }}>{zh ? op.zh : op.en}</span>
              {clickable && <span style={{ fontSize: 11, fontWeight: 700, color: "#4338ca", whiteSpace: "nowrap" }}>{zh ? "点我读/写" : "click"}</span>}
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("字段", "Field")), `${active + 1}/${fields.length}`],
          [t(T("名称", "Name")), cur ? (zh ? cur.zh : cur.en) : "—"],
          [t(T("操作", "Op")), curOp ? (zh ? curOp.zh : curOp.en) : "—"],
          [t(T("数值", "Value")), cur ? cur.value : "—"],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$进程 = 程序段 + 数据段 + PCB$" />
      </div>
      <Note>
        {zh
          ? "PCB 是进程存在的唯一标志。上下文切换依次读/写这些字段：调度器读 pid 并更新 state，保存/恢复 PC 与寄存器，切换内存界限寄存器，最后恢复打开文件表。"
          : "The PCB is the sole mark of a process. A context switch touches these fields in turn: the scheduler reads pid and updates state, saves/restores PC and registers, switches the memory-limit registers, and finally restores the open-file table."}
      </Note>
    </Panel>
  );
}

const PCB_CODE = [
  T("read pcb.pid  # 进程标识", "read pcb.pid  # process id"),
  T("write pcb.state  # running $\\to$ ready", "write pcb.state  # running $\\to$ ready"),
  T("save/load pcb.pc  # 程序计数器", "save/load pcb.pc  # program counter"),
  T("save/load pcb.regs  # 通用寄存器与 PSW", "save/load pcb.regs  # registers & PSW"),
  T("write pcb.mem  # 内存界限（切换地址空间）", "write pcb.mem  # memory limits (switch address space)"),
  T("load pcb.files  # 恢复打开文件表", "load pcb.files  # restore the open-file table"),
];

function pcbGenerate(_config: any): Frame<PcbScene>[] {
  return PCB_FIELDS.map((f, i) => ({
    line: i,
    caption: T(
      `上下文切换：${PCB_OP[f.op].zh} PCB 字段「${f.zh}」`,
      `context switch: ${PCB_OP[f.op].en} PCB field "${f.en}"`,
    ),
    scene: { fields: PCB_FIELDS, active: i },
  }));
}

// ---------------------------------------------------------------------
// context-switch
// ---------------------------------------------------------------------
const CTX_DEFAULT = { switchNs: 2000, timeSliceMs: 10 };
function ContextSwitchControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "切换时间" : "Switch"} value={config.switchNs} onChange={(v) => set({ switchNs: v })} min={0} max={1e7} step={100} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ns</span>
      <NumField label={zh ? "时间片" : "Quantum"} value={config.timeSliceMs} onChange={(v) => set({ timeSliceMs: v })} min={0.1} max={1e4} step={0.1} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ms</span>
    </div>
  );
}
type CtxScene = { step: number; who: string };

function ContextSwitchRender({ scene, config, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, who: "P0" }) as CtxScene;
  const switchNs = Number(config.switchNs ?? 0);
  const sliceMs = Number(config.timeSliceMs ?? 0);
  const switchMs = switchNs / 1e6;
  const overheadPct = sliceMs > 0 ? (switchMs / sliceMs) * 100 : 0;
  const switchPerSec = sliceMs > 0 ? 1000 / sliceMs : 0;
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const phases: { zh: string; en: string }[] = [
    { zh: "$P_0$ 运行", en: "$P_0$ running" },
    { zh: "保存 $P_0$ 现场", en: "save $P_0$ context" },
    { zh: "调度选中 $P_1$", en: "dispatch $P_1$" },
    { zh: "恢复 $P_1$ 现场", en: "restore $P_1$ context" },
    { zh: "$P_1$ 运行", en: "$P_1$ running" },
  ];
  const NEXT_LABELS: [string, string][] = [
    ["点击「P0」保存现场", "click P0 to save context"],
    ["点击「P1」调度选中", "click P1 to dispatch"],
    ["点击「P1」恢复现场", "click P1 to restore"],
    ["点击让「P1」运行", "click to run P1"],
    ["重新开始切换", "restart the switch"],
  ];
  const nextLabel = NEXT_LABELS[Math.max(0, Math.min(NEXT_LABELS.length - 1, s.step))];
  const procs = ["P0", "P1"];
  const p0Saved = s.step >= 1;
  const p1Restored = s.step >= 3;
  const refSlices = [1, 10, 100, 1000];
  const rows: React.ReactNode[][] = refSlices.map((ms) => {
    const pct = (switchMs / ms) * 100;
    const active = Math.abs(ms - sliceMs) < 1e-9;
    return [
      `${ms} ${zh ? "毫秒" : "ms"}${active ? (zh ? "（当前）" : " (now)") : ""}`,
      `${switchMs.toFixed(4)} ms`,
      `${pct.toFixed(2)}%`,
      pct > 20 ? (zh ? "开销过高" : "too high") : pct > 5 ? (zh ? "偏高" : "high") : (zh ? "可接受" : "ok"),
    ];
  });
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "每次切换开销占比" : "Overhead per switch"}</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: overheadPct > 5 ? "#b45309" : "#4338ca", fontFamily: "ui-monospace, monospace" }}>
          {`${overheadPct.toFixed(2)}%`}
        </span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? `≈ ${switchPerSec.toFixed(0)} 次切换/秒` : `≈ ${switchPerSec.toFixed(0)} switches/s`}</span>
      </Row>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {phases.map((p, i) => {
          const on = i === s.step;
          return (
            <div key={i} style={{ flex: "1 1 120px", minWidth: 108, padding: "8px 10px", borderRadius: 10, textAlign: "center", background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`, color: on ? "#4338ca" : "#64748b", fontWeight: on ? 800 : 500, fontSize: 12, transition: "all .2s" }}>
              <MathText text={zh ? p.zh : p.en} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        {procs.map((p) => {
          const on = s.who === p;
          const running = (p === "P0" && s.step === 0) || (p === "P1" && s.step === 4);
          const saved = (p === "P0" && p0Saved) || (p === "P1" && p1Restored);
          const clickable = canNext && on;
          return (
            <div key={p} onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
              style={{ flex: "1 1 200px", minWidth: 180, padding: "10px 14px", borderRadius: 12, background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`, cursor: clickable ? "pointer" : "default" }}>
              <div style={{ fontWeight: 800, color: on ? "#4338ca" : "#1e293b", fontSize: 13 }}>
                {p}{running ? (zh ? " · 占用 CPU" : " · on CPU") : ""}{clickable ? (zh ? " · 点我切换" : " · click") : ""}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{zh ? "上下文：PC · 寄存器 · PSW" : "Context: PC · regs · PSW"}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: saved ? "#047857" : "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
                {saved ? `→ PCB${p[1]}` : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("阶段", "Phase")), `${s.step + 1}/${phases.length}`],
          [t(T("占用 CPU", "On CPU")), s.who],
          [t(T("T_context", "T_context")), `${switchMs.toFixed(4)} ms`],
          [t(T("开销占比", "Overhead")), `${overheadPct.toFixed(2)}%`],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(T(nextLabel[0], nextLabel[1]))} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T_{context} = T_{save} + T_{dispatch} + T_{restore}$" />
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{占比} = \\dfrac{T_{context}}{T_{time\\ slice}} \\times 100\\% = \\dfrac{${switchMs.toFixed(4)}\\ ms}{${sliceMs}\\ ms} = ${overheadPct.toFixed(2)}\\%$`} />
      </div>
      <Table
        head={zh ? ["时间片", "切换开销", "占比", "评价"] : ["Quantum", "Switch cost", "Overhead", "Verdict"]}
        rows={rows}
      />
      <Note tone={overheadPct > 5 ? "warn" : "info"}>
        {zh
          ? `上下文切换保存并恢复 PC、寄存器与 PSW：T_save 存现场、T_dispatch 选下一个、T_restore 恢复现场。时间片越短，切换越频繁，占比越高；需在响应时间与开销之间折中。`
          : `Context switching saves and restores the PC, registers and PSW: T_save stores state, T_dispatch picks the next process, T_restore reloads state. Shorter quanta mean more switches and higher overhead—trade off response time against cost.`}
      </Note>
    </Panel>
  );
}

const CTX_CODE = [
  T("$P_0$ 占用 CPU（running）", "$P_0$ on CPU (running)"),
  T("save: 保存 $P_0$ 现场 $\\to$ PCB0", "save: store $P_0$ context $\\to$ PCB0"),
  T("dispatch: 选择下一个进程 $P_1$", "dispatch: pick next process $P_1$"),
  T("restore: 从 PCB1 恢复 $P_1$ 现场", "restore: load $P_1$ context from PCB1"),
  T("$P_1$ 占用 CPU（running）", "$P_1$ on CPU (running)"),
];

function contextSwitchGenerate(_config: any): Frame<CtxScene>[] {
  return [
    { line: 0, caption: T("$P_0$ 占用 CPU，正在运行", "$P_0$ owns the CPU, running"), scene: { step: 0, who: "P0" } },
    { line: 1, caption: T("保存 $P_0$ 现场（PC、寄存器、PSW）到 PCB0，CPU 空转", "Save $P_0$ context (PC, registers, PSW) to PCB0; CPU idles"), scene: { step: 1, who: "P0" } },
    { line: 2, caption: T("调度程序选中 $P_1$", "Scheduler picks $P_1$"), scene: { step: 2, who: "P1" } },
    { line: 3, caption: T("从 PCB1 恢复 $P_1$ 现场", "Restore $P_1$ context from PCB1"), scene: { step: 3, who: "P1" } },
    { line: 4, caption: T("$P_1$ 占用 CPU，继续运行", "$P_1$ owns the CPU, running"), scene: { step: 4, who: "P1" } },
  ];
}

const SUBS: Record<SubMode, SubDef> = {
  "process-model": { title: T("进程模型", "Model"), Render: ProcessModelRender, generate: processModelGenerate, code: MODEL_CODE },
  pcb: { title: T("进程控制块", "PCB"), Render: PcbRender, generate: pcbGenerate, code: PCB_CODE },
  "context-switch": {
    title: T("上下文切换", "Context Switch"),
    defaultConfig: CTX_DEFAULT,
    Controls: ContextSwitchControls,
    Render: ContextSwitchRender,
    generate: contextSwitchGenerate,
    code: CTX_CODE,
  },
};

export const { module: osProcessModule, GROUPS: osProcessGroups } = makeChapter<SubMode>({
  id: "os-process",
  title: T("进程与线程", "Processes & Threads"),
  desc: T("进程五状态模型与转换、PCB 字段与上下文切换读写、上下文切换开销 T_context。", "Five-state process model, PCB fields read/written on a context switch, and context-switch cost T_context."),
  tags: ["operating-system", "process"],
  groups: [
    {
      label: "进程",
      opts: [
        { v: "process-model", zh: "进程模型", en: "Model" },
        { v: "pcb", zh: "进程控制块", en: "PCB" },
        { v: "context-switch", zh: "上下文切换", en: "Context Switch" },
      ],
    },
  ],
  subs: SUBS,
});
