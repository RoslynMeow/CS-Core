import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, NumField, TextField, Row, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 虚拟内存
//   demand-paging(按需分页与缺页处理) / page-replacement(FIFO/LRU/OPT)
//   对应 tex/OperatingSystem/chapters/virtual_memory.tex
// =====================================================================

type SubMode = "demand-paging" | "page-replacement";

// ------------------------------ 按需分页 ------------------------------

const DP_REF = 3;
const DP_FRAMES = 3;

type DpPte = { vpn: number; frame: number | null; valid: boolean; dirty: boolean };
type DpScene = { step: number; victim: number | null; pageTable: DpPte[] };

const DP_CODE = [
  T("$ref \\gets (p, d)$：CPU 访问逻辑地址", "$ref \\gets (p, d)$: CPU references a logical address"),
  T("if $PTE[p].valid = 0$：$\\text{trap}$ 缺页异常", "if $PTE[p].valid = 0$: $\\text{trap}$ page fault"),
  T("$victim \\gets \\text{select}(\\text{algo})$：选牺牲页", "$victim \\gets \\text{select}(\\text{algo})$: pick a victim"),
  T("$\\text{load}(p) \\to frame(victim)$（脏页先写回）", "$\\text{load}(p) \\to frame(victim)$ (write back if dirty)"),
  T("$PTE[p] \\gets (frame, valid=1)$；刷新 TLB", "$PTE[p] \\gets (frame, valid=1)$; flush TLB"),
  T("restart：重新执行该指令", "restart the faulting instruction"),
];

function dpInit(): DpPte[] {
  return [
    { vpn: 0, frame: 0, valid: true, dirty: true },
    { vpn: 1, frame: 1, valid: true, dirty: false },
    { vpn: 2, frame: 2, valid: true, dirty: false },
    { vpn: 3, frame: null, valid: false, dirty: false },
    { vpn: 4, frame: null, valid: false, dirty: false },
  ];
}

function demandPagingGenerate(_config: any): Frame<DpScene>[] {
  const clone = (pt: DpPte[]) => pt.map((p) => ({ ...p }));
  const before = dpInit();
  const after = before.map((p) => {
    if (p.vpn === 0) return { vpn: 0, frame: null, valid: false, dirty: false };
    if (p.vpn === DP_REF) return { vpn: DP_REF, frame: 0, valid: true, dirty: false };
    return { ...p };
  });
  return [
    { line: 0, caption: T(`CPU 访问页 $p=${DP_REF}$（逻辑地址 $(p, d)$）`, `CPU references page $p=${DP_REF}$ (logical address $(p, d)$)`), scene: { step: 0, victim: null, pageTable: clone(before) } },
    { line: 1, caption: T(`MMU 查页表：$PTE[${DP_REF}].valid = 0$ → 触发缺页异常，陷入内核`, `MMU checks PTE: $PTE[${DP_REF}].valid = 0$ → page fault traps into the kernel`), scene: { step: 1, victim: null, pageTable: clone(before) } },
    { line: 1, caption: T(`缺页处理程序确认页 $${DP_REF}$ 不在内存且访问合法`, `Handler confirms page $${DP_REF}$ is not resident and the access is legal`), scene: { step: 2, victim: null, pageTable: clone(before) } },
    { line: 2, caption: T(`无空闲帧，按置换算法选中牺牲页 $victim = 0$（脏页，需写回）`, `No free frame: pick $victim = 0$ (dirty, needs write-back)`), scene: { step: 3, victim: 0, pageTable: clone(before) } },
    { line: 3, caption: T(`将页 $${DP_REF}$ 从磁盘读入帧 $0$（先写回脏页 $0$）`, `Load page $${DP_REF}$ from disk into frame $0$ (write back dirty page $0$ first)`), scene: { step: 4, victim: 0, pageTable: clone(before) } },
    { line: 4, caption: T(`更新页表：$PTE[${DP_REF}] \\gets (frame=0, valid=1)$，$PTE[0].valid = 0$，刷新 TLB`, `Update PTE: $PTE[${DP_REF}] \\gets (frame=0, valid=1)$, $PTE[0].valid = 0$, flush TLB`), scene: { step: 5, victim: 0, pageTable: clone(after) } },
    { line: 5, caption: T(`恢复现场，重新执行触发缺页的指令，此时命中`, `Restore context and re-execute the faulting instruction — now a hit`), scene: { step: 6, victim: 0, pageTable: clone(after) } },
  ];
}

function DemandPagingRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, victim: null, pageTable: [] }) as DpScene;
  const stepDefs: [string, string][] = zh
    ? [
      ["① CPU 引用页", "指令访问逻辑地址，交给 MMU 翻译。"],
      ["② trap 陷入", "有效位为 0，硬件触发缺页异常，切换到内核态。"],
      ["③ 查页表判缺页", "算出页号、校验访问合法性，判定该页不在内存。"],
      ["④ 选择牺牲页", "无空闲帧时按置换算法选 victim，脏页需先写回。"],
      ["⑤ 从磁盘调入", "把缺页从磁盘/交换区读入选定的帧。"],
      ["⑥ 更新页表", "写回帧号、置有效位，并刷新 TLB 对应项。"],
      ["⑦ 重新执行", "恢复现场返回用户态，重执行该指令，此次命中。"],
    ]
    : [
      ["① Reference", "Instruction touches a logical address; MMU translates it."],
      ["② trap", "Valid bit = 0 → a page fault traps into the kernel."],
      ["③ Check PTE", "Compute the page number, validate the access, confirm it is not resident."],
      ["④ Pick victim", "With no free frame, select a victim (write back if dirty)."],
      ["⑤ Page in", "Read the missing page from disk/swap into the chosen frame."],
      ["⑥ Update PTE", "Set the frame number and valid bit, and flush the TLB entry."],
      ["⑦ Re-execute", "Restore context and re-run the instruction, which now hits."],
    ];
  const frameSlots = Array.from({ length: DP_FRAMES }, (_, f) => ({ f, pte: s.pageTable.find((p) => p.valid && p.frame === f) ?? null }));
  const ptRows: React.ReactNode[][] = s.pageTable.map((p) => {
    const isRef = p.vpn === DP_REF;
    const isVictim = s.victim === p.vpn && s.step >= 3 && s.step <= 4;
    const tone = isVictim ? "#dc2626" : isRef ? "#4338ca" : "#0f172a";
    return [
      <b key="p" style={{ color: tone }}>{p.vpn}{isRef ? (zh ? " ← 缺页" : " ← fault") : ""}</b>,
      p.frame === null ? "—" : String(p.frame),
      <span key="v" style={{ color: p.valid ? "#16a34a" : "#dc2626", fontWeight: 700 }}>{p.valid ? "1" : "0"}</span>,
      <span key="d" style={{ color: p.dirty ? "#b45309" : "#94a3b8" }}>{p.dirty ? "1" : "0"}</span>,
    ];
  });
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={zh ? "$\\text{页号 } p \\;\\|\\; \\text{偏移 } d \\;\\to\\; \\text{帧号 } f \\;\\|\\; d$" : "$p \\;\\|\\; d \\;\\to\\; f \\;\\|\\; d$"} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {stepDefs.map(([a, b], i) => {
          const cur = i === s.step;
          return (
            <div key={a} style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= s.step ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 108, flexShrink: 0 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{zh ? `物理帧（共 ${DP_FRAMES} 个）` : `Physical frames (${DP_FRAMES})`}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {frameSlots.map(({ f, pte }) => {
              const victim = s.victim !== null && pte?.vpn === s.victim && s.step >= 3 && s.step <= 4;
              const fresh = s.step >= 5 && pte?.vpn === DP_REF;
              const bg = victim ? "#fef2f2" : fresh ? "#ecfdf5" : "#f8fafc";
              const bd = victim ? "#fecaca" : fresh ? "#a7f3d0" : "#e2e8f0";
              return (
                <div key={f} style={{ flex: "1 1 72px", minWidth: 72, padding: "8px 10px", borderRadius: 10, textAlign: "center", background: bg, border: `2px solid ${bd}`, fontFamily: "ui-monospace, monospace" }}>
                  <div style={{ fontSize: 11, color: "#64748b" }}>F{f}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: victim ? "#dc2626" : fresh ? "#047857" : "#1e293b" }}>{pte ? pte.vpn : "—"}</div>
                  <div style={{ fontSize: 10, color: victim ? "#dc2626" : fresh ? "#047857" : "#94a3b8" }}>{victim ? (zh ? "牺牲页" : "victim") : fresh ? (zh ? "新装入" : "loaded") : pte ? (zh ? "驻留" : "resident") : (zh ? "空闲" : "free")}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", padding: "6px 10px", borderRadius: 8, background: "#0f172a", color: "#e2e8f0", textAlign: "center" }}>
            {zh ? "磁盘/交换区" : "disk/swap"}：{zh ? "页" : "page"} {DP_REF}{s.step >= 5 ? (zh ? "（已调入）" : " (loaded)") : s.step >= 3 ? (zh ? " → 帧 0" : " → frame 0") : ""}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{zh ? "页表" : "Page table"}</div>
          <Table head={zh ? ["页号", "帧号", "有效位", "脏位"] : ["vpn", "frame", "valid", "dirty"]} rows={ptRows} />
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 15 }}>
        <MathText text="$EAT = (1-p)\\,t_{mem} + p\\,t_{fault}$" />
      </div>
      <Note>{zh ? "缺页代价比内存访问高约 4 个数量级；缺页率 p 稍有上升，EAT 就急剧恶化，因此需要置换算法与工作集管理。" : "A fault costs ~10^4x a memory access, so even a small fault rate p wrecks EAT."}</Note>
    </Panel>
  );
}

// ------------------------------ 页面置换 ------------------------------

const REF_DEFAULT = "7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1";
const PR_DEFAULT = { refStr: REF_DEFAULT, frames: 3 };

type SimStep = { page: number; frame: number[]; hit: boolean; evicted: number | null };
type SimResult = { faults: number; steps: SimStep[] };
type PrScene = { i: number; ref: number[]; frames: number[]; fault: boolean; faults: number; algo: string };

function parseRef(s: string): number[] {
  return s.split(/[^0-9]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x));
}

function fifo(ref: number[], F: number): SimResult {
  const frame: number[] = [];
  const queue: number[] = [];
  const steps: SimStep[] = [];
  let faults = 0;
  for (const p of ref) {
    const hit = frame.indexOf(p) >= 0;
    let evicted: number | null = null;
    if (!hit) {
      faults++;
      if (frame.length < F) {
        frame.push(p);
        queue.push(p);
      } else {
        evicted = queue.shift() as number;
        frame[frame.indexOf(evicted)] = p;
        queue.push(p);
      }
    }
    steps.push({ page: p, frame: frame.slice(), hit, evicted });
  }
  return { faults, steps };
}

function lru(ref: number[], F: number): SimResult {
  const frame: number[] = [];
  const order: number[] = [];
  const steps: SimStep[] = [];
  let faults = 0;
  for (const p of ref) {
    const hit = frame.indexOf(p) >= 0;
    const oi = order.indexOf(p);
    if (oi >= 0) order.splice(oi, 1);
    let evicted: number | null = null;
    if (!hit) {
      faults++;
      if (frame.length < F) {
        frame.push(p);
      } else {
        evicted = order.shift() as number;
        frame[frame.indexOf(evicted)] = p;
      }
    }
    order.push(p);
    steps.push({ page: p, frame: frame.slice(), hit, evicted });
  }
  return { faults, steps };
}

function opt(ref: number[], F: number): SimResult {
  const frame: number[] = [];
  const steps: SimStep[] = [];
  let faults = 0;
  for (let k = 0; k < ref.length; k++) {
    const p = ref[k];
    const hit = frame.indexOf(p) >= 0;
    let evicted: number | null = null;
    if (!hit) {
      faults++;
      if (frame.length < F) {
        frame.push(p);
      } else {
        let far = -1;
        let victim = 0;
        for (let i = 0; i < frame.length; i++) {
          const nxt = ref.indexOf(frame[i], k + 1);
          const dist = nxt === -1 ? Infinity : nxt;
          if (dist > far) {
            far = dist;
            victim = i;
          }
        }
        evicted = frame[victim];
        frame[victim] = p;
      }
    }
    steps.push({ page: p, frame: frame.slice(), hit, evicted });
  }
  return { faults, steps };
}

function TraceTable({ label, res, frames, zh }: { label: string; res: SimResult; frames: number; zh: boolean }) {
  const head = [
    zh ? "步" : "#",
    zh ? "访问" : "ref",
    ...Array.from({ length: frames }, (_, i) => `F${i + 1}`),
    zh ? "结果" : "result",
  ];
  const rows: React.ReactNode[][] = res.steps.map((s, i) => {
    const cells: React.ReactNode[] = [];
    for (let f = 0; f < frames; f++) cells.push(f < s.frame.length ? s.frame[f] : "—");
    return [
      String(i + 1),
      <span key="p" style={{ fontWeight: 700 }}>{s.page}</span>,
      ...cells,
      s.hit
        ? <span key="r" style={{ color: "#16a34a" }}>{zh ? "命中" : "hit"}</span>
        : <span key="r" style={{ color: "#dc2626" }}>{s.evicted !== null ? (zh ? `缺页·换出 ${s.evicted}` : `fault·evict ${s.evicted}`) : (zh ? "缺页" : "fault")}</span>,
    ];
  });
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{label}</div>
      <Table head={head} rows={rows} />
    </div>
  );
}

function ReplacementControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <TextField label={zh ? "引用串" : "Reference string"} value={config.refStr} onChange={(v) => set({ refStr: v })} width={330} placeholder="7,0,1,2,0,3,..." />
      <NumField label={zh ? "帧数" : "Frames"} value={config.frames} onChange={(v) => set({ frames: v })} min={1} max={8} width={64} />
    </Row>
  );
}

function ReplacementRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as PrScene;
  const ref = Array.isArray(s.ref) ? s.ref : [];
  const slots = Array.isArray(s.frames) ? s.frames : [];
  const F = Math.max(1, slots.length);
  const algo = s.algo ?? "FIFO";
  const results: { name: string; res: SimResult; tone: string }[] = [
    { name: "FIFO", res: fifo(ref, F), tone: "#7c3aed" },
    { name: "LRU", res: lru(ref, F), tone: "#2563eb" },
    { name: "OPT", res: opt(ref, F), tone: "#059669" },
  ];
  const N = Math.max(1, ref.length);
  const best = Math.min(...results.map((r) => r.res.faults));
  const compRows: React.ReactNode[][] = results.map((r) => [
    <span key="n" style={{ color: r.tone, fontWeight: r.name === algo ? 900 : 800 }}>{r.name}{r.name === algo ? " ◀" : ""}</span>,
    r.res.faults,
    `${((r.res.faults / N) * 100).toFixed(1)}%`,
    r.res.faults === best ? (zh ? "最少 ✓" : "fewest ✓") : `+${r.res.faults - best}`,
  ]);
  const cur = results.find((r) => r.name === algo);
  const curRes: SimResult = { faults: s.faults ?? 0, steps: cur ? cur.res.steps.slice(0, s.i + 1) : [] };
  return (
    <Panel>
      <Row>
        <span style={{ fontWeight: 900, color: "#4338ca", fontSize: 15 }}>{algo}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? "第" : "step"} {ref.length ? s.i + 1 : 0}/{ref.length}{zh ? " 次访问" : ""}</span>
        <span style={{ fontWeight: 800, color: s.fault ? "#dc2626" : "#16a34a" }}>{s.fault ? (zh ? "缺页 fault" : "FAULT") : (zh ? "命中 hit" : "HIT")}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? "缺页累计" : "faults so far"} <b style={{ color: "#1e293b" }}>{s.faults}</b></span>
      </Row>
      <div style={{ fontSize: 13, color: "#475569", fontFamily: "ui-monospace, monospace", textAlign: "center", wordBreak: "break-word" }}>
        {zh ? "引用串：" : "Reference: "}
        {ref.length === 0
          ? (zh ? "（空）" : "(empty)")
          : ref.map((p, k) => {
            const on = k === s.i;
            const seen = k < s.i;
            const fault = on && s.fault;
            return (
              <span key={k} style={{ display: "inline-block", minWidth: 18, margin: "0 1px", padding: "1px 4px", borderRadius: 5, background: on ? (fault ? "#fee2e2" : "#dcfce7") : seen ? "#f1f5f9" : "transparent", color: on ? (fault ? "#dc2626" : "#16a34a") : seen ? "#64748b" : "#94a3b8", fontWeight: on ? 900 : 500 }}>{p}</span>
            );
          })}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {slots.map((v, f) => (
          <div key={f} style={{ minWidth: 60, padding: "8px 10px", borderRadius: 10, textAlign: "center", background: "#f8fafc", border: "2px solid #e2e8f0", fontFamily: "ui-monospace, monospace" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>F{f + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: v < 0 ? "#cbd5e1" : "#1e293b" }}>{v < 0 ? "—" : v}</div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={zh ? "$p = \\frac{F}{N}$（缺页率 = 缺页次数 / 访问次数）" : "$p = \\frac{F}{N}$"} />
      </div>
      <Table
        head={zh ? ["算法", "缺页次数", "缺页率", "对比"] : ["Algo", "Faults", "Rate", "vs"]}
        rows={compRows}
      />
      <Note tone="info">
        {zh
          ? `当前算法 ${algo} 已完成 ${ref.length ? s.i + 1 : 0} 次访问，累计缺页 ${s.faults} 次。OPT 是理论下界；LRU 用最近使用历史逼近它；FIFO 简单但可能退化。`
          : `Algorithm ${algo}: ${ref.length ? s.i + 1 : 0} access(es) done, ${s.faults} fault(s) so far. OPT is the lower bound; LRU approximates it; FIFO is simple but can degrade.`}
      </Note>
      <TraceTable label={`${algo} · ${zh ? "缺页" : "faults"} ${s.faults}`} res={curRes} frames={F} zh={zh} />
    </Panel>
  );
}

const PR_CODE = [
  T("读取引用串 $ref$，配置帧数 $F$", "Read reference string $ref$, set frames $F$"),
  T("for each page $p$ in $ref$：", "for each page $p$ in $ref$:"),
  T("  if $p \\in frames$：命中 hit，不改帧", "  if $p \\in frames$: hit, frames unchanged"),
  T("  else：缺页 fault，缺页计数 $+1$", "  else: fault, fault count $+1$"),
  T("    有空闲帧：放入空闲帧", "    free frame: load into it"),
  T("    否则按 algo 选牺牲页换出后装入", "    else evict a victim by algo, then load"),
];

function replacementGenerate(config: any): Frame<PrScene>[] {
  const F = Math.max(1, Math.floor(Number(config.frames) || 1));
  const ref = parseRef(String(config.refStr ?? ""));
  if (ref.length === 0) {
    return [{ line: 0, caption: T("请输入合法的引用串（数字用逗号分隔）", "Enter a valid reference string (numbers separated by commas)"), scene: { i: 0, ref: [], frames: Array(F).fill(-1), fault: false, faults: 0, algo: "FIFO" } }];
  }
  const algos: { name: string; res: SimResult }[] = [
    { name: "FIFO", res: fifo(ref, F) },
    { name: "LRU", res: lru(ref, F) },
    { name: "OPT", res: opt(ref, F) },
  ];
  const frames: Frame<PrScene>[] = [];
  for (const { name, res } of algos) {
    let run = 0;
    res.steps.forEach((st, k) => {
      if (!st.hit) run += 1;
      const padded = st.frame.concat(Array(Math.max(0, F - st.frame.length)).fill(-1));
      const line = st.hit ? 2 : st.evicted !== null ? 5 : 4;
      const caption = st.hit
        ? T(`$\\text{${name}}$：访问 $${st.page}$ → 命中，缺页累计 $${run}$`, `$\\text{${name}}$: reference $${st.page}$ → hit, faults so far $${run}$`)
        : st.evicted !== null
          ? T(`$\\text{${name}}$：访问 $${st.page}$ → 缺页，换出 $${st.evicted}$，缺页累计 $${run}$`, `$\\text{${name}}$: reference $${st.page}$ → fault, evict $${st.evicted}$, faults so far $${run}$`)
          : T(`$\\text{${name}}$：访问 $${st.page}$ → 缺页，装入空闲帧，缺页累计 $${run}$`, `$\\text{${name}}$: reference $${st.page}$ → fault, load a free frame, faults so far $${run}$`);
      frames.push({ line, caption, scene: { i: k, ref, frames: padded, fault: !st.hit, faults: run, algo: name } });
    });
  }
  return frames;
}

const SUBS: Record<SubMode, SubDef> = {
  "demand-paging": { title: T("按需分页", "Demand Paging"), Render: DemandPagingRender, generate: demandPagingGenerate, code: DP_CODE },
  "page-replacement": { title: T("页面置换", "Replacement"), defaultConfig: PR_DEFAULT, Controls: ReplacementControls, Render: ReplacementRender, generate: replacementGenerate, code: PR_CODE },
};

export const { module: osVmModule, GROUPS: osVmGroups } = makeChapter<SubMode>({
  id: "os-vm",
  title: T("虚拟内存", "Virtual Memory"),
  desc: T("按需分页与缺页处理、FIFO/LRU/OPT 页面置换（引用串模拟）、Belady 异常、抖动与工作集模型。", "Demand paging & page-fault handling, FIFO/LRU/OPT replacement with reference-string simulation, Belady's anomaly, thrashing and the working-set model."),
  tags: ["operating-system", "vm"],
  groups: [{
    label: "虚拟内存", opts: [
      { v: "demand-paging", zh: "按需分页", en: "Demand Paging" },
      { v: "page-replacement", zh: "页面置换", en: "Replacement" },
    ],
  }],
  subs: SUBS,
});
