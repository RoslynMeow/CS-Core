import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第4章 同步与并发
//   对应 tex/OperatingSystem/chapters/sync.tex
//   critical-section(临界区/Peterson 逐帧) / semaphore(信号量)
//   deadlock(死锁/银行家算法 逐帧)
// =====================================================================

type SubMode = "critical-section" | "semaphore" | "deadlock";

function Code({ children, title }: { children: string; title?: string }) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1e293b" }}>
      {title && (
        <div style={{ background: "#1e293b", color: "#e2e8f0", fontSize: 11, padding: "5px 12px", fontFamily: "ui-monospace, monospace" }}>
          {title}
        </div>
      )}
      <pre style={{ margin: 0, padding: "10px 14px", background: "#0f172a", color: "#e2e8f0", fontSize: 12, lineHeight: 1.6, fontFamily: "ui-monospace, monospace", overflowX: "auto" }}>
        {children}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------
// critical-section: Peterson 算法逐帧动画
//   P0 / P1 交替请求进入临界区，展示 flag / turn 与互斥
// ---------------------------------------------------------------------
type CsScene = { step: number; flags: [boolean, boolean]; turn: 0 | 1; inside: 0 | 1 | null };

const CS_CODE = [
  T("flag[i] = true;                   // 声明想进入", "flag[i] = true;                   // declare intent"),
  T("turn = j;                         // 把优先权让给对方", "turn = j;                         // yield priority to peer"),
  T("while (flag[j] && turn == j) { }  // 忙等待", "while (flag[j] && turn == j) { }  // busy wait"),
  T("/* ============ 进入临界区 ============ */", "/* ============ enter critical section ============ */"),
  T("/* ============ 退出临界区 ============ */", "/* ============ exit critical section ============ */"),
  T("flag[i] = false;                  // 撤销进入意愿", "flag[i] = false;                  // withdraw intent"),
];

function csGenerate(_config: any): Frame<CsScene>[] {
  const frames: Frame<CsScene>[] = [];
  const flags: [boolean, boolean] = [false, false];
  let turn: 0 | 1 = 0;
  let inside: 0 | 1 | null = null;
  const push = (line: number, caption: any) =>
    frames.push({ line, caption, scene: { step: line, flags: [flags[0], flags[1]], turn, inside } });

  push(3, T("初始：$flag=[F,F]$，$turn=0$，临界区空闲", "init: $flag=[F,F]$, $turn=0$, critical section empty"));

  flags[0] = true;
  push(0, T("$P_0$：$flag[0]=true$，声明想进入临界区", "$P_0$: $flag[0]=true$, declares intent"));
  turn = 1;
  push(1, T("$P_0$：$turn=1$，把优先权让给 $P_1$", "$P_0$: $turn=1$, yields priority to $P_1$"));
  push(2, T("$P_0$：$flag[1]=false$，$while$ 条件不成立，可以进入", "$P_0$: $flag[1]=false$, while-condition false, may enter"));
  inside = 0;
  push(3, T("$P_0$ 进入临界区，读写共享资源", "$P_0$ enters and touches the shared resource"));

  flags[1] = true;
  push(0, T("$P_1$：$flag[1]=true$，也想进入临界区", "$P_1$: $flag[1]=true$, also wants to enter"));
  turn = 0;
  push(1, T("$P_1$：$turn=0$，把优先权让给 $P_0$", "$P_1$: $turn=0$, yields priority to $P_0$"));
  push(2, T("$P_1$：$flag[0]=true \\wedge turn=0$，$while$ 成立，忙等待（互斥）", "$P_1$: $flag[0]=true \\wedge turn=0$, while holds, spins (mutex)"));

  inside = null;
  push(4, T("$P_0$ 退出临界区", "$P_0$ leaves the critical section"));
  flags[0] = false;
  push(5, T("$P_0$：$flag[0]=false$，撤销进入意愿", "$P_0$: $flag[0]=false$, withdraws intent"));

  inside = 1;
  push(3, T("$P_1$：$flag[0]=false$，$while$ 条件转为假，进入临界区", "$P_1$: $flag[0]=false$, while becomes false, enters"));
  inside = null;
  push(4, T("$P_1$ 退出临界区", "$P_1$ leaves the critical section"));
  flags[1] = false;
  push(5, T("$P_1$：$flag[1]=false$，回到初始状态", "$P_1$: $flag[1]=false$, back to the initial state"));

  return frames;
}

function CriticalSectionRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<CsScene>;
  const flags = s.flags ?? [false, false];
  const turn = s.turn ?? 0;
  const inside = s.inside ?? null;
  const state = (i: 0 | 1) => {
    const j = (1 - i) as 0 | 1;
    if (inside === i) return { label: zh ? "临界区内" : "in CS", bg: "#dcfce7", fg: "#166534", bd: "#6ee7b7" };
    if (flags[i] && flags[j] && turn === j) return { label: zh ? "忙等待" : "spinning", bg: "#fef3c7", fg: "#92400e", bd: "#fde68a" };
    if (flags[i]) return { label: zh ? "请求进入" : "requesting", bg: "#eef2ff", fg: "#4338ca", bd: "#c7d2fe" };
    return { label: zh ? "空闲" : "idle", bg: "#f8fafc", fg: "#64748b", bd: "#e2e8f0" };
  };
  const card = (i: 0 | 1) => {
    const st = state(i);
    return (
      <div key={i} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: st.bg, border: `2px solid ${st.bd}` }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{`P${i}`}</div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#334155", marginTop: 4 }}>
          {`flag[${i}] = ${flags[i] ? "true" : "false"}`}
        </div>
        <div style={{ marginTop: 4, fontWeight: 700, fontSize: 12, color: st.fg }}>{st.label}</div>
      </div>
    );
  };
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "共享变量" : "Shared"}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color: "#4338ca" }}>{`turn = ${turn}`}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#64748b" }}>{`flag = [${flags[0] ? "T" : "F"}, ${flags[1] ? "T" : "F"}]`}</span>
      </Row>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        {card(0)}
        <div style={{ flex: 1.2, padding: "10px 12px", borderRadius: 12, textAlign: "center", background: inside === null ? "#f8fafc" : "#d1fae5", border: `2px dashed ${inside === null ? "#cbd5e1" : "#34d399"}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{zh ? "临界区" : "Critical Section"}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: inside === null ? "#94a3b8" : "#065f46", marginTop: 6 }}>{inside === null ? "—" : `P${inside}`}</div>
          <div style={{ fontSize: 11, color: inside === null ? "#94a3b8" : "#047857", marginTop: 4 }}>{inside === null ? (zh ? "空闲" : "empty") : (zh ? "占用中" : "occupied")}</div>
        </div>
        {card(1)}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$flag[j] \wedge turn=j \Rightarrow \text{spin},\qquad |inside| \le 1$" />
      </div>
      <Note>
        {zh
          ? "Peterson 算法：进程 i 先置 $flag[i]=true$，再把 $turn$ 让给 $j$，然后自旋等待。两进程同时竞争时 $turn$ 只能取一个值，必有一方通过 $while$（互斥）；退出者置 $flag=false$ 后等待者可进入（前进）；对方至多插队一次即改写 $turn$（有限等待）。"
          : "Peterson's algorithm: process i sets $flag[i]=true$, yields $turn$ to $j$, then spins. Under contention $turn$ has one value so exactly one passes the $while$ (mutual exclusion); once the leaver sets $flag=false$ the waiter proceeds (progress); the peer jumps ahead at most once before turn is rewritten (bounded waiting)."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// semaphore
// ---------------------------------------------------------------------
const SEM_DEFAULT = { cap: 5, items: 2 };
function SemaphoreControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "缓冲区容量 n" : "Capacity n"} value={config.cap} onChange={(v) => set({ cap: v, items: Math.min(config.items, v) })} min={1} max={8} width={80} />
      <NumField label={zh ? "已放入产品" : "Items"} value={config.items} onChange={(v) => set({ items: v })} min={0} max={config.cap} width={80} />
    </div>
  );
}
type SemScene = {
  buffer: string[];
  empty: number;
  full: number;
  mutex: number;
  action: string;
  role: "producer" | "consumer" | null;
  blocked: boolean;
};

const SEM_ACTION: Record<string, { zh: string; en: string }> = {
  init: T("初始状态", "initial"),
  "wait-empty": T("生产者 wait(empty)：申请一个空槽", "producer wait(empty): claim a free slot"),
  put: T("生产者 put(item)：写入产品", "producer put(item): write into buffer"),
  "signal-full": T("生产者 signal(full)：通知有新产品", "producer signal(full): announce an item"),
  "wait-full": T("消费者 wait(full)：等待产品", "consumer wait(full): wait for an item"),
  get: T("消费者 get(item)：取走产品", "consumer get(item): remove an item"),
  "signal-empty": T("消费者 signal(empty)：归还空槽", "consumer signal(empty): return a free slot"),
  "block-empty": T("生产者阻塞：缓冲区已满", "producer blocked: buffer full"),
  "block-full": T("消费者阻塞：缓冲区为空", "consumer blocked: buffer empty"),
};

function clampi(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

function semGenerate(config: any): Frame<SemScene>[] {
  const cap = clampi(config?.cap, 1, 8);
  const start = clampi(config?.items, 0, cap);
  const buffer: string[] = Array.from({ length: start }, (_, i) => `p${i + 1}`);
  let empty = cap - start;
  let full = start;
  const mutex = 1;
  let counter = start;
  const frames: Frame<SemScene>[] = [];
  const snap = (action: string, role: "producer" | "consumer", blocked = false): SemScene => ({
    buffer: [...buffer], empty, full, mutex, action, role, blocked,
  });
  frames.push({
    line: 0,
    caption: T(`初始：缓冲区 ${start}/${cap}，$empty = ${empty},\ full = ${full},\ mutex = 1$`,
      `init: buffer ${start}/${cap}, $empty = ${empty},\ full = ${full},\ mutex = 1$`),
    scene: snap("init", "producer"),
  });
  while (empty > 0) {
    empty--;
    frames.push({
      line: 1,
      caption: T(`生产者 wait(empty)：$empty \\gets ${empty}$`, `producer wait(empty): $empty \\gets ${empty}$`),
      scene: snap("wait-empty", "producer"),
    });
    counter++;
    buffer.push(`p${counter}`);
    frames.push({
      line: 2,
      caption: T(`put($p${counter}$)：写入一个产品`, `put($p${counter}$): write an item`),
      scene: snap("put", "producer"),
    });
    full++;
    frames.push({
      line: 2,
      caption: T(`signal(full)：$full \\gets ${full}$`, `signal(full): $full \\gets ${full}$`),
      scene: snap("signal-full", "producer"),
    });
  }
  frames.push({
    line: 5,
    caption: T("缓冲区已满（$empty = 0$），生产者阻塞于 wait(empty)",
      "buffer full ($empty = 0$): producer blocks on wait(empty)"),
    scene: snap("block-empty", "producer", true),
  });
  while (full > 0) {
    full--;
    frames.push({
      line: 3,
      caption: T(`消费者 wait(full)：$full \\gets ${full}$`, `consumer wait(full): $full \\gets ${full}$`),
      scene: snap("wait-full", "consumer"),
    });
    const item = buffer.pop();
    frames.push({
      line: 4,
      caption: T(`get(${item ?? ""})：取走一个产品`, `get(${item ?? ""}): remove an item`),
      scene: snap("get", "consumer"),
    });
    empty++;
    frames.push({
      line: 4,
      caption: T(`signal(empty)：$empty \\gets ${empty}$`, `signal(empty): $empty \\gets ${empty}$`),
      scene: snap("signal-empty", "consumer"),
    });
  }
  frames.push({
    line: 6,
    caption: T("缓冲区已空（$full = 0$），消费者阻塞于 wait(full)",
      "buffer empty ($full = 0$): consumer blocks on wait(full)"),
    scene: snap("block-full", "consumer", true),
  });
  return frames;
}

const SEM_CODE = [
  T("semaphore mutex=1, empty=n, full=0", "semaphore mutex=1, empty=n, full=0"),
  T("producer: wait(empty); wait(mutex);", "producer: wait(empty); wait(mutex);"),
  T("  put(item); signal(mutex); signal(full);", "  put(item); signal(mutex); signal(full);"),
  T("consumer: wait(full); wait(mutex);", "consumer: wait(full); wait(mutex);"),
  T("  get(item); signal(mutex); signal(empty);", "  get(item); signal(mutex); signal(empty);"),
  T("if empty=0: 生产者阻塞（缓冲区满）", "if empty=0: producer blocks (buffer full)"),
  T("if full=0: 消费者阻塞（缓冲区空）", "if full=0: consumer blocks (buffer empty)"),
];

function SemaphoreRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<SemScene>;
  const buffer = s.buffer ?? [];
  const empty = s.empty ?? 0;
  const full = s.full ?? 0;
  const mutex = s.mutex ?? 1;
  const action = s.action ?? "init";
  const role = s.role ?? null;
  const blocked = !!s.blocked;
  const cap = Math.max(Number(config?.cap) || 0, buffer.length + empty, buffer.length);
  const slots = Array.from({ length: cap }, (_, i) => i < buffer.length);
  const rows: React.ReactNode[][] = zh
    ? [
      ["mutex", String(mutex), "临界区互斥锁，初值 1"],
      ["empty", String(empty), "空槽数量，初值 n"],
      ["full", String(full), "满槽数量，初值 0"],
    ]
    : [
      ["mutex", String(mutex), "critical-section lock, init 1"],
      ["empty", String(empty), "free slots, init n"],
      ["full", String(full), "filled slots, init 0"],
    ];
  const roleLabel = role === "producer" ? (zh ? "生产者" : "producer") : role === "consumer" ? (zh ? "消费者" : "consumer") : "";
  const roleColor = role === "producer" ? "#4338ca" : role === "consumer" ? "#047857" : "#475569";
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "缓冲区" : "Buffer"}</span>
        {slots.map((filled, i) => (
          <div key={i} style={{ width: 42, height: 38, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontWeight: 800, fontSize: 12, color: filled ? "#065f46" : "#94a3b8", background: filled ? "#d1fae5" : "#f1f5f9", border: `1px solid ${filled ? "#6ee7b7" : "#cbd5e1"}` }}>
            {filled ? buffer[i] : "○"}
          </div>
        ))}
        <span style={{ fontSize: 12, color: "#64748b" }}>{`count = ${buffer.length}/${cap}`}</span>
      </Row>
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: roleColor }}>
        {roleLabel ? `${roleLabel} · ` : ""}{t(SEM_ACTION[action] ?? T(action, action))}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$empty = ${empty},\qquad full = ${full},\qquad mutex = ${mutex}$`} />
      </div>
      <Table head={zh ? ["信号量", "当前值", "含义"] : ["Semaphore", "Value", "Meaning"]} rows={rows} />
      <Note tone={blocked ? "warn" : "info"}>
        {blocked
          ? (zh
            ? `${roleLabel}被阻塞：${action === "block-empty" ? "缓冲区已满，需先等待消费者 signal(empty)" : "缓冲区已空，需先等待生产者 signal(full)"}。`
            : `the ${roleLabel} is blocked: ${action === "block-empty" ? "buffer full, wait until a consumer signals empty" : "buffer empty, wait until a producer signals full"}.`)
          : (zh
            ? "wait(S)（P 操作）先减 1，若 S < 0 则阻塞；signal(S)（V 操作）先加 1，若有等待者则唤醒其一。顺序要点：先 wait(empty) 再 wait(mutex)，否则持锁阻塞会死锁。"
            : "wait(S) (P) decrements and blocks if S < 0; signal(S) (V) increments and wakes a waiter. Order matters: wait(empty) before wait(mutex), or holding the lock while blocking deadlocks.")}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// deadlock
// ---------------------------------------------------------------------
const BNK_MAX = [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]];
const BNK_ALLOC = [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]];
const BNK_DEFAULT = { avA: 3, avB: 3, avC: 2 };

function simSafe(avail: number[]) {
  const n = BNK_ALLOC.length;
  const work = [...avail];
  const fin = new Array(n).fill(false);
  const steps: { i: number; work: number[] }[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (fin[i]) continue;
      const need = BNK_MAX[i].map((m, k) => m - BNK_ALLOC[i][k]);
      if (need.every((v, k) => v <= work[k])) {
        fin[i] = true;
        for (let k = 0; k < 3; k++) work[k] += BNK_ALLOC[i][k];
        steps.push({ i, work: [...work] });
        progress = true;
      }
    }
  }
  return { steps, safe: fin.every(Boolean) };
}

function DeadlockControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>{zh ? "Available" : "Available"}</span>
      <NumField label="A" value={config.avA} onChange={(v) => set({ avA: v })} min={0} max={12} width={60} />
      <NumField label="B" value={config.avB} onChange={(v) => set({ avB: v })} min={0} max={12} width={60} />
      <NumField label="C" value={config.avC} onChange={(v) => set({ avC: v })} min={0} max={12} width={60} />
    </div>
  );
}
type BnkScene = {
  work: number[];
  finish: boolean[];
  sequence: number[];
  candidate: number | null;
  ok?: boolean;
  safe?: boolean;
};

function bnkGenerate(config: any): Frame<BnkScene>[] {
  const avail = [clampi(config?.avA, 0, 12), clampi(config?.avB, 0, 12), clampi(config?.avC, 0, 12)];
  const n = BNK_ALLOC.length;
  const work = [...avail];
  const finish: boolean[] = new Array(n).fill(false);
  const sequence: number[] = [];
  const frames: Frame<BnkScene>[] = [];
  const fmt = (a: number[]) => `(${a.join(",")})`;
  frames.push({
    line: 0,
    caption: T(`$Work \\gets Available = ${fmt(avail)}$，所有 $Finish[i] = false$`,
      `$Work \\gets Available = ${fmt(avail)}$, all $Finish[i] = false$`),
    scene: { work: [...work], finish: [...finish], sequence: [...sequence], candidate: null },
  });
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      const need = BNK_MAX[i].map((m, k) => m - BNK_ALLOC[i][k]);
      const ok = need.every((v, k) => v <= work[k]);
      frames.push({
        line: 1,
        caption: T(`试探 $P_{${i}}$：$Need = ${fmt(need)} ${ok ? "\\le" : "\\gt"} Work = ${fmt(work)}$`,
          `try $P_{${i}}$: $Need = ${fmt(need)} ${ok ? "\\le" : "\\gt"} Work = ${fmt(work)}$`),
        scene: { work: [...work], finish: [...finish], sequence: [...sequence], candidate: i, ok },
      });
      if (ok) {
        for (let k = 0; k < 3; k++) work[k] += BNK_ALLOC[i][k];
        finish[i] = true;
        sequence.push(i);
        frames.push({
          line: 3,
          caption: T(`$Work \\gets Work + Allocation_{${i}} = ${fmt(work)}$，$P_{${i}}$ 完成并加入安全序列`,
            `$Work \\gets Work + Allocation_{${i}} = ${fmt(work)}$, $P_{${i}}$ joins the sequence`),
          scene: { work: [...work], finish: [...finish], sequence: [...sequence], candidate: i, ok: true },
        });
        progress = true;
      }
    }
  }
  const safe = finish.every(Boolean);
  frames.push({
    line: safe ? 4 : 5,
    caption: safe
      ? T(`所有进程可完成，安全序列：$${sequence.map((i) => "P" + i).join(" \\to ")}$`,
          `every process finishes — safe sequence: $${sequence.map((i) => "P" + i).join(" \\to ")}$`)
      : T("剩余进程的 $Need$ 均超过 $Work$，找不到安全序列：系统不安全，可能死锁",
          "remaining $Need$ exceeds $Work$ — no safe sequence: the system is unsafe"),
    scene: { work: [...work], finish: [...finish], sequence: [...sequence], candidate: null, safe },
  });
  return frames;
}

const BNK_CODE = [
  T("$Work \\gets Available;\\ Finish[i] \\gets false$", "$Work = Available; Finish[i] = false$"),
  T("找 $Finish[i]=false$ 且 $Need[i] \\le Work$ 的 $i$", "find $i$: $Finish[i]=false$ and $Need[i] \\le Work$"),
  T("$Work \\gets Work + Allocation[i]$", "$Work \\gets Work + Allocation[i]$"),
  T("$Finish[i] \\gets true$；$i$ 进入安全序列", "$Finish[i] = true$; push $i$ onto the sequence"),
  T("所有 $Finish[i]=true \\Rightarrow$ 存在安全序列", "all $Finish[i]=true \\Rightarrow$ safe sequence exists"),
  T("否则 $\\Rightarrow$ 不安全，可能死锁", "otherwise $\\Rightarrow$ unsafe, may deadlock"),
];

function DeadlockRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<BnkScene>;
  const avail = [Number(config?.avA) || 0, Number(config?.avB) || 0, Number(config?.avC) || 0];
  const work = s.work ?? avail;
  const finish = s.finish ?? BNK_ALLOC.map(() => false);
  const sequence = s.sequence ?? [];
  const candidate = s.candidate ?? null;
  const fmt = (a: number[]) => `(${a.join(",")})`;
  const condRows: React.ReactNode[][] = zh
    ? [
      ["互斥 Mutual Exclusion", "资源一次只能被一个进程占用", "尽量共享（只读文件）"],
      ["占有并等待 Hold and Wait", "持有资源的同时等待新资源", "一次性申请全部资源"],
      ["不可抢占 No Preemption", "资源只能由持有者主动释放", "允许抢占、回滚"],
      ["循环等待 Circular Wait", "存在进程-资源的环形等待链", "资源编号，按序申请"],
    ]
    : [
      ["Mutual Exclusion", "a resource is held by one process", "share when possible"],
      ["Hold and Wait", "hold some while requesting more", "request all at once"],
      ["No Preemption", "only the holder releases", "allow preemption/rollback"],
      ["Circular Wait", "a circular waiting chain exists", "number resources, order requests"],
    ];
  const rows: React.ReactNode[][] = BNK_ALLOC.map((alloc, i) => {
    const need = BNK_MAX[i].map((m, k) => m - alloc[k]);
    const done = finish[i];
    const cand = candidate === i;
    return [
      <span key="p" style={{ fontWeight: 800, color: done ? "#15803d" : cand ? "#4338ca" : "#0f172a" }}>{`P${i}`}{done ? " ✓" : ""}</span>,
      fmt(BNK_MAX[i]),
      fmt(alloc),
      fmt(need),
    ];
  });
  const candNeed = candidate !== null ? BNK_MAX[candidate].map((m, k) => m - BNK_ALLOC[candidate][k]) : null;
  const over = work.reduce((a, b) => a + b, 0);
  return (
    <Panel>
      <Table
        head={zh ? ["必要条件", "含义", "破坏策略"] : ["Condition", "Meaning", "Break it by"]}
        rows={condRows}
      />
      <Note>
        {zh
          ? "资源分配图：圆形为进程 P，方形为资源 R（内部黑点表示实例数）。P→R 是请求边，R→P 是分配边。出现环是死锁的必要条件：单实例时环即死锁；多实例时环仅是可能死锁，还需结合可用实例判断。"
          : "Resource-allocation graph: circles are processes P, rectangles are resources R (dots = instances). P→R is a request edge, R→P an assignment edge. A cycle is necessary for deadlock: with single instances a cycle means deadlock; with multiple instances a cycle only suggests it and available instances decide."}
      </Note>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "银行家算法" : "Banker's algorithm"}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color: "#4338ca" }}>{`Work = ${fmt(work)}`}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#64748b" }}>{`Finish = [${finish.map((f) => (f ? "T" : "F")).join(", ")}]`}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#047857" }}>{`${zh ? "安全序列" : "seq"} = ${sequence.map((i) => "P" + i).join(" → ") || "—"}`}</span>
      </Row>
      <Table
        head={zh ? ["进程", "Max", "Allocation", "Need = Max - Allocation"] : ["Process", "Max", "Allocation", "Need = Max - Allocation"]}
        rows={rows}
      />
      {candidate !== null && candNeed && (
        <Note tone={s.ok ? "info" : "warn"}>
          {zh
            ? `试探 P${candidate}：Need = ${fmt(candNeed)}${s.ok ? " ≤ " : " ≰ "}Work = ${fmt(work)}`
            : `try P${candidate}: Need = ${fmt(candNeed)}${s.ok ? " <= " : " > "}Work = ${fmt(work)}`}
        </Note>
      )}
      {s.safe !== undefined && (s.safe ? (
        <Note>
          {zh
            ? `存在安全序列：${sequence.map((i) => "P" + i).join(" → ")}，系统处于安全状态。`
            : `Safe sequence: ${sequence.map((i) => "P" + i).join(" → ")} — the system is safe.`}
        </Note>
      ) : (
        <Note tone="warn">
          {zh
            ? `无法找到安全序列：剩余进程的 Need 均超过 Work（当前 Work 总量 ${over}），系统不安全，可能死锁，应推迟分配或抢占恢复。`
            : `No safe sequence: every remaining Need exceeds Work (total ${over}) — unsafe, may deadlock; delay allocation or recover by preemption.`}
        </Note>
      ))}
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$Need[i] = Max[i] - Allocation[i],\qquad Work' = Work + Allocation[i]$" />
      </div>
      {avail[0] === 3 && avail[1] === 3 && avail[2] === 2 && (
        <div style={{ textAlign: "center", fontSize: 14 }}>
          <MathText text="$安全序列：\ P_1 \to P_3 \to P_4 \to P_0 \to P_2$" />
        </div>
      )}
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  "critical-section": { title: T("临界区", "Critical Section"), Render: CriticalSectionRender, generate: csGenerate, code: CS_CODE },
  semaphore: { title: T("信号量", "Semaphore"), defaultConfig: SEM_DEFAULT, Controls: SemaphoreControls, Render: SemaphoreRender, generate: semGenerate, code: SEM_CODE },
  deadlock: { title: T("死锁", "Deadlock"), defaultConfig: BNK_DEFAULT, Controls: DeadlockControls, Render: DeadlockRender, generate: bnkGenerate, code: BNK_CODE },
};

export const { module: osSyncModule, GROUPS: osSyncGroups } = makeChapter<SubMode>({
  id: "os-sync",
  title: T("同步与并发", "Synchronization"),
  desc: T("临界区三条件与 Peterson 算法、信号量 P/V 与生产者-消费者、死锁四必要条件与银行家算法（安全序列）。", "Critical-section conditions & Peterson, P/V semaphores & producer-consumer, deadlock conditions & Banker's algorithm (safe sequence)."),
  tags: ["operating-system", "sync"],
  groups: [
    {
      label: "并发",
      opts: [
        { v: "critical-section", zh: "临界区", en: "Critical Section" },
        { v: "semaphore", zh: "信号量", en: "Semaphore" },
        { v: "deadlock", zh: "死锁", en: "Deadlock" },
      ],
    },
  ],
  subs: SUBS,
});
