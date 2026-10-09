import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 计算机网络 · 第6章 链路层与局域网
//   对应 tex/ComputerNetwork/chapters/link_layer.tex
//   crc(逐帧长除) / multiple-access(CSMA/CD 逐帧) / arp(逐帧请求应答) / vlan(自学习逐帧)
// =====================================================================

type SubMode = "crc" | "multiple-access" | "arp" | "vlan";

function xorStr(a: string, b: string): string {
  let out = "";
  for (let i = 0; i < a.length; i++) out += a[i] === b[i] ? "0" : "1";
  return out;
}

// 模 2 长除法：data 左移 r 位后除以 gen，返回余数 r 位与每步快照
function crcDivide(data: string, gen: string) {
  const r = gen.length - 1;
  let bits = data + "0".repeat(r);
  const steps: { before: string; divisor: string; after: string; pos: number }[] = [];
  for (let i = 0; i <= data.length - 1; i++) {
    if (bits[i] === "1") {
      const slice = bits.slice(i, i + gen.length);
      const after = xorStr(slice, gen);
      const before = bits;
      bits = bits.slice(0, i) + after + bits.slice(i + gen.length);
      steps.push({ before, divisor: " ".repeat(i) + gen, after: bits, pos: i });
    }
  }
  return { remainder: bits.slice(data.length), code: data + bits.slice(data.length), steps, r };
}

type CrcScene = { phase: "init" | "step" | "done"; data: string; gen: string; shifted: string; steps: { before: string; divisor: string; after: string; pos: number }[]; visible: number; remainder: string; code: string; r: number; bad?: boolean };

function CrcRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as CrcScene;
  if (s.bad || !s.data) {
    return <Panel><Note tone="warn">{zh ? "请输入合法数据位串与生成多项式（首位为 1）。" : "Enter valid data bits and a generator (leading 1)."}</Note></Panel> as never;
  }
  const shown = s.steps.slice(0, s.visible);
  return (
    <Panel>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, textAlign: "center", color: "#334155", lineHeight: 1.9 }}>
        <div>{zh ? "数据 D" : "Data D"} = <b>{s.data}</b>{zh ? `，左移 r=${s.r} 位` : `, shift left r=${s.r}`} → <b>{s.shifted}</b></div>
        <div>{zh ? "生成多项式 G" : "Generator G"} = <b>{s.gen}</b></div>
      </div>
      <div style={{ overflowX: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 10, lineHeight: 1.7 }}>
        {shown.length === 0 && <div style={{ color: "#94a3b8" }}>{zh ? "（尚未开始异或）" : "(no XOR yet)"}</div>}
        {shown.map((st, i) => {
          const cur = i === shown.length - 1 && s.phase === "step";
          return (
            <div key={i} style={{ opacity: cur ? 1 : 0.7 }}>
              <div style={{ color: cur ? "#7dd3fc" : "#cbd5e1" }}>{st.before}</div>
              <div style={{ color: cur ? "#fca5a5" : "#94a3b8" }}>{st.divisor}</div>
              <div style={{ borderTop: "1px solid #475569", color: cur ? "#86efac" : "#a3e635" }}>{st.after}</div>
            </div>
          );
        })}
        {s.phase === "done" && <div style={{ marginTop: 4 }}>{zh ? "余数 R" : "Remainder R"} = <b style={{ color: "#fde047" }}>{s.remainder}</b></div>}
      </div>
      {s.phase === "done" && (
        <div style={{ textAlign: "center", fontSize: 14 }}>
          <MathText text={`$D\\cdot 2^{${s.r}} \\oplus R = ${s.code}$`} />
        </div>
      )}
      <Note>{zh ? `发送 数据+余数 = ${s.code}；接收方再除以 G，余数为 0 则认为无差错。` : `Send data+remainder = ${s.code}; receiver divides by G, zero remainder ⇒ no error.`}</Note>
    </Panel>
  );
}
function CrcControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "数据 D" : "Data"}</span>
        <input className="txt" value={config.data} onChange={(e) => onChange({ ...config, data: e.target.value })} style={{ width: 150, fontFamily: "ui-monospace, monospace" }} />
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "多项式 G" : "Generator"}</span>
        <input className="txt" value={config.gen} onChange={(e) => onChange({ ...config, gen: e.target.value })} style={{ width: 110, fontFamily: "ui-monospace, monospace" }} />
      </label>
    </div>
  );
}
function crcGenerate(config: any): Frame<CrcScene>[] {
  const data: string = String(config.data ?? "").replace(/[^01]/g, "");
  const gen: string = String(config.gen ?? "").replace(/[^01]/g, "");
  const base: CrcScene = { phase: "init", data, gen, shifted: "", steps: [], visible: 0, remainder: "", code: "", r: Math.max(0, gen.length - 1) };
  if (data.length === 0 || gen.length < 2 || !gen.startsWith("1") || data.length < gen.length) {
    return [{ line: 0, caption: T("! 输入不合法", "! Invalid input"), scene: { ...base, bad: true } }];
  }
  const { remainder, code, steps, r } = crcDivide(data, gen);
  const shifted = data + "0".repeat(r);
  const frames: Frame<CrcScene>[] = [];
  frames.push({ line: 0, caption: T(`数据 $D=${data}$ 左移 $r=${r}$ 位得 ${shifted}`, `Data $D=${data}$ shifted left $r=${r}$ → ${shifted}`), scene: { ...base, phase: "init", shifted } });
  steps.forEach((_, k) => {
    frames.push({ line: 2, caption: T(`第 ${k + 1} 步：最高位为 1，与 $G$ 异或`, `Step ${k + 1}: leading bit 1, XOR with $G$`), scene: { ...base, phase: "step", shifted, visible: k + 1 } });
  });
  frames.push({ line: 3, caption: T(`余数 $R=${remainder}$，发送 $${code}$`, `Remainder $R=${remainder}$, send $${code}$`), scene: { ...base, phase: "done", shifted, visible: steps.length, remainder, code } });
  return frames;
}
const CRC_CODE = [
  T("$R \\gets D \\cdot 2^{r}$", "$R \\gets D \\cdot 2^{r}$"),
  T("for $i \\gets 0$ to $|D|-1$:", "for $i \\gets 0$ to $|D|-1$:"),
  T("  if $R_i=1$: $R \\gets R \\oplus G$", "  if $R_i=1$: $R \\gets R \\oplus G$"),
  T("return $R$", "return $R$"),
];

// ---------------------------------------------------------------------
// multiple-access: CSMA/CD 逐帧动画
// ---------------------------------------------------------------------
type CsmaScene = { phase: "idle" | "send" | "collision" | "stop" | "backoff" | "success"; m: number; K: number; slots: number };

const CSMA_PHASE: Record<CsmaScene["phase"], { bg: string; fg: string; zh: string; en: string }> = {
  idle: { bg: "#dcfce7", fg: "#166534", zh: "监听信道：空闲", en: "channel idle" },
  send: { bg: "#dbeafe", fg: "#1e40af", zh: "发送中：边发边听", en: "transmitting: listen while sending" },
  collision: { bg: "#fee2e2", fg: "#b91c1c", zh: "检测到冲突！", en: "collision detected!" },
  stop: { bg: "#fef3c7", fg: "#92400e", zh: "立即停止发送", en: "abort immediately" },
  backoff: { bg: "#ede9fe", fg: "#5b21b6", zh: "二进制指数退避", en: "binary exponential backoff" },
  success: { bg: "#dcfce7", fg: "#166534", zh: "重新发送成功", en: "retransmit success" },
};

function csmaStation(label: string, on: boolean) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: 10, background: on ? "#dbeafe" : "#f8fafc", border: `2px solid ${on ? "#2563eb" : "#cbd5e1"}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#1e293b", transition: "all .2s" }}>{label}</div>
  );
}

function CsmaRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { phase: "idle", m: 0, K: 0, slots: 1 }) as CsmaScene;
  const ph = CSMA_PHASE[s.phase] ?? CSMA_PHASE.idle;
  const aOn = s.phase === "send" || s.phase === "collision" || s.phase === "success";
  const bOn = s.phase === "collision";
  const signal = s.phase === "send" ? "#2563eb" : s.phase === "collision" ? "#dc2626" : "#16a34a";
  const slots = Array.from({ length: Math.max(1, 2 ** s.m) }, (_, i) => i);
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: ph.bg, color: ph.fg, fontWeight: 800, fontSize: 14 }}>{zh ? ph.zh : ph.en}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {csmaStation("A", aOn)}
        <div style={{ position: "relative", flex: 1, height: 56, borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {(s.phase === "send" || s.phase === "success") && <div style={{ position: "absolute", top: 25, left: 0, right: "50%", height: 6, background: signal, borderRadius: 3, opacity: 0.85 }} />}
          {s.phase === "collision" && (
            <>
              <div style={{ position: "absolute", top: 25, left: 0, width: "50%", height: 6, background: "#dc2626", borderRadius: 3 }} />
              <div style={{ position: "absolute", top: 25, right: 0, width: "50%", height: 6, background: "#dc2626", borderRadius: 3 }} />
              <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", color: "#dc2626", fontWeight: 900, fontSize: 22 }}>✕</div>
            </>
          )}
          <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", fontSize: 10, color: "#94a3b8" }}>{zh ? "共享信道" : "shared channel"}</div>
        </div>
        {csmaStation("B", bOn)}
      </div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#334155" }}>
        {zh ? "第" : "collision "} m = <b>{s.m}</b>，K ∈ {"{0,…,2^m−1}"} = <b>{`{${slots.join(",")}}`}</b>
      </div>
      {s.phase === "backoff" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? "退避时隙：" : "backoff slots:"}</span>
          {slots.map((k) => (
            <span key={k} style={{ padding: "4px 14px", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontWeight: 800, background: k === s.K ? "#4338ca" : "#eef2ff", color: k === s.K ? "#fff" : "#3730a3", border: "1px solid #c7d2fe" }}>{k}</span>
          ))}
          <span style={{ fontSize: 12, color: "#64748b" }}>{zh ? `选 K=${s.K}，等待 ${s.K}×512 比特时间` : `pick K=${s.K}, wait ${s.K}×512 bit-times`}</span>
        </div>
      )}
      <Note>{zh ? "CSMA/CD：先听后发、边发边听、冲突即停、二进制指数退避。第 $m$ 次冲突从 $\\{0,\\dots,2^m-1\\}$ 取 $K$。" : "CSMA/CD: listen before talk, listen while talking, abort on collision, binary exponential backoff. After the $m$-th collision pick $K$ from $\\{0,\\dots,2^m-1\\}$."}</Note>
    </Panel>
  );
}

function csmaGenerate(_config: any): Frame<CsmaScene>[] {
  const m = 1;
  const slots = 2 ** m;
  const K = 1;
  return [
    { line: 0, caption: T("监听信道：空闲，可以发送", "sense channel: idle, may send"), scene: { phase: "idle", m: 0, K: 0, slots: 1 } },
    { line: 1, caption: T("开始发送，边发边听", "start sending, keep listening"), scene: { phase: "send", m: 0, K: 0, slots: 1 } },
    { line: 2, caption: T("$m \\gets m+1=1$，检测到冲突", "$m \\gets m+1=1$, collision detected"), scene: { phase: "collision", m, K: 0, slots } },
    { line: 3, caption: T("立即停止发送并发出拥塞信号", "abort now, send jam signal"), scene: { phase: "stop", m, K: 0, slots } },
    { line: 4, caption: T("从 $\\{0,\\dots,2^m-1\\}=\\{0,1\\}$ 中取 $K=1$", "pick $K=1$ from $\\{0,1\\}$"), scene: { phase: "backoff", m, K, slots } },
    { line: 5, caption: T("等待 $K\\cdot512$ 比特时间后重发，成功", "wait $K\\cdot512$ bit-times, retransmit, success"), scene: { phase: "success", m, K, slots } },
  ];
}
const CSMA_CODE = [
  T("监听信道，空闲则发送", "sense channel; idle → send"),
  T("边发送边检测冲突", "transmit and detect collision"),
  T("冲突 → $m \\gets m+1$", "collision → $m \\gets m+1$"),
  T("立即停止并发送拥塞信号", "abort, send jam signal"),
  T("$K \\gets$ random $\\in \\{0,\\dots,2^m-1\\}$", "$K \\gets$ random $\\in \\{0,\\dots,2^m-1\\}$"),
  T("等待 $K\\cdot512$ 比特时间后重发", "wait $K\\cdot512$ bit-times, retransmit"),
];

type ArpScene = { step: number; ip: string; macA: string; macB: string };
function ArpRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0 }) as ArpScene;
  const steps: [string, string][] = zh
    ? [
      [`① 查询`, `主机 A 想发给同子网 ${s.ip}，但不知其 MAC`],
      [`② 广播请求`, `A 广播「谁是 ${s.ip}？请告诉 A (${s.macA})」`],
      [`③ 单播应答`, `B 单播回复自己的 MAC (${s.macB})`],
      [`④ 缓存`, `A 在 ARP 表中记录 (${s.ip} → ${s.macB})，带 TTL`],
    ]
    : [
      [`① Lookup`, `A wants to send to ${s.ip} on the same subnet but lacks its MAC`],
      [`② Broadcast`, `A broadcasts "who has ${s.ip}? tell A (${s.macA})"`],
      [`③ Reply`, `B unicasts its MAC (${s.macB})`],
      [`④ Cache`, `A stores (${s.ip} → ${s.macB}) in ARP table with TTL`],
    ];
  return (
    <Panel>
      <div style={{ display: "grid", gap: 6 }}>
        {steps.map(([a, b], i) => {
          const cur = i === s.step;
          return (
            <div key={a} style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= s.step ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 96 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <Note>{zh ? "ARP 只在同一子网内解析；跨子网时主机把帧发给默认网关，由路由器转发。" : "ARP resolves within a subnet; across subnets the host sends to its default gateway."}</Note>
    </Panel>
  );
}
function arpGenerate(_config: any): Frame<ArpScene>[] {
  const s: ArpScene = { step: 0, ip: "192.168.1.20", macA: "AA:…:01", macB: "BB:…:20" };
  return [
    { line: 0, caption: T("A 要发给 IP-B，先查 ARP 表（未命中）", "A wants to reach IP-B; ARP cache miss"), scene: { ...s, step: 0 } },
    { line: 1, caption: T("A 广播 ARP 请求「谁是 IP-B」", "A broadcasts \"who has IP-B?\""), scene: { ...s, step: 1 } },
    { line: 2, caption: T("B 单播应答自己的 MAC", "B unicasts its MAC"), scene: { ...s, step: 2 } },
    { line: 3, caption: T("A 写入 ARP 表，可发送数据帧", "A caches the mapping, can send now"), scene: { ...s, step: 3 } },
  ];
}
const ARP_CODE = [
  T("查 ARP 表 $IP_B \\to MAC$", "lookup ARP $IP_B \\to MAC$"),
  T("未命中 → 广播请求", "miss → broadcast request"),
  T("$B$ 单播应答 $MAC_B$", "$B$ unicasts $MAC_B$"),
  T("写入缓存 (TTL)", "cache it (TTL)"),
];

// ---------------------------------------------------------------------
// vlan: 交换机自学习 逐帧动画
// ---------------------------------------------------------------------
type MacEntry = { mac: string; port: number };
type VlanScene = { step: number; table: MacEntry[]; event: "arrive" | "learn" | "flood" | "unicast" };

const HOSTS: { port: number; name: string; mac: string }[] = [
  { port: 1, name: "A", mac: "AA:…:01" },
  { port: 2, name: "B", mac: "BB:…:02" },
  { port: 3, name: "C", mac: "CC:…:03" },
];

const VLAN_EVENT: Record<VlanScene["event"], { bg: string; fg: string; zh: string; en: string }> = {
  arrive: { bg: "#dbeafe", fg: "#1e40af", zh: "帧到达端口（源 A → 目的 B）", en: "frame arrives on a port (src A → dst B)" },
  learn: { bg: "#dcfce7", fg: "#166534", zh: "自学习：记录「源 MAC → 入端口」", en: "learning: record src MAC → ingress port" },
  flood: { bg: "#fef3c7", fg: "#92400e", zh: "目的未知 → 向其他端口泛洪", en: "dst unknown → flood other ports" },
  unicast: { bg: "#ede9fe", fg: "#5b21b6", zh: "目的已知 → 只从对应端口单播", en: "dst known → unicast out that port" },
};

function VlanRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, table: [], event: "arrive" }) as VlanScene;
  const ev = VLAN_EVENT[s.event] ?? VLAN_EVENT.arrive;
  const ingress = s.step === 3 ? 2 : 1;
  const egress: number[] = s.event === "flood" ? [2, 3] : s.event === "unicast" ? [1] : [];
  const macs = s.table ?? [];
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: ev.bg, color: ev.fg, fontWeight: 800, fontSize: 14 }}>{zh ? ev.zh : ev.en}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {HOSTS.map((h) => {
          const isIn = (s.event === "arrive" || s.event === "learn") && h.port === ingress;
          const isOut = egress.includes(h.port);
          const on = isIn || isOut;
          return (
            <div key={h.port} style={{ flex: 1, padding: "8px 10px", borderRadius: 10, textAlign: "center", background: on ? (isIn ? "#dbeafe" : "#fef3c7") : "#f8fafc", border: `2px solid ${on ? (isIn ? "#2563eb" : "#d97706") : "#e2e8f0"}` }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1e293b" }}>{h.name}{on && <span style={{ fontSize: 10, marginLeft: 4, color: isIn ? "#2563eb" : "#d97706" }}>{isIn ? (zh ? "入" : "in") : (zh ? "出" : "out")}</span>}</div>
              <div style={{ fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>{h.mac}</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>port {h.port}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px", borderRadius: 8, background: "#0f172a", color: "#e2e8f0", textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>{zh ? "交 换 机" : "S W I T C H"}</div>
      <Table head={zh ? ["MAC 地址", "转发表端口"] : ["MAC", "Forwarding port"]} rows={macs.length ? macs.map((e) => [e.mac, `P${e.port}`]) : [[zh ? "（空）" : "(empty)", "—"]]} />
      <Note>{zh ? "命中则单播、未命中则泛洪（同 VLAN 内）；表项老化以适应拓扑变化，802.1Q 标签隔离广播域。" : "Hit ⇒ unicast, miss ⇒ flood within the VLAN; entries age out with topology changes, and 802.1Q tags isolate broadcast domains."}</Note>
    </Panel>
  );
}

function vlanGenerate(_config: any): Frame<VlanScene>[] {
  const A: MacEntry = { mac: "AA:…:01", port: 1 };
  const B: MacEntry = { mac: "BB:…:02", port: 2 };
  return [
    { line: 0, caption: T("A→B 的帧从端口 1 到达", "frame A→B arrives on port 1"), scene: { step: 0, table: [], event: "arrive" } },
    { line: 1, caption: T("自学习：表[$MAC_A$] $\\gets$ 端口 1", "learn: table[$MAC_A$] $\\gets$ port 1"), scene: { step: 1, table: [A], event: "learn" } },
    { line: 4, caption: T("目的 $MAC_B$ 未知 → 泛洪到端口 2、3", "dst $MAC_B$ unknown → flood ports 2,3"), scene: { step: 2, table: [A], event: "flood" } },
    { line: 1, caption: T("B 回复，学习表[$MAC_B$] $\\gets$ 端口 2", "B replies; learn table[$MAC_B$] $\\gets$ port 2"), scene: { step: 3, table: [A, B], event: "learn" } },
    { line: 3, caption: T("目的 $MAC_A$ 已知 → 只从端口 1 单播", "dst $MAC_A$ known → unicast out port 1"), scene: { step: 4, table: [A, B], event: "unicast" } },
  ];
}
const VLAN_CODE = [
  T("帧到达端口 $P$，读源 MAC", "frame arrives on port $P$, read src MAC"),
  T("自学习：表[$MAC_{src}$] $\\gets$ $P$", "learn: table[$MAC_{src}$] $\\gets$ $P$"),
  T("查表目的 MAC", "lookup dst MAC in the table"),
  T("命中 → 单播到该端口", "hit → unicast out that port"),
  T("未命中 → 其他端口泛洪", "miss → flood other ports"),
];

const SUBS: Record<SubMode, SubDef> = {
  crc: { title: T("差错检测 CRC", "CRC"), defaultConfig: { data: "1101011111", gen: "10011" }, Controls: CrcControls, Render: CrcRender, generate: crcGenerate, code: CRC_CODE },
  "multiple-access": { title: T("多路访问 CSMA/CD", "Multiple Access CSMA/CD"), Render: CsmaRender, generate: csmaGenerate, code: CSMA_CODE },
  arp: { title: T("ARP", "ARP"), Render: ArpRender, generate: arpGenerate, code: ARP_CODE },
  vlan: { title: T("交换机与 VLAN", "Switch / VLAN"), Render: VlanRender, generate: vlanGenerate, code: VLAN_CODE },
};

export const { module: cnLinkModule, GROUPS: cnLinkGroups } = makeChapter<SubMode>({
  id: "cn-link",
  title: T("链路层与局域网", "Link Layer & LAN"),
  desc: T("差错检测 CRC / 多路访问 CSMA-CD / ARP / 交换机自学习与 VLAN。", "CRC / multiple access CSMA/CD / ARP / switch self-learning & VLAN."),
  tags: ["computer-network", "link"],
  groups: [
    { label: "链路层", opts: [
      { v: "crc", zh: "差错检测 CRC", en: "CRC" },
      { v: "multiple-access", zh: "多路访问 CSMA/CD", en: "Multiple Access CSMA/CD" },
      { v: "arp", zh: "ARP", en: "ARP" },
      { v: "vlan", zh: "交换机与 VLAN", en: "Switch / VLAN" },
    ] },
  ],
  subs: SUBS,
});
