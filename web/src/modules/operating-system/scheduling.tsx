import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第3章 CPU 调度
//   对应 tex/OperatingSystem/chapters/scheduling.tex
//   metrics(调度指标) / fcfs-sjf(FCFS·SJF·SRTF) / rr-priority(轮转·优先级)
//   / mlfq(多级反馈队列)
// =====================================================================

type SubMode = "metrics" | "fcfs-sjf" | "rr-priority" | "mlfq";

type Proc = { id: string; arrival: number; burst: number; prio: number };
type Slice = { id: string; start: number; end: number };
type SimResult = {
  slices: Slice[];
  finish: Record<string, number>;
  avgTurn: number;
  avgWait: number;
  avgResp: number;
  end: number;
};

// 固定进程集合：P1 到0 运行7；P2 到2 运行4；P3 到4 运行1；P4 到5 运行4
const PROCS: Proc[] = [
  { id: "P1", arrival: 0, burst: 7, prio: 3 },
  { id: "P2", arrival: 2, burst: 4, prio: 1 },
  { id: "P3", arrival: 4, burst: 1, prio: 4 },
  { id: "P4", arrival: 5, burst: 4, prio: 2 },
];

// 优先级示例：同时到达，数值越小优先级越高
const PRIO_PROCS: Proc[] = [
  { id: "P1", arrival: 0, burst: 7, prio: 3 },
  { id: "P2", arrival: 0, burst: 4, prio: 1 },
  { id: "P3", arrival: 0, burst: 1, prio: 4 },
  { id: "P4", arrival: 0, burst: 4, prio: 2 },
];

const PCOLOR: Record<string, string> = { P1: "#6366f1", P2: "#0ea5e9", P3: "#f59e0b", P4: "#10b981" };

// 用户驱动的触发器：点击画布对象推进到下一帧（onNext）；末帧点击可重播（reset）
function advanceHandler(onNext?: () => void, onReset?: () => void, playing?: boolean, atEnd?: boolean) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) return;
    if (atEnd) onReset?.();
    else onNext?.();
  };
}

// 触发提示：告诉用户点哪个对象推进
function TriggerHint({ text, ready }: { text: string; ready: boolean }) {
  return <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: ready ? "#4338ca" : "#059669" }}>{text}</div>;
}

// 状态/数值面板：逐帧展示 scene 中的当前取值
function StatPanel({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 10, background: "#0f172a", border: "1px solid #1e293b", fontFamily: "ui-monospace, monospace", fontSize: 12, display: "grid", gap: 4 }}>
      <div style={{ fontWeight: 800, color: "#93c5fd" }}>{title}</div>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#94a3b8" }}>{k}</span>
          <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// 由甘特图推断已完成进程，计算当前平均周转/等待（随步进更新）
function ganttStats(procs: Proc[], gantt: Slice[]) {
  const fin: Record<string, number> = {};
  const run: Record<string, number> = {};
  for (const s of gantt) {
    fin[s.id] = Math.max(fin[s.id] ?? 0, s.end);
    run[s.id] = (run[s.id] ?? 0) + (s.end - s.start);
  }
  let st = 0, sw = 0, cnt = 0;
  for (const p of procs) {
    if ((run[p.id] ?? 0) >= p.burst) {
      const f = fin[p.id];
      st += f - p.arrival;
      sw += f - p.arrival - p.burst;
      cnt += 1;
    }
  }
  return { turn: cnt ? st / cnt : 0, wait: cnt ? sw / cnt : 0, cnt };
}

function merge(slices: Slice[]): Slice[] {
  const out: Slice[] = [];
  for (const s of slices) {
    const last = out[out.length - 1];
    if (last && last.id === s.id && last.end === s.start) last.end = s.end;
    else out.push({ id: s.id, start: s.start, end: s.end });
  }
  return out;
}

function summarize(procs: Proc[], slices: Slice[], finish: Record<string, number>) {
  const first: Record<string, number> = {};
  for (const s of slices) if (first[s.id] === undefined) first[s.id] = s.start;
  let st = 0, sw = 0, sr = 0, end = 0;
  for (const p of procs) {
    const f = finish[p.id];
    st += f - p.arrival;
    sw += f - p.arrival - p.burst;
    sr += (first[p.id] ?? f) - p.arrival;
    end = Math.max(end, f);
  }
  const n = procs.length;
  return { avgTurn: st / n, avgWait: sw / n, avgResp: sr / n, end };
}

function mkResult(procs: Proc[], raw: Slice[], finish: Record<string, number>): SimResult {
  const slices = merge(raw);
  return { slices, finish, ...summarize(procs, slices, finish) };
}

function simNonPreemptive(algo: "fcfs" | "sjf", procs: Proc[]): SimResult {
  const finish: Record<string, number> = {};
  const slices: Slice[] = [];
  const done = new Set<string>();
  let t = 0;
  while (done.size < procs.length) {
    const avail = procs.filter((p) => p.arrival <= t && !done.has(p.id));
    if (avail.length === 0) { t += 1; continue; }
    avail.sort((a, b) => algo === "fcfs"
      ? a.arrival - b.arrival || procs.indexOf(a) - procs.indexOf(b)
      : a.burst - b.burst || a.arrival - b.arrival || procs.indexOf(a) - procs.indexOf(b));
    const p = avail[0];
    slices.push({ id: p.id, start: t, end: t + p.burst });
    t += p.burst;
    finish[p.id] = t;
    done.add(p.id);
  }
  return mkResult(procs, slices, finish);
}

function simSRTF(procs: Proc[]): SimResult {
  const rem: Record<string, number> = {};
  procs.forEach((p) => { rem[p.id] = p.burst; });
  const finish: Record<string, number> = {};
  const raw: Slice[] = [];
  let t = 0, completed = 0;
  while (completed < procs.length) {
    const avail = procs.filter((p) => p.arrival <= t && rem[p.id] > 0);
    if (avail.length === 0) { t += 1; continue; }
    avail.sort((a, b) => rem[a.id] - rem[b.id] || a.arrival - b.arrival || procs.indexOf(a) - procs.indexOf(b));
    const p = avail[0];
    raw.push({ id: p.id, start: t, end: t + 1 });
    rem[p.id] -= 1;
    t += 1;
    if (rem[p.id] === 0) { finish[p.id] = t; completed += 1; }
  }
  return mkResult(procs, raw, finish);
}

function simRR(procs: Proc[], q: number): SimResult {
  const rem: Record<string, number> = {};
  procs.forEach((p) => { rem[p.id] = p.burst; });
  const finish: Record<string, number> = {};
  const raw: Slice[] = [];
  const byArrival = [...procs].sort((a, b) => a.arrival - b.arrival || procs.indexOf(a) - procs.indexOf(b));
  const admitted = new Set<string>();
  const queue: string[] = [];
  let t = 0, completed = 0, used = 0;
  let cur: string | null = null;
  const admit = () => {
    for (const p of byArrival) {
      if (p.arrival <= t && !admitted.has(p.id)) { admitted.add(p.id); queue.push(p.id); }
    }
  };
  while (completed < procs.length) {
    admit();
    if (cur === null) {
      const next = queue.shift();
      if (next === undefined) { t += 1; continue; }
      cur = next;
      used = 0;
    }
    const runId: string = cur;
    raw.push({ id: runId, start: t, end: t + 1 });
    rem[runId] -= 1;
    t += 1;
    used += 1;
    if (rem[runId] === 0) { finish[runId] = t; completed += 1; cur = null; used = 0; }
    else if (used >= q) { queue.push(runId); cur = null; used = 0; }
  }
  return mkResult(procs, raw, finish);
}

function simPriority(procs: Proc[]): SimResult {
  const finish: Record<string, number> = {};
  const slices: Slice[] = [];
  const done = new Set<string>();
  let t = 0;
  while (done.size < procs.length) {
    const avail = procs.filter((p) => p.arrival <= t && !done.has(p.id));
    if (avail.length === 0) { t += 1; continue; }
    avail.sort((a, b) => a.prio - b.prio || a.arrival - b.arrival || procs.indexOf(a) - procs.indexOf(b));
    const p = avail[0];
    slices.push({ id: p.id, start: t, end: t + p.burst });
    t += p.burst;
    finish[p.id] = t;
    done.add(p.id);
  }
  return mkResult(procs, slices, finish);
}

// ---------------------------------------------------------------------
// 逐帧动画：场景类型与帧生成
// ---------------------------------------------------------------------
type FsScene = {
  algo: "fcfs" | "sjf" | "srtf";
  time: number;
  done: number[];
  gantt: Slice[];
  running: string | null;
};

const FCFS_CODE = [
  T("初始化 $t=0$，就绪队列为空", "init $t=0$, ready queue empty"),
  T("$t$ 时刻到达的进程进入就绪队列", "jobs arriving at $t$ enter the ready queue"),
  T("if CPU 空闲：按 $\\text{algo}$ 选择一个进程", "if CPU idle: pick a job by $\\text{algo}$"),
  T("运行 1 个时间单位，剩余时间减 1", "run 1 unit, remaining $-1$"),
  T("if 剩余 $=0$：完成并记录完成时间", "if remaining $=0$: finish, record its time"),
  T("if SRTF 且出现更短进程：抢占；$t \\gets t+1$ 重复", "if SRTF and a shorter job appears: preempt; $t \\gets t+1$, repeat"),
];

function fsGenerate(config: any): Frame<FsScene>[] {
  const algo = (config.algo ?? "fcfs") as "fcfs" | "sjf" | "srtf";
  const n = PROCS.length;
  const rem: Record<string, number> = {};
  PROCS.forEach((p) => { rem[p.id] = p.burst; });
  const raw: Slice[] = [];
  const done: number[] = [];
  const frames: Frame<FsScene>[] = [];
  const snap = (time: number, running: string | null): FsScene => ({ algo, time, done: [...done], gantt: merge(raw), running });
  frames.push({ line: 0, caption: T("初始化 $t=0$，就绪队列为空", "Init $t=0$, ready queue empty"), scene: snap(0, null) });
  let cur: string | null = null;
  let t = 0;
  let guard = 0;
  while (done.length < n && guard < 2000) {
    guard += 1;
    let ranId: string | null = null;
    let completedNow = false;
    let preempted = false;
    if (algo === "srtf") {
      const avail = PROCS.filter((p) => p.arrival <= t && rem[p.id] > 0);
      if (avail.length === 0) {
        frames.push({ line: 1, caption: T(`$t=${t}$：无就绪进程，CPU 空闲`, `$t=${t}$: no ready job, CPU idle`), scene: snap(t, null) });
        t += 1;
        continue;
      }
      avail.sort((a, b) => rem[a.id] - rem[b.id] || a.arrival - b.arrival || PROCS.indexOf(a) - PROCS.indexOf(b));
      const p = avail[0];
      preempted = cur !== null && cur !== p.id;
      cur = p.id;
      ranId = p.id;
      raw.push({ id: p.id, start: t, end: t + 1 });
      rem[p.id] -= 1;
      t += 1;
      if (rem[p.id] === 0) { done.push(PROCS.indexOf(p)); completedNow = true; cur = null; }
    } else {
      if (cur === null) {
        const avail = PROCS.filter((p) => p.arrival <= t && rem[p.id] > 0);
        if (avail.length === 0) {
          frames.push({ line: 1, caption: T(`$t=${t}$：无就绪进程，CPU 空闲`, `$t=${t}$: no ready job, CPU idle`), scene: snap(t, null) });
          t += 1;
          continue;
        }
        avail.sort(algo === "fcfs"
          ? (a, b) => a.arrival - b.arrival || PROCS.indexOf(a) - PROCS.indexOf(b)
          : (a, b) => a.burst - b.burst || a.arrival - b.arrival || PROCS.indexOf(a) - PROCS.indexOf(b));
        cur = avail[0].id;
      }
      const id: string = cur;
      ranId = id;
      raw.push({ id, start: t, end: t + 1 });
      rem[id] -= 1;
      t += 1;
      if (rem[id] === 0) { done.push(PROCS.findIndex((p) => p.id === id)); completedNow = true; cur = null; }
    }
    const line = completedNow ? 4 : preempted ? 5 : 3;
    const caption = completedNow
      ? T(`$t=${t}$：${ranId} 完成，记录完成时间`, `$t=${t}$: ${ranId} completes, record finish time`)
      : preempted
        ? T(`$t=${t}$：出现更短进程，抢占并运行 ${ranId}`, `$t=${t}$: shorter job preempts, run ${ranId}`)
        : T(`$t=${t}$：运行 ${ranId} 1 个时间单位`, `$t=${t}$: run ${ranId} for 1 unit`);
    frames.push({ line, caption, scene: snap(t, ranId) });
  }
  return frames;
}

type RrScene = { time: number; queue: string[]; gantt: Slice[]; running: string | null };

const RR_CODE = [
  T("初始化 $t=0$，时间片 $q$", "init $t=0$, quantum $q$"),
  T("到达的进程按顺序入就绪队列", "jobs enter the ready queue in order"),
  T("if CPU 空闲：取队首，已用时间归零", "if CPU idle: dequeue head, reset used"),
  T("运行 1 单位，剩余减 1、已用加 1", "run 1 unit, remaining $-1$, used $+1$"),
  T("if 剩余 $=0$：完成", "if remaining $=0$: done"),
  T("else if 已用 $=q$：重新排到队尾；$t \\gets t+1$", "else if used $=q$: requeue at tail; $t \\gets t+1$"),
];

function rrGenerate(config: any): Frame<RrScene>[] {
  const q = Math.max(1, Math.min(8, Math.round(config.q ?? 2)));
  const rem: Record<string, number> = {};
  PROCS.forEach((p) => { rem[p.id] = p.burst; });
  const byArrival = [...PROCS].sort((a, b) => a.arrival - b.arrival || PROCS.indexOf(a) - PROCS.indexOf(b));
  const admitted = new Set<string>();
  const queue: string[] = [];
  const raw: Slice[] = [];
  const frames: Frame<RrScene>[] = [];
  const snap = (time: number, running: string | null): RrScene => ({ time, queue: [...queue], gantt: merge(raw), running });
  const admit = (t: number) => {
    for (const p of byArrival) if (p.arrival <= t && !admitted.has(p.id)) { admitted.add(p.id); queue.push(p.id); }
  };
  admit(0);
  frames.push({ line: 0, caption: T(`初始化 $t=0$，时间片 $q=${q}$`, `Init $t=0$, quantum $q=${q}$`), scene: snap(0, null) });
  let t = 0, used = 0, completed = 0, guard = 0;
  let cur: string | null = null;
  while (completed < PROCS.length && guard < 2000) {
    guard += 1;
    admit(t);
    if (cur === null) {
      const next = queue.shift();
      if (next === undefined) {
        frames.push({ line: 1, caption: T(`$t=${t}$：就绪队列空，CPU 空闲`, `$t=${t}$: ready queue empty, CPU idle`), scene: snap(t, null) });
        t += 1;
        continue;
      }
      cur = next;
      used = 0;
    }
    const id: string = cur;
    raw.push({ id, start: t, end: t + 1 });
    rem[id] -= 1;
    t += 1;
    used += 1;
    let line = 3;
    let caption = T(`$t=${t}$：运行 ${id}（已用 ${used}/${q}）`, `$t=${t}$: run ${id} (used ${used}/${q})`);
    if (rem[id] === 0) {
      completed += 1;
      cur = null;
      used = 0;
      line = 4;
      caption = T(`$t=${t}$：${id} 完成`, `$t=${t}$: ${id} completes`);
    } else if (used >= q) {
      queue.push(id);
      cur = null;
      used = 0;
      line = 5;
      caption = T(`$t=${t}$：${id} 时间片用尽，回到队尾`, `$t=${t}$: ${id} exhausts quantum, requeued at tail`);
    }
    frames.push({ line, caption, scene: snap(t, id) });
  }
  return frames;
}

type MlfqScene = { step: number; queues: string[][] };

const MLFQ_CODE = [
  T("新进程进入最高队列 $Q_0$", "new jobs enter the top queue $Q_0$"),
  T("总是调度最高非空队列（同队内 RR）", "always run the highest non-empty queue (RR within)"),
  T("用满时间片仍未完成 → 降级", "uses the whole quantum ⇒ demote"),
  T("提前让出（I/O）→ 留在原队列", "yields early (I/O) ⇒ keep"),
  T("每 $S$ 个时间单位把全部进程提升到 $Q_0$", "every $S$ units boost all jobs to $Q_0$"),
  T("重复直到所有进程完成", "repeat until all jobs finish"),
];

function mlfqGenerate(_config: any): Frame<MlfqScene>[] {
  const Q = (a: string[], b: string[], c: string[]): string[][] => [a, b, c];
  const steps: { line: number; cap: { zh: string; en: string }; queues: string[][] }[] = [
    { line: 0, cap: { zh: "新进程 A、B 进入 $Q_0$", en: "new jobs A, B enter $Q_0$" }, queues: Q(["A", "B"], [], []) },
    { line: 2, cap: { zh: "A 在 $Q_0$ 用满时间片 2（余 8），降级到 $Q_1$", en: "A uses full quantum 2 in $Q_0$ (rem 8), demoted to $Q_1$" }, queues: Q(["B"], ["A"], []) },
    { line: 5, cap: { zh: "B 在 $Q_0$ 时间片内完成（2）", en: "B completes within its quantum in $Q_0$ (2)" }, queues: Q([], ["A"], []) },
    { line: 2, cap: { zh: "A 在 $Q_1$ 用满时间片 4（余 4），降级到 $Q_2$", en: "A uses full quantum 4 in $Q_1$ (rem 4), demoted to $Q_2$" }, queues: Q([], [], ["A"]) },
    { line: 4, cap: { zh: "到达周期 $S=8$：A 被提升回 $Q_0$（防饥饿）", en: "period $S=8$ reached: A boosted back to $Q_0$ (anti-starvation)" }, queues: Q(["A"], [], []) },
    { line: 2, cap: { zh: "A 在 $Q_0$ 用满时间片 2（余 2），降级到 $Q_1$", en: "A uses full quantum 2 in $Q_0$ (rem 2), demoted to $Q_1$" }, queues: Q([], ["A"], []) },
    { line: 5, cap: { zh: "A 在 $Q_1$ 剩余 2 全部完成", en: "A finishes its remaining 2 in $Q_1$" }, queues: Q([], [], []) },
  ];
  return steps.map((s, i) => ({ line: s.line, caption: T(s.cap.zh, s.cap.en), scene: { step: i, queues: s.queues } }));
}

function Gantt({ slices, end }: { slices: Slice[]; end: number }) {
  const step = end > 12 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= end; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== end) ticks.push(end);
  const pos = (x: number) => `${(x / end) * 100}%`;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ position: "relative", height: 36, background: "#f1f5f9", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {slices.map((s, i) => (
          <div key={i} title={`${s.id} ${s.start}-${s.end}`} style={{
            position: "absolute", top: 0, bottom: 0, left: pos(s.start), width: pos(s.end - s.start),
            background: PCOLOR[s.id], borderRight: "1px solid #fff", display: "flex", alignItems: "center",
            justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800,
          }}>{s.id}</div>
        ))}
      </div>
      <div style={{ position: "relative", height: 16, fontSize: 10, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
        {ticks.map((v) => (
          <span key={v} style={{ position: "absolute", left: pos(v), transform: "translateX(-50%)" }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

function Legend({ t }: { t: any }) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", fontSize: 12, color: "#64748b" }}>
      {PROCS.map((p) => (
        <span key={p.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: PCOLOR[p.id], display: "inline-block" }} />
          {p.id} ({zh ? "到" : "arr"}{p.arrival}, {zh ? "行" : "burst"}{p.burst})
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// metrics: 调度指标（公式推导逐帧动画）
// ---------------------------------------------------------------------
type MetricsScene = {
  step: number;
  proc: number;
  completion: (number | null)[];
  turnaround: (number | null)[];
  waiting: (number | null)[];
  averages: { turn: number; wait: number } | null;
};

// 固定小样本：FCFS 下 P1(到0 运7) P2(到2 运4) P3(到4 运1)，完成时间依次 7、11、12
const METRIC_PROCS: Proc[] = [
  { id: "P1", arrival: 0, burst: 7, prio: 3 },
  { id: "P2", arrival: 2, burst: 4, prio: 1 },
  { id: "P3", arrival: 4, burst: 1, prio: 4 },
];
const METRIC_COMPLETION = [7, 11, 12];

const METRICS_CODE = [
  T("输入到达时间、运行时间与完成时间", "input arrival, burst and completion"),
  T("$T_{\\text{周转}} = T_{\\text{完成}} - T_{\\text{到达}}$", "$T_{turn} = T_{finish} - T_{arrive}$"),
  T("$T_{\\text{等待}} = T_{\\text{周转}} - T_{\\text{运行}}$", "$T_{wait} = T_{turn} - T_{burst}$"),
  T("对每个进程重复上面两步", "repeat the two steps for every job"),
  T("返回平均值 $\\overline{T_{\\text{周转}}}$、$\\overline{T_{\\text{等待}}}$", "return averages $\\overline{T_{turn}}$, $\\overline{T_{wait}}$"),
];

function metricsGenerate(_config: any): Frame<MetricsScene>[] {
  const n = METRIC_PROCS.length;
  const completion: (number | null)[] = [...METRIC_COMPLETION];
  const turnaround: (number | null)[] = new Array(n).fill(null);
  const waiting: (number | null)[] = new Array(n).fill(null);
  const snap = (step: number, proc: number, averages: MetricsScene["averages"]): MetricsScene => ({
    step, proc, completion: [...completion], turnaround: [...turnaround], waiting: [...waiting], averages,
  });
  const frames: Frame<MetricsScene>[] = [];
  frames.push({
    line: 0,
    caption: T("给定各进程的到达、运行与完成时间", "Given each job's arrival, burst and completion"),
    scene: snap(0, -1, null),
  });
  METRIC_PROCS.forEach((p, i) => {
    const turn = (completion[i] as number) - p.arrival;
    turnaround[i] = turn;
    frames.push({
      line: 1,
      caption: T(`$T_{\\text{周转}}^{${p.id}} = ${completion[i]} - ${p.arrival} = ${turn}$`, `$T_{turn}^{${p.id}} = ${completion[i]} - ${p.arrival} = ${turn}$`),
      scene: snap(1, i, null),
    });
    const wait = turn - p.burst;
    waiting[i] = wait;
    frames.push({
      line: 2,
      caption: T(`$T_{\\text{等待}}^{${p.id}} = ${turn} - ${p.burst} = ${wait}$`, `$T_{wait}^{${p.id}} = ${turn} - ${p.burst} = ${wait}$`),
      scene: snap(2, i, null),
    });
  });
  const avgTurn = (turnaround as number[]).reduce((a, b) => a + b, 0) / n;
  const avgWait = (waiting as number[]).reduce((a, b) => a + b, 0) / n;
  frames.push({
    line: 4,
    caption: T(`平均周转 $= ${avgTurn.toFixed(2)}$，平均等待 $= ${avgWait.toFixed(2)}$`, `Avg turnaround $= ${avgTurn.toFixed(2)}$, avg wait $= ${avgWait.toFixed(2)}$`),
    scene: snap(3, -1, { turn: avgTurn, wait: avgWait }),
  });
  return frames;
}

function MetricsRender({ scene, t, onNext, reset, playing, step: pStep, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<MetricsScene>;
  const n = METRIC_PROCS.length;
  const completion = s.completion ?? new Array(n).fill(null);
  const turnaround = s.turnaround ?? new Array(n).fill(null);
  const waiting = s.waiting ?? new Array(n).fill(null);
  const proc = s.proc ?? -1;
  const step = s.step ?? 0;
  const total = count ?? 1;
  const atEnd = typeof pStep === "number" && pStep >= total - 1;
  const canClick = !!onNext && !playing && total > 1;
  const advance = advanceHandler(onNext, reset, playing, atEnd);
  const slices: Slice[] = METRIC_PROCS.map((p, i) => ({
    id: p.id, start: (completion[i] ?? 0) - p.burst, end: completion[i] ?? 0,
  }));
  const end = Math.max(...METRIC_PROCS.map((_, i) => completion[i] ?? 0), 1);
  const hl = (on: boolean, v: React.ReactNode): React.ReactNode =>
    on ? <b style={{ color: "#4338ca" }}>{v}</b> : v;
  const rows: React.ReactNode[][] = METRIC_PROCS.map((p, i) => [
    p.id, p.arrival, p.burst,
    completion[i] ?? "—",
    hl(step === 1 && i === proc, turnaround[i] ?? "—"),
    hl(step === 2 && i === proc, waiting[i] ?? "—"),
  ]);
  const av = s.averages;
  const formula = step === 1
    ? (zh ? "$T_{\\text{周转}} = T_{\\text{完成}} - T_{\\text{到达}}$" : "$T_{turn} = T_{finish} - T_{arrive}$")
    : step === 2
      ? (zh ? "$T_{\\text{等待}} = T_{\\text{周转}} - T_{\\text{运行}}$" : "$T_{wait} = T_{turn} - T_{burst}$")
      : (zh ? "$T_{\\text{周转}} = T_{\\text{完成}} - T_{\\text{到达}},\\quad T_{\\text{等待}} = T_{\\text{周转}} - T_{\\text{运行}}$" : "$T_{turn} = T_{finish} - T_{arrive},\\quad T_{wait} = T_{turn} - T_{burst}$");
  return (
    <Panel>
      <Gantt slices={slices} end={end} />
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {METRIC_PROCS.map((p, i) => (
          <div key={p.id} onClick={canClick ? advance : undefined}
            title={canClick ? t(T("点击该进程，逐步计算周转/等待", "click this job to compute turnaround/wait step by step")) : undefined}
            style={{ padding: "6px 14px", borderRadius: 10, background: i === proc ? "#eef2ff" : "#f8fafc", border: `2px solid ${i === proc ? "#6366f1" : "#e2e8f0"}`, fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#334155", cursor: canClick ? "pointer" : "default" }}>
            {p.id}
          </div>
        ))}
      </div>
      {canClick && (
        <TriggerHint ready={!atEnd} text={atEnd
          ? t(T("已完成，点击进程可重播", "Done; click a job to replay"))
          : t(T("点击任一进程，逐步计算其周转/等待并求平均", "click any job to compute its turnaround/wait, then average"))} />
      )}
      <StatPanel title={t(T("状态 / 数值", "State / values"))} rows={[
        [t(T("步骤", "Step")), `${(s.step ?? 0) + 1}/${total}`],
        [t(T("当前进程", "Current job")), proc >= 0 ? METRIC_PROCS[proc].id : "—"],
        [t(T("平均周转", "Avg turn")), av ? av.turn.toFixed(2) : "—"],
        [t(T("平均等待", "Avg wait")), av ? av.wait.toFixed(2) : "—"],
      ]} />
      <Table
        head={zh ? ["进程", "到达", "运行", "完成", "周转", "等待"] : ["Proc", "Arr", "Burst", "Finish", "Turn", "Wait"]}
        rows={rows}
      />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={formula} />
      </div>
      <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>{zh ? "平均周转" : "Avg turnaround"} = <b style={{ color: "#4338ca" }}>{av ? av.turn.toFixed(2) : "—"}</b></span>
        <span>{zh ? "平均等待" : "Avg wait"} = <b style={{ color: "#b45309" }}>{av ? av.wait.toFixed(2) : "—"}</b></span>
      </div>
      <Note>
        {zh
          ? "等待时间 = 周转时间 − 运行时间：周转里只有真正占用 CPU 的那部分是有效运行，其余都在就绪队列里干等。求平均即把各进程的周转/等待相加再除以进程数。"
          : "Waiting = turnaround − burst: only the CPU-occupying part of turnaround is useful work, the rest waits in the ready queue. Averages sum each job's turnaround/wait and divide by the count."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// fcfs-sjf: FCFS / SJF / SRTF
// ---------------------------------------------------------------------
function FcfsSJFControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "算法" : "Algorithm"}</span>
        <select className="txt" value={config.algo} onChange={(e) => onChange({ ...config, algo: e.target.value })} style={{ fontWeight: 700 }}>
          <option value="fcfs">FCFS</option>
          <option value="sjf">SJF</option>
          <option value="srtf">SRTF</option>
        </select>
      </label>
    </Row>
  );
}

function FcfsSJFRender({ scene, config, t, onNext, reset, playing, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<FsScene>;
  const algo = (s.algo ?? config?.algo ?? "fcfs") as "fcfs" | "sjf" | "srtf";
  const total = count ?? 1;
  const atEnd = typeof step === "number" && step >= total - 1;
  const canClick = !!onNext && !playing && total > 1;
  const advance = advanceHandler(onNext, reset, playing, atEnd);
  const res = algo === "srtf" ? simSRTF(PROCS) : simNonPreemptive(algo, PROCS);
  const aF = simNonPreemptive("fcfs", PROCS);
  const aS = simNonPreemptive("sjf", PROCS);
  const aP = simSRTF(PROCS);
  const doneSet = new Set<number>(s.done ?? []);
  const gStat = ganttStats(PROCS, s.gantt ?? res.slices);
  const per: React.ReactNode[][] = PROCS.map((p, i) => {
    const f = res.finish[p.id];
    if (!doneSet.has(i)) return [p.id, p.arrival, p.burst, "—", "—", "—"];
    return [p.id, p.arrival, p.burst, f, f - p.arrival, f - p.arrival - p.burst];
  });
  const mk = (name: string, key: string, r: SimResult): React.ReactNode[] => [
    (algo === key ? "▶ " : "") + name, r.avgTurn.toFixed(2), r.avgWait.toFixed(2),
  ];
  const cmp: React.ReactNode[][] = [
    mk("FCFS", "fcfs", aF),
    mk("SJF", "sjf", aS),
    mk("SRTF", "srtf", aP),
  ];
  const note: Record<string, { zh: string; en: string }> = {
    fcfs: { zh: "FCFS 非抢占，按到达顺序服务；长作业会造成护航效应 (convoy effect)，拖住后续短作业。", en: "FCFS is non-preemptive, serving by arrival; a long job causes the convoy effect, delaying later short jobs." },
    sjf: { zh: "SJF 非抢占，每次选运行时间最短者；同时到达时可证平均等待最小，但需预测运行时间，长作业可能饥饿。", en: "SJF is non-preemptive, picking the shortest burst; optimal average wait when all arrive together, but needs burst prediction and may starve long jobs." },
    srtf: { zh: "SRTF 是 SJF 的抢占版：新进程若剩余时间更短则立即抢占；指标最优但切换最多。", en: "SRTF is preemptive SJF: a new shorter job immediately preempts; best metrics but most switches." },
  };
  return (
    <Panel>
      <Legend t={t} />
      <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "center", flexWrap: "wrap", fontSize: 13, fontFamily: "ui-monospace, monospace", color: "#334155" }}>
        <span>{zh ? "当前时间" : "Time"} <b>t = {s.time ?? 0}</b></span>
        <span>{zh ? "运行" : "Running"} = <b style={{ color: s.running ? PCOLOR[s.running] : "#94a3b8" }}>{s.running ?? (zh ? "空闲" : "idle")}</b></span>
        {canClick && (
          <span onClick={advance} title={t(T("点击时钟，前进一个时间单位", "click the clock to advance one time unit"))}
            style={{ padding: "3px 12px", borderRadius: 999, background: "#4338ca", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            {zh ? "时钟 +1" : "clock +1"}
          </span>
        )}
      </div>
      <div onClick={canClick ? advance : undefined} title={canClick ? t(T("点击甘特图，前进一个时间单位", "click the Gantt to advance one time unit")) : undefined} style={{ cursor: canClick ? "pointer" : "default" }}>
        <Gantt slices={s.gantt ?? res.slices} end={res.end} />
      </div>
      {canClick && (
        <TriggerHint ready={!atEnd} text={atEnd
          ? t(T("已完成，点击可重播", "Done; click to replay"))
          : t(T("点击「时钟 +1」或甘特图，逐单位推进调度", "click the clock or the Gantt to advance the schedule unit by unit"))} />
      )}
      <StatPanel title={t(T("状态 / 数值", "State / values"))} rows={[
        [t(T("当前时间", "Time")), `t = ${s.time ?? 0}`],
        [t(T("运行", "Running")), s.running ?? t(T("空闲", "idle"))],
        [t(T("已完成", "Done")), `${doneSet.size}/${PROCS.length}`],
        [t(T("平均周转", "Avg turn")), gStat.turn.toFixed(2)],
        [t(T("平均等待", "Avg wait")), gStat.wait.toFixed(2)],
      ]} />
      <Table head={zh ? ["进程", "到达", "运行", "完成", "周转", "等待"] : ["Proc", "Arr", "Burst", "Finish", "Turn", "Wait"]} rows={per} />
      <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>{zh ? "平均周转" : "Avg turnaround"} = <b style={{ color: "#4338ca" }}>{res.avgTurn.toFixed(2)}</b></span>
        <span>{zh ? "平均等待" : "Avg wait"} = <b style={{ color: "#b45309" }}>{res.avgWait.toFixed(2)}</b></span>
      </div>
      <Table head={zh ? ["算法", "平均周转", "平均等待"] : ["Algo", "Avg turn", "Avg wait"]} rows={cmp} />
      <Note>{zh ? note[algo].zh : note[algo].en}</Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// rr-priority: 时间片轮转 RR + 优先级
// ---------------------------------------------------------------------
function RrPriorityControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <NumField label={zh ? "时间片 q" : "Quantum q"} value={config.q} onChange={(v) => onChange({ ...config, q: v })} min={1} max={8} width={70} />
    </Row>
  );
}

function RrPriorityRender({ scene, config, t, onNext, reset, playing, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<RrScene>;
  const q = Math.max(1, Math.min(8, Math.round(config?.q ?? 2)));
  const res = simRR(PROCS, q);
  const total = count ?? 1;
  const atEnd = typeof step === "number" && step >= total - 1;
  const canClick = !!onNext && !playing && total > 1;
  const advance = advanceHandler(onNext, reset, playing, atEnd);
  const gStat = ganttStats(PROCS, s.gantt ?? res.slices);
  const per: React.ReactNode[][] = PROCS.map((p) => {
    const f = res.finish[p.id];
    return [p.id, p.arrival, p.burst, f, f - p.arrival, f - p.arrival - p.burst];
  });
  const qs = [1, 2, 4];
  const qRows: React.ReactNode[][] = qs.map((x) => {
    const r = simRR(PROCS, x);
    return [String(x), r.avgTurn.toFixed(2), r.avgWait.toFixed(2), r.avgResp.toFixed(2)];
  });
  const fcfs = simNonPreemptive("fcfs", PROCS);
  qRows.push([zh ? "∞ (FCFS)" : "∞ (FCFS)", fcfs.avgTurn.toFixed(2), fcfs.avgWait.toFixed(2), fcfs.avgResp.toFixed(2)]);

  const pr = simPriority(PRIO_PROCS);
  const prPer: React.ReactNode[][] = [...PRIO_PROCS]
    .sort((a, b) => a.prio - b.prio)
    .map((p) => {
      const f = pr.finish[p.id];
      return [p.id, p.prio, p.burst, f, f - p.arrival, f - p.arrival - p.burst];
    });
  const queueView = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center", fontSize: 13 }}>
      <span style={{ fontFamily: "ui-monospace, monospace", color: "#334155" }}>{zh ? "当前时间" : "Time"} <b>t = {s.time ?? 0}</b></span>
      <span style={{ color: "#334155" }}>{zh ? "CPU" : "CPU"} = <b style={{ color: s.running ? PCOLOR[s.running] : "#94a3b8" }}>{s.running ?? (zh ? "空闲" : "idle")}</b></span>
      <span style={{ color: "#64748b" }}>{zh ? "就绪队列" : "Ready queue"}</span>
      {(s.queue ?? []).length === 0
        ? <span style={{ color: "#94a3b8" }}>{zh ? "（空）" : "(empty)"}</span>
        : (s.queue ?? []).map((id, i) => (
          <span key={`${id}-${i}`} style={{ padding: "2px 10px", borderRadius: 999, background: PCOLOR[id] ?? "#64748b", color: "#fff", fontWeight: 800, fontSize: 12 }}>{id}</span>
        ))}
    </div>
  );
  return (
    <Panel>
      <Legend t={t} />
      {queueView}
      {canClick && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div onClick={advance} title={t(T("点击运行一个时间片", "click to run one time slice"))}
            style={{ padding: "7px 18px", borderRadius: 999, background: "#4338ca", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {zh ? "运行一个时间片" : "run one time slice"}
          </div>
        </div>
      )}
      {canClick && (
        <TriggerHint ready={!atEnd} text={atEnd
          ? t(T("已完成，点击可重播", "Done; click to replay"))
          : t(T("点击「运行一个时间片」，逐片演示 RR 轮转", "click to run one time slice and step through RR"))} />
      )}
      <StatPanel title={t(T("状态 / 数值", "State / values"))} rows={[
        [t(T("当前时间", "Time")), `t = ${s.time ?? 0}`],
        [t(T("CPU", "CPU")), s.running ?? t(T("空闲", "idle"))],
        [t(T("就绪队列", "Ready queue")), (s.queue ?? []).join(" ") || t(T("空", "empty"))],
        [t(T("时间片", "Quantum")), `q = ${q}`],
        [t(T("平均周转", "Avg turn")), gStat.turn.toFixed(2)],
        [t(T("平均等待", "Avg wait")), gStat.wait.toFixed(2)],
      ]} />
      <Gantt slices={s.gantt ?? res.slices} end={res.end} />
      <Table head={zh ? ["进程", "到达", "运行", "完成", "周转", "等待"] : ["Proc", "Arr", "Burst", "Finish", "Turn", "Wait"]} rows={per} />
      <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>{zh ? "平均周转" : "Avg turnaround"} = <b style={{ color: "#4338ca" }}>{res.avgTurn.toFixed(2)}</b></span>
        <span>{zh ? "平均等待" : "Avg wait"} = <b style={{ color: "#b45309" }}>{res.avgWait.toFixed(2)}</b></span>
      </div>
      <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 13 }}>{zh ? "时间片大小的影响" : "Effect of quantum size"}</div>
      <Table head={zh ? ["时间片 q", "平均周转", "平均等待", "平均响应"] : ["q", "Avg turn", "Avg wait", "Avg resp"]} rows={qRows} />
      <Note>
        {zh
          ? `当前 q=${q}：时间片越小，首轮轮转更早到达每个进程，响应越快、但切换越频繁；q→∞ 退化为 FCFS。上例总完成时间恒为 ${res.end}（单 CPU 不空闲），故 q 的选取是响应与吞吐的折中。`
          : `Current q=${q}: smaller quanta reach each process sooner (better response) but switch more; q→∞ degenerates to FCFS. Makespan stays ${res.end} on one busy CPU, so q trades response against throughput.`}
      </Note>

      <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 13 }}>{zh ? "优先级调度示例（数值小者优先，非抢占）" : "Priority example (smaller = higher, non-preemptive)"}</div>
      <Gantt slices={pr.slices} end={pr.end} />
      <Table head={zh ? ["进程", "优先级", "运行", "完成", "周转", "等待"] : ["Proc", "Prio", "Burst", "Finish", "Turn", "Wait"]} rows={prPer} />
      <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>{zh ? "平均周转" : "Avg turnaround"} = <b style={{ color: "#4338ca" }}>{pr.avgTurn.toFixed(2)}</b></span>
        <span>{zh ? "平均等待" : "Avg wait"} = <b style={{ color: "#b45309" }}>{pr.avgWait.toFixed(2)}</b></span>
      </div>
      <Note tone="warn">
        {zh
          ? "优先级调度缓解了共享问题，但会带来饥饿（低优先级长期得不到 CPU）与优先级反转（持锁低优先级阻塞高优先级）。可用「老化/周期提升」与「优先级继承」缓解。"
          : "Priority scheduling risks starvation (low priority never runs) and priority inversion (a low-priority lock holder blocks a high-priority task); aging/priority boost and priority inheritance mitigate them."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// mlfq: 多级反馈队列
// ---------------------------------------------------------------------
function MlfqRender({ scene, t, onNext, reset, playing, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<MlfqScene>;
  const mlQueues = s.queues ?? [["A", "B"], [], []];
  const total = count ?? 1;
  const atEnd = typeof step === "number" && step >= total - 1;
  const canClick = !!onNext && !playing && total > 1;
  const advance = advanceHandler(onNext, reset, playing, atEnd);
  const rules: [string, string][] = zh
    ? [
      ["多队列", "多个优先级队列 Q0…Qn，Q0 最高；总是先调度最高优先级非空队列"],
      ["时间片递增", "层级越低时间片越长：Q0=2，Q1=4，Q2=FCFS"],
      ["新进程", "新进程先进入最高队列 Q0，享受最短响应"],
      ["用完降级", "耗尽整个时间片仍未完成（偏 CPU 密集）→ 降到下一队列"],
      ["主动让出", "时间片内主动让出（如 I/O，偏交互式）→ 留在原队列或提升"],
      ["周期提升", "每隔固定时间 S 把所有进程提升到 Q0，防止饥饿并校正误判"],
      ["同队轮转", "同一队列内部按 RR 轮转"],
    ]
    : [
      ["Multi-queue", "priority queues Q0…Qn, Q0 highest; always run the highest non-empty queue"],
      ["Quantum grows", "lower queues get longer quanta: Q0=2, Q1=4, Q2=FCFS"],
      ["New jobs", "all new jobs enter the top queue Q0 for the fastest response"],
      ["Demotion", "using the whole quantum (CPU-bound) → drop to the next queue"],
      ["Keep/promote", "yielding early (e.g. I/O, interactive) → stay or move up"],
      ["Priority boost", "every S time units, move all jobs to Q0 to prevent starvation"],
      ["Round-robin", "within a queue, schedule by RR"],
    ];
  const queues: React.ReactNode[][] = zh
    ? [
      ["Q0", "最高", "2", "新进程 / 交互式 (I/O 密集)"],
      ["Q1", "中", "4", "短批处理"],
      ["Q2", "最低", "FCFS", "CPU 密集型长作业"],
    ]
    : [
      ["Q0", "highest", "2", "new / interactive (I/O-bound)"],
      ["Q1", "middle", "4", "short batch"],
      ["Q2", "lowest", "FCFS", "long CPU-bound jobs"],
    ];
  const queueColors = ["#6366f1", "#0ea5e9", "#94a3b8"];
  const procColor: Record<string, string> = { A: "#0ea5e9", B: "#10b981" };
  return (
    <Panel>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ textAlign: "center", fontSize: 13, color: "#334155", fontFamily: "ui-monospace, monospace" }}>
          {zh ? "步骤" : "Step"} <b>{s.step ?? 0}</b>
        </div>
        {mlQueues.map((row, i) => (
          <div key={`ml-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderRadius: 10, borderLeft: `6px solid ${queueColors[i]}`, background: "#f8fafc", border: "1px solid #e2e8f0", minHeight: 44 }}>
            <span style={{ fontWeight: 900, color: queueColors[i], width: 34, fontFamily: "ui-monospace, monospace" }}>Q{i}</span>
            {(row ?? []).length === 0
              ? <span style={{ color: "#94a3b8", fontSize: 12 }}>{zh ? "（空）" : "(empty)"}</span>
              : (row ?? []).map((id, k) => (
                <span key={`${id}-${k}`} onClick={canClick ? advance : undefined}
                  title={canClick ? t(T("点击该进程，推进一步（降级/提升/完成）", "click this job to advance (demote/boost/finish)")) : undefined}
                  style={{ padding: "3px 12px", borderRadius: 8, background: procColor[id] ?? "#64748b", color: "#fff", fontWeight: 800, fontSize: 13, cursor: canClick ? "pointer" : "default" }}>{id}</span>
              ))}
          </div>
        ))}
      </div>
      {canClick && (
        <TriggerHint ready={!atEnd} text={atEnd
          ? t(T("已完成，点击进程可重播", "Done; click a job to replay"))
          : t(T("点击任一队列中的进程，逐步演示降级 / 提升 / 完成", "click any job in a queue to step through demotion / boost / finish"))} />
      )}
      <StatPanel title={t(T("状态 / 数值", "State / values"))} rows={[
        [t(T("步骤", "Step")), `${(s.step ?? 0) + 1}/${total}`],
        ["Q0", (mlQueues[0] ?? []).join(" ") || "—"],
        ["Q1", (mlQueues[1] ?? []).join(" ") || "—"],
        ["Q2", (mlQueues[2] ?? []).join(" ") || "—"],
      ]} />
      <div style={{ display: "grid", gap: 6 }}>
        {queues.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderRadius: 10, borderLeft: `6px solid ${queueColors[i]}`, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <span style={{ fontWeight: 900, color: queueColors[i], width: 34, fontFamily: "ui-monospace, monospace" }}>{r[0] as string}</span>
            <span style={{ fontSize: 12, color: "#64748b", width: 62 }}>{r[1] as string}</span>
            <span style={{ fontSize: 12, color: "#475569", width: 60, fontFamily: "ui-monospace, monospace" }}>{zh ? "片 " : "q "}{r[2] as string}</span>
            <span style={{ fontSize: 13, color: "#334155" }}>{r[3] as string}</span>
          </div>
        ))}
      </div>
      <Steps items={rules} />
      <Table head={zh ? ["队列", "优先级", "时间片", "典型对象"] : ["Queue", "Priority", "Quantum", "Typical"]} rows={queues} />
      <Note>
        {zh
          ? "MLFQ 用「降级惩罚 CPU 密集、保留奖励 I/O 密集、周期提升兜底饥饿」三条机制，在无需预知运行时间的情况下兼顾响应与吞吐，是通用 OS 最常用的调度框架。"
          : "MLFQ combines demotion for CPU-bound, retention for I/O-bound and periodic boosting to prevent starvation — trading response vs throughput without knowing burst lengths, the workhorse of general-purpose OSes."}
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  metrics: { title: T("调度指标", "Metrics"), Render: MetricsRender, generate: metricsGenerate, code: METRICS_CODE },
  "fcfs-sjf": {
    title: T("FCFS / SJF", "FCFS / SJF"),
    defaultConfig: { algo: "fcfs" },
    Controls: FcfsSJFControls,
    Render: FcfsSJFRender,
    generate: fsGenerate,
    code: FCFS_CODE,
  },
  "rr-priority": {
    title: T("轮转 / 优先级", "RR / Priority"),
    defaultConfig: { q: 2 },
    Controls: RrPriorityControls,
    Render: RrPriorityRender,
    generate: rrGenerate,
    code: RR_CODE,
  },
  mlfq: { title: T("多级反馈队列", "MLFQ"), Render: MlfqRender, generate: mlfqGenerate, code: MLFQ_CODE },
};

export const { module: osSchedulingModule, GROUPS: osSchedulingGroups } = makeChapter<SubMode>({
  id: "os-scheduling",
  title: T("CPU 调度", "CPU Scheduling"),
  desc: T(
    "周转/等待/响应/吞吐指标，FCFS、SJF/SRTF、时间片轮转 RR、优先级与多级反馈队列 MLFQ 的交互甘特图与计算。",
    "Turnaround/wait/response/throughput metrics; interactive Gantt charts and calculations for FCFS, SJF/SRTF, RR, priority and MLFQ.",
  ),
  tags: ["operating-system", "scheduling"],
  groups: [
    {
      label: "调度",
      opts: [
        { v: "metrics", zh: "调度指标", en: "Metrics" },
        { v: "fcfs-sjf", zh: "FCFS/SJF", en: "FCFS/SJF" },
        { v: "rr-priority", zh: "轮转/优先级", en: "RR/Priority" },
        { v: "mlfq", zh: "多级反馈队列", en: "MLFQ" },
      ],
    },
  ],
  subs: SUBS,
});
