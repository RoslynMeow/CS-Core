import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";

// =====================================================================
// 存储层次与缓存 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/memory.tex
//   levels(层次) / locality(局部性) / cache(映射·地址划分·命中) / virtual(虚拟内存)
//   / dram(DRAM) / design(设计原则)
// =====================================================================

type SubMode = "levels" | "locality" | "cache" | "virtual" | "dram" | "design";

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
const hx = (n: number, w = 8) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, "0")}`;
const bits = (n: number, w: number) => (n >>> 0).toString(2).padStart(w, "0");
const log2 = (n: number) => Math.round(Math.log2(n));

// ---------------------------------------------------------------------
// levels: 存储层次
// ---------------------------------------------------------------------
function LevelsRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["寄存器", "~1 KB", "< 1 ns", "CPU 内部"],
      ["L1 Cache", "32–64 KB", "~1 ns", "SRAM, 每核"],
      ["L2 Cache", "256 KB–1 MB", "~4 ns", "SRAM, 每核"],
      ["L3 Cache", "8–32 MB", "~12 ns", "SRAM, 多核共享"],
      ["主存 DRAM", "8–64 GB", "~60–100 ns", "DRAM"],
      ["SSD / 磁盘", "TB 级", "µs–ms", "闪存 / 磁介质"],
    ]
    : [
      ["Registers", "~1 KB", "< 1 ns", "in CPU"],
      ["L1 Cache", "32–64 KB", "~1 ns", "SRAM, per-core"],
      ["L2 Cache", "256 KB–1 MB", "~4 ns", "SRAM, per-core"],
      ["L3 Cache", "8–32 MB", "~12 ns", "SRAM, shared"],
      ["Main DRAM", "8–64 GB", "~60–100 ns", "DRAM"],
      ["SSD / Disk", "TB", "µs–ms", "flash / magnetic"],
    ];
  return (
    <Panel>
      <div style={{ padding: "12px 16px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 2 }}>
        {isZh
          ? "越靠近 CPU: 越快、越小、越贵。每一层缓存下一层的数据, 目标是用接近 L1 的速度访问接近磁盘的容量。"
          : "Closer to CPU = faster/smaller/pricier. Each level caches the next; goal: L1 speed with disk capacity."}
      </div>
      <Table head={isZh ? ["层次", "典型容量", "延迟", "实现"] : ["Level", "Size", "Latency", "Tech"]} rows={rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// locality: 局部性
// ---------------------------------------------------------------------
function LocalityControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "步长" : "STRIDE"}</span>
      <select className="txt" value={config.stride} onChange={(e) => onChange({ ...config, stride: Number(e.target.value) })} style={{ fontWeight: 700 }}>
        {[1, 2, 4, 8].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span style={{ fontSize: 12, color: "#64748b" }}>{isZh ? "数组大小 16, 访问两轮" : "array 16, two passes"}</span>
    </div>
  );
}
function LocalityRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const n = 16;
  const stride = Math.max(1, config.stride | 0);
  const seq: number[] = [];
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i += stride) seq.push(i);
  const count = Array(n).fill(0);
  seq.forEach((i) => count[i]++);
  const reuse = count.reduce((s, c) => s + Math.max(0, c - 1), 0);
  const touched = count.filter((c) => c > 0).length;
  return (
    <Panel>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {Array.from({ length: n }, (_, i) => {
          const c = count[i];
          const bg = c === 0 ? "#f1f5f9" : c === 1 ? "#dbeafe" : "#dcfce7";
          const fg = c === 0 ? "#cbd5e1" : c === 1 ? "#1d4ed8" : "#15803d";
          return (
            <div key={i} style={{ width: 46, textAlign: "center", padding: "6px 0", borderRadius: 8, border: `1.5px solid ${fg}55`, background: bg }}>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>[{i}]</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: fg }}>{c > 0 ? `×${c}` : "—"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", fontSize: 13 }}>
        <span>{isZh ? "访问元素" : "touched"} = <b>{touched}</b></span>
        <span>{isZh ? "重复访问 (时间局部性)" : "reuse (temporal)"} = <b style={{ color: "#15803d" }}>{reuse}</b></span>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
        {isZh ? (
          <>
            <b>步长 1</b>: 顺序访问相邻地址 → <b>空间局部性</b>好, 一个 cache 块可命中多个元素。<br />
            <b>步长大</b>: 每次跳到新块, 空间局部性差; 第二轮重复同一集合 → <b>时间局部性</b>。
          </>
        ) : (
          <>
            <b>Stride 1</b>: sequential → good spatial locality. <b>Large stride</b>: a new block each time; second pass reuses (temporal).
          </>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// cache: 映射 + 地址划分 + 命中
// ---------------------------------------------------------------------
type CacheCfg = {
  cacheKB: number; blockB: number; ways: number;
  addr: number;
  tags: (number | null)[];
  ptr: number;
  last: { set: number; tag: number; hit: boolean; way: number } | null;
  log: { addr: number; hit: boolean; set: number }[];
};
const CACHE_DEFAULT: CacheCfg = { cacheKB: 1, blockB: 16, ways: 1, addr: 0x00001234, tags: Array(64).fill(null), ptr: 0, last: null, log: [] };

function geo(cacheKB: number, blockB: number, ways: number) {
  const numBlocks = (cacheKB * 1024) / blockB;
  const numSets = Math.max(1, Math.floor(numBlocks / ways));
  const offsetBits = log2(blockB);
  const indexBits = log2(numSets);
  return { numBlocks, numSets, ways, offsetBits, indexBits, tagBits: 32 - offsetBits - indexBits };
}
function decode(addr: number, g: ReturnType<typeof geo>) {
  const offset = addr & ((1 << g.offsetBits) - 1);
  const indexMask = g.numSets > 1 ? (1 << g.indexBits) - 1 : 0;
  const index = (addr >>> g.offsetBits) & indexMask;
  const tag = addr >>> (g.offsetBits + g.indexBits);
  return { offset, index, tag };
}

function CacheControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as CacheCfg;
  const resize = (p: Partial<CacheCfg>) => {
    const next = { ...cfg, ...p };
    const g = geo(next.cacheKB, next.blockB, next.ways);
    onChange({ ...next, tags: Array(g.numSets * g.ways).fill(null), ptr: 0, last: null, log: [] });
  };
  const access = () => {
    const g = geo(cfg.cacheKB, cfg.blockB, cfg.ways);
    const { index: set, tag } = decode(cfg.addr, g);
    const tags = [...(cfg.tags ?? [])];
    while (tags.length < g.numSets * g.ways) tags.push(null);
    let hit = false; let way = -1;
    for (let w = 0; w < g.ways; w++) if (tags[set * g.ways + w] === tag) { hit = true; way = w; break; }
    if (!hit) {
      way = 0;
      for (let w = 0; w < g.ways; w++) if (tags[set * g.ways + w] === null) { way = w; break; }
      if (way === 0 && g.ways > 1 && cfg.ptr % g.ways !== 0 && tags[set * g.ways] !== null) {
        // 已满: 简单轮转替换
        way = cfg.ptr % g.ways;
      }
      tags[set * g.ways + way] = tag;
    }
    onChange({ ...cfg, tags, ptr: (cfg.ptr + 1) % Math.max(1, g.ways), last: { set, tag, hit, way }, log: [...(cfg.log ?? []), { addr: cfg.addr, hit, set }].slice(-8) });
  };
  const clear = () => {
    const g = geo(cfg.cacheKB, cfg.blockB, cfg.ways);
    onChange({ ...cfg, tags: Array(g.numSets * g.ways).fill(null), ptr: 0, last: null, log: [] });
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "容量" : "Size"}</span>
        <select className="txt" value={cfg.cacheKB} onChange={(e) => resize({ cacheKB: Number(e.target.value) })}>{[1, 2, 4, 8].map((v) => <option key={v} value={v}>{v} KB</option>)}</select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "块大小" : "Block"}</span>
        <select className="txt" value={cfg.blockB} onChange={(e) => resize({ blockB: Number(e.target.value) })}>{[4, 8, 16, 32].map((v) => <option key={v} value={v}>{v} B</option>)}</select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "相联度" : "Ways"}</span>
        <select className="txt" value={cfg.ways} onChange={(e) => resize({ ways: Number(e.target.value) })}>
          <option value={1}>{isZh ? "直接映射 (1路)" : "Direct (1-way)"}</option>
          <option value={2}>2 {isZh ? "路" : "way"}</option>
          <option value={4}>4 {isZh ? "路" : "way"}</option>
        </select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "地址" : "Addr"}</span>
        <input className="txt" value={hx(cfg.addr)} onChange={(e) => onChange({ ...cfg, addr: parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ""), 16) || 0 })} style={{ width: 110, fontFamily: "ui-monospace, monospace" }} />
      </label>
      <button className="ghost" onClick={access} style={{ background: "#eef2ff", borderColor: "#c7d2fe", color: "#4338ca", fontWeight: 800 }}>{isZh ? "访问" : "Access"}</button>
      <button className="ghost" onClick={clear}>{isZh ? "清空" : "Clear"}</button>
    </div>
  );
}
function CacheRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as CacheCfg;
  const g = geo(cfg.cacheKB, cfg.blockB, cfg.ways);
  const d = decode(cfg.addr, g);
  const tags = cfg.tags ?? [];
  const last = cfg.last;
  const log = cfg.log ?? [];
  const hits = log.filter((x) => x.hit).length;
  const field = (label: string, val: string, color: string, bg: string, w: number) => (
    <div style={{ flexGrow: w, flexBasis: 0, background: bg, borderRight: "1px solid #cbd5e1", padding: "5px 4px", textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color }}>{label}</div>
      <div style={{ fontSize: 9, color: "#94a3b8" }}>{w} bits</div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, color, letterSpacing: 1, wordBreak: "break-all" }}>{val}</div>
    </div>
  );
  return (
    <Panel>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", fontSize: 12, color: "#475569" }}>
        <span>{isZh ? "块数" : "blocks"} = <b>{g.numBlocks}</b></span>
        <span>{isZh ? "组数" : "sets"} = <b>{g.numSets}</b></span>
        <span>{isZh ? "相联" : "ways"} = <b>{g.ways}</b></span>
        <span>tag/index/offset = <b>{g.tagBits} / {g.indexBits} / {g.offsetBits}</b></span>
      </div>
      <div style={{ display: "flex", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
        {field("tag", bits(d.tag, g.tagBits), "#4338ca", "#e0e7ff", Math.max(1, g.tagBits))}
        {field("index", bits(d.index, g.indexBits), "#15803d", "#dcfce7", Math.max(1, g.indexBits))}
        {field("offset", bits(d.offset, g.offsetBits), "#b45309", "#fef3c7", Math.max(1, g.offsetBits))}
      </div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, textAlign: "center", color: "#475569" }}>
        {isZh ? "地址" : "addr"} {hx(cfg.addr)} → tag={hx(d.tag, Math.ceil(g.tagBits / 4))}, set={d.index}, offset={d.offset}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-grid", gap: 3, minWidth: "max-content" }}>
          <div style={{ display: "grid", gridTemplateColumns: `54px repeat(${g.ways}, 72px)`, gap: 3, fontSize: 10, color: "#94a3b8" }}>
            <div>{isZh ? "组" : "set"}</div>
            {Array.from({ length: g.ways }, (_, w) => <div key={w} style={{ textAlign: "center" }}>{isZh ? "路" : "way"} {w}</div>)}
          </div>
          {Array.from({ length: g.numSets }, (_, s) => {
            const activeSet = last?.set === s;
            return (
              <div key={s} style={{ display: "grid", gridTemplateColumns: `54px repeat(${g.ways}, 72px)`, gap: 3, alignItems: "center" }}>
                <div style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", fontWeight: 700, color: activeSet ? "#4338ca" : "#64748b" }}>#{s}</div>
                {Array.from({ length: g.ways }, (_, w) => {
                  const tg = tags[s * g.ways + w];
                  const isHit = last?.hit && last.set === s && last.way === w;
                  const isFill = last && !last.hit && last.set === s && last.way === w;
                  return (
                    <div key={w} style={{
                      textAlign: "center", padding: "4px 2px", borderRadius: 6, fontSize: 11, fontFamily: "ui-monospace, monospace",
                      background: isHit ? "#dcfce7" : isFill ? "#fee2e2" : activeSet ? "#f5f3ff" : "#f8fafc",
                      border: `1.5px solid ${isHit ? "#16a34a" : isFill ? "#ef4444" : "#e2e8f0"}`,
                      color: tg === null ? "#cbd5e1" : "#334155", fontWeight: 700,
                    }}>{tg === null ? "—" : `tag ${hx(tg, Math.ceil(g.tagBits / 4))}`}</div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: last ? (last.hit ? "#15803d" : "#b91c1c") : "#94a3b8" }}>
        {last ? (last.hit ? (isZh ? `命中 (set ${last.set}, way ${last.way})` : `HIT set ${last.set} way ${last.way}`) : (isZh ? `缺失 → 装入 (set ${last.set}, way ${last.way})` : `MISS → fill set ${last.set} way ${last.way}`)) : (isZh ? "输入地址后点「访问」" : "enter address, click Access")}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {log.map((x, i) => (
          <span key={i} title={hx(x.addr)} style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "2px 8px", borderRadius: 6, background: x.hit ? "#dcfce7" : "#fee2e2", color: x.hit ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
            {x.hit ? "H" : "M"}
          </span>
        ))}
        {log.length > 0 && <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>{isZh ? `命中率 ${hits}/${log.length}` : `hit ${hits}/${log.length}`}</span>}
      </div>
      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.9 }}>
        {isZh
          ? "AMAT = 命中时间 + 缺失率 × 缺失代价。直接映射冲突多; 组相联折中; 全相联冲突最少但硬件贵(TLB 用)。"
          : "AMAT = hit time + miss rate × miss penalty. Direct-mapped conflicts most; set-assoc balances; fully-assoc (TLB) least conflicts."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// virtual: 虚拟内存
// ---------------------------------------------------------------------
type VmCfg = {
  va: number; pageKB: number;
  table: number[];
  tlb: { vpn: number; pfn: number }[];
  last: { vpn: number; offset: number; pfn: number; tlbHit: boolean; fault: boolean } | null;
};
const VM_DEFAULT: VmCfg = {
  va: 0x00001abc, pageKB: 4,
  table: [0x1, 0x5, 0x2, -1, 0x0, 0x7, 0x3, 0x6, 0x4, -1, 0x8, 0x9, -1, 0xa, 0xb, 0xc],
  tlb: [], last: null,
};
function VmControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as VmCfg;
  const walk = () => {
    const offsetBits = log2(cfg.pageKB * 1024);
    const vpn = cfg.va >>> offsetBits;
    const offset = cfg.va & ((1 << offsetBits) - 1);
    const pfn = vpn < cfg.table.length ? cfg.table[vpn] : -1;
    const fault = pfn < 0;
    const tlbHit = cfg.tlb.some((e) => e.vpn === vpn);
    const tlb = tlbHit ? cfg.tlb : [{ vpn, pfn }, ...cfg.tlb].slice(0, 4);
    onChange({ ...cfg, tlb, last: { vpn, offset, pfn, tlbHit, fault } });
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "虚拟地址" : "VA"}</span>
        <input className="txt" value={hx(cfg.va)} onChange={(e) => onChange({ ...cfg, va: parseInt(e.target.value.replace(/[^0-9a-fA-Fx]/g, ""), 16) || 0 })} style={{ width: 120, fontFamily: "ui-monospace, monospace" }} />
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{isZh ? "页大小" : "Page"}</span>
        <select className="txt" value={cfg.pageKB} onChange={(e) => onChange({ ...cfg, pageKB: Number(e.target.value), tlb: [], last: null })}>{[1, 4, 16].map((v) => <option key={v} value={v}>{v} KB</option>)}</select>
      </label>
      <button className="ghost" onClick={walk} style={{ background: "#eef2ff", borderColor: "#c7d2fe", color: "#4338ca", fontWeight: 800 }}>{isZh ? "翻译" : "Translate"}</button>
    </div>
  );
}
function VmRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config as VmCfg;
  const offsetBits = log2(cfg.pageKB * 1024);
  const vpn = cfg.va >>> offsetBits;
  const offset = cfg.va & ((1 << offsetBits) - 1);
  const last = cfg.last;
  const pfn = last?.pfn ?? (vpn < cfg.table.length ? cfg.table[vpn] : -1);
  const fault = pfn < 0;
  const pa = fault ? 0 : ((pfn << offsetBits) | offset) >>> 0;
  const vpnBits = 20 - offsetBits;
  return (
    <Panel>
      <div style={{ display: "flex", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ flexGrow: vpnBits, flexBasis: 0, background: "#e0e7ff", borderRight: "1px solid #cbd5e1", padding: "5px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#4338ca" }}>VPN</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#4338ca" }}>{bits(vpn, vpnBits)}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>={vpn} (0x{vpn.toString(16)})</div>
        </div>
        <div style={{ flexGrow: offsetBits, flexBasis: 0, background: "#fef3c7", padding: "5px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#b45309" }}>offset</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#b45309" }}>{bits(offset, offsetBits)}</div>
          <div style={{ fontSize: 10, color: "#64748b" }}>={offset}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ flex: "1 1 220px", minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>TLB ({isZh ? "全相联" : "fully-assoc"})</div>
          {cfg.tlb.length === 0 ? <div style={{ fontSize: 12, color: "#94a3b8" }}>—</div> : cfg.tlb.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "ui-monospace, monospace", padding: "3px 8px", borderRadius: 6, background: last?.vpn === e.vpn ? "#dcfce7" : "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 3 }}>
              <span>VPN {e.vpn}</span><span>→ PFN {e.pfn < 0 ? "缺页" : e.pfn}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{isZh ? "页表 (前 8 项)" : "Page table (first 8)"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3 }}>
            {cfg.table.slice(0, 8).map((p, i) => (
              <div key={i} style={{ textAlign: "center", padding: "3px 0", borderRadius: 6, fontSize: 11, fontFamily: "ui-monospace, monospace", background: vpn === i ? "#eef2ff" : "#f8fafc", border: `1.5px solid ${vpn === i ? "#4f46e5" : "#e2e8f0"}`, color: p < 0 ? "#b91c1c" : "#334155" }}>
                {i}→{p < 0 ? "缺" : p}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 900, color: last ? (last.tlbHit ? "#15803d" : "#b45309") : "#94a3b8" }}>
        {last ? (last.tlbHit ? (isZh ? "TLB 命中 (无需访存页表)" : "TLB HIT") : (isZh ? "TLB 缺失 → 查页表" : "TLB MISS → page-table walk")) : (isZh ? "输入 VA 后点「翻译」" : "enter VA, click Translate")}
      </div>
      {last && (
        <div style={{ textAlign: "center", fontFamily: "ui-monospace, monospace", fontSize: 14, color: fault ? "#b91c1c" : "#1e40af", fontWeight: 800 }}>
          {fault ? (isZh ? "→ 缺页异常 (OS 处理)" : "→ page fault") : `→ PA = ${hx(pa)}`}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "TLB 命中只走 TLB; 缺失则查页表(命中)或触发缺页异常。" : "TLB hit = fast path; miss → page table walk or page fault."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// dram / design
// ---------------------------------------------------------------------
function DramRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const items: [string, string][] = isZh
    ? [
      ["DRAM 单元", "电容存 1 位, 会漏电 → 需周期性刷新"],
      ["地址复用", "行地址(RAS) + 列地址(CAS) 分两次送, 减少引脚"],
      ["SDRAM / DDR", "与时钟同步; DDR 上升沿+下降沿都传 → 双倍速率"],
      ["突发传输", "一次命令连续传多个字, 摊薄地址开销"],
      ["多 Bank 交错", "不同 bank 并行, 提升有效带宽"],
    ]
    : [
      ["Cell", "capacitor, leaks → periodic refresh"],
      ["Address mux", "row (RAS) + column (CAS), fewer pins"],
      ["SDRAM / DDR", "clocked; both edges → double data rate"],
      ["Burst", "one command, many words"],
      ["Bank interleave", "parallel banks → more bandwidth"],
    ];
  return <Panel><Table head={isZh ? ["要点", "说明"] : ["Point", "Note"]} rows={items} /></Panel>;
}
function DesignRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["局部性", "时间/空间局部性决定缓存整体收益"],
      ["块大小", "大块→空间局部性好, 但缺失代价/污染增大"],
      ["相联度", "越高冲突缺失越少, 但命中时间/成本上升"],
      ["写策略", "写回(减少写流量) vs 写直达(简单一致)"],
      ["包含性", "inclusive 简化一致; exclusive 省容量"],
      ["物理 vs 虚拟索引", "虚拟索引省 TLB 转换, 但需处理同义/别名"],
    ]
    : [
      ["Locality", "temporal/spatial drives benefit"],
      ["Block size", "large → spatial, but cost/pollution up"],
      ["Associativity", "fewer conflict misses, higher hit time"],
      ["Write policy", "write-back vs write-through"],
      ["Inclusion", "inclusive (coherence) vs exclusive (capacity)"],
      ["Virt/phys index", "VIPT trades synonym handling"],
    ];
  return <Panel><Table head={isZh ? ["设计点", "权衡"] : ["Design point", "Trade-off"]} rows={rows} /></Panel>;
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  levels: { id: "levels", title: T("存储层次", "Levels"), defaultConfig: {}, generate: () => [{ caption: T("存储层次概述", "Memory hierarchy"), scene: {} }] as never, Render: LevelsRender as never } as unknown as ModuleDef,
  locality: { id: "locality", title: T("局部性", "Locality"), defaultConfig: { stride: 1 }, Controls: LocalityControls as never, generate: () => [{ caption: T("局部性原理", "Locality"), scene: {} }] as never, Render: LocalityRender as never } as unknown as ModuleDef,
  cache: { id: "cache", title: T("缓存", "Cache"), defaultConfig: CACHE_DEFAULT, Controls: CacheControls as never, generate: () => [{ caption: T("缓存映射与地址划分", "Cache mapping"), scene: {} }] as never, Render: CacheRender as never } as unknown as ModuleDef,
  virtual: { id: "virtual", title: T("虚拟内存", "Virtual Memory"), defaultConfig: VM_DEFAULT, Controls: VmControls as never, generate: () => [{ caption: T("虚拟内存地址翻译", "VA translation"), scene: {} }] as never, Render: VmRender as never } as unknown as ModuleDef,
  dram: { id: "dram", title: T("DRAM", "DRAM"), defaultConfig: {}, generate: () => [{ caption: T("SDRAM 与 DRAM", "DRAM"), scene: {} }] as never, Render: DramRender as never } as unknown as ModuleDef,
  design: { id: "design", title: T("设计原则", "Design"), defaultConfig: {}, generate: () => [{ caption: T("存储层次设计", "Design"), scene: {} }] as never, Render: DesignRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "层次", opts: [
    { v: "levels", zh: "存储层次", en: "Levels" },
    { v: "locality", zh: "局部性", en: "Locality" },
    { v: "dram", zh: "DRAM", en: "DRAM" },
  ]},
  { label: "缓存", opts: [
    { v: "cache", zh: "缓存映射", en: "Cache" },
    { v: "design", zh: "设计原则", en: "Design" },
  ]},
  { label: "虚拟内存", opts: [
    { v: "virtual", zh: "地址翻译", en: "Virtual" },
  ]},
];

const DEFAULT: Cfg = { subMode: "levels", ...(SUB.levels as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.levels;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "levels";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const memoryHierarchyModule: ModuleDef<any, Cfg> = {
  id: "memory-hierarchy",
  title: T("存储层次", "Memory Hierarchy"),
  desc: T("层次 / 局部性 / 缓存映射与地址划分 / 虚拟内存与 TLB / DRAM / 设计原则。", "Hierarchy / locality / cache mapping & address split / virtual memory & TLB / DRAM / design."),
  tags: ["computer-organization", "memory"],
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "存储层次" : "MEMORY"}</span>
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
    return frames.length ? frames : [{ caption: T("存储层次", "Memory Hierarchy"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
