import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// I/O 系统与总线 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/io_bus.tex
//   layers(层次) / mapped(内存映射 vs 独立) / sync(轮询·中断·DMA)
//   / bus(总线·PCIe) / storage(磁盘 vs SSD) / summary(架构总结)
// =====================================================================

type SubMode = "layers" | "mapped" | "sync" | "bus" | "storage" | "summary";

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

// ---------------------------------------------------------------------
// layers
// ---------------------------------------------------------------------
function LayersRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const chain = isZh ? ["设备", "设备控制器", "总线", "CPU / 内存"] : ["Device", "Controller", "Bus", "CPU / Memory"];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        {chain.map((c, i) => (
          <div key={c} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1.5px solid #c7d2fe", color: "#3730a3", fontWeight: 800, fontSize: 13 }}>{c}</div>
            {i < chain.length - 1 && <span style={{ color: "#c7d2fe", padding: "0 4px", fontSize: 16 }}>↔</span>}
          </div>
        ))}
      </div>
      <Table
        head={isZh ? ["控制器寄存器", "作用"] : ["Controller register", "Role"]}
        rows={isZh
          ? [["状态 (Status)", "设备忙/就绪/错误标志"], ["控制 (Control)", "命令位(启动/复位/方向)"], ["数据 (Data)", "读写的数据缓冲"]]
          : [["Status", "busy / ready / error flags"], ["Control", "command bits (start/reset/dir)"], ["Data", "data buffer"]]}
      />
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
        {isZh ? "CPU 只与控制器寄存器交互, 屏蔽具体设备差异。" : "CPU talks only to controller registers, abstracting devices."}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// mapped
// ---------------------------------------------------------------------
function MappedControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.scheme} onChange={(e) => onChange({ ...config, scheme: e.target.value })} style={{ fontWeight: 700 }}>
        <option value="mmio">{isZh ? "内存映射 I/O" : "Memory-mapped"}</option>
        <option value="isolated">{isZh ? "独立 I/O" : "Isolated I/O"}</option>
      </select>
    </div>
  );
}
function MappedRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const mmio = config.scheme === "mmio";
  const bar = (label: string, regions: { name: string; w: number; bg: string; fg: string }[]) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #cbd5e1" }}>
        {regions.map((r, i) => (
          <div key={i} style={{ flexGrow: r.w, flexBasis: 0, background: r.bg, color: r.fg, textAlign: "center", padding: "10px 4px", fontSize: 12, fontWeight: 700, borderRight: i < regions.length - 1 ? "1px solid #cbd5e1" : "none" }}>{r.name}</div>
        ))}
      </div>
    </div>
  );
  return (
    <Panel>
      {mmio ? (
        <>
          {bar(isZh ? "单一地址空间 (0 → 4 GB)" : "Single address space (0 → 4 GB)", [
            { name: isZh ? "RAM" : "RAM", w: 5, bg: "#dbeafe", fg: "#1d4ed8" },
            { name: isZh ? "设备寄存器 (MMIO)" : "Device regs (MMIO)", w: 1, bg: "#fef3c7", fg: "#b45309" },
            { name: isZh ? "RAM" : "RAM", w: 2, bg: "#dbeafe", fg: "#1d4ed8" },
            { name: isZh ? "显存/其他" : "Framebuffer", w: 1, bg: "#fce7f3", fg: "#be185d" },
          ])}
        </>
      ) : (
        <>
          {bar(isZh ? "内存地址空间" : "Memory space", [
            { name: isZh ? "RAM" : "RAM", w: 8, bg: "#dbeafe", fg: "#1d4ed8" },
          ])}
          {bar(isZh ? "独立 I/O 端口空间 (64 KB)" : "I/O port space (64 KB)", [
            { name: isZh ? "设备端口" : "Device ports", w: 8, bg: "#fef3c7", fg: "#b45309" },
          ])}
          <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
            {isZh
              ? <>独立端口空间, 用专用 <b>in/out</b> 指令访问 (x86)。与内存空间隔离, 但指令/保护机制更复杂。</>
              : <>Separate port space accessed via <b>in/out</b> (x86). Isolated but needs special instructions.</>}
          </div>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// sync: 轮询 / 中断 / DMA
// ---------------------------------------------------------------------
type Seg = { kind: "busy" | "free"; dur: number; label?: string };
const N_BLOCKS = 4, T_DEV = 5, T_CPU = 2, T_ISR = 1, T_SETUP = 1;

function syncSegments(mode: string): Seg[] {
  if (mode === "polling") {
    const segs: Seg[] = [];
    for (let i = 0; i < N_BLOCKS; i++) { segs.push({ kind: "busy", dur: T_DEV, label: "轮询" }); segs.push({ kind: "busy", dur: T_CPU, label: "处理" }); }
    return segs;
  }
  if (mode === "interrupt") {
    const segs: Seg[] = [];
    for (let i = 0; i < N_BLOCKS; i++) { segs.push({ kind: "free", dur: T_DEV, label: "空闲" }); segs.push({ kind: "busy", dur: T_ISR + T_CPU, label: "ISR+处理" }); }
    return segs;
  }
  return [{ kind: "busy", dur: T_SETUP, label: "设置" }, { kind: "free", dur: N_BLOCKS * T_DEV, label: "DMA 传输 (CPU 解放)" }, { kind: "busy", dur: T_ISR, label: "完成中断" }];
}
function SyncControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value })} style={{ fontWeight: 700 }}>
        <option value="polling">{isZh ? "轮询 (Polling)" : "Polling"}</option>
        <option value="interrupt">{isZh ? "中断 (Interrupt)" : "Interrupt"}</option>
        <option value="dma">{isZh ? "DMA" : "DMA"}</option>
      </select>
    </div>
  );
}
function SyncRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const segs = syncSegments(config.mode);
  const total = segs.reduce((s, x) => s + x.dur, 0);
  const busy = segs.filter((s) => s.kind === "busy").reduce((s, x) => s + x.dur, 0);
  const util = Math.round((busy / total) * 100);
  return (
    <Panel>
      <div style={{ fontSize: 13, color: "#334155" }}>
        {isZh ? `场景: ${N_BLOCKS} 个数据块, 设备每块准备 ${T_DEV} 时间, CPU 处理 ${T_CPU}, 中断开销 ${T_ISR}, DMA 设置 ${T_SETUP}。` : `${N_BLOCKS} blocks; device prep ${T_DEV}, CPU ${T_CPU}, ISR ${T_ISR}, DMA setup ${T_SETUP}.`}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{isZh ? "CPU 时间线" : "CPU timeline"}</div>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #cbd5e1" }}>
          {segs.map((s, i) => (
            <div key={i} title={s.label} style={{ flexGrow: s.dur, flexBasis: 0, background: s.kind === "busy" ? "#fecaca" : "#bbf7d0", color: s.kind === "busy" ? "#b91c1c" : "#15803d", textAlign: "center", padding: "12px 2px", fontSize: 11, fontWeight: 800, borderRight: i < segs.length - 1 ? "1px solid #cbd5e1" : "none" }}>
              {s.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
          <span>0</span><span>{total}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", fontSize: 13 }}>
        <span>{isZh ? "总时间" : "Total"} = <b>{total}</b></span>
        <span>{isZh ? "CPU 占用" : "CPU busy"} = <b>{busy}</b> ({util}%)</span>
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", lineHeight: 1.9 }}>
        {config.mode === "polling" && (isZh ? "轮询: CPU 反复查状态位, 忙等期间无法做别的事 → 占用率 100%, 简单但浪费。" : "Polling: CPU busy-waits on the status bit — 100% busy, simple but wasteful.")}
        {config.mode === "interrupt" && (isZh ? "中断: 设备就绪才打断 CPU; CPU 在设备准备期间做别的工作, 但要付每次中断的现场保存开销。" : "Interrupt: device notifies; CPU works meanwhile, paying per-interrupt context overhead.")}
        {config.mode === "dma" && (isZh ? "DMA: CPU 只做一次设置, 传输由 DMA 控制器直接完成, 结束后中断一次 → CPU 占用极低, 适合大块传输。" : "DMA: CPU sets up once, controller transfers directly, one completion interrupt → minimal CPU load.")}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// bus / summary
// ---------------------------------------------------------------------
function BusRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["数据总线", "传数据, 宽度决定一次传输位数", "双向"],
      ["地址总线", "传地址, 宽度决定寻址范围", "单向 (CPU→设备)"],
      ["控制总线", "读/写/中断/时钟等控制", "双向"],
      ["同步总线", "由时钟统一节拍", "快, 但受最慢设备拖累"],
      ["异步总线", "握手信号 (req/ack) 协调", "适应不同速度设备"],
    ]
    : [
      ["Data bus", "carries data; width = transfer size", "bidirectional"],
      ["Address bus", "carries address; width = range", "unidirectional"],
      ["Control bus", "read/write/interrupt/clock", "bidirectional"],
      ["Synchronous", "clocked", "fast; limited by slowest"],
      ["Asynchronous", "handshake (req/ack)", "tolerates varied speeds"],
    ];
  return (
    <Panel>
      <Table head={isZh ? ["总线/类型", "含义", "方向/特点"] : ["Bus", "Meaning", "Dir/Trait"]} rows={rows} />
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>PCIe</div>
      <Table
        head={isZh ? ["特性", "说明"] : ["Feature", "Note"]}
        rows={isZh
          ? [["拓扑", "点对点串行链路 (非共享并行总线), 多 lane 聚合带宽"], ["分层", "事务层 / 数据链路层 / 物理层"], ["方向", "每 lane 收发独立, 全双工"], ["演进", "高频串行取代宽并行, 带宽随代数翻倍"]]
          : [["Topology", "point-to-point serial, multi-lane aggregation"], ["Layers", "transaction / data-link / physical"], ["Duplex", "independent TX/RX per lane"], ["Trend", "serial beats wide parallel"] ]}
      />
    </Panel>
  );
}
function SummaryRender({ t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const rows: React.ReactNode[][] = isZh
    ? [
      ["北桥 / 南桥", "传统: 内存控制器 + PCIe 走北桥, 慢速 I/O 走南桥"],
      ["SoC 集成", "内存控制器与 PCIe 移入 CPU, 北桥消失"],
      ["多核互联", "环形/网格片上网络 + 缓存一致性协议"],
      ["并行 I/O", "NVMe / 多通道, 以 DMA 与队列深度换吞吐"],
      ["界面", "I/O 是 CPU 与 OS 交互的关键界面 (中断/驱动)"],
    ]
    : [
      ["North/South bridge", "memory ctrl + PCIe on north; slow I/O on south"],
      ["SoC integration", "memory ctrl & PCIe into CPU; north bridge gone"],
      ["Interconnect", "ring/mesh NoC + cache coherence"],
      ["Parallel I/O", "NVMe / multi-channel, DMA + queue depth"],
      ["Interface", "I/O is the key CPU/OS interface"],
    ];
  return <Panel><Table head={isZh ? ["主题", "要点"] : ["Topic", "Point"]} rows={rows} /></Panel>;
}

// ---------------------------------------------------------------------
// storage: 磁盘 vs SSD
// ---------------------------------------------------------------------
const STORAGE_DEFAULT = { seek: 8, rpm: 7200, xfer: 150, sizeKB: 4 };
function StorageControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config;
  const pct = (label: string, key: string, min: number, max: number, step: number, unit = "") => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={cfg[key]} onChange={(e) => onChange({ ...cfg, [key]: Number(e.target.value) })} />
      <b style={{ fontFamily: "ui-monospace, monospace" }}>{cfg[key]}{unit}</b>
    </label>
  );
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>HDD</span>
      {pct(isZh ? "寻道" : "Seek", "seek", 0, 15, 1, " ms")}
      {pct("RPM", "rpm", 5400, 15000, 1800)}
      {pct(isZh ? "传输" : "Xfer", "xfer", 50, 500, 50, " MB/s")}
      {pct(isZh ? "块大小" : "Block", "sizeKB", 1, 64, 1, " KB")}
    </div>
  );
}
function StorageRender({ config, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const cfg = config;
  const rot = 30000 / cfg.rpm; // 平均旋转延迟(半圈)
  const xferMs = (cfg.sizeKB / 1024) / cfg.xfer * 1000;
  const hdd = cfg.seek + rot + xferMs;
  const ssd = 0.1 + xferMs;
  const parts = [
    { name: isZh ? "寻道" : "Seek", v: cfg.seek, c: "#fecaca" },
    { name: isZh ? "旋转" : "Rotation", v: rot, c: "#fef3c7" },
    { name: isZh ? "传输" : "Transfer", v: xferMs, c: "#dbeafe" },
  ];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 13 }}>
        <MathText text={`$T_{\\text{HDD}} = T_{\\text{seek}} + \\frac{30000}{\\text{RPM}} + \\frac{\\text{bytes}}{\\text{rate}}$`} />
      </div>
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #cbd5e1", height: 34 }}>
        {parts.map((p, i) => (
          <div key={i} style={{ flexGrow: Math.max(0.001, p.v), flexBasis: 0, background: p.c, color: "#334155", textAlign: "center", fontSize: 11, fontWeight: 700, lineHeight: "34px", borderRight: "1px solid #cbd5e1" }}>{p.name}{p.v >= 0.5 ? ` ${p.v.toFixed(1)}` : ""}</div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", fontSize: 14 }}>
        <span>HDD: <b style={{ color: "#b91c1c", fontFamily: "ui-monospace, monospace" }}>{hdd.toFixed(2)} ms</b></span>
        <span>SSD: <b style={{ color: "#15803d", fontFamily: "ui-monospace, monospace" }}>{ssd.toFixed(2)} ms</b></span>
        <span style={{ color: "#4338ca" }}>{isZh ? "提速" : "Speedup"} ≈ <b>{(hdd / ssd).toFixed(1)}×</b></span>
      </div>
    </Panel>
  );
}

// =====================================================================
// 聚合
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

const SUB: Record<SubMode, ModuleDef> = {
  layers: { id: "layers", title: T("I/O 层次", "Layers"), defaultConfig: {}, generate: () => [{ caption: T("I/O 系统层次", "I/O layers"), scene: {} }] as never, Render: LayersRender as never } as unknown as ModuleDef,
  mapped: { id: "mapped", title: T("映射方式", "Mapped I/O"), defaultConfig: { scheme: "mmio" }, Controls: MappedControls as never, generate: () => [{ caption: T("内存映射 vs 独立 I/O", "Mapped I/O"), scene: {} }] as never, Render: MappedRender as never } as unknown as ModuleDef,
  sync: { id: "sync", title: T("同步方式", "Synchronization"), defaultConfig: { mode: "polling" }, Controls: SyncControls as never, generate: () => [{ caption: T("轮询 / 中断 / DMA", "Polling / Interrupt / DMA"), scene: {} }] as never, Render: SyncRender as never } as unknown as ModuleDef,
  bus: { id: "bus", title: T("总线与 PCIe", "Bus & PCIe"), defaultConfig: {}, generate: () => [{ caption: T("总线与 PCIe", "Bus & PCIe"), scene: {} }] as never, Render: BusRender as never } as unknown as ModuleDef,
  storage: { id: "storage", title: T("磁盘与 SSD", "Disk & SSD"), defaultConfig: STORAGE_DEFAULT, Controls: StorageControls as never, generate: () => [{ caption: T("磁盘与 SSD 访问时间", "Disk vs SSD"), scene: {} }] as never, Render: StorageRender as never } as unknown as ModuleDef,
  summary: { id: "summary", title: T("架构总结", "Summary"), defaultConfig: {}, generate: () => [{ caption: T("系统总线架构总结", "Architecture summary"), scene: {} }] as never, Render: SummaryRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "I/O", opts: [
    { v: "layers", zh: "I/O 层次", en: "Layers" },
    { v: "mapped", zh: "映射方式", en: "Mapped" },
    { v: "sync", zh: "轮询/中断/DMA", en: "Sync" },
  ]},
  { label: "总线与存储", opts: [
    { v: "bus", zh: "总线/PCIe", en: "Bus" },
    { v: "storage", zh: "磁盘/SSD", en: "Storage" },
    { v: "summary", zh: "架构总结", en: "Summary" },
  ]},
];

const DEFAULT: Cfg = { subMode: "layers", ...(SUB.layers as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.layers;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "layers";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const ioBusModule: ModuleDef<any, Cfg> = {
  id: "io-bus",
  title: T("I/O 与总线", "I/O & Bus"),
  desc: T("I/O 层次 / 内存映射 / 轮询·中断·DMA / 总线与 PCIe / 磁盘与 SSD / 架构总结。", "I/O layers / mapped I/O / polling, interrupt, DMA / bus & PCIe / disk & SSD / summary."),
  tags: ["computer-organization", "io"],
  interactive: true,
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
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "I/O 与总线" : "I/O & BUS"}</span>
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
    return frames.length ? frames : [{ caption: T("I/O 与总线", "I/O & Bus"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    return createElement(m.Render as any, { ...(props as any), config: safe } as any);
  },
};
