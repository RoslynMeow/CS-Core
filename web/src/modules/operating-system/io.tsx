import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, NumField, TextField, Row, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第8章 I/O 与设备管理
//   对应 tex/OperatingSystem/chapters/io.tex
//   dma(轮询/中断/DMA) / disk-scheduling(磁盘调度)
// =====================================================================

type SubMode = "dma" | "disk-scheduling";

// ---------------------------------------------------------------------
// dma：轮询 / 中断 / DMA 逐帧对比
// ---------------------------------------------------------------------
type DmaMode = "poll" | "irq" | "dma";
type DmaScene = { mode: DmaMode; step: number; cpuBusy: boolean; done: boolean };

const DMA_N = 6;

const DMA_CODE = [
  T("配置设备：方向、内存地址、长度 $N$", "set up device: direction, memory address, length $N$"),
  T("while 传输未完成:", "while transfer not done:"),
  T("  等待设备就绪（轮询 / 中断）", "  wait until the device is ready (poll / IRQ)"),
  T("  搬运数据：CPU 逐字 或 DMA 成块", "  move data: CPU per word, or DMA per block"),
  T("结束时置状态位并发出完成中断", "at the end: set status and raise a completion IRQ"),
  T("对比 CPU 占用与中断次数", "compare CPU cost and interrupt count"),
];

function dmaGenerate(_config: any): Frame<DmaScene>[] {
  const frames: Frame<DmaScene>[] = [];
  const push = (line: number, zh: string, en: string, scene: DmaScene) =>
    frames.push({ line, caption: T(zh, en), scene });

  push(2, "轮询：CPU 反复读取状态寄存器直到设备就绪", "Polling: CPU spins on the status register until ready", { mode: "poll", step: 0, cpuBusy: true, done: false });
  for (let i = 1; i <= DMA_N; i++) {
    push(3, `轮询：CPU 搬运第 ${i}/${DMA_N} 个字（全程忙等）`, `Polling: CPU copies word ${i}/${DMA_N} (busy-wait all along)`, { mode: "poll", step: i, cpuBusy: true, done: false });
  }
  push(4, "轮询完成：CPU 占用接近 100%", "Polling done: CPU cost near 100%", { mode: "poll", step: DMA_N, cpuBusy: false, done: true });

  push(1, "中断：设备未就绪时 CPU 可先执行其它任务", "Interrupt: CPU runs other work while the device is not ready", { mode: "irq", step: 0, cpuBusy: false, done: false });
  for (let i = 1; i <= DMA_N; i++) {
    push(3, `中断：第 ${i} 次就绪中断，CPU 在 ISR 中搬运 1 个字`, `Interrupt: ${i}-th ready IRQ, CPU copies one word in the ISR`, { mode: "irq", step: i, cpuBusy: true, done: false });
    if (i < DMA_N) {
      push(2, "中断：搬运完毕，CPU 返回被打断的任务", "Interrupt: copy done, CPU resumes the interrupted task", { mode: "irq", step: i, cpuBusy: false, done: false });
    }
  }
  push(4, `中断完成：共 ${DMA_N} 次中断，CPU 仅在 ISR 内繁忙`, `Interrupt done: ${DMA_N} IRQs, CPU busy only in ISRs`, { mode: "irq", step: DMA_N, cpuBusy: false, done: true });

  push(0, "DMA：CPU 配置控制器（方向、内存地址、长度）", "DMA: CPU configures the controller (direction, address, length)", { mode: "dma", step: 0, cpuBusy: true, done: false });
  for (let i = 1; i <= DMA_N; i++) {
    push(3, `DMA：控制器直接把第 ${i}/${DMA_N} 个字写入内存，CPU 空闲`, `DMA: controller writes word ${i}/${DMA_N} to memory, CPU idle`, { mode: "dma", step: i, cpuBusy: false, done: false });
  }
  push(4, "DMA 完成中断：整块传完才打扰 CPU 一次", "DMA completion IRQ: CPU is disturbed once for the whole block", { mode: "dma", step: DMA_N, cpuBusy: true, done: true });
  return frames;
}

function DmaRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { mode: "poll", step: 0, cpuBusy: true, done: false }) as DmaScene;
  const meta: Record<DmaMode, { name: string; color: string; mover: string; cpu: string; use: string }> = {
    poll: { name: zh ? "轮询" : "Polling", color: "#ef4444", mover: zh ? "CPU 逐字搬运" : "CPU per word", cpu: "≈100%", use: zh ? "简单、低速设备" : "simple, slow devices" },
    irq: { name: zh ? "中断" : "Interrupt", color: "#f59e0b", mover: zh ? "CPU 在 ISR 中逐字搬运" : "CPU per word in ISR", cpu: zh ? "每字 1 次中断" : "1 IRQ/word", use: zh ? "中低速、事件随机" : "medium speed, random" },
    dma: { name: zh ? "DMA" : "DMA", color: "#10b981", mover: zh ? "DMA 控制器成块搬运" : "DMA controller per block", cpu: zh ? "仅初始化 / 结束" : "setup + end only", use: zh ? "高速成块（磁盘 / 网卡）" : "high-speed blocks (disk/NIC)" },
  };
  const m = meta[s.mode];
  const moved = Math.min(s.step, DMA_N);
  const rows: React.ReactNode[][] = (["poll", "irq", "dma"] as DmaMode[]).map((k) => {
    const mm = meta[k];
    return [(k === s.mode ? "▶ " : "") + mm.name, mm.mover, mm.cpu, mm.use];
  });
  return (
    <Panel>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {(["poll", "irq", "dma"] as DmaMode[]).map((k) => {
          const cur = k === s.mode;
          return (
            <span key={k} style={{ padding: "4px 14px", borderRadius: 999, fontSize: 13, fontWeight: 800, color: cur ? "#fff" : "#475569", background: cur ? meta[k].color : "#f1f5f9", border: `1px solid ${cur ? meta[k].color : "#e2e8f0"}` }}>
              {meta[k].name}
            </span>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontWeight: 800, color: "#3730a3" }}>{zh ? "设备" : "Device"}</div>
        <div style={{ color: m.color, fontWeight: 800 }}>
          {s.mode === "dma" ? (zh ? "→ DMA → 内存" : "→ DMA → Memory") : (zh ? "→ 经 CPU → 内存" : "→ via CPU → Memory")}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {Array.from({ length: DMA_N }, (_, i) => {
            const filled = i < moved;
            const cur = i === moved - 1;
            return (
              <div key={i} style={{ width: 26, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: filled ? m.color : "#f8fafc", color: filled ? "#fff" : "#94a3b8", border: `1px solid ${cur ? "#0f172a" : "#e2e8f0"}`, boxShadow: cur ? "0 0 0 2px rgba(15,23,42,.15)" : undefined }}>
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ padding: "3px 12px", borderRadius: 999, background: s.cpuBusy ? "#fee2e2" : "#dcfce7", color: s.cpuBusy ? "#b91c1c" : "#15803d", fontWeight: 800 }}>
          CPU: {s.cpuBusy ? (zh ? "忙" : "busy") : (zh ? "空闲 / 执行其它任务" : "idle / other work")}
        </span>
        <span style={{ color: "#334155", fontFamily: "ui-monospace, monospace" }}>
          {zh ? "已搬运" : "moved"} <b>{moved}/{DMA_N}</b> {zh ? "个字" : "words"}
        </span>
        {s.done && <span style={{ color: "#15803d", fontWeight: 800 }}>{zh ? "✓ 完成" : "✓ done"}</span>}
      </div>
      <Table
        head={zh ? ["方式", "数据搬运者", "CPU 占用", "适用场景"] : ["Mode", "Data mover", "CPU cost", "Use case"]}
        rows={rows}
      />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T_{DMA} = T_{setup} + \\dfrac{N}{BW} + T_{int}$" />
      </div>
      <Note>
        {zh
          ? "轮询用 CPU 时间换硬件简单性；中断消除了忙等，但每字一次中断开销随数据量线性增长；DMA 让控制器直接成块搬运，固定开销被摊薄，适合磁盘、网卡等高速成块传输。"
          : "Polling trades CPU time for simple hardware; interrupts remove busy-waiting but cost one IRQ per word; DMA lets the controller move whole blocks, amortizing fixed cost—ideal for disks and NICs."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// disk-scheduling
// ---------------------------------------------------------------------
function parseReq(s: string): number[] {
  return s
    .split(/[\s,，、;；]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.round(n));
}

function movement(order: number[], head: number): number {
  let pos = head;
  let total = 0;
  for (const r of order) {
    total += Math.abs(r - pos);
    pos = r;
  }
  return total;
}

function fcfs(req: number[], head: number): { order: number[]; total: number } {
  return { order: [...req], total: movement(req, head) };
}

function sstf(req: number[], head: number): { order: number[]; total: number } {
  const rem = [...req];
  const order: number[] = [];
  let pos = head;
  let total = 0;
  while (rem.length > 0) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = Math.abs(rem[i] - pos);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const r = rem.splice(bi, 1)[0];
    total += bd;
    pos = r;
    order.push(r);
  }
  return { order, total };
}

// SCAN / C-SCAN：初始方向取磁道号增大方向；折返点取该方向最外侧的请求磁道。
function scan(req: number[], head: number): { order: number[]; total: number } {
  const up = req.filter((r) => r >= head).sort((a, b) => a - b);
  const down = req.filter((r) => r < head).sort((a, b) => b - a);
  const order = [...up, ...down];
  return { order, total: movement(order, head) };
}

function cscan(req: number[], head: number): { order: number[]; total: number } {
  const up = req.filter((r) => r >= head).sort((a, b) => a - b);
  const down = req.filter((r) => r < head).sort((a, b) => a - b);
  const order: number[] = [];
  let pos = head;
  let total = 0;
  for (const r of up) {
    total += Math.abs(r - pos);
    pos = r;
    order.push(r);
  }
  if (down.length > 0) {
    const lowest = down[0];
    total += Math.abs(pos - lowest);
    pos = lowest;
    for (const r of down) {
      total += Math.abs(r - pos);
      pos = r;
      order.push(r);
    }
  }
  return { order, total };
}

const DISK_ALGOS = ["FCFS", "SSTF", "SCAN", "C-SCAN"] as const;
const DISK_DEFAULT = { requests: "98,183,37,122,14,124,65,67", head: 53, algo: "FCFS" };
const DISK_ALGO_FN: Record<string, (req: number[], head: number) => { order: number[]; total: number }> = {
  FCFS: fcfs,
  SSTF: sstf,
  SCAN: scan,
  "C-SCAN": cscan,
};
function DiskControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <TextField
        label={zh ? "请求序列" : "Requests"}
        value={String(config.requests ?? "")}
        onChange={(v) => set({ requests: v })}
        width={280}
        placeholder="98,183,37,122,14,124,65,67"
      />
      <NumField
        label={zh ? "初始磁头" : "Head"}
        value={Number(config.head) || 0}
        onChange={(v) => set({ head: v })}
        min={0}
        max={100000}
        width={90}
      />
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "算法" : "Algorithm"}</span>
        <select className="txt" value={String(config.algo ?? "FCFS")} onChange={(e) => set({ algo: e.target.value })} style={{ fontWeight: 700 }}>
          {DISK_ALGOS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </label>
    </Row>
  );
}
type DiskScene = { algo: string; order: number[]; pos: number; total: number; idx: number };

const DISK_CODE = [
  T("读取请求磁道序列与初始磁头位置", "read the request queue and initial head position"),
  T("按算法选择下一个服务磁道 $r$", "pick the next track $r$ by the algorithm"),
  T("移动磁头：$\\text{total} \\gets \\text{total} + |r - pos|$", "move head: $total \\gets total + |r - pos|$"),
  T("服务请求 $r$，更新 $pos \\gets r$", "serve $r$; update $pos \\gets r$"),
  T("重复直到请求队列为空", "repeat until the request queue is empty"),
  T("返回总寻道长度 $\\text{total}$", "return the total seek length $total$"),
];

function diskGenerate(config: any): Frame<DiskScene>[] {
  const req = parseReq(String(config.requests ?? ""));
  const head = Number(config.head) || 0;
  const algo = DISK_ALGO_FN[String(config.algo)] ? String(config.algo) : "FCFS";
  const { order } = DISK_ALGO_FN[algo](req, head);
  const frames: Frame<DiskScene>[] = [
    { line: 0, caption: T(`初始磁头在磁道 $${head}$，按 ${algo} 调度`, `head at track $${head}$, schedule by ${algo}`), scene: { algo, order, pos: head, total: 0, idx: -1 } },
  ];
  let pos = head;
  let total = 0;
  order.forEach((r, k) => {
    const d = Math.abs(r - pos);
    total += d;
    frames.push({ line: 2, caption: T(`服务磁道 $${r}$：移动 $${d}$，累计寻道 $${total}$`, `serve track $${r}$: move $${d}$, running total $${total}$`), scene: { algo, order, pos: r, total, idx: k } });
    pos = r;
  });
  frames.push({ line: 5, caption: T(`请求处理完毕，总寻道长度 $${total}$`, `all requests served, total seek length $${total}$`), scene: { algo, order, pos, total, idx: order.length } });
  return frames;
}

function DiskRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? null) as DiskScene | null;
  const req = parseReq(String(config?.requests ?? ""));
  const head = Number(config?.head) || 0;
  const algo = s?.algo ?? (DISK_ALGO_FN[String(config?.algo)] ? String(config?.algo) : "FCFS");
  const order = s?.order ?? DISK_ALGO_FN[algo](req, head).order;
  const pos = s?.pos ?? head;
  const total = s?.total ?? 0;
  const idx = s?.idx ?? -1;
  const algos: { name: string; res: { order: number[]; total: number } }[] = DISK_ALGOS.map((name) => ({ name, res: DISK_ALGO_FN[name](req, head) }));
  const best = algos.reduce((a, b) => (b.res.total < a.res.total ? b : a), algos[0]).name;
  const rows: React.ReactNode[][] = algos.map((a) => [
    (a.name === algo ? "▶ " : "") + a.name + (a.name === best ? " ★" : ""),
    a.res.order.length ? a.res.order.join(" → ") : (zh ? "（无请求）" : "(empty)"),
    `${a.res.total}`,
    a.name === best ? (zh ? "最短寻道" : "shortest") : "",
  ]);

  const marks = req.length ? req : [head];
  const lo = Math.min(head, ...marks);
  const hi = Math.max(head, ...marks);
  const span = Math.max(1, hi - lo);
  const at = (v: number) => `${((v - lo) / span) * 100}%`;

  return (
    <Panel>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", fontSize: 13, fontFamily: "ui-monospace, monospace", color: "#334155" }}>
        <span>{zh ? "算法" : "Algo"} = <b style={{ color: "#4338ca" }}>{algo}</b></span>
        <span>{zh ? "磁头" : "Head"} = <b style={{ color: "#0f172a" }}>{pos}</b></span>
        <span>{zh ? "累计寻道" : "Seek so far"} = <b style={{ color: "#b45309" }}>{total}</b></span>
        <span>{zh ? "已服务" : "Served"} = <b>{Math.max(idx + 1, 0)}/{order.length}</b></span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ position: "relative", height: 54, margin: "0 8px" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 28, height: 2, background: "#cbd5e1", borderRadius: 2 }} />
          {req.map((r, i) => (
            <div key={i} style={{ position: "absolute", left: at(r), top: 20, transform: "translateX(-50%)" }}>
              <div style={{ width: 2, height: 18, background: "#94a3b8", margin: "0 auto" }} />
              <div style={{ fontSize: 10, color: "#64748b", textAlign: "center" }}>{r}</div>
            </div>
          ))}
          <div style={{ position: "absolute", left: at(head), top: 34, transform: "translateX(-50%)", fontSize: 10, color: "#94a3b8" }}>
            {zh ? "起点" : "start"}
          </div>
          <div style={{ position: "absolute", left: at(pos), top: 0, transform: "translateX(-50%)", background: "#4338ca", color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
            {zh ? "磁头" : "head"} {pos}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {order.length === 0
            ? <span style={{ color: "#94a3b8", fontSize: 12 }}>{zh ? "（无请求）" : "(no requests)"}</span>
            : order.map((r, k) => {
              const served = k <= idx;
              const cur = k === idx;
              return (
                <span key={k} style={{ padding: "2px 9px", borderRadius: 999, fontSize: 12, fontFamily: "ui-monospace, monospace", fontWeight: 700, background: cur ? "#4338ca" : served ? "#eef2ff" : "#f8fafc", color: cur ? "#fff" : served ? "#4338ca" : "#94a3b8", border: `1px solid ${cur ? "#4338ca" : "#e2e8f0"}` }}>{r}</span>
              );
            })}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T_{access} = T_{seek} + T_{rotation} + T_{transfer}$" />
      </div>
      <Table
        head={zh ? ["算法", "服务顺序", "寻道长度", "评价"] : ["Algorithm", "Service order", "Seek length", "Verdict"]}
        rows={rows}
      />
      <Note tone={best === "SSTF" ? "warn" : "info"}>
        {zh
          ? `FCFS 按到达顺序，公平但寻道大；SSTF 每步选最近请求，本例最短（${algos[1].res.total}）但可能饿死远端请求；SCAN 单方向扫到底再反向；C-SCAN 单方向扫到底后折返另一端，等待更均匀。约定：初始方向取磁道号增大方向，折返点取该方向最外侧的请求磁道。`
          : `FCFS serves arrivals in order—fair but long seeks; SSTF picks the nearest request each step, shortest here (${algos[1].res.total}) but may starve far requests; SCAN sweeps one way to the end then reverses; C-SCAN returns to the other end after a one-way sweep for uniform waiting. Convention: initial direction is increasing track, turnaround at the outermost requested track.`}
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  dma: { title: T("轮询/中断/DMA", "Poll/IRQ/DMA"), Render: DmaRender, generate: dmaGenerate, code: DMA_CODE },
  "disk-scheduling": {
    title: T("磁盘调度", "Disk Scheduling"),
    defaultConfig: DISK_DEFAULT,
    Controls: DiskControls,
    Render: DiskRender,
    generate: diskGenerate,
    code: DISK_CODE,
  },
};

export const { module: osIoModule, GROUPS: osIoGroups } = makeChapter<SubMode>({
  id: "os-io",
  title: T("I/O 与设备", "I/O & Devices"),
  desc: T("轮询/中断/DMA 对比、磁盘结构与调度（FCFS/SSTF/SCAN/C-SCAN 寻道长度计算）。", "Polling/IRQ/DMA comparison, disk structure & scheduling (FCFS/SSTF/SCAN/C-SCAN seek length)."),
  tags: ["operating-system", "io"],
  groups: [
    {
      label: "I/O",
      opts: [
        { v: "dma", zh: "轮询/中断/DMA", en: "Poll/IRQ/DMA" },
        { v: "disk-scheduling", zh: "磁盘调度", en: "Disk Scheduling" },
      ],
    },
  ],
  subs: SUBS,
});
