import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第5章 内存管理
//   对应 tex/OperatingSystem/chapters/memory.tex
//   address-space(地址空间与重定位) / paging(分页)
//   / segmentation(分段) / tlb(TLB 与 EAT)
// =====================================================================

type SubMode = "address-space" | "paging" | "segmentation" | "tlb";

const bin = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0");
const isPow2 = (n: number) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

// ---------------------------------------------------------------------
// address-space: MMU 运行时重定位（逐帧）
//   逻辑地址 → 基址寄存器相加 → 物理地址，并对界限寄存器做越界检查
// ---------------------------------------------------------------------
const ADDRESS_DEFAULT = { logical: 1200, base: 4000, limit: 2048 };

function AddressControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <NumField label={zh ? "逻辑地址 LA" : "Logical LA"} value={config.logical} onChange={(v) => set({ logical: v })} min={0} max={100000} width={110} />
      <NumField label={zh ? "基址 base" : "base"} value={config.base} onChange={(v) => set({ base: v })} min={0} max={100000} width={110} />
      <NumField label={zh ? "界限 limit" : "limit"} value={config.limit} onChange={(v) => set({ limit: v })} min={0} max={100000} width={110} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "越界检查：LA < limit" : "check: LA < limit"}</span>
    </Row>
  );
}
type AddressScene = { logical: number; base: number; limit: number; physical: number; ok: boolean; step: number };

function AddressRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<AddressScene>;
  const la = sc.logical ?? Math.max(0, Math.floor(Number(config?.logical) || 0));
  const base = sc.base ?? Math.max(0, Math.floor(Number(config?.base) || 0));
  const limit = sc.limit ?? Math.max(0, Math.floor(Number(config?.limit) || 0));
  const ok = sc.ok ?? la < limit;
  const pa = sc.physical ?? (ok ? base + la : 0);
  const step = sc.step ?? 3;
  const box = (accent: string, bg: string, on: boolean, title: string, lines: string[]) => (
    <div style={{ minWidth: 132, flex: "0 1 auto", padding: "12px 16px", borderRadius: 12, background: on ? bg : "#f8fafc", border: `1.5px solid ${on ? accent : "#e2e8f0"}`, textAlign: "center", opacity: on ? 1 : 0.5, transition: "background .2s, opacity .2s" }}>
      <div style={{ fontWeight: 800, color: on ? accent : "#94a3b8" }}>{title}</div>
      {lines.map((l, i) => <div key={i} style={{ fontSize: i === 0 ? 12 : 11, color: i === 0 ? "#334155" : "#64748b", fontFamily: "ui-monospace, monospace", fontWeight: i === 0 ? 800 : 400 }}>{l}</div>)}
    </div>
  );
  const rows: React.ReactNode[][] = zh
    ? [
      ["产生者", "CPU（进程视角）", "内存总线 / 存储体"],
      ["取值范围", "从 0 开始连续编号", "真实物理单元地址"],
      ["是否可见", "对进程可见", "对进程透明"],
      ["转换者", "MMU 在运行时翻译", "—"],
    ]
    : [
      ["Produced by", "CPU (process view)", "memory bus / storage"],
      ["Range", "starts at 0, contiguous", "real physical cell addresses"],
      ["Visibility", "visible to the process", "transparent to the process"],
      ["Translated by", "MMU at run time", "—"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {box("#4f46e5", "#e0e7ff", step === 0, "CPU", [zh ? "逻辑地址" : "Logical addr", `LA = ${la}`])}
        <span style={{ fontSize: 22, color: "#94a3b8" }}>→</span>
        {box("#d97706", "#fef3c7", step === 1, "MMU", [zh ? "重定位 + 保护" : "relocate + protect", `base = ${base}`, `limit = ${limit}`])}
        <span style={{ fontSize: 22, color: "#94a3b8" }}>→</span>
        {box("#16a34a", "#dcfce7", step >= 2 && ok, zh ? "内存" : "Memory", [zh ? "物理地址" : "Physical addr", ok ? `PA = ${pa}` : "—"])}
      </div>
      <div style={{ textAlign: "center", fontSize: 14, fontFamily: "ui-monospace, monospace", opacity: step >= 1 ? 1 : 0.5, transition: "opacity .2s" }}>
        {zh ? "界限检查" : "bounds check"}: LA = {la} {ok ? "<" : "≥"} limit = {limit}{" "}
        <b style={{ color: ok ? "#15803d" : "#b91c1c" }}>{ok ? (zh ? "合法" : "valid") : (zh ? "越界" : "fault")}</b>
      </div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 900, color: ok ? "#15803d" : "#b91c1c", fontFamily: "ui-monospace, monospace", opacity: step >= 2 ? 1 : 0.45, transition: "opacity .2s" }}>
        {ok ? `PA = base + LA = ${base} + ${la} = ${pa}` : (zh ? "越界陷阱：LA ≥ limit（内核处理，保护隔离）" : "Out-of-bounds trap: LA ≥ limit (kernel handles, isolation)")}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$LA < limit \;\Rightarrow\; PA = base + LA$" />
      </div>
      <Table head={zh ? ["维度", "逻辑地址", "物理地址"] : ["Aspect", "Logical", "Physical"]} rows={rows} />
      <Note>
        {zh
          ? "执行时重定位（动态重定位）由 MMU 完成，程序装入内存后可移动、可换出；基址/界限寄存器同时提供重定位与保护。"
          : "Run-time relocation is done by the MMU, so a program can move or be swapped after loading; base/limit registers give both relocation and protection."}
      </Note>
    </Panel>
  );
}
function addressGenerate(config: any): Frame<AddressScene>[] {
  const la = Math.max(0, Math.floor(Number(config.logical) || 0));
  const base = Math.max(0, Math.floor(Number(config.base) || 0));
  const limit = Math.max(0, Math.floor(Number(config.limit) || 0));
  const ok = la < limit;
  const physical = ok ? base + la : 0;
  const s = { logical: la, base, limit, physical, ok };
  return [
    { line: 0, caption: T(`CPU 产生逻辑地址 $LA=${la}$`, `CPU issues logical address $LA=${la}$`), scene: { ...s, step: 0 } },
    { line: 1, caption: T(`越界检查：$LA=${la} ${ok ? "<" : "\\ge"} limit=${limit}$`, `Bound check: $LA=${la} ${ok ? "<" : "\\ge"} limit=${limit}$`), scene: { ...s, step: 1 } },
    {
      line: 2,
      caption: ok
        ? T(`重定位：$PA=base+LA=${base}+${la}=${physical}$`, `Relocate: $PA=base+LA=${base}+${la}=${physical}$`)
        : T("越界：触发越界陷阱（内核处理）", "Out of bounds: raise a trap (kernel handles)"),
      scene: { ...s, step: 2 },
    },
    {
      line: 3,
      caption: ok
        ? T(`以物理地址 $PA=${physical}$ 访问内存`, `Access memory at $PA=${physical}$`)
        : T("拒绝访问，进程收到保护信号", "Access denied, process gets a protection signal"),
      scene: { ...s, step: 3 },
    },
  ];
}
const ADDRESS_CODE = [
  T("$LA \\gets$ CPU 产生的逻辑地址", "$LA \\gets$ logical address from CPU"),
  T("if $LA \\ge limit$: trap", "if $LA \\ge limit$: trap"),
  T("$PA \\gets base + LA$", "$PA \\gets base + LA$"),
  T("访问物理地址 $PA$", "access physical address $PA$"),
];

// ---------------------------------------------------------------------
// paging: 交互式地址翻译
// ---------------------------------------------------------------------
const PAGING_DEFAULT = { addrText: "5120", pageSize: 1024 };
const PAGE_TABLE = [3, 7, 1, 5, 2, 0, 4, 6, 9, 8, 11, 10, 13, 12, 15, 14];

function PagingControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <TextField label={zh ? "逻辑地址" : "Logical addr"} value={config.addrText} onChange={(v) => set({ addrText: v })} width={140} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "十进制" : "decimal"}</span>
      <NumField label={zh ? "页大小" : "Page size"} value={config.pageSize} onChange={(v) => set({ pageSize: v })} min={2} max={65536} width={110} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "字节（2 的幂）" : "bytes (power of 2)"}</span>
    </Row>
  );
}
type PagingScene = { logical: number; pageSize: number; p: number; d: number; frame: number; physical: number; step: number };

function PagingRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<PagingScene>;
  const addr = sc.logical ?? 0;
  const pageSize = sc.pageSize ?? Math.max(1, Math.round(Number(config?.pageSize) || 1));
  const pow2 = isPow2(pageSize);
  const offsetBits = pow2 ? Math.round(Math.log2(pageSize)) : Math.max(1, Math.ceil(Math.log2(pageSize)));
  const pageNo = sc.p ?? Math.floor(addr / pageSize);
  const offset = sc.d ?? addr % pageSize;
  const slot = pageNo % PAGE_TABLE.length;
  const pfn = sc.frame ?? PAGE_TABLE[slot];
  const pa = sc.physical ?? pfn * pageSize + offset;
  const step = sc.step ?? 4;
  const pageBits = Math.max(1, 32 - offsetBits);
  const rect = (label: string, val: string, bitsText: string, bg: string, bd: string, fg: string, grow: number, on: boolean) => (
    <div style={{ flexGrow: grow, flexBasis: 0, background: on ? bg : "#f8fafc", borderRight: `1px solid ${bd}`, padding: "6px 4px", textAlign: "center", opacity: on ? 1 : 0.55, transition: "background .2s, opacity .2s" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: fg }}>{label}</div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>{bitsText}</div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color: fg, wordBreak: "break-all" }}>{val}</div>
    </div>
  );
  const pteRows: React.ReactNode[][] = zh
    ? [
      ["帧号", "映射到的物理帧"],
      ["有效位", "是否在内存，0 触发缺页"],
      ["修改位", "是否被写过，决定换出是否回写"],
      ["访问位", "是否被访问，供置换算法参考"],
      ["保护位", "读/写/执行权限"],
    ]
    : [
      ["Frame number", "physical frame the page maps to"],
      ["Valid", "in memory? 0 triggers a page fault"],
      ["Dirty", "written? decides write-back on eviction"],
      ["Reference", "accessed? feeds replacement policy"],
      ["Protection", "R/W/X permission bits"],
    ];
  return (
    <Panel>
      {!pow2 && <Note tone="warn">{zh ? "页大小建议取 2 的幂（如 1024）；当前按最近似的位数演示位切分。" : "Use a power-of-two page size (e.g. 1024); bit split uses the nearest width."}</Note>}
      <div style={{ display: "flex", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
        {rect(zh ? "页号 p" : "page p", pow2 ? bin(pageNo, Math.min(pageBits, 16)) : `${pageNo}`, pow2 ? `${pageNo} (dec)` : "", "#e0e7ff", "#c7d2fe", "#4338ca", Math.max(1, Math.min(pageBits, 16)), step === 1)}
        {rect(zh ? "页内偏移 d" : "offset d", pow2 ? bin(offset, offsetBits) : `${offset}`, `${offset} (dec)`, "#fef3c7", "#fde68a", "#b45309", Math.max(1, offsetBits), step === 2)}
      </div>
      <div style={{ textAlign: "center", fontSize: 14, color: "#334155", fontFamily: "ui-monospace, monospace", opacity: step >= 1 ? 1 : 0.5, transition: "opacity .2s" }}>
        {zh ? "逻辑地址" : "LA"} {addr} = p·S + d = {pageNo}×{pageSize} + {offset}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>{zh ? "页表（固定映射）" : "Page table (fixed mapping)"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {PAGE_TABLE.map((f, p) => {
          const active = step >= 3 && p === slot;
          return (
            <div key={p} style={{ textAlign: "center", padding: "5px 0", borderRadius: 7, fontSize: 11, fontFamily: "ui-monospace, monospace", background: active ? "#eef2ff" : "#f8fafc", border: `1.5px solid ${active ? "#4f46e5" : "#e2e8f0"}`, color: active ? "#3730a3" : "#334155", fontWeight: active ? 800 : 500, opacity: step >= 3 ? 1 : 0.5, transition: "background .2s, opacity .2s" }}>
              {zh ? `页 ${p} → 帧 ${f}` : `p ${p} → f ${f}`}
            </div>
          );
        })}
      </div>
      <Row>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? "帧号 f" : "frame f"} = <b style={{ color: "#4338ca" }}>{pfn}</b></span>
        <span style={{ fontSize: 13, color: "#475569", opacity: step >= 4 ? 1 : 0.5, transition: "opacity .2s" }}>{zh ? "物理地址" : "PA"} = f·S + d = {pfn}×{pageSize} + {offset} = <b style={{ color: "#15803d" }}>{pa}</b></span>
        <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#64748b" }}>0x{pa.toString(16).toUpperCase()}</span>
      </Row>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$p = \lfloor LA / S \rfloor,\quad d = LA \bmod S,\quad PA = f \times S + d$" />
      </div>
      <Table head={zh ? ["页表项字段", "作用"] : ["PTE field", "Purpose"]} rows={pteRows} />
      <Note>
        {zh
          ? "因为 S 是 2 的幂，页号与偏移就是逻辑地址的高位与低位，翻译退化为「查表换高位、低位不变」。"
          : "Because S is a power of two, page number and offset are simply the high and low bits of LA; translation becomes “swap the high bits via the table, keep the low bits”."}
      </Note>
    </Panel>
  );
}
function pagingGenerate(config: any): Frame<PagingScene>[] {
  const raw = Number(config.addrText);
  const addr = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  const pageSize = Math.max(1, Math.round(Number(config.pageSize) || 1));
  const p = Math.floor(addr / pageSize);
  const d = addr % pageSize;
  const slot = p % PAGE_TABLE.length;
  const frame = PAGE_TABLE[slot];
  const physical = frame * pageSize + d;
  const base = { logical: addr, pageSize, p, d, frame, physical };
  return [
    { line: 0, caption: T(`逻辑地址 $LA=${addr}$，页大小 $S=${pageSize}$`, `Logical address $LA=${addr}$, page size $S=${pageSize}$`), scene: { ...base, step: 0 } },
    { line: 1, caption: T(`页号 $p=\\lfloor LA/S \\rfloor=${p}$`, `Page number $p=\\lfloor LA/S \\rfloor=${p}$`), scene: { ...base, step: 1 } },
    { line: 2, caption: T(`页内偏移 $d=LA \\bmod S=${d}$`, `Offset $d=LA \\bmod S=${d}$`), scene: { ...base, step: 2 } },
    { line: 3, caption: T(`用 $p=${p}$ 查页表得帧号 $f=${frame}$`, `Index the page table with $p=${p}$ → frame $f=${frame}$`), scene: { ...base, step: 3 } },
    { line: 4, caption: T(`拼装物理地址 $PA=f\\times S+d=${physical}$`, `Assemble $PA=f\\times S+d=${physical}$`), scene: { ...base, step: 4 } },
  ];
}
const PAGING_CODE = [
  T("输入逻辑地址 $LA$", "input logical $LA$"),
  T("$p \\gets \\lfloor LA/S \\rfloor$", "$p \\gets \\lfloor LA/S \\rfloor$"),
  T("$d \\gets LA \\bmod S$", "$d \\gets LA \\bmod S$"),
  T("$f \\gets pagetable[p]$", "$f \\gets pagetable[p]$"),
  T("return $f \\times S + d$", "return $f \\times S + d$"),
];

// ---------------------------------------------------------------------
// segmentation: 段表 + 合法性检查
// ---------------------------------------------------------------------
const SEG_DEFAULT = { segNo: 1, offset: 120 };
const SEG_TABLE = [
  { base: 1000, limit: 400 },
  { base: 2400, limit: 200 },
  { base: 5000, limit: 600 },
  { base: 8000, limit: 150 },
];

function SegmentationControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <NumField label={zh ? "段号 s" : "Segment s"} value={config.segNo} onChange={(v) => set({ segNo: v })} min={0} max={SEG_TABLE.length - 1} width={70} />
      <NumField label={zh ? "段内偏移 d" : "Offset d"} value={config.offset} onChange={(v) => set({ offset: v })} min={0} max={100000} width={110} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "越界检查：d < limit[s]" : "check: d < limit[s]"}</span>
    </Row>
  );
}
type SegScene = { seg: number; offset: number; base: number; limit: number; ok: boolean; physical: number; step: number };

function SegmentationRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<SegScene>;
  const s = sc.seg ?? Math.max(0, Math.min(SEG_TABLE.length - 1, Math.round(Number(config?.segNo) || 0)));
  const d = sc.offset ?? Math.max(0, Math.floor(Number(config?.offset) || 0));
  const seg = SEG_TABLE[s];
  const valid = sc.ok ?? d < seg.limit;
  const pa = sc.physical ?? (valid ? seg.base + d : 0);
  const step = sc.step ?? 4;
  const rows: React.ReactNode[][] = SEG_TABLE.map((g, i) => [
    `${i}${i === s ? (zh ? "（当前）" : " (now)") : ""}`,
    g.base,
    g.limit,
    i === s ? (valid ? (zh ? "合法" : "valid") : (zh ? "越界" : "fault")) : "—",
  ]);
  const cmp: React.ReactNode[][] = zh
    ? [
      ["划分依据", "物理等分为固定页", "按逻辑结构分变长段"],
      ["大小", "固定（页 = 帧）", "可变"],
      ["地址结构", "一维：页号 + 偏移", "二维：段号 + 偏移"],
      ["碎片", "仅内部碎片", "仅外部碎片"],
      ["对用户", "透明", "可见，便于共享/保护"],
    ]
    : [
      ["Basis", "equal fixed-size pages", "variable logical segments"],
      ["Size", "fixed (page = frame)", "variable"],
      ["Address", "1D: page + offset", "2D: segment + offset"],
      ["Fragment", "internal only", "external only"],
      ["Visibility", "transparent", "visible, eases sharing/protection"],
    ];
  return (
    <Panel>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>{zh ? "段表" : "Segment table"}</div>
      <Table head={zh ? ["段号 s", "base", "limit", "状态"] : ["Segment s", "base", "limit", "State"]} rows={rows} />
      <Row>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? "逻辑地址" : "LA"} = s∥d = {s}∥{d}</span>
        <span style={{ fontSize: 13, color: "#475569", fontWeight: step === 3 ? 800 : 400 }}>{zh ? "检查" : "check"} d={d} {valid ? "<" : "≥"} limit[{s}]={seg.limit}</span>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? `步骤 ${step + 1}/5` : `step ${step + 1}/5`}</span>
      </Row>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 900, color: valid ? "#15803d" : "#b91c1c", fontFamily: "ui-monospace, monospace", opacity: step >= 4 ? 1 : 0.45, transition: "opacity .2s" }}>
        {valid ? `PA = base[${s}] + d = ${seg.base} + ${d} = ${pa}` : (zh ? `越界异常：d ≥ limit[${s}]（保护中断）` : `out-of-bounds: d ≥ limit[${s}] (trap)`)}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$d < limit[s] \;\Rightarrow\; PA = base[s] + d$" />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? "分段 vs 分页" : "Segmentation vs paging"}</div>
      <Table head={zh ? ["维度", "分页", "分段"] : ["Aspect", "Paging", "Segmentation"]} rows={cmp} />
      <Note>
        {zh
          ? "段页式：先按逻辑分段，再把每段分页。逻辑地址 = 段号∥页号∥偏移，段表得页表、页表得帧号，兼顾逻辑保护与无外部碎片。"
          : "Segmented paging: segment first, then page each segment. LA = segment∥page∥offset; segment table → page table → frame, giving logical protection without external fragmentation."}
      </Note>
    </Panel>
  );
}
function segGenerate(config: any): Frame<SegScene>[] {
  const s = Math.max(0, Math.min(SEG_TABLE.length - 1, Math.round(Number(config.segNo) || 0)));
  const d = Math.max(0, Math.floor(Number(config.offset) || 0));
  const seg = SEG_TABLE[s];
  const ok = d < seg.limit;
  const physical = ok ? seg.base + d : 0;
  const base = { seg: s, offset: d, base: seg.base, limit: seg.limit, ok, physical };
  return [
    { line: 0, caption: T(`读取段号 $s=${s}$、段内偏移 $d=${d}$`, `Read segment $s=${s}$, offset $d=${d}$`), scene: { ...base, step: 0 } },
    { line: 1, caption: T(`查段表：$base[s]=${seg.base}$`, `Segment table: $base[s]=${seg.base}$`), scene: { ...base, step: 1 } },
    { line: 2, caption: T(`查段表：$limit[s]=${seg.limit}$`, `Segment table: $limit[s]=${seg.limit}$`), scene: { ...base, step: 2 } },
    { line: 3, caption: T(`越界检查：$d=${d} ${ok ? "<" : "\\ge"} limit=${seg.limit}$`, `Bound check: $d=${d} ${ok ? "<" : "\\ge"} limit=${seg.limit}$`), scene: { ...base, step: 3 } },
    {
      line: 4,
      caption: ok
        ? T(`合法：物理地址 $PA=base+d=${seg.base}+${d}=${physical}$`, `Valid: $PA=base+d=${seg.base}+${d}=${physical}$`)
        : T("越界：触发保护陷阱（内核处理）", "Out of bounds: raise a protection trap (kernel handles)"),
      scene: { ...base, step: 4 },
    },
  ];
}
const SEG_CODE = [
  T("读取段号 $s$、段内偏移 $d$", "read segment $s$, offset $d$"),
  T("$base \\gets segtable[s].base$", "$base \\gets segtable[s].base$"),
  T("$limit \\gets segtable[s].limit$", "$limit \\gets segtable[s].limit$"),
  T("if $d \\ge limit$: trap", "if $d \\ge limit$: trap"),
  T("return $base + d$", "return $base + d$"),
];

// ---------------------------------------------------------------------
// tlb: 交互式 EAT 计算器
// ---------------------------------------------------------------------
const TLB_DEFAULT = { hitPct: 90, tMem: 100, tTlb: 10 };

function TlbControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <Row>
      <NumField label={zh ? "TLB 命中率 h" : "TLB hit h"} value={config.hitPct} onChange={(v) => set({ hitPct: v })} min={0} max={100} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>%</span>
      <NumField label={zh ? "内存访问 t_mem" : "t_mem"} value={config.tMem} onChange={(v) => set({ tMem: v })} min={1} max={10000} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ns</span>
      <NumField label={zh ? "TLB 访问 t_tlb" : "t_tlb"} value={config.tTlb} onChange={(v) => set({ tTlb: v })} min={0} max={10000} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ns</span>
    </Row>
  );
}
type TlbScene = { hit: boolean; step: number; eat: number };

function TlbRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const sc = (scene ?? {}) as Partial<TlbScene>;
  const h = Math.max(0, Math.min(1, (Number(config?.hitPct) || 0) / 100));
  const tMem = Math.max(0, Number(config?.tMem) || 0);
  const tTlb = Math.max(0, Number(config?.tTlb) || 0);
  const hitPath = tTlb + tMem;
  const missPath = tTlb + 2 * tMem;
  const eat = sc.eat ?? h * hitPath + (1 - h) * missPath;
  const step = sc.step ?? 4;
  const hitNow = sc.hit ?? false;
  const simplified = tTlb + (2 - h) * tMem;
  const noTlb = 2 * tMem;
  const path = (label: string, sub: string, val: number, bg: string, bd: string, fg: string, on: boolean) => (
    <div style={{ flex: "1 1 180px", minWidth: 160, padding: "10px 12px", borderRadius: 12, background: on ? bg : "#f8fafc", border: `1.5px solid ${bd}`, textAlign: "center", opacity: on ? 1 : 0.5, transition: "background .2s, opacity .2s" }}>
      <div style={{ fontWeight: 800, color: fg, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>{sub}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: fg, fontFamily: "ui-monospace, monospace" }}>{val.toFixed(1)} ns</div>
    </div>
  );
  const rows: React.ReactNode[][] = [50, 80, 90, 95, 98, 99].map((p) => {
    const hh = p / 100;
    return [`${p}%`, `${hitPath.toFixed(1)}`, `${missPath.toFixed(1)}`, `${(hh * hitPath + (1 - hh) * missPath).toFixed(2)}`];
  });
  return (
    <Panel>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {path(zh ? `命中路径 (h=${(h * 100).toFixed(0)}%)` : `Hit path (h=${(h * 100).toFixed(0)}%)`, "t_tlb + t_mem", hitPath, "#dcfce7", "#16a34a", "#166534", step === 1)}
        {path(zh ? `未命中路径 (${((1 - h) * 100).toFixed(0)}%)` : `Miss path (${((1 - h) * 100).toFixed(0)}%)`, "t_tlb + 2·t_mem", missPath, "#fee2e2", "#ef4444", "#b91c1c", step >= 2)}
      </div>
      <div style={{ textAlign: "center", fontSize: 14, opacity: step >= 4 ? 1 : 0.5, transition: "opacity .2s" }}>
        <MathText text="$EAT = h\,(t_{TLB}+t_{mem}) + (1-h)\,(t_{TLB}+2t_{mem})$" />
      </div>
      <div style={{ textAlign: "center", fontSize: 14, opacity: step >= 4 ? 1 : 0.5, transition: "opacity .2s" }}>
        <MathText text={`$= ${h.toFixed(2)}\\times ${hitPath.toFixed(1)} + ${(1 - h).toFixed(2)}\\times ${missPath.toFixed(1)} = ${eat.toFixed(2)}\\ \\text{ns}$`} />
      </div>
      <Row>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? "有效访问时间" : "EAT"} = <b style={{ color: "#4338ca" }}>{eat.toFixed(2)} ns</b></span>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? "化简" : "simplify"} <MathText text="$t_{TLB}+(2-h)t_{mem}$" />{" = "}<b>{simplified.toFixed(2)} ns</b></span>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? "无 TLB" : "no TLB"} 2·t_mem = <b style={{ color: "#b45309" }}>{noTlb.toFixed(1)} ns</b></span>
        <span style={{ fontSize: 11, color: hitNow ? "#166534" : "#b91c1c", fontWeight: 800 }}>{zh ? `当前：${hitNow ? "命中" : "未命中"}` : `now: ${hitNow ? "hit" : "miss"}`}</span>
      </Row>
      <Table head={zh ? ["h", "命中路径 (ns)", "未命中 (ns)", "EAT (ns)"] : ["h", "Hit (ns)", "Miss (ns)", "EAT (ns)"]} rows={rows} />
      <Note>
        {zh
          ? "TLB 命中即免去访存查页表，因此 h 越高 EAT 越接近 t_tlb + t_mem；多级页表虽省空间，却会让未命中路径访问更多次内存。"
          : "A TLB hit skips the memory page-table walk, so higher h drives EAT toward t_tlb + t_mem; multi-level tables save space but lengthen the miss path."}
      </Note>
    </Panel>
  );
}
function tlbGenerate(config: any): Frame<TlbScene>[] {
  const h = Math.max(0, Math.min(1, (Number(config.hitPct) || 0) / 100));
  const tMem = Math.max(0, Number(config.tMem) || 0);
  const tTlb = Math.max(0, Number(config.tTlb) || 0);
  const hitPath = tTlb + tMem;
  const missPath = tTlb + 2 * tMem;
  const eat = h * hitPath + (1 - h) * missPath;
  return [
    { line: 0, caption: T("CPU 访存：先查 TLB", "CPU memory access: look up the TLB first"), scene: { hit: true, step: 0, eat } },
    { line: 1, caption: T(`TLB 命中（快路径）：$t_{TLB}+t_{mem}=${hitPath.toFixed(1)}$ ns`, `TLB hit (fast path): $t_{TLB}+t_{mem}=${hitPath.toFixed(1)}$ ns`), scene: { hit: true, step: 1, eat } },
    { line: 2, caption: T(`TLB 未命中：查页表（$t_{TLB}+t_{mem}$）`, `TLB miss: walk the page table ($t_{TLB}+t_{mem}$)`), scene: { hit: false, step: 2, eat } },
    { line: 3, caption: T(`回填 TLB 并访问：$t_{TLB}+2t_{mem}=${missPath.toFixed(1)}$ ns`, `Fill the TLB and access: $t_{TLB}+2t_{mem}=${missPath.toFixed(1)}$ ns`), scene: { hit: false, step: 3, eat } },
    { line: 4, caption: T(`有效访问时间 $EAT=h(t_{TLB}+t_{mem})+(1-h)(t_{TLB}+2t_{mem})=${eat.toFixed(2)}$ ns`, `Effective access time $EAT=h(t_{TLB}+t_{mem})+(1-h)(t_{TLB}+2t_{mem})=${eat.toFixed(2)}$ ns`), scene: { hit: false, step: 4, eat } },
  ];
}
const TLB_CODE = [
  T("查 TLB：$entry \\gets lookup(p)$", "look up TLB: $entry \\gets lookup(p)$"),
  T("命中 → $t_{TLB}+t_{mem}$", "hit → $t_{TLB}+t_{mem}$"),
  T("未命中 → 查页表", "miss → walk the page table"),
  T("回填 TLB，$t_{TLB}+2t_{mem}$", "fill TLB, $t_{TLB}+2t_{mem}$"),
  T("return $h\\,hit+(1-h)\\,miss$", "return $h\\,hit+(1-h)\\,miss$"),
];

const SUBS: Record<SubMode, SubDef> = {
  "address-space": { title: T("地址空间", "Address Space"), defaultConfig: ADDRESS_DEFAULT, Controls: AddressControls, Render: AddressRender, generate: addressGenerate, code: ADDRESS_CODE },
  paging: { title: T("分页", "Paging"), defaultConfig: PAGING_DEFAULT, Controls: PagingControls, Render: PagingRender, generate: pagingGenerate, code: PAGING_CODE },
  segmentation: { title: T("分段", "Segmentation"), defaultConfig: SEG_DEFAULT, Controls: SegmentationControls, Render: SegmentationRender, generate: segGenerate, code: SEG_CODE },
  tlb: { title: T("TLB", "TLB"), defaultConfig: TLB_DEFAULT, Controls: TlbControls, Render: TlbRender, generate: tlbGenerate, code: TLB_CODE },
};

export const { module: osMemoryModule, GROUPS: osMemoryGroups } = makeChapter<SubMode>({
  id: "os-memory",
  title: T("内存管理", "Memory Management"),
  desc: T("逻辑/物理地址与重定位、基址+界限保护、分页（页表·地址翻译·PTE）、分段与段页式、TLB 与有效访问时间 EAT。", "Logical/physical addresses & relocation, base+limit protection, paging (page table, address translation, PTE), segmentation & segmented paging, TLB and effective access time."),
  tags: ["operating-system", "memory"],
  groups: [
    { label: "内存", opts: [
      { v: "address-space", zh: "地址空间", en: "Address Space" },
      { v: "paging", zh: "分页", en: "Paging" },
      { v: "segmentation", zh: "分段", en: "Segmentation" },
      { v: "tlb", zh: "TLB", en: "TLB" },
    ] },
  ],
  subs: SUBS,
});
