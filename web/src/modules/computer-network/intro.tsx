import { T, type Text } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Note, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 第1章 概述与体系结构
//   对应 tex/ComputerNetwork/chapters/intro.tex
//   switching(交换方式) / performance(性能指标·时延公式推导)
// =====================================================================

type SubMode = "switching" | "performance";

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

const SW_DEFAULT = { sizeMb: 1, rateMbps: 10, hops: 3, users: 20, circuitUsers: 10 };
function SwitchingControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "链路速率" : "Rate"} value={config.rateMbps} onChange={(v) => set({ rateMbps: v })} min={1} max={1000} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Mbps</span>
      <NumField label={zh ? "跳数" : "Hops"} value={config.hops} onChange={(v) => set({ hops: v })} min={1} max={6} width={70} />
      <NumField label={zh ? "包大小" : "Packet"} value={config.sizeMb} onChange={(v) => set({ sizeMb: v })} min={0.01} max={100} step={0.01} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Mbit</span>
      <NumField label={zh ? "同时用户" : "Users"} value={config.users} onChange={(v) => set({ users: v })} min={1} max={1000} width={80} />
      <NumField label={zh ? "电路用户" : "Circuit users"} value={config.circuitUsers} onChange={(v) => set({ circuitUsers: v })} min={1} max={1000} width={80} />
    </div>
  );
}

type SwitchScene = { pos: number; hops: number; lenBits: number; rateMbps: number; phase: "send" | "queue" | "forward" | "arrive" };

// 存储转发：包在 源(0) → 交换机(1..hops) → 目的(hops+1) 之间逐跳推进。
function switchingGenerate(config: any): Frame<SwitchScene>[] {
  const hops = Math.max(1, Math.min(6, Math.round(Number(config.hops) || 3)));
  const rateMbps = Number(config.rateMbps) || 10;
  const lenBits = Math.max(1, Math.round(Number(config.sizeMb ?? 1) * 1e6));
  const dtrans = lenBits / (rateMbps * 1e6) * 1000; // 每跳传输时延 ms
  const base = { hops, lenBits, rateMbps };
  const frames: Frame<SwitchScene>[] = [
    { line: 0, caption: T(`源主机把分组推上链路：$L=${lenBits}$ bit，$R=${rateMbps}$ Mbps`, `Source pushes the packet onto the link: $L=${lenBits}$ bit, $R=${rateMbps}$ Mbps`), scene: { ...base, pos: 0, phase: "send" } },
  ];
  for (let i = 1; i <= hops; i++) {
    frames.push({ line: 2, caption: T(`第 ${i} 台交换机：先收完整帧，缓存排队`, `Switch ${i}: receive the whole frame, buffer & queue`), scene: { ...base, pos: i, phase: "queue" } });
    frames.push({ line: 1, caption: T(`第 ${i} 跳存储转发时延 $t_{trans}=L/R=${dtrans.toFixed(2)}$ ms`, `Hop ${i} store-and-forward delay $t_{trans}=L/R=${dtrans.toFixed(2)}$ ms`), scene: { ...base, pos: i, phase: "forward" } });
  }
  frames.push({ line: 3, caption: T(`到达目的主机：共 ${hops} 跳，$\approx ${hops}\\,L/R + d_{prop}$`, `Reached destination: ${hops} hops, $\approx ${hops}\\,L/R + d_{prop}$`), scene: { ...base, pos: hops + 1, phase: "arrive" } });
  return frames;
}
const SW_CODE = [
  T("每跳「存储转发」先收完整帧", "store-and-forward: ingest whole frame per hop"),
  T("$t_{trans} = L / R$", "$t_{trans} = L / R$"),
  T("交换机缓存排队后查表转发", "switch buffers, then looks up & forwards"),
  T("$(N)\\,t_{trans} + d_{prop}$", "$(N)\\,t_{trans} + d_{prop}$"),
];

function SwitchingRender({ scene, config, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<SwitchScene>;
  const hops = s.hops ?? Math.max(1, Math.round(Number(config?.hops) || 3));
  const rateMbps = s.rateMbps ?? (Number(config?.rateMbps) || 10);
  const lenBits = s.lenBits ?? Math.max(1, Math.round(Number(config?.sizeMb ?? 1) * 1e6));
  const pos = Math.max(0, Math.min(hops + 1, s.pos ?? 0));
  const dtrans = lenBits / (rateMbps * 1e6) * 1000;
  const nodes = Array.from({ length: hops + 2 }, (_, i) => i);
  const phase = s.phase;
  const canNext = !!onNext && pos < hops + 1;
  const phaseZh = phase === "send" ? "发送" : phase === "queue" ? "缓存排队" : phase === "forward" ? "存储转发" : "到达";
  const phaseEn = phase === "send" ? "send" : phase === "queue" ? "buffer/queue" : phase === "forward" ? "store-and-forward" : "arrive";
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", overflowX: "auto", padding: "16px 6px" }}>
        {nodes.map((i) => {
          const cur = i === pos;
          const passed = i <= pos;
          const label = i === 0 ? (zh ? "源主机" : "Source") : i === hops + 1 ? (zh ? "目的主机" : "Dest") : zh ? `交换机 ${i}` : `SW ${i}`;
          const icon = i === 0 || i === hops + 1 ? "🖥️" : "🔀";
          const clickable = cur && canNext;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 40, height: 3, background: i <= pos ? "#6366f1" : "#cbd5e1" }} />}
              <div style={{ display: "grid", justifyItems: "center", gap: 4, minWidth: 72 }}>
                <div style={{ height: 20, fontSize: 16 }}>{cur ? "📦" : ""}</div>
                <div onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
                  style={{ padding: "8px 10px", borderRadius: 10, background: cur ? "#eef2ff" : passed ? "#f1f5f9" : "#fff", border: `2px solid ${cur ? "#6366f1" : passed ? "#c7d2fe" : "#e2e8f0"}`, fontSize: 11, fontWeight: 700, color: "#334155", textAlign: "center", whiteSpace: "nowrap", cursor: clickable ? "pointer" : "default" }}>
                  <div>{icon}</div>
                  <div>{label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("节点", "Node")), `${pos}/${hops + 1}`],
          [t(T("阶段", "Phase")), zh ? phaseZh : phaseEn],
          [t(T("包长 L", "L")), `${lenBits} bit`],
          [t(T("速率 R", "R")), `${rateMbps} Mbps`],
          [t(T("每跳 ttrans", "ttrans")), `${dtrans.toFixed(3)} ms`],
          [t(T("累计", "Cumulative")), `${(hops * dtrans).toFixed(3)} ms`],
        ]}
        onNext={onNext} showNext={canNext}
        nextLabel={t(pos === 0 ? T("发送分组", "Send packet") : T("转发到下一跳", "Forward to next hop"))} />
      <Note tone={phase === "queue" ? "warn" : "info"}>
        {zh
          ? `包位于第 ${pos} / ${hops + 1} 个节点（${pos === 0 ? "源" : pos === hops + 1 ? "目的" : "交换机"}）。存储转发每跳 $t_{trans}=L/R=${dtrans.toFixed(3)}$ ms，共约 $${(hops * dtrans).toFixed(3)}$ ms 传输时延（不含传播/排队）。`
          : `Packet at node ${pos} / ${hops + 1} (${pos === 0 ? "source" : pos === hops + 1 ? "destination" : "switch"}). Store-and-forward per hop $t_{trans}=L/R=${dtrans.toFixed(3)}$ ms, ≈ $${(hops * dtrans).toFixed(3)}$ ms total transmission (excl. propagation/queueing).`}
      </Note>
    </Panel>
  );
}

const PERF_DEFAULT = { len: 8000, rateMbps: 1, distKm: 2500, hops: 3 };
function PerfControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "分组 L" : "L"} value={config.len} onChange={(v) => set({ len: v })} min={8} max={1e6} step={8} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>bit</span>
      <NumField label={zh ? "速率 R" : "R"} value={config.rateMbps} onChange={(v) => set({ rateMbps: v })} min={0.1} max={10000} step={0.1} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Mbps</span>
      <NumField label={zh ? "距离 d" : "d"} value={config.distKm} onChange={(v) => set({ distKm: v })} min={1} max={20000} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>km</span>
      <NumField label={zh ? "跳数 N" : "N"} value={config.hops} onChange={(v) => set({ hops: v })} min={1} max={64} width={70} />
    </div>
  );
}
// ---------------------------------------------------------------------
// 性能指标：网络时延各分量的公式推导（逐帧揭示每个导出量）
// ---------------------------------------------------------------------
type PerfScene = {
  len: number; rateMbps: number; distKm: number; hops: number;
  R: number;
  dtrans: number; dprop: number; dproc: number; dqueue: number;
  nodal: number; e2e: number; bdp: number;
  visible: number;
};

function perfScene(config: any, visible: number): PerfScene {
  const len = Math.max(1, Number(config.len) || 8000);
  const rateMbps = Math.max(0.01, Number(config.rateMbps) || 1);
  const distKm = Math.max(0, Number(config.distKm) || 2500);
  const hops = Math.max(1, Math.round(Number(config.hops) || 3));
  const R = rateMbps * 1e6;
  const dtrans = (len / R) * 1000; // ms
  const dprop = ((distKm * 1e3) / 2.5e8) * 1000; // ms
  const dproc = 0;
  const dqueue = 0;
  return {
    len, rateMbps, distKm, hops, R,
    dtrans, dprop, dproc, dqueue,
    nodal: dproc + dqueue + dtrans + dprop,
    e2e: hops * dtrans + dprop,
    bdp: (dprop / 1000) * R,
    visible,
  };
}

function perfGenerate(config: any): Frame<PerfScene>[] {
  const b = perfScene(config, 0);
  const at = (visible: number): PerfScene => ({ ...b, visible });
  return [
    { line: 0, caption: T(`已知 $L=${b.len}$ bit，$R=${b.rateMbps}$ Mbps，$d=${b.distKm}$ km，$N=${b.hops}$`, `Given $L=${b.len}$ bit, $R=${b.rateMbps}$ Mbps, $d=${b.distKm}$ km, $N=${b.hops}$`), scene: b },
    { line: 0, caption: T(`传输时延 $d_{trans}=L/R=${b.dtrans.toFixed(3)}$ ms`, `Transmission $d_{trans}=L/R=${b.dtrans.toFixed(3)}$ ms`), scene: at(1) },
    { line: 1, caption: T(`传播时延 $d_{prop}=d/s=${b.dprop.toFixed(3)}$ ms`, `Propagation $d_{prop}=d/s=${b.dprop.toFixed(3)}$ ms`), scene: at(2) },
    { line: 2, caption: T(`单跳时延 $d_{nodal}=d_{proc}+d_{queue}+d_{trans}+d_{prop}=${b.nodal.toFixed(3)}$ ms`, `Nodal $d_{nodal}=d_{proc}+d_{queue}+d_{trans}+d_{prop}=${b.nodal.toFixed(3)}$ ms`), scene: at(3) },
    { line: 3, caption: T(`端到端 $d_{e2e}=N\\cdot d_{trans}+d_{prop}=${b.e2e.toFixed(3)}$ ms`, `End-to-end $d_{e2e}=N\\cdot d_{trans}+d_{prop}=${b.e2e.toFixed(3)}$ ms`), scene: at(4) },
    { line: 4, caption: T(`时延带宽积 $DBP=d_{prop}\\cdot R=${b.bdp.toFixed(0)}$ bit`, `Delay×bandwidth $DBP=d_{prop}\\cdot R=${b.bdp.toFixed(0)}$ bit`), scene: at(5) },
    { line: 5, caption: T("带宽不是时延：时延带宽积 = 「管道」中在途的比特数", "Bandwidth is not latency: DBP = bits in flight in the pipe"), scene: at(5) },
  ];
}

const PERF_CODE = [
  T("$d_{trans} = L / R$", "$d_{trans} = L / R$"),
  T("$d_{prop} = d / s$", "$d_{prop} = d / s$"),
  T("$d_{nodal} = d_{proc} + d_{queue} + d_{trans} + d_{prop}$", "$d_{nodal} = d_{proc} + d_{queue} + d_{trans} + d_{prop}$"),
  T("$d_{e2e} = N \\cdot d_{trans} + d_{prop}$", "$d_{e2e} = N \\cdot d_{trans} + d_{prop}$"),
  T("$DBP = d_{prop} \\cdot R$", "$DBP = d_{prop} \\cdot R$"),
  T("带宽不是时延：$DBP$ 为管道中在途比特", "bandwidth ≠ latency: $DBP$ bits in flight"),
];

function PerfRow({ show, label, formula, value, color }: { show: boolean; label: string; formula: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 10, background: show ? color : "#f8fafc", border: `1px solid ${show ? "#c7d2fe" : "#e2e8f0"}`, opacity: show ? 1 : 0.35 }}>
      <span style={{ fontWeight: 800, color: "#3730a3", fontSize: 12, width: 96, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: "#334155", flex: 1, minWidth: 0 }}><MathText text={formula} /></span>
      {show && <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#1e293b", whiteSpace: "nowrap" }}>{value}</span>}
    </div>
  );
}

function PerfRender({ scene, config, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? perfScene(config ?? PERF_DEFAULT, 5)) as PerfScene;
  const v = s.visible ?? 0;
  const canNext = !!onNext && v < 5;
  const nextLabel = v === 0 ? T("计算传输时延", "Transmission delay")
    : v === 1 ? T("计算传播时延", "Propagation delay")
    : v === 2 ? T("计算单跳时延", "Nodal delay")
    : v === 3 ? T("计算端到端时延", "End-to-end delay")
    : T("计算时延带宽积", "Delay x bandwidth");
  const given: [string, string][] = [
    [zh ? "分组 L" : "L", `${s.len} bit`],
    [zh ? "速率 R" : "R", `${s.rateMbps} Mbps`],
    [zh ? "距离 d" : "d", `${s.distKm} km`],
    [zh ? "跳数 N" : "N", `${s.hops}`],
  ];
  return (
    <Panel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {given.map(([k, val]) => (
          <span key={k} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155" }}>
            {k} = <b style={{ fontFamily: "ui-monospace, monospace" }}>{val}</b>
          </span>
        ))}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("进度", "Step")), `${v}/5`],
          [t(T("传输 dtrans", "dtrans")), `${s.dtrans.toFixed(3)} ms`],
          [t(T("传播 dprop", "dprop")), `${s.dprop.toFixed(3)} ms`],
          [t(T("端到端", "e2e")), `${s.e2e.toFixed(3)} ms`],
          [t(T("时延带宽积", "DBP")), `${s.bdp.toFixed(0)} bit`],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <div style={{ display: "grid", gap: 6 }}>
        <PerfRow show={v >= 1} label={zh ? "传输时延" : "Transmission"} formula={`$d_{trans}=\\dfrac{L}{R}=\\dfrac{${s.len}}{${s.R}}=${s.dtrans.toFixed(3)}\\ \\text{ms}$`} value={`${s.dtrans.toFixed(3)} ms`} color="#dbeafe" />
        <PerfRow show={v >= 2} label={zh ? "传播时延" : "Propagation"} formula={`$d_{prop}=\\dfrac{d}{s}=\\dfrac{${s.distKm}\\times10^{3}}{2.5\\times10^{8}}=${s.dprop.toFixed(3)}\\ \\text{ms}$`} value={`${s.dprop.toFixed(3)} ms`} color="#fce7f3" />
        <PerfRow show={v >= 3} label={zh ? "单跳时延" : "Nodal"} formula={`$d_{nodal}=d_{proc}+d_{queue}+d_{trans}+d_{prop}=${s.dtrans.toFixed(3)}+${s.dprop.toFixed(3)}=${s.nodal.toFixed(3)}\\ \\text{ms}$`} value={`${s.nodal.toFixed(3)} ms`} color="#fef3c7" />
        <PerfRow show={v >= 4} label={zh ? `端到端 N=${s.hops}` : `E2E N=${s.hops}`} formula={`$d_{e2e}=N\\,d_{trans}+d_{prop}=${s.hops}\\cdot${s.dtrans.toFixed(3)}+${s.dprop.toFixed(3)}=${s.e2e.toFixed(3)}\\ \\text{ms}$`} value={`${s.e2e.toFixed(3)} ms`} color="#dcfce7" />
        <PerfRow show={v >= 5} label={zh ? "时延带宽积" : "Delay×BW"} formula={`$DBP=d_{prop}R=${(s.dprop / 1000).toFixed(4)}\\times${s.R}=${s.bdp.toFixed(0)}\\ \\text{bit}$`} value={`${s.bdp.toFixed(0)} bit`} color="#ede9fe" />
      </div>
      {v >= 2 && (
        <div>
          <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "1px solid #cbd5e1" }}>
            <div style={{ flexGrow: s.dtrans || 1e-9, flexBasis: 0, background: "#dbeafe", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#1e40af", minWidth: 2 }}>{zh ? "传输" : "trans"}</div>
            <div style={{ flexGrow: s.dprop || 1e-9, flexBasis: 0, background: "#fce7f3", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#9d174d", minWidth: 2 }}>{zh ? "传播" : "prop"}</div>
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", marginTop: 3 }}>{zh ? "单跳时延构成（按比例）" : "Single-hop delay split (to scale)"}</div>
        </div>
      )}
      {v >= 5 && (
        <div>
          <div style={{ display: "flex", gap: 3, alignItems: "center", height: 26, padding: "0 10px", borderRadius: 13, background: "#eef2ff", border: "1px solid #c7d2fe", overflow: "hidden" }}>
            {Array.from({ length: 22 }).map((_, i) => (
              <span key={i} style={{ width: 7, height: 14, borderRadius: 2, background: "#6366f1", opacity: 0.3 + 0.7 * (i / 21) }} />
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", marginTop: 3 }}>{zh ? `链路「管道」中在途比特数 ≈ ${s.bdp.toFixed(0)} bit` : `Bits in flight in the link "pipe" ≈ ${s.bdp.toFixed(0)} bit`}</div>
        </div>
      )}
      <Note>{zh ? "处理与排队时延不在控件内，示例取 $d_{proc}=d_{queue}=0$；带宽（Mbps）不是时延，时延带宽积是「管道」里能容纳的比特数。" : "Processing/queueing are not in the controls; this demo uses $d_{proc}=d_{queue}=0$. Bandwidth (Mbps) is not latency; delay×bandwidth is the bits the pipe holds."}</Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  switching: { title: T("交换方式", "Switching"), defaultConfig: SW_DEFAULT, Controls: SwitchingControls, Render: SwitchingRender, generate: switchingGenerate, code: SW_CODE },
  performance: { title: T("性能指标", "Performance"), defaultConfig: PERF_DEFAULT, Controls: PerfControls, Render: PerfRender, generate: perfGenerate, code: PERF_CODE },
};

export const { module: cnIntroModule, GROUPS: cnIntroGroups } = makeChapter<SubMode>({
  id: "cn-overview",
  title: T("网络概述", "Network Overview"),
  desc: T("边缘/核心、交换方式、性能指标（时延四分量/时延带宽积/吞吐）的公式推导。", "Edge/core, switching, and the derivation of performance metrics (4 delay components, delay×bandwidth, throughput)."),
  tags: ["computer-network", "intro"],
  groups: [
    { label: "交换与性能", opts: [
      { v: "switching", zh: "交换方式", en: "Switching" },
      { v: "performance", zh: "性能指标", en: "Performance" },
    ] },
  ],
  subs: SUBS,
});
