import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

// =====================================================================
// I/O 系统与总线 · 单模块聚合 · 交互式
//   对应 tex/ComputerOrganization/chapters/io_bus.tex
//   mapped(内存映射 vs 独立) / sync(轮询·中断·DMA) / storage(磁盘 vs SSD)
// =====================================================================

type SubMode = "mapped" | "sync" | "storage";

function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: "100%", margin: "0 auto", display: "grid", gap: 12 }}>{children}</div>;
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
  mapped: { id: "mapped", title: T("映射方式", "Mapped I/O"), defaultConfig: { scheme: "mmio" }, Controls: MappedControls as never, generate: () => [{ caption: T("内存映射 vs 独立 I/O", "Mapped I/O"), scene: {} }] as never, Render: MappedRender as never } as unknown as ModuleDef,
  sync: { id: "sync", title: T("同步方式", "Synchronization"), defaultConfig: { mode: "polling" }, Controls: SyncControls as never, generate: () => [{ caption: T("轮询 / 中断 / DMA", "Polling / Interrupt / DMA"), scene: {} }] as never, Render: SyncRender as never } as unknown as ModuleDef,
  storage: { id: "storage", title: T("磁盘与 SSD", "Disk & SSD"), defaultConfig: STORAGE_DEFAULT, Controls: StorageControls as never, generate: () => [{ caption: T("磁盘与 SSD 访问时间", "Disk vs SSD"), scene: {} }] as never, Render: StorageRender as never } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
export const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "I/O", opts: [
    { v: "mapped", zh: "映射方式", en: "Mapped" },
    { v: "sync", zh: "轮询/中断/DMA", en: "Sync" },
  ]},
  { label: "总线与存储", opts: [
    { v: "storage", zh: "磁盘/SSD", en: "Storage" },
  ]},
];

const DEFAULT: Cfg = { subMode: "mapped", ...(SUB.mapped as any).defaultConfig };

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.mapped;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "mapped";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = ((m.defaultConfig as any) ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

export const ioBusModule: ModuleDef<any, Cfg> = {
  id: "io-bus",
  title: T("I/O 与总线", "I/O & Bus"),
  desc: T("内存映射 / 轮询·中断·DMA / 磁盘与 SSD。", "Mapped I/O / polling, interrupt, DMA / disk & SSD."),
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
