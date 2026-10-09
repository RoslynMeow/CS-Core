import { T, type Text } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Note, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 计算机网络 · 网络包解剖
//   真实数据包长什么样：封装/解封装、以太网帧、IPv4 首部、TCP 首部、hex 视图
//   stack / frame / ipv4 / tcp / hex
// =====================================================================

type SubMode = "stack" | "frame" | "ipv4" | "tcp" | "hex";

// ---------------------------------------------------------------------
// 通用首部字段模型
// ---------------------------------------------------------------------
type Field = { zh: string; en: string; size: number; value: string; descZh: string; descEn: string; color: string };
type HeaderScene = { title: Text; fields: Field[]; active: number };

function field(zh: string, en: string, size: number, value: string, descZh: string, descEn: string, color: string): Field {
  return { zh, en, size, value, descZh, descEn, color };
}

function BarsRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as HeaderScene;
  const fields = s.fields ?? [];
  const total = fields.reduce((n, f) => n + f.size, 0) || 1;
  const cur = fields[s.active];
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 13, color: "#64748b" }}>{t(s.title)}</div>
      <div style={{ display: "flex", width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden", minHeight: 56 }}>
        {fields.map((f, i) => {
          const active = i === s.active;
          return (
            <div key={i} style={{ flexGrow: f.size, flexBasis: 0, minWidth: f.size > 2 ? 48 : 34, padding: "6px 4px", background: active ? f.color : "#f8fafc", borderRight: "1px solid #e2e8f0", textAlign: "center", outline: active ? "2px solid #4338ca" : "none", outlineOffset: -2, transition: "background .2s" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: active ? "#1e293b" : "#475569", lineHeight: 1.15 }}>{zh ? f.zh : f.en}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>{f.size} B</div>
            </div>
          );
        })}
      </div>
      {cur && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, color: "#3730a3", fontSize: 13 }}>
            {zh ? cur.zh : cur.en} = <span style={{ fontFamily: "ui-monospace, monospace" }}>{cur.value}</span>
          </div>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.7 }}>{zh ? cur.descZh : cur.descEn}</div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 封装 / 解封装
// ---------------------------------------------------------------------
type Layer = { zh: string; en: string; note: string; color: string };
type StackScene = { visible: number; layers: Layer[]; dir: "enc" | "dec" };

const STACK_LAYERS: Layer[] = [
  { zh: "应用层：HTTP 报文", en: "Application: HTTP message", note: "GET /index.html HTTP/1.1", color: "#dbeafe" },
  { zh: "运输层：+TCP 首部 (20 B)", en: "Transport: +TCP header (20 B)", note: "源/目的端口、序号、标志位", color: "#dcfce7" },
  { zh: "网络层：+IP 首部 (20 B)", en: "Network: +IP header (20 B)", note: "源/目的 IP、TTL、协议", color: "#fef3c7" },
  { zh: "链路层：+以太网首部(14 B)+FCS(4 B)", en: "Link: +Ethernet header(14 B)+FCS(4 B)", note: "MAC 地址、类型、CRC", color: "#fce7f3" },
  { zh: "物理层：比特流", en: "Physical: bit stream", note: "0101… 上介质传输", color: "#ede9fe" },
];

function StackRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { visible: 1, layers: STACK_LAYERS }) as StackScene;
  return (
    <Panel>
      <div style={{ display: "grid", gap: 6 }}>
        {(s.layers ?? STACK_LAYERS).map((l, i) => {
          const on = i < s.visible;
          return (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderRadius: 10, background: on ? l.color : "#f8fafc", border: `1px solid ${i === s.visible - 1 ? "#4338ca" : "#e2e8f0"}`, opacity: on ? 1 : 0.4, marginLeft: i * 18 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#1e293b" }}>{zh ? l.zh : l.en}</span>
              <span style={{ fontSize: 12, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>{l.note}</span>
            </div>
          );
        })}
      </div>
      <Note>{zh ? "发送方逐层加首部（封装）；接收方逐层剥去首部（解封装），每层只看自己那一层。" : "Sender adds headers layer by layer (encapsulation); receiver strips them (decapsulation), each layer reading only its own."}</Note>
    </Panel>
  );
}
function stackGenerate(_config: any): Frame<StackScene>[] {
  return STACK_LAYERS.map((_, i) => ({
    line: i,
    caption: T(`第 ${i + 1} 层：${STACK_LAYERS[i].zh}`, `Layer ${i + 1}: ${STACK_LAYERS[i].en}`),
    scene: { visible: i + 1, layers: STACK_LAYERS, dir: "enc" },
  }));
}
const STACK_CODE = STACK_LAYERS.map((l) => T(l.zh, l.en));

// ---------------------------------------------------------------------
// 以太网帧 / IPv4 / TCP 首部
// ---------------------------------------------------------------------
const ETH_FIELDS: Field[] = [
  field("前导码", "Preamble", 8, "AA AA AA AA AA AA AA AB", "用于收发双方时钟同步，固定 8 字节。", "8 bytes for clock synchronization.", "#e2e8f0"),
  field("目的 MAC", "Dest MAC", 6, "BB:BB:BB:BB:BB:BB", "接收方的 48 位网卡地址。", "48-bit address of the receiving NIC.", "#dbeafe"),
  field("源 MAC", "Src MAC", 6, "AA:AA:AA:AA:AA:AA", "发送方的 48 位网卡地址。", "48-bit address of the sending NIC.", "#dcfce7"),
  field("类型", "Type", 2, "0x0800", "上层协议：0x0800=IPv4，0x86DD=IPv6，0x0806=ARP。", "Upper protocol: 0x0800 IPv4, 0x86DD IPv6, 0x0806 ARP.", "#fef3c7"),
  field("数据", "Data", 46, "（承载 IP 数据报）", "46–1500 字节的载荷，不足 46 需填充；上限由 MTU 决定。", "46–1500 byte payload, padded if short; capped by MTU.", "#fce7f3"),
  field("FCS", "FCS", 4, "CRC-32", "帧检验序列，用 CRC 检测传输差错，出错即丢弃。", "Frame check sequence; CRC detects errors, bad frames dropped.", "#ede9fe"),
];
const IP_FIELDS: Field[] = [
  field("版本", "Version", 1, "4", "IP 版本号，IPv4 为 4。", "IP version; 4 for IPv4.", "#e2e8f0"),
  field("首部长度", "IHL", 1, "5", "以 4 字节为单位，5 表示 20 字节首部。", "In 4-byte units; 5 = 20-byte header.", "#dbeafe"),
  field("服务类型", "ToS", 1, "0x00", "DSCP/ECN，用于区分服务与拥塞标记。", "DSCP/ECN for differentiated service.", "#dcfce7"),
  field("总长度", "Total Len", 2, "0x003C = 60", "首部 + 数据的总字节数。", "Total bytes = header + data.", "#fef3c7"),
  field("标识", "ID", 2, "0x1C46", "同一数据报的分片共享同一标识。", "Fragments of one datagram share this ID.", "#fce7f3"),
  field("标志+片偏移", "Flags+Offset", 2, "0x4000", "DF/MF 标志与以 8 字节为单位的片偏移。", "DF/MF flags and 8-byte-unit fragment offset.", "#ede9fe"),
  field("TTL", "TTL", 1, "64", "每经一跳减 1，为 0 丢弃，防止环路。", "Decremented per hop; 0 → drop, prevents loops.", "#e2e8f0"),
  field("协议", "Protocol", 1, "6 = TCP", "上层协议：6=TCP，17=UDP，1=ICMP。", "6=TCP, 17=UDP, 1=ICMP.", "#dbeafe"),
  field("首部检验和", "Checksum", 2, "0xB1E6", "仅校验首部，不含数据。", "Covers the header only.", "#dcfce7"),
  field("源地址", "Src IP", 4, "192.168.1.10", "发送方 IPv4 地址。", "Sender IPv4 address.", "#fef3c7"),
  field("目的地址", "Dst IP", 4, "93.184.216.34", "接收方 IPv4 地址。", "Receiver IPv4 address.", "#fce7f3"),
];
const TCP_FIELDS: Field[] = [
  field("源端口", "Src Port", 2, "12345", "发送方应用端口。", "Sender application port.", "#e2e8f0"),
  field("目的端口", "Dst Port", 2, "443 (HTTPS)", "接收方应用端口。", "Receiver application port.", "#dbeafe"),
  field("序号", "Seq", 4, "0x00000000", "本报文段第一个数据字节的序号。", "Sequence number of the first data byte.", "#dcfce7"),
  field("确认号", "Ack", 4, "0x00000000", "期望收到的下一个字节序号。", "Next expected byte sequence number.", "#fef3c7"),
  field("数据偏移", "Data Offset", 1, "5", "TCP 首部长度，以 4 字节为单位。", "TCP header length in 4-byte units.", "#fce7f3"),
  field("标志位", "Flags", 1, "SYN", "SYN/ACK/FIN/RST/PSH/URG 等控制位。", "SYN/ACK/FIN/RST/PSH/URG control bits.", "#ede9fe"),
  field("窗口", "Window", 2, "0x7210 = 29200", "接收窗口，用于流量控制。", "Receive window for flow control.", "#e2e8f0"),
  field("检验和", "Checksum", 2, "0x0000", "覆盖首部 + 数据 + 伪首部。", "Covers header + data + pseudo-header.", "#dbeafe"),
  field("紧急指针", "Urgent Ptr", 2, "0x0000", "URG 置位时指示紧急数据结尾。", "Points to end of urgent data when URG set.", "#dcfce7"),
];

function makeHeaderSub(titleZh: string, titleEn: string, fields: Field[]): SubDef {
  const code = fields.map((f) => T(`读取 ${f.zh}（${f.size} B）`, `read ${f.en} (${f.size} B)`));
  return {
    title: T(titleZh, titleEn),
    Render: BarsRender,
    code,
    generate: () =>
      fields.map((f, i) => ({
        line: i,
        caption: T(`${f.zh}：${f.value}`, `${f.en}: ${f.value}`),
        scene: { title: T(titleZh, titleEn), fields, active: i } as HeaderScene,
      })),
  };
}

// ---------------------------------------------------------------------
// 真实数据包 hex 视图
// ---------------------------------------------------------------------
type HexField = { zh: string; en: string; bytes: string[]; color: string; descZh: string; descEn: string };
type HexScene = { fields: HexField[]; active: number };

function hf(zh: string, en: string, bytes: string[], color: string, descZh: string, descEn: string): HexField {
  return { zh, en, bytes, color, descZh, descEn };
}
const HEX_FIELDS: HexField[] = [
  hf("目的 MAC", "Dest MAC", ["BB", "BB", "BB", "BB", "BB", "BB"], "#dbeafe", "接收方网卡地址。", "Receiver NIC address."),
  hf("源 MAC", "Src MAC", ["AA", "AA", "AA", "AA", "AA", "AA"], "#dcfce7", "发送方网卡地址。", "Sender NIC address."),
  hf("类型", "Type", ["08", "00"], "#fef3c7", "0x0800 = IPv4。", "0x0800 = IPv4."),
  hf("版本+IHL", "Ver+IHL", ["45"], "#e2e8f0", "版本 4，首部长度 5（20 B）。", "Version 4, IHL 5 (20 B)."),
  hf("总长度", "Total Len", ["00", "3C"], "#fce7f3", "总长 60 字节。", "Total 60 bytes."),
  hf("标识", "ID", ["1C", "46"], "#ede9fe", "分片标识。", "Fragment ID."),
  hf("标志+偏移", "Flags+Off", ["40", "00"], "#e2e8f0", "DF=1，不分片。", "DF=1, don't fragment."),
  hf("TTL", "TTL", ["40"], "#dbeafe", "TTL=64。", "TTL=64."),
  hf("协议", "Protocol", ["06"], "#dcfce7", "6 = TCP。", "6 = TCP."),
  hf("首部检验和", "Checksum", ["B1", "E6"], "#fef3c7", "IPv4 首部校验。", "IPv4 header checksum."),
  hf("源 IP", "Src IP", ["C0", "A8", "01", "0A"], "#fce7f3", "192.168.1.10。", "192.168.1.10."),
  hf("目的 IP", "Dst IP", ["5D", "B8", "D8", "22"], "#ede9fe", "93.184.216.34。", "93.184.216.34."),
  hf("源端口", "Src Port", ["30", "39"], "#e2e8f0", "12345。", "12345."),
  hf("目的端口", "Dst Port", ["01", "BB"], "#dbeafe", "443 (HTTPS)。", "443 (HTTPS)."),
  hf("TCP 标志", "TCP Flags", ["02"], "#dcfce7", "SYN=1，连接请求。", "SYN=1, connection request."),
  hf("窗口", "Window", ["72", "10"], "#fef3c7", "接收窗口 29200。", "Receive window 29200."),
  hf("载荷", "Payload", ["47", "45", "54", "20", "2F", "20", "48", "54", "54", "50"], "#fce7f3", "“GET / HTTP” 的 ASCII 码。", "ASCII of \"GET / HTTP\"."),
];

function HexRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { fields: HEX_FIELDS, active: 0 }) as HexScene;
  const fields = s.fields ?? HEX_FIELDS;
  // 打平为字节序列，记录每字节归属字段
  const flat: { b: string; f: number }[] = [];
  fields.forEach((f, fi) => f.bytes.forEach((b) => flat.push({ b, f: fi })));
  const cur = fields[s.active];
  const rows: { off: number; items: { b: string; f: number }[] }[] = [];
  for (let i = 0; i < flat.length; i += 16) rows.push({ off: i, items: flat.slice(i, i + 16) });
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 13, color: "#64748b" }}>{zh ? "一个真实的数据包（十六进制，按层着色）" : "A real packet (hex, colored by layer)"}</div>
      <div style={{ overflowX: "auto", background: "#0f172a", borderRadius: 10, padding: 12, fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.9 }}>
        {rows.map((r) => (
          <div key={r.off} style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "#64748b" }}>{r.off.toString(16).padStart(4, "0")}</span>
            <span style={{ display: "flex", gap: 3 }}>
              {r.items.map((it, k) => {
                const active = it.f === s.active;
                return (
                  <span key={k} style={{ padding: "0 3px", borderRadius: 3, background: active ? "#fde047" : fields[it.f]?.color, color: "#0f172a", fontWeight: active ? 900 : 600, outline: active ? "1px solid #fff" : "none" }}>{it.b}</span>
                );
              })}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        {fields.map((f, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: i === s.active ? "#4338ca" : f.color, color: i === s.active ? "#fff" : "#334155" }}>{zh ? f.zh : f.en}</span>
        ))}
      </div>
      {cur && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800, color: "#3730a3", fontSize: 13 }}>{zh ? cur.zh : cur.en}：<span style={{ fontFamily: "ui-monospace, monospace" }}>{cur.bytes.join(" ")}</span></div>
          <div style={{ fontSize: 13, color: "#334155" }}>{zh ? cur.descZh : cur.descEn}</div>
        </div>
      )}
    </Panel>
  );
}
function hexGenerate(): Frame<HexScene>[] {
  return HEX_FIELDS.map((f, i) => ({
    line: i,
    caption: T(`${f.zh}：${f.bytes.join(" ")}`, `${f.en}: ${f.bytes.join(" ")}`),
    scene: { fields: HEX_FIELDS, active: i },
  }));
}
const HEX_CODE = HEX_FIELDS.map((f) => T(`解析 ${f.zh}`, `parse ${f.en}`));

// ---------------------------------------------------------------------
const SUBS: Record<SubMode, SubDef> = {
  stack: { title: T("封装与解封装", "Encapsulation"), Render: StackRender, code: STACK_CODE, generate: stackGenerate },
  frame: makeHeaderSub("以太网帧", "Ethernet Frame", ETH_FIELDS),
  ipv4: makeHeaderSub("IPv4 数据报首部", "IPv4 Header", IP_FIELDS),
  tcp: makeHeaderSub("TCP 报文段首部", "TCP Header", TCP_FIELDS),
  hex: { title: T("真实数据包 (hex)", "Real Packet (hex)"), Render: HexRender, code: HEX_CODE, generate: hexGenerate },
};

export const { module: cnPacketModule, GROUPS: cnPacketGroups } = makeChapter<SubMode>({
  id: "cn-packet",
  title: T("网络包解剖", "Packet Dissection"),
  desc: T("真实数据包长什么样：逐层封装/解封装、以太网帧、IPv4 与 TCP 首部逐字段、一个真实数据包的十六进制视图。", "What a real packet looks like: layering, Ethernet/IP/TCP headers field by field, and a real hex dump."),
  tags: ["computer-network", "packet"],
  groups: [
    { label: "网络包", opts: [
      { v: "stack", zh: "封装与解封装", en: "Encapsulation" },
      { v: "frame", zh: "以太网帧", en: "Ethernet Frame" },
      { v: "ipv4", zh: "IPv4 首部", en: "IPv4 Header" },
      { v: "tcp", zh: "TCP 首部", en: "TCP Header" },
      { v: "hex", zh: "真实数据包 hex", en: "Real Packet hex" },
    ] },
  ],
  subs: SUBS,
});
