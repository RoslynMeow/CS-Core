import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第7章 文件系统
//   对应 tex/OperatingSystem/chapters/filesystem.tex
//   inode(逐帧索引解析) / allocation(逐帧分配对比)
//   free-space(静态) / journaling(逐帧日志与崩溃恢复)
// =====================================================================

type SubMode = "inode" | "allocation" | "free-space" | "journaling";

function fmtBytes(n: number): string {
  const u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let v = n || 0;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  const dec = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(dec)} ${u[i]}`;
}

// 用户驱动「状态 / 数值」面板：展示当前步取值，并提供推进按钮
function StepPanel({ title, rows, onNext, nextLabel, showNext }: {
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
// inode 与多级索引（逐帧解析目标块）
// ---------------------------------------------------------------------
const INODE_DEFAULT = { blockSize: 4096, direct: 12, ptrSize: 4 };

function InodeControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "块大小" : "Block size"} value={config.blockSize} onChange={(v) => set({ blockSize: v })} min={512} max={65536} step={512} width={96} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>B</span>
      <NumField label={zh ? "直接指针数" : "Direct ptrs"} value={config.direct} onChange={(v) => set({ direct: v })} min={0} max={48} width={80} />
      <NumField label={zh ? "指针大小" : "Ptr size"} value={config.ptrSize} onChange={(v) => set({ ptrSize: v })} min={1} max={16} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>B</span>
    </div>
  );
}

function BlockStrip({ n, color, label }: { n: number; color: string; label: string }) {
  const shown = Math.max(1, Math.min(Math.max(1, Math.round(n)), 8));
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", gap: 2, justifyContent: "center", alignItems: "center" }}>
        {Array.from({ length: shown }).map((_, i) => (
          <div key={i} style={{ width: 12, height: 16, borderRadius: 3, background: color, border: "1px solid #cbd5e1" }} />
        ))}
        {n > shown && <span style={{ fontSize: 11, color: "#94a3b8" }}>…</span>}
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1, fontFamily: "ui-monospace, monospace" }}>
        {n >= 1e6 ? n.toExponential(1) : n}
      </div>
    </div>
  );
}

function Chain({ parts }: { parts: { label: string; count: number; color: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {parts.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BlockStrip n={p.count} color={p.color} label={p.label} />
          {i < parts.length - 1 && <span style={{ color: "#94a3b8", fontWeight: 800 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

type InodeScene = {
  offset: number;      // 目标数据块偏移（0 基）
  blockIndex: number;  // 命中的指针项序号
  level: number;       // 0 直接 / 1 一级 / 2 二级 / 3 三级（-1 未定）
  chain: string[];     // 指针链
  reads: number;       // 定位所需读盘次数
};

function inodeGeometry(config: any) {
  const b = Math.max(1, Number(config?.blockSize) || 4096);
  const ptr = Math.max(1, Number(config?.ptrSize) || 4);
  const d = Math.max(0, Number(config?.directCount ?? config?.direct) || 0);
  const p = Math.max(1, Math.floor(b / ptr));
  return { b, ptr, d, p, single: p, double: p * p, triple: p * p * p };
}

function inodeResolve(target: number, d: number, p: number) {
  const single = p;
  const dbl = p * p;
  if (target < d) return { level: 0, blockIndex: target, chain: [`inode.direct[${target}]`], reads: 1 };
  const q1 = target - d;
  if (q1 < single) return { level: 1, blockIndex: q1, chain: ["inode.single", `ptr[${q1}]`], reads: 2 };
  const q2 = q1 - single;
  if (q2 < dbl) {
    const i = Math.floor(q2 / p);
    const j = q2 % p;
    return { level: 2, blockIndex: q2, chain: ["inode.double", `ptr1[${i}]`, `ptr2[${j}]`], reads: 3 };
  }
  const q3 = q2 - dbl;
  return { level: 3, blockIndex: q3, chain: ["inode.triple", `ptr1[]`, `ptr2[]`, `ptr3[]`], reads: 4 };
}

function inodeGenerate(config: any): Frame<InodeScene>[] {
  const { d, p, double } = inodeGeometry(config);
  const target = d + p + Math.floor(p / 2);
  const r = inodeResolve(target, d, p);
  const frames: Frame<InodeScene>[] = [];
  frames.push({
    line: 0,
    caption: T(`目标数据块偏移 $q=${target}$，每块指针数 $p=\\lfloor b/s\\rfloor=${p}$`,
      `target block offset $q=${target}$, pointers per block $p=\\lfloor b/s\\rfloor=${p}$`),
    scene: { offset: target, blockIndex: target, level: -1, chain: [], reads: 0 },
  });
  if (r.level === 0) {
    frames.push({ line: 1, caption: T(`$q=${target}<d=${d}$：直接指针命中`, `$q=${target}<d=${d}$: direct pointer hit`), scene: { offset: target, blockIndex: r.blockIndex, level: 0, chain: r.chain, reads: r.reads } });
  } else {
    frames.push({ line: 1, caption: T(`$q=${target}\\ge d=${d}$：直接指针不足，继续查间接指针`, `$q=${target}\\ge d=${d}$: direct pointers insufficient, try indirection`), scene: { offset: target, blockIndex: target - d, level: 0, chain: [], reads: 0 } });
    if (r.level === 1) {
      frames.push({ line: 2, caption: T(`$q'=${target - d}<p=${p}$：一级间接命中`, `$q'=${target - d}<p=${p}$: 1-indirect hit`), scene: { offset: target, blockIndex: r.blockIndex, level: 1, chain: r.chain, reads: r.reads } });
    } else {
      frames.push({ line: 2, caption: T(`$q'=${target - d}\\ge p=${p}$：一级间接不足`, `$q'=${target - d}\\ge p=${p}$: 1-indirect insufficient`), scene: { offset: target, blockIndex: target - d - p, level: 1, chain: [], reads: 0 } });
      if (r.level === 2) {
        const i = Math.floor(r.blockIndex / p);
        const j = r.blockIndex % p;
        frames.push({ line: 3, caption: T(`$q''=${r.blockIndex}<p^2=${double}$：二级间接命中 $[${i}][${j}]$`, `$q''=${r.blockIndex}<p^2=${double}$: 2-indirect hit $[${i}][${j}]$`), scene: { offset: target, blockIndex: r.blockIndex, level: 2, chain: r.chain, reads: r.reads } });
      } else {
        frames.push({ line: 3, caption: T(`$q''\\ge p^2$：二级间接不足，需三级间接`, `$q''\\ge p^2$: 2-indirect insufficient, need triple`), scene: { offset: target, blockIndex: r.blockIndex, level: 3, chain: r.chain, reads: r.reads } });
      }
    }
  }
  frames.push({ line: 4, caption: T(`共 ${r.reads} 次读盘定位数据块（含 inode 与各级指针块）`, `total ${r.reads} disk reads to locate the data block (inode + pointer blocks)`), scene: { offset: target, blockIndex: r.blockIndex, level: r.level, chain: r.chain, reads: r.reads } });
  frames.push({ line: 5, caption: T(`数据块地址 $=\\text{base}+${r.blockIndex}\\,b$，返回给上层`, `data block address $=\\text{base}+${r.blockIndex}\\,b$, returned to caller`), scene: { offset: target, blockIndex: r.blockIndex, level: r.level, chain: r.chain, reads: r.reads } });
  return frames;
}

const INODE_CODE = [
  T("$q \\gets$ 目标块偏移, $p \\gets \\lfloor b/s \\rfloor$", "$q \\gets$ target offset, $p \\gets \\lfloor b/s \\rfloor$"),
  T("if $q < d$: 读 inode.direct[$q$]", "if $q < d$: read inode.direct[$q$]"),
  T("else if $q-d < p$: 经一级间接指针块", "else if $q-d < p$: via 1-indirect block"),
  T("else if $q-d-p < p^2$: 经二级间接指针块", "else if $q-d-p < p^2$: via 2-indirect blocks"),
  T("读取各级指针块后得到数据块地址", "resolve the data block address through pointer blocks"),
  T("return 数据块地址", "return data block address"),
];

function InodeRender({ scene, config, t, onNext, step: frameStep, count, playing }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<InodeScene>;
  const { b, ptr, d, p, single, double, triple } = inodeGeometry(config);
  const offset = sc.offset ?? 0;
  const level = sc.level ?? -1;
  const chain = sc.chain ?? [];
  const reads = sc.reads ?? 0;
  const canNext = !!onNext && !playing && (typeof frameStep !== "number" || typeof count !== "number" || frameStep < count - 1);
  const advance = (e: React.MouseEvent) => { e.stopPropagation(); if (canNext) onNext(); };
  const levelName = level < 0 ? "—" : (zh ? ["直接", "一级间接", "二级间接", "三级间接"] : ["direct", "1-indirect", "2-indirect", "3-indirect"])[level];
  const totalBlocks = d + single + double + triple;
  const maxBytes = totalBlocks * b;
  const regions = [
    { lv: 0, label: zh ? "直接" : "Direct", lo: 0, hi: d, bg: "#dcfce7", bd: "#86efac" },
    { lv: 1, label: zh ? "一级间接" : "1-indirect", lo: d, hi: d + single, bg: "#fef9c3", bd: "#fde68a" },
    { lv: 2, label: zh ? "二级间接" : "2-indirect", lo: d + single, hi: d + single + double, bg: "#ffedd5", bd: "#fdba74" },
    { lv: 3, label: zh ? "三级间接" : "3-indirect", lo: d + single + double, hi: d + single + double + triple, bg: "#fee2e2", bd: "#fca5a5" },
  ];
  const rows: React.ReactNode[][] = regions.map((r) => [
    r.label,
    `${r.lo.toLocaleString()}–${Math.max(r.lo, r.hi - 1).toLocaleString()}`,
    `${(r.hi - r.lo).toLocaleString()}${zh ? " 块" : ""}`,
    fmtBytes((r.hi - r.lo) * b),
  ]);
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "目标块偏移" : "Target offset"}</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>{offset}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{`b=${b} B, s=${ptr} B ⇒ p = ⌊b/s⌋ = ${p}`}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: reads > 0 ? "#b45309" : "#94a3b8" }}>{zh ? `读盘 ${reads} 次` : `${reads} reads`}</span>
      </Row>
      <div style={{ display: "grid", gap: 4 }}>
        {regions.map((r) => {
          const active = level === r.lv;
          const contains = offset >= r.lo && offset < r.hi;
          const clickable = canNext && (active || contains);
          return (
            <div key={r.lv} onClick={clickable ? advance : undefined} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 10px", borderRadius: 8,
              background: active ? r.bg : contains ? "#f8fafc" : "#fff",
              border: `2px solid ${active ? r.bd : contains ? "#cbd5e1" : "#f1f5f9"}`,
              cursor: clickable ? "pointer" : "default",
              opacity: level >= 0 && !contains && !active ? 0.5 : 1 }}>
              <span style={{ width: 90, fontSize: 11, fontWeight: 800, color: active ? "#92400e" : "#475569" }}>{r.label}</span>
              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, monospace", flex: 1 }}>{`[${r.lo.toLocaleString()}, ${(r.hi - 1).toLocaleString()}]`}</span>
              {contains && <span style={{ fontSize: 10, color: "#4338ca", fontWeight: 800 }}>{zh ? "含 q" : "has q"}</span>}
              {active && <span style={{ fontSize: 10, color: "#b45309", fontWeight: 800 }}>{zh ? "命中" : "hit"}</span>}
              {clickable && <span style={{ fontSize: 10, color: "#4338ca", fontWeight: 800 }}>{zh ? "点此读取下一级" : "click to read next"}</span>}
            </div>
          );
        })}
      </div>
      <Row>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#3730a3" }}>{zh ? "指针链" : "Pointer chain"}</span>
        {chain.length === 0
          ? <span style={{ fontSize: 12, color: "#94a3b8" }}>{zh ? "（尚未定位）" : "(not located yet)"}</span>
          : chain.map((c, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: "#94a3b8" }}>→</span>}
              <span onClick={canNext ? advance : undefined} style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", background: "#eef2ff", color: "#3730a3", padding: "2px 6px", borderRadius: 6, cursor: canNext ? "pointer" : "default" }}>{c}</span>
            </span>
          ))}
      </Row>
      <StepPanel
        title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("目标偏移", "Offset")), String(offset)],
          [t(T("层级", "Level")), levelName],
          [t(T("读盘", "Reads")), String(reads)],
          [t(T("指针链", "Chain")), chain.length ? chain.join(" -> ") : "—"],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(T("读取下一级指针块", "Read next pointer block"))} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$B_{\\max} = (d + p + p^{2} + p^{3})\\cdot b = ${fmtBytes(maxBytes)}$`} />
      </div>
      <Table head={zh ? ["层次", "偏移区间", "块数", "容量"] : ["Level", "Offset range", "Blocks", "Capacity"]} rows={rows} />
      <Note>
        {zh
          ? `直接指针覆盖小文件（命中只需一次读盘）；文件增大时逐级启用间接指针，每级容量按 $p$ 的幂增长。定位块需按指针链读出各级指针块。`
          : `Direct pointers serve small files fast (one read); higher indirection kicks in as files grow, each level scaling by a power of $p$. Locating a block reads through each pointer level.`}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 分配方式（逐帧：顺序读完再随机访问，比较读盘次数）
// ---------------------------------------------------------------------
type AllocMode = "contiguous" | "linked" | "indexed";
type AllocScene = { mode: AllocMode; step: number; reads: number; phase: "seq" | "random"; target: number };

const ALLOC_LABEL: Record<AllocMode, { zh: string; en: string }> = {
  contiguous: { zh: "连续分配", en: "Contiguous" },
  linked: { zh: "链式分配", en: "Linked" },
  indexed: { zh: "索引分配", en: "Indexed" },
};

function allocGenerate(_config: any): Frame<AllocScene>[] {
  const N = 6;
  const target = N - 1;
  const modes: AllocMode[] = ["contiguous", "linked", "indexed"];
  const frames: Frame<AllocScene>[] = [];
  frames.push({
    line: 0,
    caption: T("比较三种分配方式：先顺序读完所有块，再随机访问目标块",
      "compare three schemes: read all blocks sequentially, then random-access the target"),
    scene: { mode: "contiguous", step: 0, reads: 0, phase: "seq", target },
  });
  for (const mode of modes) {
    for (let i = 0; i < N; i++) {
      const reads = mode === "indexed" ? i + 2 : i + 1;
      frames.push({
        line: 3,
        caption: T(`${ALLOC_LABEL[mode].zh} 顺序读第 ${i + 1} 块：累计 ${reads} 次读盘`,
          `${ALLOC_LABEL[mode].en} sequential read block ${i + 1}: ${reads} reads so far`),
        scene: { mode, step: i, reads, phase: "seq", target },
      });
    }
    const rr = mode === "contiguous" ? 1 : mode === "linked" ? target + 1 : 2;
    frames.push({
      line: 4,
      caption: T(`${ALLOC_LABEL[mode].zh} 随机访问第 ${target + 1} 块：需 ${rr} 次读盘`,
        `${ALLOC_LABEL[mode].en} random access block ${target + 1}: ${rr} reads`),
      scene: { mode, step: N, reads: rr, phase: "random", target },
    });
  }
  return frames;
}

const ALLOC_CODE = [
  T("contiguous: $addr = start + i$ → 1 次读", "contiguous: $addr = start + i$ → 1 read"),
  T("linked: 每块内存下一块指针", "linked: each block stores the next pointer"),
  T("indexed: 索引块集中存放块号", "indexed: an index block holds all block numbers"),
  T("顺序访问：逐块读出，累计读盘次数", "sequential: read block by block, accumulate reads"),
  T("随机跳转目标块，统计所需读盘次数", "jump to the target block, count required reads"),
];

function AllocationRender({ scene, t, onNext, step: frameStep, count, playing }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<AllocScene>;
  const mode = sc.mode ?? "contiguous";
  const reads = sc.reads ?? 0;
  const phase = sc.phase ?? "seq";
  const target = sc.target ?? 5;
  const step = sc.step ?? 0;
  const canNext = !!onNext && !playing && (typeof frameStep !== "number" || typeof count !== "number" || frameStep < count - 1);
  const advance = (e: React.MouseEvent) => { e.stopPropagation(); if (canNext) onNext(); };
  const N = 6;
  const modes: AllocMode[] = ["contiguous", "linked", "indexed"];
  const randomReads: Record<AllocMode, number> = { contiguous: 1, linked: target + 1, indexed: 2 };
  const seqReads: Record<AllocMode, number> = { contiguous: N, linked: N, indexed: N + 1 };
  const rows: React.ReactNode[][] = modes.map((m) => [
    ALLOC_LABEL[m][zh ? "zh" : "en"],
    m === "contiguous" ? (zh ? "起始块 + 长度" : "start + length") : m === "linked" ? (zh ? "首块 + 末块" : "first + last block") : (zh ? "索引块" : "index block"),
    String(seqReads[m]),
    String(randomReads[m]),
    randomReads[m] <= 2 ? (zh ? "随机访问快" : "fast random") : (zh ? "随机访问慢" : "slow random"),
  ]);
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>
          {phase === "random" ? (zh ? "随机访问读盘" : "Random-access reads") : (zh ? "顺序访问累计读盘" : "Sequential reads so far")}
        </span>
        <span style={{ fontSize: 22, fontWeight: 900, color: "#b45309", fontFamily: "ui-monospace, monospace" }}>{reads}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {phase === "random"
            ? (zh ? `目标块 #${target + 1}` : `target block #${target + 1}`)
            : (zh ? `已读 ${Math.min(step + 1, N)} / ${N} 块` : `read ${Math.min(step + 1, N)} / ${N} blocks`)}
        </span>
      </Row>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {modes.map((m) => {
          const on = m === mode;
          return (
            <div key={m} style={{ padding: "10px 12px", borderRadius: 12, background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`, opacity: on ? 1 : 0.6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: on ? "#4338ca" : "#475569" }}>{ALLOC_LABEL[m][zh ? "zh" : "en"]}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                {zh ? "随机访问" : "random"} = <b style={{ fontSize: 18, color: "#b45309", fontFamily: "ui-monospace, monospace" }}>{randomReads[m]}</b> {zh ? "次" : "reads"}
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: "#94a3b8" }}>{zh ? `顺序共 ${seqReads[m]} 次` : `sequential ${seqReads[m]} reads`}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
        {Array.from({ length: N }, (_, i) => {
          const at = phase === "random" ? target : step;
          const on = i === at && (phase === "random" || step < N);
          const clickable = canNext && on;
          return (
            <div key={i} onClick={clickable ? advance : undefined} style={{ width: 44, textAlign: "center", padding: "6px 0", borderRadius: 8, fontSize: 11,
              background: on ? "#4338ca" : "#f1f5f9", color: on ? "#fff" : "#475569",
              border: `1px solid ${on ? "#4338ca" : "#e2e8f0"}`, fontFamily: "ui-monospace, monospace", fontWeight: on ? 800 : 500, cursor: clickable ? "pointer" : "default" }}>
              {i}
            </div>
          );
        })}
      </div>
      <StepPanel
        title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("方式", "Scheme")), ALLOC_LABEL[mode][zh ? "zh" : "en"]],
          [t(T("阶段", "Phase")), phase === "random" ? (zh ? "随机访问" : "random") : (zh ? "顺序访问" : "sequential")],
          [t(T("目标块", "Target")), `#${target + 1}`],
          [t(T("读盘", "Reads")), String(reads)],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(T("读取下一块", "Read next block"))} />
      <Table
        head={zh ? ["方式", "元数据", "顺序读盘", "随机读盘", "评价"] : ["Scheme", "Metadata", "Seq reads", "Rand reads", "Verdict"]}
        rows={rows}
      />
      <Note>
        {zh
          ? `顺序访问三者相近；随机访问时连续分配用起始地址直接算出块位置（$O(1)$），链式分配必须从首块沿链走到目标块（$O(n)$），索引分配先读索引块再读数据块（$O(1)$）。`
          : `Sequential reads are similar; for random access, contiguous computes the address directly ($O(1)$), linked must walk the chain from the first block ($O(n)$), and indexed reads the index block then the data block ($O(1)$).`}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 空闲空间管理（静态）
// ---------------------------------------------------------------------
const FS_DEFAULT = { diskGb: 1024, blockKb: 4 };

function FreeSpaceControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "磁盘容量" : "Disk"} value={config.diskGb} onChange={(v) => set({ diskGb: v })} min={1} max={1048576} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>GB</span>
      <NumField label={zh ? "块大小" : "Block"} value={config.blockKb} onChange={(v) => set({ blockKb: v })} min={1} max={1024} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>KB</span>
    </div>
  );
}

function FreeSpaceRender({ config, t }: any) {
  const zh = isZh(t);
  const totalBytes = config.diskGb * 1024 * 1024 * 1024;
  const blocks = Math.floor((config.diskGb * 1024 * 1024) / Math.max(1, config.blockKb));
  const bitmapBytes = blocks / 8;
  const pct = totalBytes > 0 ? (bitmapBytes / totalBytes) * 100 : 0;
  const rows: React.ReactNode[][] = zh
    ? [
      ["位示图 Bitmap", "每块一位（字号 + 位号）", "简单、可随机查找、易找连续空闲块", "空间随磁盘线性增长；找首块可能需扫描（字内位运算可加速）"],
      ["空闲链表 Free list", "每空闲块存下一空闲块号", "几乎零额外空间；头插分配/回收 O(1)", "难找连续块、遍历慢、依赖数据块本身、可靠性差"],
      ["成组链接 Grouping", "组内块号 + 下一组首块（UNIX）", "空间与效率折中，可批量分配/回收", "实现较复杂，需维护组栈"],
    ]
    : [
      ["Bitmap", "one bit per block (word + offset)", "simple, random search, easy to find runs", "size grows with disk; first-free may need a scan"],
      ["Free list", "each free block stores the next", "near-zero space; O(1) alloc/free at head", "hard to find runs, slow walk, fragile"],
      ["Grouping", "block numbers + next group head (UNIX)", "good space/efficiency, batch allocation", "more complex, needs a group stack"],
    ];
  const samples: React.ReactNode[][] = zh
    ? [
      ["1 TB", "4 KB", "2^28 块", fmtBytes(2 ** 28 / 8)],
      ["16 TB", "4 KB", "2^32 块", fmtBytes(2 ** 32 / 8)],
      ["1 TB", "64 KB", "2^24 块", fmtBytes(2 ** 24 / 8)],
    ]
    : [
      ["1 TB", "4 KB", "2^28 blocks", fmtBytes(2 ** 28 / 8)],
      ["16 TB", "4 KB", "2^32 blocks", fmtBytes(2 ** 32 / 8)],
      ["1 TB", "64 KB", "2^24 blocks", fmtBytes(2 ** 24 / 8)],
    ];
  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "位示图大小" : "Bitmap size"}</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>{fmtBytes(bitmapBytes)}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {zh ? `≈ 磁盘的 ${pct.toFixed(4)}%（${blocks.toLocaleString()} 块）` : `≈ ${pct.toFixed(4)}% of disk (${blocks.toLocaleString()} blocks)`}
        </span>
      </Row>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{bitmap bytes} = \\dfrac{N}{8} = \\dfrac{D/b}{8},\\qquad N = D/b$`} />
      </div>
      <Table head={zh ? ["方法", "结构", "优点", "缺点"] : ["Method", "Structure", "Pros", "Cons"]} rows={rows} />
      <Table head={zh ? ["容量", "块大小", "块数", "位示图"] : ["Capacity", "Block", "Blocks", "Bitmap"]} rows={samples} />
      <Note>
        {zh
          ? "位示图开销仅约磁盘容量的 1/(8·块大小)：1 TB / 4 KB 约 32 MB。UNIX 系采用成组链接法，把空闲块分组以减少遍历、支持批量分配。"
          : "Bitmap overhead is about 1/(8·block) of the disk: 1 TB / 4 KB ≈ 32 MB. UNIX uses grouping to cut traversal and enable batch allocation."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 日志与崩溃一致性（逐帧）
// ---------------------------------------------------------------------
type JournalScene = { step: number };

const JOURNAL_LINES = [0, 0, 1, 2, 3, 4, 4, 4];

const JOURNAL_STATE: { journal: string[]; committed: boolean; home: string; crash: boolean }[] = [
  { journal: [], committed: false, home: "old", crash: false },
  { journal: ["T1: old → new"], committed: false, home: "old", crash: false },
  { journal: ["T1: old → new", "commit"], committed: true, home: "old", crash: false },
  { journal: ["T1: old → new", "commit"], committed: true, home: "new", crash: false },
  { journal: [], committed: false, home: "new", crash: false },
  { journal: ["T1: old → new"], committed: false, home: "old", crash: true },
  { journal: ["T1: old → new", "commit"], committed: true, home: "old", crash: true },
  { journal: ["T1: old → new", "commit"], committed: true, home: "new", crash: false },
];

const JOURNAL_CAPS: [string, string][] = [
  ["初始：日志为空，数据区为旧值", "init: journal empty, data area holds the old value"],
  ["① 写日志 (intent)：把事务 $T_1$ 的元数据先追加写入日志", "① journal write: append $T_1$ metadata to the journal first"],
  ["② 提交：写入 commit 记录，$T_1$ 进入已提交状态", "② commit: write the commit record; $T_1$ is committed"],
  ["③ 应用：把修改写回数据区最终位置", "③ apply: write changes back to their final location"],
  ["④ 检查点：修改已落盘后回收/清空日志", "④ checkpoint: clear the journal once changes are durable"],
  ["崩溃（提交前）：日志有记录但无 commit → 回滚，保持旧的一致状态", "crash before commit: entry present but no commit → rollback to the old consistent state"],
  ["崩溃（提交后、检查点前）：日志已含 commit → 需要重放", "crash after commit, before checkpoint: journal has commit → replay needed"],
  ["恢复 (redo)：重放已提交事务，数据区变为新的一致状态", "recovery (redo): replay the committed transaction; data area reaches the new consistent state"],
];

function journalGenerate(_config: any): Frame<JournalScene>[] {
  return JOURNAL_CAPS.map(([zh, en], i): Frame<JournalScene> => ({ line: JOURNAL_LINES[i], caption: T(zh, en), scene: { step: i } }));
}

const JOURNAL_CODE = [
  T("journal.write(intent): 先追加写日志", "journal.write(intent): append to the journal"),
  T("journal.commit(): 提交记录落盘", "journal.commit(): persist the commit record"),
  T("apply(home): 写回数据区最终位置", "apply(home): write back to final locations"),
  T("checkpoint(): 修改落盘后清空日志", "checkpoint(): clear the journal after flushing"),
  T("recover(): 重放已提交事务 (redo)", "recover(): replay committed transactions (redo)"),
];

function JournalingRender({ scene, t, onNext, step: frameStep, count, playing }: any) {
  const zh = isZh(t);
  const sc = (scene ?? { step: 0 }) as Partial<JournalScene>;
  const step = Math.max(0, Math.min(JOURNAL_STATE.length - 1, sc.step ?? 0));
  const st = JOURNAL_STATE[step];
  const canNext = !!onNext && !playing && (typeof frameStep !== "number" || typeof count !== "number" || frameStep < count - 1);
  const advance = (e: React.MouseEvent) => { e.stopPropagation(); if (canNext) onNext(); };
  const phases: [string, string][] = [
    ["① 写日志", "① write journal"],
    ["② 提交", "② commit"],
    ["③ 应用", "③ apply"],
    ["④ 检查点", "④ checkpoint"],
  ];
  const activePhase = step >= 1 && step <= 4 ? step - 1 : -1;
  const recovering = step >= 5;
  const cell = (label: string, value: React.ReactNode, tint: string, onClick?: (e: React.MouseEvent) => void) => (
    <div onClick={onClick} style={{ flex: "1 1 220px", minWidth: 200, border: `2px solid ${tint}`, borderRadius: 10, overflow: "hidden", background: "#fff", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ background: tint, color: "#fff", padding: "5px 10px", fontWeight: 800, fontSize: 12 }}>{label}</div>
      <div style={{ padding: 10, display: "grid", gap: 5, minHeight: 78 }}>{value}</div>
    </div>
  );
  return (
    <Panel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {phases.map(([zhL, enL], i) => {
          const on = i === activePhase;
          const clickable = canNext && on;
          return (
            <div key={i} onClick={clickable ? advance : undefined} style={{ flex: "1 1 120px", minWidth: 108, padding: "8px 10px", borderRadius: 10, textAlign: "center",
              background: on ? "#eef2ff" : "#f8fafc", border: `2px solid ${on ? "#6366f1" : "#e2e8f0"}`,
              color: on ? "#4338ca" : "#64748b", fontWeight: on ? 800 : 500, fontSize: 12, transition: "all .2s", cursor: clickable ? "pointer" : "default" }}>
              {zh ? zhL : enL}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {cell(zh ? "日志区 (journal)" : "Journal", st.journal.length === 0
          ? <span style={{ fontSize: 12, color: "#94a3b8" }}>{zh ? "（空）" : "(empty)"}</span>
          : st.journal.map((j, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", padding: "3px 7px", borderRadius: 6,
              background: j === "commit" ? "#dcfce7" : "#eef2ff", color: j === "commit" ? "#047857" : "#3730a3", fontWeight: j === "commit" ? 800 : 500 }}>{j}</div>
          )), "#6366f1", canNext ? advance : undefined)}
        {cell(zh ? "数据区 (home)" : "Home location",
          <div style={{ fontSize: 12 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", padding: "3px 7px", borderRadius: 6,
              background: st.home === "new" ? "#dcfce7" : "#fef3c7", color: st.home === "new" ? "#047857" : "#92400e", fontWeight: 800 }}>
              {st.home}
            </span>
          </div>, "#0f766e")}
      </div>
      <StepPanel
        title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("步骤", "Step")), `${step + 1}/${typeof count === "number" ? count : JOURNAL_STATE.length}`],
          [t(T("日志", "Journal")), st.journal.length ? st.journal.join(" | ") : (zh ? "空" : "empty")],
          [t(T("已提交", "Committed")), st.committed ? (zh ? "是" : "yes") : (zh ? "否" : "no")],
          [t(T("数据区", "Home")), st.home],
          [t(T("崩溃", "Crash")), st.crash ? (zh ? "是" : "yes") : (zh ? "否" : "no")],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(T("推进日志 / 提交", "Advance journal / commit"))} />
      {st.crash && (
        <Note tone="warn">
          {zh
            ? "💥 崩溃！重启后扫描日志：无 commit 的事务回滚，有 commit 的事务重放 (redo)——日志保证恢复到一个一致状态。"
            : "💥 Crash! On reboot the journal is scanned: transactions without commit roll back, committed ones are redone—so the FS recovers to a consistent state."}
        </Note>
      )}
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$\\text{WAL}:\\ \\text{journal} \\to \\text{commit} \\to \\text{checkpoint} \\to \\text{home}$" />
      </div>
      <Note>
        {zh
          ? "核心是「先写日志 (WAL)」：只要日志与提交记录已落盘，崩溃后即可通过重做/回滚把文件系统恢复到某个一致状态。"
          : "The key is write-ahead logging: once the journal and commit record are durable, redo/undo restores a consistent state after a crash."}
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  inode: { title: T("inode 与索引", "inode"), defaultConfig: INODE_DEFAULT, Controls: InodeControls, Render: InodeRender, generate: inodeGenerate, code: INODE_CODE },
  allocation: { title: T("分配方式", "Allocation"), Render: AllocationRender, generate: allocGenerate, code: ALLOC_CODE },
  "free-space": { title: T("空闲空间", "Free Space"), defaultConfig: FS_DEFAULT, Controls: FreeSpaceControls, Render: FreeSpaceRender },
  journaling: { title: T("日志", "Journaling"), Render: JournalingRender, generate: journalGenerate, code: JOURNAL_CODE },
};

export const { module: osFsModule, GROUPS: osFsGroups } = makeChapter<SubMode>({
  id: "os-fs",
  title: T("文件系统", "File Systems"),
  desc: T("磁盘布局、inode 多级索引与最大文件公式、连续/链式/索引分配、位示图与空闲链表、日志与崩溃一致性。", "Disk layout, inode multi-level indexing & max-file formula, contiguous/linked/indexed allocation, bitmap & free list, journaling & crash consistency."),
  tags: ["operating-system", "filesystem"],
  groups: [
    {
      label: "文件系统",
      opts: [
        { v: "inode", zh: "inode 与索引", en: "inode" },
        { v: "allocation", zh: "分配方式", en: "Allocation" },
        { v: "free-space", zh: "空闲空间", en: "Free Space" },
        { v: "journaling", zh: "日志", en: "Journaling" },
      ],
    },
  ],
  subs: SUBS,
});
