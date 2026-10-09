import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 应用层
//   对应 tex/ComputerNetwork/chapters/application_layer.tex
//   arch(应用体系结构) / http(HTTP 报文与非持久连接) / dns(DNS 层次与查询) / socket(Socket 编程)
// =====================================================================

type SubMode = "arch" | "http" | "dns" | "socket";

// 通用「竖向流程」示意：编号步骤 + 向下箭头（纯 HTML/CSS，无第三方图库）
function Flow({ title, steps, accent }: { title: string; steps: string[]; accent: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 800, color: accent, fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 4 }}>
        {steps.map((s, i) => (
          <div key={i}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", fontSize: 12 }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: accent, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{i + 1}</span>
              <span style={{ color: "#334155" }}>{s}</span>
            </div>
            {i < steps.length - 1 && <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, lineHeight: "14px" }}>↓</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// 报文结构条：标签 + 内容
function MsgLine({ label, body, tint }: { label: string; body: string; tint: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: tint, border: "1px solid #e2e8f0", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      <span style={{ fontWeight: 700, color: "#334155" }}>{label}</span>
      <span style={{ color: "#64748b", whiteSpace: "pre-line" }}>{body ? "  " + body : ""}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// arch — 应用体系结构：C/S 上传瓶颈 vs P2P 对等分发（逐帧动画）
//   C/S 只有服务器上传 → D=NF/u_s 随 N 线性增长；
//   P2P 对等点也上传 → 聚合速率 u_s+Σu_i 增大，分发时延缩短。
// ---------------------------------------------------------------------
const ARCH_F = 100;
const ARCH_US = 1;
const ARCH_U = 1;

type ArchMode = "cs" | "p2p";
type ArchScene = { mode: ArchMode; peers: number; time: number; progress: number };

function archCsTime(peers: number): number {
  return (peers * ARCH_F) / ARCH_US;
}
function archP2pTime(peers: number): number {
  return ARCH_F / (ARCH_US + peers * ARCH_U);
}

const ARCH_DEFAULT = { peers: 6 };

function ArchControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "对等点数 N" : "Peers N"} value={config.peers} onChange={(v) => onChange({ ...config, peers: v })} min={2} max={12} width={70} />
    </div>
  );
}

function archGenerate(config: any): Frame<ArchScene>[] {
  const maxPeers = Math.max(2, Math.min(12, Math.round(Number(config?.peers) || 6)));
  const csFull = archCsTime(maxPeers);
  const frames: Frame<ArchScene>[] = [
    { line: 0, caption: T(`客户机/服务器：$N=${maxPeers}$ 个对等点都从服务器下载，服务器上传 $u_s$ 成瓶颈，$D_{C/S}=NF/u_s=${csFull.toFixed(0)}$`, `Client/server: all $N=${maxPeers}$ peers download from the server; upload $u_s$ is the bottleneck, $D_{C/S}=NF/u_s=${csFull.toFixed(0)}$`), scene: { mode: "cs", peers: maxPeers, time: csFull, progress: 0 } },
  ];
  for (let n = 1; n <= maxPeers; n++) {
    const time = archP2pTime(n);
    const progress = (ARCH_US + n * ARCH_U) / (ARCH_US + maxPeers * ARCH_U);
    frames.push({
      line: n === 1 ? 1 : n === maxPeers ? 4 : 3,
      caption: T(`P2P：$N=${n}$ 个对等点同时上传，聚合速率 $u_s+\\sum u_i=${(ARCH_US + n * ARCH_U).toFixed(0)}$，$D_{P2P}=${time.toFixed(1)}$（C/S 需 ${archCsTime(n).toFixed(0)}）`, `P2P: $N=${n}$ peers upload too; aggregate $u_s+\\sum u_i=${(ARCH_US + n * ARCH_U).toFixed(0)}$, $D_{P2P}=${time.toFixed(1)}$ (C/S needs ${archCsTime(n).toFixed(0)})`),
      scene: { mode: "p2p", peers: n, time, progress },
    });
  }
  return frames;
}

const ARCH_CODE = [
  T("C/S：服务器串行分发 $N$ 份，$D=N F/u_s$", "C/S: the server serves $N$ copies, $D=N F/u_s$"),
  T("P2P：每个对等点兼作上传者", "P2P: every peer also uploads"),
  T("聚合上传速率 $= u_s + \\sum u_i$", "aggregate upload $= u_s + \\sum u_i$"),
  T("$D_{P2P} = F / (u_s + \\sum u_i)$", "$D_{P2P} = F / (u_s + \\sum u_i)$"),
  T("对等点越多 → 分发时延越短", "more peers → shorter distribution time"),
];

function ArchRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<ArchScene>;
  const mode: ArchMode = s.mode === "cs" ? "cs" : "p2p";
  const peers = Math.max(1, Math.round(s.peers ?? 1));
  const time = s.time ?? 0;
  const progress = Math.max(0, Math.min(1, s.progress ?? 0));
  const csT = archCsTime(peers);
  const p2pT = archP2pTime(peers);
  const scale = Math.max(csT, p2pT, 1);
  const idx = Array.from({ length: peers }, (_, i) => i);

  const bar = (label: string, val: number, color: string, current: boolean) => (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 70px", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: current ? "#1e293b" : "#64748b" }}>{label}</span>
      <div style={{ height: 16, background: "#e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, (val / scale) * 100)}%`, height: "100%", background: color, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "#334155" }}>{val.toFixed(1)}</span>
    </div>
  );

  return (
    <Panel>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: "#fff", background: mode === "cs" ? "#dc2626" : "#059669" }}>
          {mode === "cs" ? (zh ? "客户机/服务器" : "Client/Server") : "P2P"}
        </span>
        <span style={{ fontSize: 13, color: "#334155" }}>{zh ? `对等点 N = ${peers}` : `peers N = ${peers}`}</span>
        <span style={{ fontSize: 13, color: "#475569" }}>{zh ? `分发时延 D = ${time.toFixed(1)}` : `distribution D = ${time.toFixed(1)}`}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", padding: "8px 4px" }}>
        <div style={{ padding: "10px 14px", borderRadius: 12, background: "#eef2ff", border: "2px solid #6366f1", fontSize: 12, fontWeight: 800, color: "#3730a3", textAlign: "center" }}>
          {zh ? "服务器" : "server"}
          <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{`u_s=${ARCH_US}`}</div>
        </div>
        <span style={{ color: "#94a3b8" }}>↦</span>
        {idx.map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ padding: "8px 10px", borderRadius: 10, background: mode === "p2p" ? "#ecfdf5" : "#f8fafc", border: `1px solid ${mode === "p2p" ? "#6ee7b7" : "#e2e8f0"}`, fontSize: 11, fontWeight: 700, color: "#334155", textAlign: "center" }}>
              {zh ? `对等点 ${i + 1}` : `peer ${i + 1}`}
              <div style={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>{mode === "p2p" ? (zh ? "上传+下载" : "up+down") : (zh ? "仅下载" : "down only")}</div>
            </div>
            {i < peers - 1 && <span style={{ color: mode === "p2p" ? "#10b981" : "#cbd5e1", fontSize: 11 }}>{mode === "p2p" ? "⇄" : "·"}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6, padding: "6px 8px" }}>
        {bar(zh ? "C/S 串行" : "C/S serial", csT, "#f87171", mode === "cs")}
        {bar(zh ? "P2P 并行" : "P2P parallel", p2pT, "#34d399", mode === "p2p")}
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>{zh ? "聚合上传能力" : "Aggregate capacity"}</span>
          <div style={{ height: 12, background: "#e2e8f0", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: "linear-gradient(90deg,#818cf8,#4f46e5)", transition: "width .3s" }} />
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 13 }}>
        <MathText text={mode === "cs" ? "$D_{C/S} = \\dfrac{N F}{u_s}$" : "$D_{P2P} = \\dfrac{F}{u_s + \\sum_{i=1}^{N} u_i}$"} />
      </div>
      <Note>{zh ? "C/S 中只有服务器上传，对等点越多分发越慢；P2P 中对等点也贡献上传带宽，聚合速率随 N 增大，分发时延随之缩短。" : "In C/S only the server uploads, so more peers means slower; in P2P peers add upload bandwidth, aggregate rate grows with N and distribution time shrinks."}</Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// http — 报文结构 + 非持久连接耗时计算器
// ---------------------------------------------------------------------
const HTTP_DEFAULT = { n: 5, rtt: 100, lKb: 100, rateMbps: 10 };
function HttpControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "对象数 n" : "Objects n"} value={config.n} onChange={(v) => set({ n: v })} min={1} max={20} width={70} />
      <NumField label="RTT" value={config.rtt} onChange={(v) => set({ rtt: v })} min={1} max={5000} width={80} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>ms</span>
      <NumField label={zh ? "对象大小 L" : "Size L"} value={config.lKb} onChange={(v) => set({ lKb: v })} min={1} max={100000} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Kb</span>
      <NumField label={zh ? "速率 R" : "Rate R"} value={config.rateMbps} onChange={(v) => set({ rateMbps: v })} min={0.1} max={100000} step={0.1} width={90} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>Mbps</span>
    </div>
  );
}
type HttpPhase = "connect" | "request" | "process" | "response" | "fetch";
type HttpScene = {
  phase: HttpPhase;
  step: number;
  objectsFetched: number;
  elapsedMs: number;
  n: number;
  rtt: number;
  lKb: number;
  rateMbps: number;
  totalMs: number;
};

function httpGenerate(config: any): Frame<HttpScene>[] {
  const n = Math.max(1, Math.round(Number(config?.n) || 1));
  const rtt = Math.max(0, Number(config?.rtt) || 0);
  const lKb = Math.max(0, Number(config?.lKb) || 0);
  const rateMbps = Math.max(0, Number(config?.rateMbps) || 0);
  const perObject = rtt + (rateMbps > 0 ? lKb / rateMbps : 0);
  const totalMs = rtt + n * perObject;
  const base = { n, rtt, lKb, rateMbps, totalMs };
  const frames: Frame<HttpScene>[] = [
    { line: 0, caption: T(`① TCP 三次握手，建立连接（$RTT=${rtt}$ ms）`, `① TCP 3-way handshake establishes the connection ($RTT=${rtt}$ ms)`), scene: { ...base, phase: "connect", step: 0, objectsFetched: 0, elapsedMs: 0 } },
    { line: 1, caption: T(`② 发送请求 $GET\\ /index.html\\ HTTP/1.1$`, `② send request $GET\\ /index.html\\ HTTP/1.1$`), scene: { ...base, phase: "request", step: 1, objectsFetched: 0, elapsedMs: 0 } },
    { line: 2, caption: T(`③ 服务器处理请求并读取对象（$L=${lKb}$ Kb）`, `③ server processes the request and reads the object ($L=${lKb}$ Kb)`), scene: { ...base, phase: "process", step: 2, objectsFetched: 0, elapsedMs: 0 } },
    { line: 3, caption: T(`④ 返回 $HTTP/1.1\\ 200\\ OK$，客户机接收响应`, `④ returns $HTTP/1.1\\ 200\\ OK$; client receives it`), scene: { ...base, phase: "response", step: 3, objectsFetched: 0, elapsedMs: 0 } },
  ];
  for (let k = 1; k <= n; k++) {
    const elapsed = rtt + k * perObject;
    frames.push({ line: 4, caption: T(`非持久连接：第 $${k}/${n}$ 个对象完成，累计 $T=${elapsed.toFixed(1)}$ ms`, `non-persistent: object $${k}/${n}$ done, cumulative $T=${elapsed.toFixed(1)}$ ms`), scene: { ...base, phase: "fetch", step: 3 + k, objectsFetched: k, elapsedMs: elapsed } });
  }
  return frames;
}

const HTTP_CODE = [
  T("TCP 三次握手建立连接", "TCP 3-way handshake"),
  T("发送 $GET$ 请求报文", "send $GET$ request"),
  T("服务器处理并生成响应", "server processes the request"),
  T("返回 $200\\ OK$ 响应报文", "return $200\\ OK$"),
  T("每个对象再付 $RTT + L/R$", "each object costs $RTT + L/R$"),
];

function HttpRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<HttpScene>;
  const n = s.n ?? (Number(config?.n) || 1);
  const rtt = s.rtt ?? (Number(config?.rtt) || 0);
  const L = s.lKb ?? (Number(config?.lKb) || 0);
  const R = s.rateMbps ?? (Number(config?.rateMbps) || 0);
  const rttTerm = (n + 1) * rtt;
  const transTerm = R > 0 ? n * (L / R) : 0;
  const total = s.totalMs ?? (rttTerm + transTerm);
  const step = s.step ?? 0;
  const objectsFetched = s.objectsFetched ?? 0;
  const elapsed = s.elapsedMs ?? 0;

  const phases: [string, string][] = zh
    ? [
      ["① TCP 连接", "三次握手"],
      ["② 发送 GET", "请求报文"],
      ["③ 服务器处理", "生成响应"],
      ["④ 200 OK", "接收响应"],
    ]
    : [
      ["① TCP connect", "3-way handshake"],
      ["② send GET", "request"],
      ["③ server process", "build response"],
      ["④ 200 OK", "receive"],
    ];

  const req: [string, string, string][] = zh
    ? [
      ["请求行 ", "GET /index.html HTTP/1.1", "#dbeafe"],
      ["首部行 ", "Host: www.example.com\nUser-Agent: Mozilla/5.0\nConnection: close\nAccept-Language: zh-CN", "#f1f5f9"],
      ["空行   ", "CRLF", "#fff7ed"],
      ["实体主体", "（仅 POST / PUT 时才有）", "#dcfce7"],
    ]
    : [
      ["Request line ", "GET /index.html HTTP/1.1", "#dbeafe"],
      ["Header lines ", "Host: www.example.com\nUser-Agent: Mozilla/5.0\nConnection: close\nAccept-Language: en-US", "#f1f5f9"],
      ["Blank line   ", "CRLF", "#fff7ed"],
      ["Entity body  ", "(only for POST / PUT)", "#dcfce7"],
    ];
  const res: [string, string, string][] = zh
    ? [
      ["状态行 ", "HTTP/1.1 200 OK", "#dbeafe"],
      ["首部行 ", "Content-Type: text/html\nContent-Length: 1024\nDate: ...\nSet-Cookie: sid=...", "#f1f5f9"],
      ["空行   ", "CRLF", "#fff7ed"],
      ["实体主体", "<html> … 响应内容 …", "#dcfce7"],
    ]
    : [
      ["Status line ", "HTTP/1.1 200 OK", "#dbeafe"],
      ["Header lines ", "Content-Type: text/html\nContent-Length: 1024\nDate: ...\nSet-Cookie: sid=...", "#f1f5f9"],
      ["Blank line   ", "CRLF", "#fff7ed"],
      ["Entity body  ", "<html> … response payload …", "#dcfce7"],
    ];

  const rows: React.ReactNode[][] = [
    [zh ? "RTT 开销" : "RTT overhead", `${rttTerm.toFixed(1)} ms`, `(n+1)·RTT = (${n}+1)·${rtt}`],
    [zh ? "传输时延" : "Transfer time", `${transTerm.toFixed(1)} ms`, `Σ L/R = ${n}·${L}/${R}`],
    [zh ? "总时延 T" : "Total T", `${total.toFixed(1)} ms`, "(n+1)RTT + ΣL/R"],
  ];

  return (
    <Panel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {phases.map(([a, b], i) => {
          const cur = i === step;
          const done = i < step;
          return (
            <div key={a} style={{ padding: "8px 10px", borderRadius: 10, background: cur ? "#eef2ff" : done ? "#f0fdf4" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : done ? "#bbf7d0" : "#e2e8f0"}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: cur ? "#4338ca" : "#334155" }}>{a}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{b}</div>
            </div>
          );
        })}
      </div>
      {s.phase === "fetch" && (
        <Note>
          {zh
            ? `非持久连接：已取回 ${objectsFetched}/${n} 个对象，当前累计 $T=${elapsed.toFixed(1)}$ ms。`
            : `Non-persistent: fetched ${objectsFetched}/${n} objects, cumulative $T=${elapsed.toFixed(1)}$ ms.`}
        </Note>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? "请求报文" : "Request message"}</div>
          {req.map(([l, b, tint], i) => <MsgLine key={i} label={l} body={b} tint={tint} />)}
        </div>
        <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#047857" }}>{zh ? "响应报文" : "Response message"}</div>
          {res.map(([l, b, tint], i) => <MsgLine key={i} label={l} body={b} tint={tint} />)}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T \approx (n+1)\cdot RTT + \sum_{i=1}^{n} \frac{L_i}{R}$" />
      </div>
      <Table head={zh ? ["分量", "值", "代入"] : ["Component", "Value", "Substituted"]} rows={rows} />
      <Note tone={total > 2000 ? "warn" : "info"}>
        {zh
          ? `非持久连接（HTTP/1.0）每个对象都可能重复握手：n=${n} 个对象在 RTT=${rtt} ms、L=${L} Kb、R=${R} Mbps 下约需 T=${total.toFixed(1)} ms。采用持久连接（HTTP/1.1）可复用 TCP 连接，显著降低 RTT 开销。`
          : `Non-persistent HTTP/1.0 may re-handshake per object: n=${n} objects at RTT=${rtt} ms, L=${L} Kb, R=${R} Mbps need about T=${total.toFixed(1)} ms. Persistent HTTP/1.1 reuses one TCP connection and cuts the RTT overhead.`}
      </Note>
      <Chips items={zh
        ? [["方法", "GET · POST · PUT · DELETE · HEAD"], ["2xx", "成功"], ["3xx", "重定向"], ["4xx / 5xx", "客户端 / 服务器错误"]]
        : [["Methods", "GET · POST · PUT · DELETE · HEAD"], ["2xx", "success"], ["3xx", "redirect"], ["4xx / 5xx", "client / server error"]]} />
      <Note>{zh ? "HTTP 是无状态协议，用 Cookie 保存会话状态；用 Web 缓存/代理配合条件 GET（If-Modified-Since / ETag）返回 304 降低时延与链路负载。" : "HTTP is stateless: cookies keep session state; web caches/proxies with conditional GET (If-Modified-Since / ETag) return 304 to cut latency and link load."}</Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// dns — 层次结构 + 递归/迭代查询
// ---------------------------------------------------------------------
type DnsMode = "recursive" | "iterative";
type DnsScene = { step: number; path: string[]; mode: DnsMode };

const DNS_NODES = ["host", "local", "root", "tld", "auth"] as const;

function DnsControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "查询方式" : "Mode"}</span>
        <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value })}>
          <option value="recursive">{zh ? "递归 Recursive" : "Recursive"}</option>
          <option value="iterative">{zh ? "迭代 Iterative" : "Iterative"}</option>
        </select>
      </label>
    </div>
  );
}

function dnsGenerate(config: any): Frame<DnsScene>[] {
  const mode: DnsMode = config?.mode === "iterative" ? "iterative" : "recursive";
  if (mode === "recursive") {
    return [
      { line: 0, caption: T("主机把递归查询交给本地 DNS 服务器", "host hands the recursive query to the local DNS"), scene: { step: 0, path: ["host", "local"], mode } },
      { line: 1, caption: T("本地 DNS 向根服务器发起递归查询", "local DNS sends a recursive query to a root server"), scene: { step: 1, path: ["host", "local", "root"], mode } },
      { line: 1, caption: T("根服务器继续向 TLD 服务器递归查询", "root recurses to the TLD server"), scene: { step: 2, path: ["host", "local", "root", "tld"], mode } },
      { line: 1, caption: T("TLD 继续向权威服务器递归查询", "TLD recurses to the authoritative server"), scene: { step: 3, path: ["host", "local", "root", "tld", "auth"], mode } },
      { line: 3, caption: T("权威服务器返回 IP，逐级原路返回", "authoritative returns the IP; answer flows back up the chain"), scene: { step: 4, path: ["host", "local", "root", "tld", "auth"], mode } },
      { line: 4, caption: T("本地 DNS 按 TTL 缓存并把结果回给主机", "local DNS caches by TTL and replies to the host"), scene: { step: 5, path: ["host", "local"], mode } },
    ];
  }
  return [
    { line: 0, caption: T("主机把查询交给本地 DNS 服务器", "host hands the query to the local DNS"), scene: { step: 0, path: ["host", "local"], mode } },
    { line: 1, caption: T("本地 DNS 迭代查询根，根返回 TLD 地址", "local DNS iteratively asks root; root returns the TLD address"), scene: { step: 1, path: ["local", "root"], mode } },
    { line: 1, caption: T("本地 DNS 迭代查询 TLD，TLD 返回权威地址", "local DNS asks TLD; TLD returns the authoritative address"), scene: { step: 2, path: ["local", "root", "tld"], mode } },
    { line: 1, caption: T("本地 DNS 迭代查询权威，权威返回 IP", "local DNS asks authoritative; it returns the IP"), scene: { step: 3, path: ["local", "root", "tld", "auth"], mode } },
    { line: 4, caption: T("本地 DNS 缓存结果并回给主机", "local DNS caches the answer and replies to the host"), scene: { step: 4, path: ["host", "local"], mode } },
  ];
}

const DNS_CODE = [
  T("主机 → 本地 DNS：查询域名", "host → local DNS: query name"),
  T("本地 DNS → 根 / TLD / 权威", "local DNS → root / TLD / authoritative"),
  T("递归：被查方查全；迭代：返回下一跳", "recursive: server resolves; iterative: returns next hop"),
  T("权威返回 IP（原路返回）", "authoritative returns IP (back up the chain)"),
  T("本地 DNS 缓存（TTL）后回主机", "local DNS caches (TTL) then replies"),
];

function DnsRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<DnsScene>;
  const mode: DnsMode = s.mode === "iterative" ? "iterative" : "recursive";
  const path = s.path ?? ["host", "local"];
  const labels: Record<string, string> = zh
    ? { host: "主机", local: "本地 DNS", root: "根服务器", tld: "TLD 服务器", auth: "权威服务器" }
    : { host: "host", local: "local DNS", root: "root", tld: "TLD", auth: "authoritative" };
  const tiers: [string, string][] = zh
    ? [
      ["根 DNS 服务器", "全球 13 组根服务器，知道所有 TLD 的地址"],
      ["顶级域 TLD 服务器", "com / org / cn … 知道对应权威服务器的地址"],
      ["权威 DNS 服务器", "组织自维护，保存主机名 → IP 的权威资源记录"],
    ]
    : [
      ["Root servers", "13 root clusters; know every TLD server"],
      ["TLD servers", "com / org / cn …; know the authoritative servers"],
      ["Authoritative servers", "Org-run; hold authoritative hostname → IP records"],
    ];
  const rec = zh
    ? [
      "主机 → 本地 DNS：查询 www.example.com",
      "本地 DNS → 根：代为逐级查询",
      "根 → TLD → 权威：逐级转发查询",
      "权威 → 本地 DNS：原路返回 IP",
      "本地 DNS → 主机：返回结果（按 TTL 缓存）",
    ]
    : [
      "Host → local DNS: query www.example.com",
      "Local DNS → root: resolves on your behalf",
      "Root → TLD → authoritative: chain forwards query",
      "Authoritative → local DNS: IP returned back",
      "Local DNS → host: result (cached by TTL)",
    ];
  const itr = zh
    ? [
      "本地 DNS → 根：查询",
      "根 → 本地 DNS：返回 TLD 地址",
      "本地 DNS → TLD：查询",
      "TLD → 本地 DNS：返回权威地址",
      "本地 DNS → 权威：查询，权威返回 IP",
    ]
    : [
      "Local DNS → root: query",
      "Root → local DNS: TLD address",
      "Local DNS → TLD: query",
      "TLD → local DNS: authoritative address",
      "Local DNS → authoritative: IP returned",
    ];
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", padding: "6px 4px" }}>
        {DNS_NODES.map((id, i) => {
          const active = path.includes(id);
          const cur = path[path.length - 1] === id;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: 26, height: 3, background: active ? "#6366f1" : "#cbd5e1" }} />}
              <div style={{ padding: "7px 10px", borderRadius: 10, background: cur ? "#eef2ff" : active ? "#f1f5f9" : "#fff", border: `2px solid ${cur ? "#6366f1" : active ? "#c7d2fe" : "#e2e8f0"}`, fontSize: 11, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>
                {labels[id]}
              </div>
            </div>
          );
        })}
      </div>
      <Note tone={mode === "recursive" ? "info" : "warn"}>
        {zh
          ? `${mode === "recursive" ? "递归查询" : "迭代查询"}：当前走位 ${path.map((p) => labels[p] ?? p).join(" → ")}。`
          : `${mode === "recursive" ? "Recursive" : "Iterative"}: current path ${path.map((p) => labels[p] ?? p).join(" → ")}.`}
      </Note>
      <div style={{ display: "grid", gap: 4 }}>
        {tiers.map(([name, d], i) => (
          <div key={name}>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: `hsl(232, 72%, ${94 - i * 4}%)`, border: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: 800, color: "#3730a3", fontSize: 13 }}>{name}</span>
              <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>{d}</span>
            </div>
            {i < tiers.length - 1 && <div style={{ textAlign: "center", color: "#94a3b8", lineHeight: "16px" }}>↓</div>}
          </div>
        ))}
      </div>
      <Note>{zh ? "本地 DNS 服务器（ISP / 校园网）是终端的代理 stub resolver：代表主机向层次服务器查询，并按 TTL 缓存结果以减轻根/TLD 压力。" : "The local DNS (ISP/campus) is the stub resolver: it queries the hierarchy on the host's behalf and caches answers by TTL, easing root/TLD load."}</Note>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Flow title={zh ? "递归查询 Recursive" : "Recursive"} steps={rec} accent="#4f46e5" />
        <Flow title={zh ? "迭代查询 Iterative" : "Iterative"} steps={itr} accent="#0891b2" />
      </div>
      <Note>{zh ? "关键区别：递归由被查询服务器负责把答案查全（本地 DNS 代为逐级查询）；迭代由被查询服务器返回「下一步问谁」，本地 DNS 自己继续追问。" : "Key difference: recursive means the queried server must produce the full answer; iterative returns 'ask whom next' and the local DNS follows up itself."}</Note>
      <Chips items={zh
        ? [["A / AAAA", "主机名 → IPv4 / IPv6"], ["CNAME", "别名 → 规范名"], ["MX", "邮件交换服务器"], ["NS", "该域的域名服务器"]]
        : [["A / AAAA", "name → IPv4 / IPv6"], ["CNAME", "alias → canonical"], ["MX", "mail exchange"], ["NS", "name servers"]]} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// socket — TCP / UDP 调用序列对比
// ---------------------------------------------------------------------
type SockWho = "server" | "client";
type SockScene = { step: number; who: SockWho; call: string };

const SOCKET_STEPS: { who: SockWho; call: string; line: number; zh: string; en: string }[] = [
  { who: "server", call: "socket()", line: 0, zh: "服务器 socket() 创建监听套接字", en: "server socket() creates a listening socket" },
  { who: "server", call: "bind()", line: 1, zh: "服务器 bind() 绑定 IP:端口", en: "server bind() to IP:port" },
  { who: "server", call: "listen()", line: 1, zh: "服务器 listen() 进入监听状态", en: "server listen() and waits" },
  { who: "client", call: "socket()", line: 3, zh: "客户机 socket() 创建套接字", en: "client socket() creates a socket" },
  { who: "client", call: "connect()", line: 3, zh: "客户机 connect() 发起三次握手", en: "client connect() starts the 3-way handshake" },
  { who: "server", call: "accept()", line: 2, zh: "服务器 accept() 取出新连接套接字", en: "server accept() returns a new connection socket" },
  { who: "client", call: "send()", line: 4, zh: "客户机 send() 发送请求", en: "client send() the request" },
  { who: "server", call: "recv()", line: 4, zh: "服务器 recv() 接收请求", en: "server recv() the request" },
  { who: "server", call: "send()", line: 5, zh: "服务器 send() 发回响应", en: "server send() the response" },
  { who: "client", call: "recv()", line: 5, zh: "客户机 recv() 接收响应", en: "client recv() the response" },
  { who: "client", call: "close()", line: 5, zh: "双方 close() 关闭连接", en: "both sides close() the connection" },
];

function socketGenerate(_config: any): Frame<SockScene>[] {
  return SOCKET_STEPS.map((st, i) => ({ line: st.line, caption: T(st.zh, st.en), scene: { step: i, who: st.who, call: st.call } }));
}

const SOCKET_CODE = [
  T("server: $socket()$", "server: $socket()$"),
  T("server: $bind()$ / $listen()$", "server: $bind()$ / $listen()$"),
  T("server: $accept()$", "server: $accept()$"),
  T("client: $socket()$ / $connect()$", "client: $socket()$ / $connect()$"),
  T("client $send()$ / server $recv()$", "client $send()$ / server $recv()$"),
  T("server $send()$ / client $recv()$ → $close()$", "server $send()$ / client $recv()$ → $close()$"),
];

function FlowHL({ title, items, accent, active }: { title: string; items: [string, string][]; accent: string; active: number }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 800, color: accent, fontSize: 13, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 4 }}>
        {items.map(([, text], i) => {
          const cur = i === active;
          return (
            <div key={i}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderRadius: 8, background: cur ? "#eef2ff" : "#fff", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, fontSize: 12, opacity: active >= 0 && i > active ? 0.45 : 1 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: accent, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{i + 1}</span>
                <span style={{ color: "#334155" }}>{text}</span>
              </div>
              {i < items.length - 1 && <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, lineHeight: "14px" }}>↓</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SocketRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<SockScene>;
  const curCall = s.call ?? "";
  const srv: [string, string][] = zh
    ? [["socket()", "socket() 创建套接字"], ["bind()", "bind() 绑定 IP:端口"], ["listen()", "listen() 进入监听"], ["accept()", "accept() 等待并接受连接"], ["recv()/send()", "recv() / send() 收发数据"], ["close()", "close() 关闭"]]
    : [["socket()", "socket() create"], ["bind()", "bind() to IP:port"], ["listen()", "listen() start listening"], ["accept()", "accept() wait & accept"], ["recv()/send()", "recv() / send() data"], ["close()", "close()"]];
  const cli: [string, string][] = zh
    ? [["socket()", "socket() 创建套接字"], ["connect()", "connect() 发起三次握手"], ["send()/recv()", "send() / recv() 收发数据"], ["close()", "close() 关闭"]]
    : [["socket()", "socket() create"], ["connect()", "connect() three-way handshake"], ["send()/recv()", "send() / recv() data"], ["close()", "close()"]];
  const udp = zh
    ? ["socket() 创建套接字", "sendto() / recvfrom() 直接收发（无连接）", "close() 关闭"]
    : ["socket() create", "sendto() / recvfrom() (connectionless)", "close()"];
  const active = s.who === "server"
    ? srv.findIndex(([tok]) => tok.includes(curCall))
    : cli.findIndex(([tok]) => tok.includes(curCall));
  const rows: React.ReactNode[][] = zh
    ? [
      ["连接", "面向连接（三次握手）", "无连接"],
      ["可靠性", "可靠、有序、字节流", "尽力而为，可能丢失 / 乱序"],
      ["首部开销", "20 字节起", "8 字节"],
      ["典型调用", "server: socket→bind→listen→accept", "socket→sendto / recvfrom"],
      ["应用", "HTTP · SMTP · FTP", "DNS · 流媒体 · 游戏"],
    ]
    : [
      ["Connection", "Connection-oriented (3-way handshake)", "Connectionless"],
      ["Reliability", "Reliable, ordered byte stream", "Best effort; may drop / reorder"],
      ["Header size", "20 bytes and up", "8 bytes"],
      ["Typical calls", "server: socket→bind→listen→accept", "socket→sendto / recvfrom"],
      ["Applications", "HTTP · SMTP · FTP", "DNS · streaming · games"],
    ];
  return (
    <Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FlowHL title={zh ? "TCP 服务器" : "TCP server"} items={srv} accent="#4f46e5" active={s.who === "server" ? active : -1} />
        <FlowHL title={zh ? "TCP 客户机" : "TCP client"} items={cli} accent="#0891b2" active={s.who === "client" ? active : -1} />
        <Flow title={zh ? "UDP（双方）" : "UDP (both sides)"} steps={udp} accent="#059669" />
      </div>
      <Table head={zh ? ["特性", "TCP", "UDP"] : ["Feature", "TCP", "UDP"]} rows={rows} />
      <Note>{zh ? "TCP 服务器先 listen 后 accept，阻塞直到客户机 connect 到达；连接由「源 IP/端口 + 目的 IP/端口」套接字对唯一标识。" : "The TCP server listens then blocks in accept until a client connect arrives; a connection is identified by the socket pair (source IP/port, dest IP/port)."}</Note>
      <Note>{zh ? "UDP 无连接，发送前无需握手：socket() 之后即可 sendto() / recvfrom()，适合容忍丢包、追求低时延的场景。" : "UDP is connectionless: after socket() you can sendto() / recvfrom() immediately — ideal when low latency beats loss tolerance."}</Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  arch: { title: T("应用体系结构", "Application Architecture"), defaultConfig: ARCH_DEFAULT, Controls: ArchControls, Render: ArchRender, generate: archGenerate, code: ARCH_CODE },
  http: { title: T("HTTP", "HTTP"), defaultConfig: HTTP_DEFAULT, Controls: HttpControls, Render: HttpRender, generate: httpGenerate, code: HTTP_CODE },
  dns: { title: T("DNS", "DNS"), defaultConfig: { mode: "recursive" }, Controls: DnsControls, Render: DnsRender, generate: dnsGenerate, code: DNS_CODE },
  socket: { title: T("Socket 编程", "Socket"), Render: SocketRender, generate: socketGenerate, code: SOCKET_CODE },
};

export const { module: cnApplicationModule, GROUPS: cnApplicationGroups } = makeChapter<SubMode>({
  id: "cn-application",
  title: T("应用层", "Application Layer"),
  desc: T(
    "应用体系结构（C/S / P2P / 混合）、HTTP 报文与非持久连接时延、DNS 层次与递归/迭代查询、TCP/UDP Socket 调用序列。",
    "Application architecture (C/S, P2P, hybrid), HTTP messages & non-persistent delay, DNS hierarchy with recursive/iterative queries, and TCP/UDP socket call sequences.",
  ),
  tags: ["computer-network", "application"],
  groups: [
    { label: "应用", opts: [
      { v: "arch", zh: "体系结构", en: "Architecture" },
      { v: "http", zh: "HTTP", en: "HTTP" },
      { v: "dns", zh: "DNS", en: "DNS" },
      { v: "socket", zh: "Socket 编程", en: "Socket" },
    ] },
  ],
  subs: SUBS,
});
