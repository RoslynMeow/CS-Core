import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 第4章 运输层
//   对应 tex/ComputerNetwork/chapters/transport_layer.tex
//   mux(复用/分用) / udp / rdt(可靠传输) / tcp-conn(连接管理) / tcp-control(流量与拥塞控制)
// =====================================================================

type SubMode = "mux" | "udp" | "rdt" | "tcp-conn" | "tcp-control";

// ---------------------------------------------------------------- mux
type MuxSocket = { port: number; proto: "UDP" | "TCP"; app: string };
type MuxSeg = { srcIP: string; srcPort: number; dstIP: string; dstPort: number };
type MuxScene = { proto: "UDP" | "TCP"; segment: MuxSeg; sockets: MuxSocket[]; delivered: number; read: boolean };

const MUX_SOCKETS: MuxSocket[] = [
  { port: 53, proto: "UDP", app: "DNS" },
  { port: 80, proto: "TCP", app: "HTTP" },
  { port: 443, proto: "TCP", app: "HTTPS" },
];
const MUX_UDP_SEG: MuxSeg = { srcIP: "10.0.0.5", srcPort: 5000, dstIP: "192.168.1.10", dstPort: 53 };
const MUX_TCP_SEG: MuxSeg = { srcIP: "10.0.0.5", srcPort: 5000, dstIP: "192.168.1.10", dstPort: 443 };

function MuxRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<MuxScene>;
  const proto = s.proto ?? "UDP";
  const seg = s.segment ?? MUX_UDP_SEG;
  const sockets = s.sockets ?? MUX_SOCKETS;
  const delivered = s.delivered ?? -1;
  const read = s.read ?? false;
  const useSrc = proto === "TCP";
  const cell = (label: string, value: string, on: boolean) => (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: on ? "#eef2ff" : "#f8fafc", border: `1px solid ${on ? "#4338ca" : "#e2e8f0"}`, fontFamily: "ui-monospace, monospace", fontSize: 12, textAlign: "center" }}>
      <div style={{ fontSize: 10, color: on ? "#4338ca" : "#94a3b8", fontWeight: 800 }}>{label}</div>
      <div style={{ color: "#334155" }}>{value}</div>
    </div>
  );
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>{zh ? `到达的报文段（${proto}）` : `Arriving segment (${proto})`}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {cell(zh ? "源 IP" : "src IP", seg.srcIP, read && useSrc)}
        {cell(zh ? "源端口" : "src port", `${seg.srcPort}`, read && useSrc)}
        {cell(zh ? "目的 IP" : "dst IP", seg.dstIP, read)}
        {cell(zh ? "目的端口" : "dst port", `${seg.dstPort}`, read)}
      </div>
      <div style={{ textAlign: "center", fontSize: 13 }}>
        <MathText text={proto === "UDP"
          ? `$\\text{demux}= (\\text{dst IP}, \\text{dst port}) = (${seg.dstIP}, ${seg.dstPort})$`
          : `$\\text{demux}= (\\text{src IP}, \\text{src port}, \\text{dst IP}, \\text{dst port}) = (${seg.srcIP}, ${seg.srcPort}, ${seg.dstIP}, ${seg.dstPort})$`} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {sockets.map((sk, i) => {
          const on = i === delivered;
          const cand = read && delivered < 0 && sk.proto === proto && sk.port === seg.dstPort;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 10, background: on ? "#dcfce7" : cand ? "#eef2ff" : "#f8fafc", border: `2px ${cand ? "dashed" : "solid"} ${on ? "#16a34a" : cand ? "#4338ca" : "#e2e8f0"}` }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#1e293b", width: 54 }}>{sk.proto}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#334155" }}>{zh ? "端口" : "port"} {sk.port}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{sk.app}</span>
              {on && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#166534" }}>{zh ? "◀ 交付到此 socket" : "◀ deliver here"}</span>}
              {cand && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? "匹配中…" : "matching…"}</span>}
            </div>
          );
        })}
      </div>
      <Table
        head={zh ? ["协议", "分用元组 (demux tuple)", "要点"] : ["Protocol", "Demux tuple", "Notes"]}
        rows={
          zh
            ? [
              ["UDP", "(目的 IP, 目的端口)", "二元组分用；同一目的端口的不同源会进入同一 socket。"],
              ["TCP", "(源 IP, 源端口, 目的 IP, 目的端口)", "四元组分用；每一条连接由唯一的四元组标识。"],
            ]
            : [
              ["UDP", "(dest IP, dest port)", "2-tuple demux; different sources to the same port share one socket."],
              ["TCP", "(src IP, src port, dest IP, dest port)", "4-tuple demux; each connection is uniquely identified."],
            ]
        }
      />
      <Note>
        {zh
          ? "接收端把网络层的「主机到主机」交付扩展为「进程到进程」：UDP 只认目的二元组，TCP 靠四元组区分不同连接。"
          : "The receiver extends host-to-host delivery into process-to-process: UDP keys on the destination pair, TCP distinguishes connections by the 4-tuple."}
      </Note>
    </Panel>
  );
}
function muxGenerate(_config: any): Frame<MuxScene>[] {
  const sockets = MUX_SOCKETS;
  return [
    { line: 0, caption: T("一个 UDP 报文段到达接收端", "A UDP segment arrives"), scene: { proto: "UDP", segment: MUX_UDP_SEG, sockets, delivered: -1, read: false } },
    { line: 1, caption: T("读取目的 IP 与目的端口（二元组）", "Read dst IP and dst port (2-tuple)"), scene: { proto: "UDP", segment: MUX_UDP_SEG, sockets, delivered: -1, read: true } },
    { line: 3, caption: T(`在 socket 表中查找目的端口 ${MUX_UDP_SEG.dstPort}`, `Look up dst port ${MUX_UDP_SEG.dstPort}`), scene: { proto: "UDP", segment: MUX_UDP_SEG, sockets, delivered: -1, read: true } },
    { line: 4, caption: T("交付到 DNS socket", "Deliver to the DNS socket"), scene: { proto: "UDP", segment: MUX_UDP_SEG, sockets, delivered: 0, read: true } },
    { line: 0, caption: T("一个 TCP 报文段到达接收端", "A TCP segment arrives"), scene: { proto: "TCP", segment: MUX_TCP_SEG, sockets, delivered: -1, read: false } },
    { line: 2, caption: T("读取源 IP、源端口、目的 IP、目的端口（四元组）", "Read the 4-tuple (src IP, src port, dst IP, dst port)"), scene: { proto: "TCP", segment: MUX_TCP_SEG, sockets, delivered: -1, read: true } },
    { line: 3, caption: T("在连接表中查找匹配的四元组", "Look up the matching 4-tuple"), scene: { proto: "TCP", segment: MUX_TCP_SEG, sockets, delivered: -1, read: true } },
    { line: 4, caption: T("交付到 HTTPS socket", "Deliver to the HTTPS socket"), scene: { proto: "TCP", segment: MUX_TCP_SEG, sockets, delivered: 2, read: true } },
  ];
}
const MUX_CODE = [
  T("报文段到达接收端", "segment arrives"),
  T("UDP：读取 $(\\text{dst IP},\\text{dst port})$", "UDP: read $(\\text{dst IP},\\text{dst port})$"),
  T("TCP：读取四元组 $(\\text{src IP},\\text{src port},\\text{dst IP},\\text{dst port})$", "TCP: read 4-tuple"),
  T("在 socket 表中查找匹配", "look up the matching socket"),
  T("交付到正确的 socket", "deliver to the correct socket"),
];

// ---------------------------------------------------------------- udp
type UdpField = { zh: string; en: string; size: number; value: string; descZh: string; descEn: string; color: string };
type UdpScene = { fields: UdpField[]; active: number };

const UDP_FIELDS: UdpField[] = [
  { zh: "源端口", en: "Source Port", size: 2, value: "0xC001 = 49153", descZh: "发送方进程的 16 位端口，接收端回送应答时使用。", descEn: "Sender's 16-bit port, used when replying.", color: "#dbeafe" },
  { zh: "目的端口", en: "Dest Port", size: 2, value: "0x0035 = 53 (DNS)", descZh: "接收方进程的 16 位端口，是分用的依据。", descEn: "Receiver's 16-bit port, the demux key.", color: "#dcfce7" },
  { zh: "长度", en: "Length", size: 2, value: "0x0021 = 33", descZh: "UDP 首部 + 数据的总字节数，最小值 8。", descEn: "Header + data bytes, minimum 8.", color: "#fef3c7" },
  { zh: "检验和", en: "Checksum", size: 2, value: "0x1B2A", descZh: "覆盖首部、数据与伪首部的差错检测；出错则丢弃。", descEn: "Error check over header, data and pseudo-header; bad ⇒ drop.", color: "#fce7f3" },
];

function UdpRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<UdpScene>;
  const fields = s.fields ?? UDP_FIELDS;
  const active = s.active ?? 0;
  const cur = fields[active];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>{zh ? "UDP 首部（8 字节，逐字段解析）" : "UDP header (8 bytes, field by field)"}</div>
      <div style={{ display: "flex", width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden", minHeight: 64 }}>
        {fields.map((f, i) => {
          const on = i === active;
          return (
            <div key={i} style={{ flexGrow: f.size, flexBasis: 0, padding: "10px 4px", background: on ? f.color : "#f8fafc", borderRight: "1px solid #e2e8f0", textAlign: "center", outline: on ? "2px solid #4338ca" : "none", outlineOffset: -2, transition: "background .2s" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: on ? "#1e293b" : "#475569" }}>{zh ? f.zh : f.en}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{f.size * 8} bit</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#64748b", marginTop: 2 }}>{i * 16}–{i * 16 + 15}</div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$\\underbrace{16}_{\\text{src port}}\\;\\underbrace{16}_{\\text{dst port}}\\;\\underbrace{16}_{\\text{length}}\\;\\underbrace{16}_{\\text{checksum}} = 8\\,\\text{bytes}$" />
      </div>
      {cur && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, color: "#3730a3", fontSize: 13 }}>
            {zh ? cur.zh : cur.en} = <span style={{ fontFamily: "ui-monospace, monospace" }}>{cur.value}</span>
          </div>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{zh ? cur.descZh : cur.descEn}</div>
        </div>
      )}
      <Chips
        items={
          zh
            ? [["无连接", "无握手时延、无连接状态"], ["首部小", "仅 8 字节，开销低"], ["尽力而为", "不保证可靠、不保序、无拥塞控制"]]
            : [["Connectionless", "No handshake delay, no state"], ["Small header", "Only 8 bytes"], ["Best effort", "No reliability, no ordering, no congestion control"]]
        }
      />
      <Note tone="warn">
        {zh
          ? "UDP 适合实时音视频、DNS 等：宁可丢一点也要低时延；可靠/有序需由应用自己实现。"
          : "UDP suits real-time audio/video and DNS: prefer low latency over a bit of loss; reliability/ordering must be handled by the application."}
      </Note>
    </Panel>
  );
}
function udpGenerate(_config: any): Frame<UdpScene>[] {
  return UDP_FIELDS.map((_, i) => ({
    line: i,
    caption: T(`${UDP_FIELDS[i].zh}：${UDP_FIELDS[i].value}`, `${UDP_FIELDS[i].en}: ${UDP_FIELDS[i].value}`),
    scene: { fields: UDP_FIELDS, active: i },
  }));
}
const UDP_CODE = [
  T("读取源端口（16 bit）", "read source port (16 bit)"),
  T("读取目的端口（16 bit）", "read dest port (16 bit)"),
  T("读取长度（16 bit）", "read length (16 bit)"),
  T("读取检验和（16 bit）", "read checksum (16 bit)"),
];

// ---------------------------------------------------------------- rdt
const RDT_DEFAULT = { len: 8000, rateMbps: 1, rttMs: 30, win: 4 };
function RdtControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "分组 L" : "L"} value={config.len} onChange={(v) => set({ len: v })} min={8} max={1e6} step={8} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>bit</span>
      <NumField label={zh ? "速率 R" : "R"} value={config.rateMbps} onChange={(v) => set({ rateMbps: v })} min={0.1} max={10000} step={0.1} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Mbps</span>
      <NumField label={zh ? "往返时延 RTT" : "RTT"} value={config.rttMs} onChange={(v) => set({ rttMs: v })} min={0.1} max={10000} step={0.1} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ms</span>
      <NumField label={zh ? "窗口 N" : "N"} value={config.win} onChange={(v) => set({ win: v })} min={1} max={10000} width={80} />
    </div>
  );
}
type RdtScene = {
  base: number;
  nextSeq: number;
  acked: number[];
  lostAt: number | null;
  action: "send" | "ack" | "loss" | "timeout" | "retransmit" | "done";
  window: number;
};
function RdtRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<RdtScene>;
  const N = Math.max(1, Math.min(8, Math.round(s.window ?? config?.win ?? 4)));
  const base = Math.max(0, Math.round(s.base ?? 0));
  const nextSeq = Math.max(0, Math.round(s.nextSeq ?? 0));
  const acked = new Set<number>(s.acked ?? []);
  const lostAt = s.lostAt ?? null;
  const total = N + 2;
  const seqs = Array.from({ length: total }, (_, i) => i);
  const act = s.action ?? "send";
  const actionText: Record<string, [string, string]> = {
    send: ["窗口内连续发送未确认分组", "send unacked segments in window"],
    ack: ["ACK 到达，base 前移", "ACK arrives, base advances"],
    loss: ["分组丢失", "a segment is lost"],
    timeout: ["定时器超时", "timer times out"],
    retransmit: ["重传未确认分组", "retransmit unacked segments"],
    done: ["传输完成，窗口清空", "transfer complete, window cleared"],
  };
  const [az, ae] = actionText[act] ?? actionText.send;
  const R = (config?.rateMbps ?? 1) * 1e6;
  const L = config?.len ?? 8000;
  const rtt = (config?.rttMs ?? 30) / 1000;
  const tTrans = L / R;
  const uPipe = rtt + tTrans > 0 ? Math.min(1, (N * tTrans) / (rtt + tTrans)) : 0;
  const colorOf = (i: number) => {
    if (lostAt === i) return { bg: "#fee2e2", bd: "#dc2626", fg: "#b91c1c" };
    if (acked.has(i)) return { bg: "#dcfce7", bd: "#16a34a", fg: "#166534" };
    if (i >= base && i < nextSeq) return { bg: "#dbeafe", bd: "#2563eb", fg: "#1e40af" };
    return { bg: "#f1f5f9", bd: "#cbd5e1", fg: "#64748b" };
  };
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$U_{\\text{pipe}}=\\dfrac{N\\cdot L/R}{RTT+L/R}=${(uPipe * 100).toFixed(1)}\\%$`} />
      </div>
      <div style={{ position: "relative", paddingBottom: 30 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {seqs.map((i) => {
            const c = colorOf(i);
            return (
              <div key={i} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 8, background: c.bg, border: `2px solid ${c.bd}`, color: c.fg, fontWeight: 800, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                {i}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: `${(base / total) * 100}%`, width: `${(Math.min(N, total - base) / total) * 100}%`, bottom: 0, height: 24, border: "2px solid #4f46e5", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
          <span style={{ position: "absolute", left: "50%", top: 3, transform: "translateX(-50%)", fontSize: 11, fontWeight: 800, color: "#4338ca", whiteSpace: "nowrap" }}>{zh ? `窗口 N=${N}` : `window N=${N}`}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 12, color: "#334155", fontFamily: "ui-monospace, monospace", flexWrap: "wrap" }}>
        <span>base = <b style={{ color: "#4338ca" }}>{base}</b></span>
        <span>nextSeq = <b style={{ color: "#2563eb" }}>{nextSeq}</b></span>
        <span>{zh ? "已确认" : "acked"} = <b style={{ color: "#16a34a" }}>{acked.size}</b></span>
        {lostAt !== null && <span>{zh ? "丢失" : "lost"} = <b style={{ color: "#dc2626" }}>{lostAt}</b></span>}
      </div>
      <Note tone={act === "loss" || act === "timeout" ? "warn" : "info"}>{zh ? az : ae}</Note>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
        <span>{zh ? "已确认" : "acked"} <span style={{ display: "inline-block", width: 10, height: 10, background: "#dcfce7", border: "1px solid #16a34a", borderRadius: 3, verticalAlign: "middle" }} /></span>
        <span>{zh ? "在途" : "in-flight"} <span style={{ display: "inline-block", width: 10, height: 10, background: "#dbeafe", border: "1px solid #2563eb", borderRadius: 3, verticalAlign: "middle" }} /></span>
        <span>{zh ? "丢失" : "lost"} <span style={{ display: "inline-block", width: 10, height: 10, background: "#fee2e2", border: "1px solid #dc2626", borderRadius: 3, verticalAlign: "middle" }} /></span>
        <span>{zh ? "未发送" : "unsent"} <span style={{ display: "inline-block", width: 10, height: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 3, verticalAlign: "middle" }} /></span>
      </div>
    </Panel>
  );
}
function rdtGenerate(config: any): Frame<RdtScene>[] {
  const N = Math.max(1, Math.min(8, Math.round(config?.win ?? 4)));
  const mid = Math.max(1, Math.ceil(N / 2));
  const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
  const base: RdtScene = { base: 0, nextSeq: N, acked: [], lostAt: null, action: "send", window: N };
  const ackedPart = range(0, mid);
  return [
    { line: 0, caption: T(`窗口 $[0,${N})$ 内连续发送 ${N} 个分组`, `Send ${N} segments in window $[0,${N})$`), scene: { ...base } },
    { line: 1, caption: T(`收到累积 ACK，base 前移到 ${mid}`, `Cumulative ACK → base advances to ${mid}`), scene: { ...base, base: mid, acked: ackedPart, action: "ack" } },
    { line: 2, caption: T(`分组 ${mid} 在链路中丢失`, `Segment ${mid} is lost`), scene: { ...base, base: mid, acked: ackedPart, lostAt: mid, action: "loss" } },
    { line: 3, caption: T(`分组 ${mid} 的定时器超时`, `Timer for segment ${mid} times out`), scene: { ...base, base: mid, acked: ackedPart, lostAt: mid, action: "timeout" } },
    { line: 4, caption: T(`重传分组 ${mid}`, `Retransmit segment ${mid}`), scene: { ...base, base: mid, acked: ackedPart, lostAt: mid, action: "retransmit" } },
    { line: 5, caption: T(`累积 ACK 到 ${N - 1}，窗口继续滑动`, `Cumulative ACK through ${N - 1}, window slides on`), scene: { ...base, base: N, nextSeq: N, acked: range(0, N), lostAt: null, action: "done" } },
  ];
}
const RDT_CODE = [
  T("窗口内连续发送未确认分组", "send all unacked segments in window"),
  T("收到 ACK → $base$ 前移", "ACK arrives → $base$ advances"),
  T("分组 $i$ 丢失", "segment $i$ is lost"),
  T("$base$ 定时器超时", "$base$ timer times out"),
  T("重传未确认分组", "retransmit unacked segments"),
  T("累积 ACK，窗口继续滑动", "cumulative ACK, window slides on"),
];

// ---------------------------------------------------------------- tcp-conn
type TcpMsg = { dir: 1 | -1; label: string; phase: "hs" | "td"; color: string };
type TcpConnScene = { step: number; msgs: TcpMsg[] };

function MsgRow({ msg, show, active }: any) {
  const m = msg as TcpMsg;
  return (
    <div style={{ position: "relative", height: 38, opacity: show ? 1 : 0.18, background: active ? "#f5f3ff" : "transparent", borderRadius: 8 }}>
      <div style={{ position: "absolute", top: 22, left: m.dir > 0 ? "2%" : "6%", right: m.dir > 0 ? "6%" : "2%", borderTop: `2px ${active ? "solid" : "dashed"} ${m.color}` }} />
      <span style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#334155", background: "#fff", padding: "0 6px", whiteSpace: "nowrap", fontWeight: active ? 800 : 400 }}>{m.label}</span>
      <span style={{ position: "absolute", top: 15, fontSize: 12, color: m.color, ...(m.dir > 0 ? { right: "1%" } : { left: "1%" }) }}>{m.dir > 0 ? "▶" : "◀"}</span>
    </div>
  );
}
function TcpConnRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<TcpConnScene>;
  const msgs = s.msgs ?? [];
  const step = s.step ?? 0;
  const rowsFor = (phase: "hs" | "td") => msgs.map((m, i) => ({ m, i })).filter(({ m }) => m.phase === phase).map(({ m, i }) => (
    <MsgRow key={i} msg={m} show={i <= step} active={i === step} />
  ));
  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "#1e293b" }}>
        <span>{zh ? "客户机" : "Client"}</span>
        <span>{zh ? "服务器" : "Server"}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? "三次握手" : "Three-way handshake"}</div>
      <div>{rowsFor("hs")}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#9a3412", marginTop: 4 }}>{zh ? "四次挥手" : "Four-way teardown"}</div>
      <div>{rowsFor("td")}</div>
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: step >= 7 ? "#dc2626" : "#f1f5f9", color: step >= 7 ? "#fff" : "#94a3b8" }}>
          {zh ? "TIME_WAIT（等待 2×MSL）" : "TIME_WAIT (wait 2×MSL)"}
        </span>
      </div>
      <Note tone={step >= 7 ? "warn" : "info"}>
        {zh
          ? "三次握手让双方确认「自己会发、对方会收」并交换初始序号；四次挥手因 TCP 全双工，两个方向需各自关闭；主动关闭方最后进入 TIME_WAIT。"
          : "The 3-way handshake confirms send/receive capability and exchanges ISNs; the 4-way teardown closes each half of the full-duplex connection; the active closer ends in TIME_WAIT."}
      </Note>
    </Panel>
  );
}
function tcpConnGenerate(_config: any): Frame<TcpConnScene>[] {
  const msgs: TcpMsg[] = [
    { dir: 1, label: "SYN, seq=x", phase: "hs", color: "#4f46e5" },
    { dir: -1, label: "SYN+ACK, seq=y, ack=x+1", phase: "hs", color: "#059669" },
    { dir: 1, label: "ACK, ack=y+1", phase: "hs", color: "#4f46e5" },
    { dir: 1, label: "FIN, seq=u", phase: "td", color: "#dc2626" },
    { dir: -1, label: "ACK, ack=u+1", phase: "td", color: "#059669" },
    { dir: -1, label: "FIN, seq=w, ack=u+1", phase: "td", color: "#dc2626" },
    { dir: 1, label: "ACK, ack=w+1", phase: "td", color: "#059669" },
  ];
  const frames: Frame<TcpConnScene>[] = msgs.map((m, i) => ({
    line: i,
    caption: T(`发送 ${m.label}`, `Send ${m.label}`),
    scene: { step: i, msgs },
  }));
  frames.push({ line: 7, caption: T("进入 $TIME\\_WAIT$，等待 $2\\times MSL$", "Enter $TIME\\_WAIT$ for $2\\times MSL$"), scene: { step: 7, msgs } });
  return frames;
}
const TCP_CONN_CODE = [
  T("客户机发送 $SYN,\\ seq=x$", "client sends $SYN,\\ seq=x$"),
  T("服务器回 $SYN+ACK,\\ seq=y,\\ ack=x+1$", "server replies $SYN+ACK$"),
  T("客户机发送 $ACK,\\ ack=y+1$", "client sends $ACK$"),
  T("客户机发送 $FIN,\\ seq=u$", "client sends $FIN$"),
  T("服务器 $ACK,\\ ack=u+1$", "server $ACK$"),
  T("服务器 $FIN,\\ seq=w$", "server $FIN$"),
  T("客户机 $ACK,\\ ack=w+1$", "client final $ACK$"),
  T("进入 $TIME\\_WAIT$（$2\\times MSL$）", "enter $TIME\\_WAIT$ ($2\\times MSL$)"),
];

// ---------------------------------------------------------------- tcp-control
const CC_DEFAULT = { ssthresh: 16, lossRound: 13 };
const CC_ROUNDS = 20;
function CcControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "初始 ssthresh" : "init ssthresh"} value={config.ssthresh} onChange={(v) => set({ ssthresh: v })} min={2} max={64} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>MSS</span>
      <NumField label={zh ? "丢包轮次" : "loss round"} value={config.lossRound} onChange={(v) => set({ lossRound: v })} min={1} max={CC_ROUNDS} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>round</span>
    </div>
  );
}
type CcPoint = { r: number; cwnd: number; ssth: number; phase: "ss" | "ca"; loss: boolean };
function simulateCC(ssthresh0: number, lossRound: number, rounds = CC_ROUNDS) {
  const pts: CcPoint[] = [];
  let cwnd = 1;
  let ssthresh = ssthresh0;
  let lossCwnd = 0;
  let ssthEnd = ssthresh;
  for (let r = 1; r <= rounds; r++) {
    const loss = r === lossRound;
    pts.push({ r, cwnd, ssth: ssthresh, phase: cwnd < ssthresh ? "ss" : "ca", loss });
    if (loss) {
      lossCwnd = cwnd;
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      ssthEnd = ssthresh;
      cwnd = 1;
    } else if (cwnd < ssthresh) {
      cwnd = Math.min(cwnd * 2, 4096);
    } else {
      cwnd += 1;
    }
  }
  return { pts, ssthEnd, lossCwnd };
}
type CcScene = { round: number; cwnd: number; ssthresh: number; phase: "ss" | "ca" | "loss" };
function ccGenerate(config: any): Frame<CcScene>[] {
  const ssthresh0 = Math.max(2, Math.min(64, Math.round(config?.ssthresh ?? 16)));
  const lossRound = Math.max(1, Math.min(CC_ROUNDS, Math.round(config?.lossRound ?? 13)));
  const { pts } = simulateCC(ssthresh0, lossRound);
  return pts.map((p) => {
    const phase: CcScene["phase"] = p.loss ? "loss" : p.phase;
    const line = p.loss ? 4 : p.phase === "ss" ? 1 : 3;
    const caption = p.loss
      ? T(`第 ${p.r} 轮丢包：$ssthresh \\gets ${Math.max(2, Math.floor(p.cwnd / 2))}$，$cwnd \\gets 1$`, `Loss at round ${p.r}: $ssthresh \\gets ${Math.max(2, Math.floor(p.cwnd / 2))}$, $cwnd \\gets 1$`)
      : p.phase === "ss"
        ? T(`第 ${p.r} 轮：慢启动 $cwnd=${p.cwnd}$（每 RTT 翻倍）`, `Round ${p.r}: slow start $cwnd=${p.cwnd}$ (doubles per RTT)`)
        : T(`第 ${p.r} 轮：拥塞避免 $cwnd=${p.cwnd}$（每 RTT +1）`, `Round ${p.r}: congestion avoidance $cwnd=${p.cwnd}$ (+1 per RTT)`);
    return { line, caption, scene: { round: p.r, cwnd: p.cwnd, ssthresh: p.ssth, phase } };
  });
}
const CC_CODE = [
  T("$cwnd \\gets 1$，进入慢启动", "$cwnd \\gets 1$, slow start"),
  T("每 RTT $cwnd \\gets 2\\,cwnd$", "per RTT $cwnd \\gets 2\\,cwnd$"),
  T("$cwnd \\ge ssthresh$ → 拥塞避免", "$cwnd \\ge ssthresh$ → congestion avoidance"),
  T("每 RTT $cwnd \\gets cwnd + 1$", "per RTT $cwnd \\gets cwnd + 1$"),
  T("丢包：$ssthresh \\gets cwnd/2$", "loss: $ssthresh \\gets cwnd/2$"),
  T("$cwnd \\gets 1$，回到慢启动", "$cwnd \\gets 1$, back to slow start"),
];
function CcRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const conf = config ?? {};
  const lossRound = Math.max(1, Math.min(CC_ROUNDS, Math.round(conf.lossRound ?? 13)));
  const { pts, lossCwnd } = simulateCC(conf.ssthresh ?? 16, lossRound);
  const s = (scene ?? {}) as Partial<CcScene>;
  const round = Math.max(1, Math.min(CC_ROUNDS, Math.round(s.round ?? 1)));
  const shown = pts.filter((p) => p.r <= round);
  const W = 600, H = 240, padL = 42, padR = 16, padT = 16, padB = 30;
  const maxV = Math.max(2, ...pts.map((p) => Math.max(p.cwnd, p.ssth)));
  const x = (r: number) => padL + ((r - 1) / (CC_ROUNDS - 1)) * (W - padL - padR);
  const y = (v: number) => H - padB - (v / maxV) * (H - padT - padB);
  const cwndLine = shown.map((p) => `${x(p.r)},${y(p.cwnd)}`).join(" ");
  const ssthLine = shown.map((p) => `${x(p.r)},${y(p.ssth)}`).join(" ");
  const yTicks = [0, Math.round(maxV / 2), maxV];
  const cur = shown[shown.length - 1];
  const lossPt = shown.find((p) => p.loss);
  const cwnd = s.cwnd ?? cur?.cwnd ?? 1;
  const ssth = s.ssthresh ?? cur?.ssth ?? 2;
  const phase = s.phase ?? cur?.phase ?? "ss";
  const phaseText = phase === "loss" ? (zh ? "丢包" : "loss") : phase === "ss" ? (zh ? "慢启动" : "slow start") : (zh ? "拥塞避免" : "cong. avoid");
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{round}=${round},\\quad cwnd=${cwnd},\\quad ssthresh=${ssth}$`} />
      </div>
      <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, color: phase === "loss" ? "#dc2626" : phase === "ss" ? "#4f46e5" : "#f59e0b" }}>
        {zh ? "阶段：" : "Phase: "}{phaseText}
      </div>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: 8 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#94a3b8" strokeWidth={1} />
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#94a3b8" strokeWidth={1} />
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#64748b">{v}</text>
            </g>
          ))}
          <polyline points={ssthLine} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" />
          <polyline points={cwndLine} fill="none" stroke="#4f46e5" strokeWidth={2.5} />
          {lossPt && (
            <g>
              <line x1={x(lossPt.r)} y1={y(lossPt.cwnd)} x2={x(lossPt.r)} y2={H - padB} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
              <circle cx={x(lossPt.r)} cy={y(lossPt.cwnd)} r={4} fill="#dc2626" />
              <text x={x(lossPt.r)} y={y(lossPt.cwnd) - 8} textAnchor="middle" fontSize={10} fill="#dc2626">{zh ? "丢包" : "loss"}</text>
            </g>
          )}
          {cur && (
            <g>
              <circle cx={x(cur.r)} cy={y(cur.cwnd)} r={6} fill="none" stroke="#4f46e5" strokeWidth={2} />
              <text x={x(cur.r)} y={y(cur.cwnd) - 10} textAnchor="middle" fontSize={10} fontWeight={800} fill="#4f46e5">{cur.cwnd}</text>
            </g>
          )}
          <text x={W - padR} y={H - padB + 18} textAnchor="end" fontSize={10} fill="#64748b">{zh ? "时间 / RTT →" : "time / RTT →"}</text>
          <text x={padL + 24} y={padT + 10} fontSize={10} fill="#4f46e5">cwnd</text>
          <text x={padL + 70} y={padT + 10} fontSize={10} fill="#f59e0b">ssthresh</text>
        </svg>
      </div>
      <Table head={zh ? ["轮次", "cwnd", "阶段", "事件"] : ["Round", "cwnd", "Phase", "Event"]} rows={shown.map((p) => [`${p.r}`, `${p.cwnd}`, p.loss ? (zh ? "丢包" : "loss") : p.phase === "ss" ? (zh ? "慢启动" : "slow start") : (zh ? "拥塞避免" : "cong. avoid"), p.loss ? (zh ? "ssthresh 减半，cwnd→1" : "ssthresh halved, cwnd→1") : ""])} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$\\text{Throughput} \\approx \\dfrac{0.75\\,W}{RTT}\\quad (W=${lossCwnd || maxV})$`} />
      </div>
      <Note tone="warn">
        {zh
          ? `慢启动指数翻倍 → 到达 ssthresh 后转拥塞避免线性 +1 → 第 ${lossRound} 轮丢包，ssthresh 减半、cwnd 回落。并发窗口取 min(rwnd, cwnd)。`
          : `Slow start doubles per RTT → after reaching ssthresh switch to linear +1 congestion avoidance → loss at round ${lossRound} halves ssthresh and resets cwnd. The real window is min(rwnd, cwnd).`}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------- chapter
const SUBS: Record<SubMode, SubDef> = {
  mux: { title: T("复用与分用", "Mux/Demux"), Render: MuxRender, generate: muxGenerate, code: MUX_CODE },
  udp: { title: T("UDP", "UDP"), Render: UdpRender, generate: udpGenerate, code: UDP_CODE },
  rdt: { title: T("可靠传输", "Reliable"), defaultConfig: RDT_DEFAULT, Controls: RdtControls, Render: RdtRender, generate: rdtGenerate, code: RDT_CODE },
  "tcp-conn": { title: T("TCP 连接", "TCP Conn"), Render: TcpConnRender, generate: tcpConnGenerate, code: TCP_CONN_CODE },
  "tcp-control": { title: T("流量/拥塞控制", "Flow/Congestion"), defaultConfig: CC_DEFAULT, Controls: CcControls, Render: CcRender, generate: ccGenerate, code: CC_CODE },
};

export const { module: cnTransportModule, GROUPS: cnTransportGroups } = makeChapter<SubMode>({
  id: "cn-transport",
  title: T("运输层", "Transport Layer"),
  desc: T("进程到进程的逻辑通信：复用/分用、UDP 首部、可靠传输与滑动窗口利用率、TCP 三次握手/四次挥手、流量与拥塞控制（慢启动/拥塞避免/AIMD）。", "Process-to-process logical communication: mux/demux, UDP header, reliable transfer & sliding-window utilization, TCP handshake/teardown, flow & congestion control (slow start / congestion avoidance / AIMD)."),
  tags: ["computer-network", "transport"],
  groups: [
    { label: "运输层", opts: [
      { v: "mux", zh: "复用与分用", en: "Mux/Demux" },
      { v: "udp", zh: "UDP", en: "UDP" },
      { v: "rdt", zh: "可靠传输", en: "Reliable" },
      { v: "tcp-conn", zh: "TCP 连接", en: "TCP Conn" },
      { v: "tcp-control", zh: "流量/拥塞控制", en: "Flow/Congestion" },
    ] },
  ],
  subs: SUBS,
});
