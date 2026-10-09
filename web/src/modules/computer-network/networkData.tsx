import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 网络层：数据平面
//   对应 tex/ComputerNetwork/chapters/network_data_plane.tex
//   subnet(子网与 CIDR) / nat(NAT) / forwarding(最长前缀匹配) / ipv6(IPv6 地址压缩)
// =====================================================================

type SubMode = "subnet" | "nat" | "forwarding" | "ipv6";

// ---------------------------------------------------------------------
// IP 地址工具（点分十进制 <-> uint32）
// ---------------------------------------------------------------------

function ipToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function maskOf(prefix: number): number {
  return prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function bitsOf(n: number): string {
  let s = "";
  for (let i = 31; i >= 0; i--) s += (n >>> i) & 1;
  return s;
}

// 32 位二进制示意：前 prefix 位为网络位（蓝），其余主机位（灰）
function Bits({ value, prefix }: { value: number; prefix: number }) {
  const bits = bitsOf(value);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
      {[0, 1, 2, 3].map((oct) => (
        <span key={oct}>
          {bits.slice(oct * 8, oct * 8 + 8).split("").map((b, i) => {
            const pos = oct * 8 + i;
            return (
              <span key={i} style={{ color: pos < prefix ? "#4338ca" : "#94a3b8", fontWeight: pos < prefix ? 800 : 400 }}>{b}</span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

// 用户驱动交互：内联「状态 / 数值」面板，随 scene 每步刷新
function Status({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#4338ca", letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
      <span style={{ width: 140, flexShrink: 0, color: "#64748b" }}>{k}</span>
      <span style={{ color: "#0f172a", fontWeight: 700, wordBreak: "break-all" }}>{v}</span>
    </div>
  );
}

function StepHint({ text }: { text: string }) {
  return <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#4338ca" }}>{text}</div>;
}

// =====================================================================
// 2) subnet — 子网 / CIDR 计算器
// =====================================================================

const SUBNET_DEFAULT = { ip: "192.168.1.130", prefix: 26 };

function SubnetControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "IP 地址" : "IP address"}</span>
        <input className="txt" value={config.ip} onChange={(e) => set({ ip: e.target.value })} placeholder="192.168.1.130" style={{ width: 150, fontFamily: "ui-monospace, monospace" }} />
      </label>
      <NumField label={zh ? "前缀 /" : "Prefix /"} value={config.prefix} onChange={(v) => set({ prefix: Math.round(v) })} min={1} max={32} width={70} />
    </div>
  );
}

type SubnetScene = {
  ip: string;
  prefix: number;
  maskBitsShown: number;
  network: string | null;
  broadcast: string | null;
};

function SubnetRender({ scene, t, step, count, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as SubnetScene;
  const ipInt = ipToInt(String(s.ip ?? ""));
  const prefix = Math.max(0, Math.min(32, Math.round(s.prefix ?? 0)));
  if (ipInt === null) {
    return (
      <Panel>
        <Note tone="warn">
          {zh
            ? `无法解析 IP 地址「${s.ip}」，请输入形如 192.168.1.130 的点分十进制。`
            : `Cannot parse IP "${s.ip}"; enter dotted decimal such as 192.168.1.130.`}
        </Note>
      </Panel>
    );
  }
  const shown = Math.max(0, Math.min(prefix, Math.round(s.maskBitsShown ?? 0)));
  const mask = maskOf(prefix);
  const networkInt = (ipInt & maskOf(shown)) >>> 0;
  const networkFinal = (ipInt & mask) >>> 0;
  const broadcastFinal = (networkFinal | (~mask >>> 0)) >>> 0;
  const size = Math.pow(2, 32 - prefix);
  const hostCount = Math.max(0, size - 2);
  const firstHost = size > 2 ? networkFinal + 1 : networkFinal;
  const lastHost = size > 2 ? broadcastFinal - 1 : broadcastFinal;
  const rows: React.ReactNode[][] = [
    [zh ? "子网掩码" : "Netmask", intToIp(mask), `/${prefix}`],
    [zh ? "网络地址" : "Network", s.network ?? intToIp(networkInt), `${zh ? "已应用" : "applied"} ${shown}/${prefix} ${zh ? "位" : "bits"}`],
  ];
  if (s.broadcast) {
    rows.push([zh ? "广播地址" : "Broadcast", s.broadcast, zh ? "主机位全 1" : "all host bits = 1"]);
    rows.push([zh ? "可用主机范围" : "Host range", `${intToIp(firstHost)} – ${intToIp(lastHost)}`, zh ? "去掉网络号与广播" : "network & broadcast excluded"]);
    rows.push([zh ? "可用主机数" : "Usable hosts", `${hostCount}`, <MathText key="f" text={`$2^{32-${prefix}} - 2 = ${hostCount}$`} />]);
  }
  const canStep = !!onNext && !playing && (typeof count !== "number" || typeof step !== "number" || step < count - 1);
  const cue = shown < prefix
    ? T("点击应用下一位掩码", "click to apply the next mask bit")
    : s.network === null
      ? T("点击求网络地址", "click to compute the network address")
      : s.broadcast === null
        ? T("点击求广播地址", "click to compute the broadcast address")
        : T("点击列出可用主机", "click to list usable hosts");
  return (
    <Panel>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
          {zh ? `地址 ${s.ip}：前缀 ${prefix} 位（蓝）/ 主机 ${32 - prefix} 位（灰）` : `${s.ip}: prefix ${prefix} bits (blue) / host ${32 - prefix} bits (gray)`}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", fontSize: 11, color: "#64748b" }}>
          <span style={{ width: 28, textAlign: "right" }}>IP</span>
          <Bits value={ipInt} prefix={shown} />
        </div>
        <div
          onClick={canStep ? (e) => { e.stopPropagation(); onNext(); } : undefined}
          style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", fontSize: 11, color: "#64748b", cursor: canStep ? "pointer" : "default", padding: "4px 8px", borderRadius: 8, border: canStep ? "1px dashed #4338ca" : "1px solid transparent", background: canStep ? "#eef2ff" : "transparent" }}
        >
          <span style={{ width: 28, textAlign: "right" }}>MASK</span>
          <Bits value={mask} prefix={shown} />
          {canStep && <span style={{ marginLeft: 8, fontWeight: 800, color: "#4338ca" }}>{t(cue)}</span>}
        </div>
      </div>
      <Table head={zh ? ["项", "值", "说明"] : ["Item", "Value", "Note"]} rows={rows} />
      <Status title={zh ? "状态 / 数值" : "State / Values"}>
        <KV k={zh ? "进度" : "Progress"} v={`${typeof step === "number" ? step + 1 : 1} / ${typeof count === "number" ? count : "-"}`} />
        <KV k={zh ? "已应用掩码" : "Mask bits applied"} v={`${shown} / ${prefix}`} />
        <KV k={zh ? "网络地址" : "Network"} v={s.network ?? "-"} />
        <KV k={zh ? "广播地址" : "Broadcast"} v={s.broadcast ?? "-"} />
        <KV k={zh ? "可用主机范围" : "Host range"} v={s.broadcast ? `${intToIp(firstHost)} - ${intToIp(lastHost)}` : "-"} />
      </Status>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$\\text{network} = \\text{IP} \\;\\&\\; \\text{mask}$" />
      </div>
      {s.broadcast && (
        <Note tone={prefix >= 31 ? "warn" : "info"}>
          {zh
            ? `CIDR 记法 a.b.c.d/${prefix} 中前 ${prefix} 位是网络前缀。可用主机数为 2^(32-${prefix}) − 2 = ${hostCount}（扣除网络号 ${intToIp(networkFinal)} 与广播地址 ${intToIp(broadcastFinal)}）；/31 与 /32 不适用「减 2」规则。`
            : `In CIDR a.b.c.d/${prefix} the first ${prefix} bits are the network prefix. Usable hosts = 2^(32-${prefix}) − 2 = ${hostCount}, excluding network ${intToIp(networkFinal)} and broadcast ${intToIp(broadcastFinal)}; /31 and /32 don't follow the "−2" rule.`}
        </Note>
      )}
    </Panel>
  );
}

function subnetGenerate(config: any): Frame<SubnetScene>[] {
  const ip = String(config.ip ?? "");
  const prefix = Math.max(0, Math.min(32, Math.round(config.prefix)));
  const ipInt = ipToInt(ip);
  const base: SubnetScene = { ip, prefix, maskBitsShown: 0, network: null, broadcast: null };
  if (ipInt === null) {
    return [{ line: 0, caption: T(`! 无法解析 IP「${ip}」`, `! Cannot parse IP "${ip}"`), scene: base }];
  }
  const mask = maskOf(prefix);
  const network = (ipInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const firstHost = Math.pow(2, 32 - prefix) > 2 ? network + 1 : network;
  const lastHost = Math.pow(2, 32 - prefix) > 2 ? broadcast - 1 : broadcast;
  const frames: Frame<SubnetScene>[] = [];
  frames.push({
    line: 0,
    caption: T(`IP $${ip}$ 与前缀 $/${prefix}$：掩码前 ${prefix} 位为 1`, `IP $${ip}$ with prefix $/${prefix}$: the first ${prefix} mask bits are 1`),
    scene: { ...base, maskBitsShown: 0 },
  });
  for (let k = 1; k <= prefix; k++) {
    frames.push({
      line: 1,
      caption: T(`逐位应用掩码第 $${k}$ 位（共 ${prefix} 位）`, `apply mask bit $${k}$ of ${prefix}, left to right`),
      scene: { ...base, maskBitsShown: k },
    });
  }
  frames.push({
    line: 2,
    caption: T(`网络地址 $= \\text{IP} \\;\\&\\; \\text{mask} = ${intToIp(network)}$`, `network $= \\text{IP} \\;\\&\\; \\text{mask} = ${intToIp(network)}$`),
    scene: { ...base, maskBitsShown: prefix, network: intToIp(network) },
  });
  frames.push({
    line: 3,
    caption: T(`广播地址 $= \\text{network} \\;|\\; \\sim\\text{mask} = ${intToIp(broadcast)}$`, `broadcast $= \\text{network} \\;|\\; \\sim\\text{mask} = ${intToIp(broadcast)}$`),
    scene: { ...base, maskBitsShown: prefix, network: intToIp(network), broadcast: intToIp(broadcast) },
  });
  frames.push({
    line: 4,
    caption: T(`可用主机范围 $${intToIp(firstHost)}$ – $${intToIp(lastHost)}$`, `usable host range $${intToIp(firstHost)}$ – $${intToIp(lastHost)}$`),
    scene: { ...base, maskBitsShown: prefix, network: intToIp(network), broadcast: intToIp(broadcast) },
  });
  return frames;
}

const SUBNET_CODE = [
  T("$mask \\gets$ 前缀 $/n$ 的 $n$ 个 1", "$mask \\gets$ $n$ leading 1s for prefix $/n$"),
  T("for $i \\gets 1$ to $n$: 逐位应用掩码位", "for $i \\gets 1$ to $n$: apply mask bit $i$"),
  T("$network \\gets \\text{IP} \\;\\&\\; mask$", "$network \\gets \\text{IP} \\;\\&\\; mask$"),
  T("$broadcast \\gets network \\;|\\; \\sim mask$", "$broadcast \\gets network \\;|\\; \\sim mask$"),
  T("return $[network+1,\\; broadcast-1]$", "return $[network+1,\\; broadcast-1]$"),
];

// =====================================================================
// 3) nat — 网络地址转换
// =====================================================================

const NAT_ROWS: [string, string, string, string][] = [
  ["192.168.1.10:3345", "203.0.113.7:5001", "内网主机 A 首次外出，分配公网端口 5001", "first outbound flow of host A, public port 5001"],
  ["192.168.1.11:3345", "203.0.113.7:5002", "不同内网主机相同端口 → 映射到不同公网端口", "same private port on another host → different public port"],
  ["192.168.1.10:3346", "203.0.113.7:5003", "同一主机不同连接 → 不同公网端口", "different connection of one host → different public port"],
];

type NatEntry = { private: string; public: string };
type NatScene = { step: number; entries: NatEntry[] };

function NatRender({ scene, t, step, count, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, entries: [] }) as NatScene;
  const entries = s.entries ?? [];
  const acts = zh
    ? [
      "内网主机 A 发出 (192.168.1.10:3345) → 目的服务器",
      "NAT 改写源：(192.168.1.10:3345) → (203.0.113.7:5001)，写入映射表",
      "内网主机 B 用相同端口 3345 → 分配不同公网端口 5002",
      "主机 A 的新连接 3346 → 5003，端口可区分不同连接",
      "服务器回包发往 (203.0.113.7:5001)",
      "NAT 反查映射表，改写目的回到 (192.168.1.10:3345)",
    ]
    : [
      "host A sends (192.168.1.10:3345) → server",
      "NAT rewrites source: (192.168.1.10:3345) → (203.0.113.7:5001), adds entry",
      "host B reuses port 3345 → mapped to a different public port 5002",
      "host A new connection 3346 → 5003; ports distinguish connections",
      "server replies to (203.0.113.7:5001)",
      "NAT reverse-lookups, rewrites destination back to (192.168.1.10:3345)",
    ];
  const rows: React.ReactNode[][] = entries.map((e, i) => [
    e.private,
    e.public,
    i === entries.length - 1 ? (zh ? "★ 刚写入" : "★ just added") : "",
  ]);
  const canStep = !!onNext && !playing && (typeof count !== "number" || typeof step !== "number" || step < count - 1);
  const actIdx = Math.max(0, Math.min(acts.length - 1, s.step));
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$\\text{(private IP:port)} \\longleftrightarrow \\text{(public IP:new port)}$" />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <div
          onClick={canStep ? (e) => { e.stopPropagation(); onNext(); } : undefined}
          style={{ padding: "8px 14px", borderRadius: 10, background: canStep ? "#4338ca" : "#eef2ff", color: canStep ? "#fff" : "#3730a3", border: "1px solid #c7d2fe", fontWeight: 800, fontSize: 13, textAlign: "center", cursor: canStep ? "pointer" : "default" }}
        >
          {zh ? "内网主机 A" : "Private host A"}
          <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.9, fontFamily: "ui-monospace, monospace" }}>192.168.1.10:3345</div>
        </div>
        <span style={{ color: "#94a3b8", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{"->"}</span>
        <div style={{ padding: "8px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontWeight: 800, fontSize: 13 }}>NAT</div>
        <span style={{ color: "#94a3b8", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{"->"}</span>
        <div style={{ padding: "8px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontWeight: 800, fontSize: 13 }}>{zh ? "公网" : "Internet"}</div>
      </div>
      {canStep && <StepHint text={t(T("点击「内网主机 A」发送并建立 NAT 映射", "click \"host A\" to send and create a NAT mapping"))} />}
      <Table head={zh ? ["内网 (IP:端口)", "公网 (IP:端口)", "状态"] : ["Private (IP:port)", "Public (IP:port)", "State"]} rows={rows} />
      <Status title={zh ? "状态 / 数值" : "State / Values"}>
        <KV k={zh ? "进度" : "Progress"} v={`${typeof step === "number" ? step + 1 : 1} / ${typeof count === "number" ? count : "-"}`} />
        <KV k={zh ? "映射表项数" : "NAT entries"} v={`${entries.length}`} />
        <KV k={zh ? "最近写入" : "Latest"} v={entries.length ? `${entries[entries.length - 1].private} -> ${entries[entries.length - 1].public}` : "-"} />
      </Status>
      {entries.length === 0 && <Note>{zh ? "映射表为空：等待内网主机首次发出分组。" : "Table empty: waiting for the first outbound packet."}</Note>}
      <Note>{acts[actIdx]}</Note>
      <Chips items={zh
        ? [["10.0.0.0/8", "A 类私有网段"], ["172.16.0.0/12", "B 类私有网段"], ["192.168.0.0/16", "C 类私有网段"]]
        : [["10.0.0.0/8", "private class A"], ["172.16.0.0/12", "private class B"], ["192.168.0.0/16", "private class C"]]} />
      <Note>
        {zh
          ? "NAT 让整个私有网络共享一个（或少量）公网 IP：出口时把「内网 IP:端口」改写为「公网 IP:新端口」并记录映射，回包再逆向改写。端口用于区分不同内部连接，因此称 NAPT。NAT 使外部无法主动连接内网主机，与端到端原则相冲突。"
          : "NAT lets an entire private network share one (or few) public IPs: on egress it rewrites (private IP:port) to (public IP:new port) and records the mapping, reversing it on replies. Ports distinguish internal connections, hence NAPT. It breaks the end-to-end principle by hiding hosts from inbound connections."}
      </Note>
    </Panel>
  );
}

function natGenerate(_config: any): Frame<NatScene>[] {
  const all: NatEntry[] = NAT_ROWS.map((r) => ({ private: r[0], public: r[1] }));
  return [
    { line: 0, caption: T("内网主机 A 发出 $(192.168.1.10{:}3345)$", "host A sends $(192.168.1.10{:}3345)$"), scene: { step: 0, entries: [] } },
    { line: 1, caption: T("NAT 分配公网端口，改写源并建表：$(192.168.1.10{:}3345) \\to (203.0.113.7{:}5001)$", "NAT allocates a public port, rewrites source, adds entry: $(192.168.1.10{:}3345) \\to (203.0.113.7{:}5001)$"), scene: { step: 1, entries: [all[0]] } },
    { line: 1, caption: T("同一端口 3345 的另一主机 → 不同公网端口 5002", "the same port 3345 on another host → public port 5002"), scene: { step: 2, entries: [all[0], all[1]] } },
    { line: 1, caption: T("同一主机的新连接 3346 → 5003，端口区分连接", "a new connection 3346 of one host → 5003; ports distinguish connections"), scene: { step: 3, entries: all } },
    { line: 3, caption: T("服务器回包发往 $(203.0.113.7{:}5001)$", "server replies to $(203.0.113.7{:}5001)$"), scene: { step: 4, entries: all } },
    { line: 4, caption: T("NAT 反向查表，改写目的送回 $(192.168.1.10{:}3345)$", "NAT reverse-lookups and rewrites the destination back to $(192.168.1.10{:}3345)$"), scene: { step: 5, entries: all } },
  ];
}

const NAT_CODE = [
  T("内网主机发出 $(IP_{priv}{:}port)$", "host sends $(IP_{priv}{:}port)$"),
  T("$\\text{NAT}$: 分配公网端口，改写源并建表", "$\\text{NAT}$: allocate public port, rewrite source, add entry"),
  T("表项区分不同主机 / 不同连接", "entries distinguish hosts / connections"),
  T("服务器回包发往 $(IP_{pub}{:}newport)$", "server replies to $(IP_{pub}{:}newport)$"),
  T("反向查表，改写目的送回内网", "reverse lookup, rewrite dest, deliver inward"),
];

// =====================================================================
// 4) forwarding — 最长前缀匹配
// =====================================================================

const FWD_TABLE: { net: string; prefix: number; nextHop: string; iface: string }[] = [
  { net: "192.168.1.128", prefix: 25, nextHop: "R2", iface: "eth2" },
  { net: "192.168.1.64", prefix: 26, nextHop: "R3", iface: "eth3" },
  { net: "192.168.1.0", prefix: 24, nextHop: "R1", iface: "eth1" },
  { net: "192.168.0.0", prefix: 16, nextHop: "R0", iface: "eth0" },
  { net: "10.0.0.0", prefix: 8, nextHop: "R4", iface: "eth4" },
  { net: "0.0.0.0", prefix: 0, nextHop: "default gw", iface: "wan" },
];

const FWD_DEFAULT = { dest: "192.168.1.130" };

function ForwardingControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "目的 IP" : "Destination IP"}</span>
        <input className="txt" value={config.dest} onChange={(e) => onChange({ ...config, dest: e.target.value })} placeholder="192.168.1.130" style={{ width: 150, fontFamily: "ui-monospace, monospace" }} />
      </label>
    </div>
  );
}

type FwdScene = { dst: string; checked: number[]; best: number | null; done: boolean; bad?: boolean };

function ForwardingRender({ scene, t, step, count, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as FwdScene;
  const destInt = ipToInt(String(s.dst ?? ""));
  const checked = new Set(s.checked ?? []);
  const matched = FWD_TABLE.map((e) => {
    if (destInt === null) return false;
    const netInt = ipToInt(e.net);
    if (netInt === null) return false;
    const m = maskOf(e.prefix);
    return ((destInt & m) >>> 0) === ((netInt & m) >>> 0);
  });
  const best = s.best;
  const header = zh ? ["前缀", "下一跳", "接口", "状态"] : ["Prefix", "Next hop", "Iface", "State"];
  const canStep = !!onNext && !playing && !s.done && (typeof count !== "number" || typeof step !== "number" || step < count - 1);
  return (
    <Panel>
      {destInt === null && (
        <Note tone="warn">
          {zh ? `无法解析目的 IP「${s.dst}」，请输入形如 192.168.1.130 的点分十进制。` : `Cannot parse destination "${s.dst}"; enter dotted decimal such as 192.168.1.130.`}
        </Note>
      )}
      <div style={{ display: "flex", gap: 10, padding: "0 12px", fontSize: 11, fontWeight: 800, color: "#64748b" }}>
        {header.map((h, i) => <span key={h} style={{ width: i === 0 ? 190 : i === 3 ? undefined : 100, marginLeft: i === 3 ? "auto" : undefined }}>{h}</span>)}
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {FWD_TABLE.map((e, i) => {
          const isBest = i === best;
          const seen = checked.has(i);
          const m = matched[i];
          const bg = isBest ? "#dcfce7" : seen ? (m ? "#eef2ff" : "#f1f5f9") : "#f8fafc";
          const bd = isBest ? "#86efac" : seen ? (m ? "#c7d2fe" : "#e2e8f0") : "#e2e8f0";
          const state = !seen ? "—" : isBest ? (zh ? "★ 最长匹配" : "★ longest") : m ? (zh ? "匹配" : "match") : (zh ? "不匹配" : "no match");
          return (
            <div
              key={i}
              onClick={canStep ? (e) => { e.stopPropagation(); onNext(); } : undefined}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${bd}`, opacity: seen || isBest ? 1 : 0.5, cursor: canStep ? "pointer" : "default" }}
            >
              <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 800, color: "#0f172a", width: 190 }}>{e.net}/{e.prefix}</span>
              <span style={{ fontSize: 12, color: "#64748b", width: 100 }}>{e.nextHop}</span>
              <span style={{ fontSize: 12, color: "#64748b", width: 100 }}>{e.iface}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: isBest ? "#166534" : seen && m ? "#4338ca" : "#94a3b8" }}>
                {state}
              </span>
            </div>
          );
        })}
      </div>
      {canStep && <StepHint text={t(T("点击任一表项逐条匹配，取最长前缀", "click a table row to match entries one by one, longest prefix wins"))} />}
      <Status title={zh ? "状态 / 数值" : "State / Values"}>
        <KV k={zh ? "进度" : "Progress"} v={`${typeof step === "number" ? step + 1 : 1} / ${typeof count === "number" ? count : "-"}`} />
        <KV k={zh ? "目的地址" : "Destination"} v={s.dst ?? "-"} />
        <KV k={zh ? "已检查表项" : "Entries checked"} v={`${checked.size} / ${FWD_TABLE.length}`} />
        <KV k={zh ? "当前最优前缀" : "Best prefix so far"} v={best !== null && best !== undefined ? `${FWD_TABLE[best].net}/${FWD_TABLE[best].prefix} -> ${FWD_TABLE[best].nextHop}` : "-"} />
      </Status>
      {destInt !== null && best !== null && (
        <>
          <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>
            {zh ? `目的地址 ${s.dst} 的匹配前缀位：` : `Matching prefix bits for ${s.dst}:`}
          </div>
          <Bits value={destInt} prefix={FWD_TABLE[best].prefix} />
          {s.done && (
            <Note>
              {zh
                ? `最长前缀匹配：在所有匹配表项中选前缀最长者。${s.dst} 命中 ${matched.filter(Boolean).length} 条，最长的是 ${FWD_TABLE[best].net}/${FWD_TABLE[best].prefix} → ${FWD_TABLE[best].nextHop}（${FWD_TABLE[best].iface}）。默认路由 0.0.0.0/0 总是匹配，仅作兜底。`
                : `Longest prefix matching: among all matching entries pick the longest prefix. ${s.dst} hits ${matched.filter(Boolean).length} entries; the longest is ${FWD_TABLE[best].net}/${FWD_TABLE[best].prefix} → ${FWD_TABLE[best].nextHop} (${FWD_TABLE[best].iface}). The default route 0.0.0.0/0 always matches and is only a fallback.`}
            </Note>
          )}
        </>
      )}
    </Panel>
  );
}

function forwardingGenerate(config: any): Frame<FwdScene>[] {
  const dst = String(config.dest ?? "");
  const destInt = ipToInt(dst);
  const base: FwdScene = { dst, checked: [], best: null, done: false };
  if (destInt === null) {
    return [{ line: 0, caption: T(`! 无法解析目的 IP「${dst}」`, `! Cannot parse destination "${dst}"`), scene: { ...base, done: true, bad: true } }];
  }
  const matchOf = (net: string, prefix: number): boolean => {
    const netInt = ipToInt(net);
    if (netInt === null) return false;
    const m = maskOf(prefix);
    return ((destInt & m) >>> 0) === ((netInt & m) >>> 0);
  };
  const frames: Frame<FwdScene>[] = [
    { line: 0, caption: T(`目的地址 $${dst}$：在转发表中逐条比较，找最长前缀匹配`, `destination $${dst}$: compare each table entry for the longest prefix match`), scene: { ...base } },
  ];
  let best: number | null = null;
  FWD_TABLE.forEach((e, i) => {
    const m = matchOf(e.net, e.prefix);
    let updated = false;
    if (m && (best === null || e.prefix > FWD_TABLE[best].prefix)) {
      best = i;
      updated = true;
    }
    const caption = updated
      ? T(`表项 ${e.net}/${e.prefix}：匹配且前缀更长，暂定为最优`, `entry ${e.net}/${e.prefix}: matches and is longer, becomes best`)
      : m
        ? T(`表项 ${e.net}/${e.prefix}：匹配，但前缀不比当前最优更长`, `entry ${e.net}/${e.prefix}: matches but not longer than best`)
        : T(`表项 ${e.net}/${e.prefix}：不匹配`, `entry ${e.net}/${e.prefix}: no match`);
    frames.push({
      line: 2,
      caption,
      scene: { ...base, checked: FWD_TABLE.slice(0, i + 1).map((_, k) => k), best },
    });
  });
  const winner = best;
  frames.push({
    line: 4,
    caption: winner === null
      ? T("无匹配表项，丢弃分组", "no matching entry, drop the packet")
      : T(`最长前缀匹配 $${FWD_TABLE[winner].net}/${FWD_TABLE[winner].prefix} \\to ${FWD_TABLE[winner].nextHop}$（${FWD_TABLE[winner].iface}）`, `longest prefix $${FWD_TABLE[winner].net}/${FWD_TABLE[winner].prefix} \\to ${FWD_TABLE[winner].nextHop}$ (${FWD_TABLE[winner].iface})`),
    scene: { ...base, checked: FWD_TABLE.map((_, k) => k), best: winner, done: true },
  });
  return frames;
}

const FWD_CODE = [
  T("$best \\gets \\text{null}$", "$best \\gets \\text{null}$"),
  T("for 每条表项 $e$ in 转发表:", "for each entry $e$ in table:"),
  T("  if $(dst \\;\\&\\; e.mask) = e.net$:", "  if $(dst \\;\\&\\; e.mask) = e.net$:"),
  T("    if $best = \\text{null}$ or $e.prefix > best.prefix$: $best \\gets e$", "    if $best = \\text{null}$ or $e.prefix > best.prefix$: $best \\gets e$"),
  T("return $best.nextHop$", "return $best.nextHop$"),
];

// =====================================================================
// 5) ipv6 — IPv6 地址压缩
// =====================================================================

const IPV6_DEFAULT = { addr: "2001:0db8:0000:0000:0000:ff00:0042:8329" };

// 解析为 8 组（支持已含 :: 的输入）
function parseIpv6(s: string): string[] | null {
  const trimmed = String(s ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  const parts = trimmed.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const groups = parts.length === 2
    ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail]
    : head;
  if (groups.length !== 8) return null;
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups;
}

// 去掉每组前导零（至少保留一位）
function stripZeros(groups: string[]): string[] {
  return groups.map((g) => g.replace(/^0+(?=.)/, ""));
}

// 最长连续全零段
function longestZeroRun(groups: string[]): { start: number; len: number } {
  let start = -1;
  let len = 0;
  let i = 0;
  while (i < groups.length) {
    if (groups[i] === "0") {
      let j = i;
      while (j < groups.length && groups[j] === "0") j++;
      if (j - i > len) {
        len = j - i;
        start = i;
      }
      i = j;
    } else {
      i++;
    }
  }
  return { start, len };
}

function compressIpv6(groups: string[]): string {
  const { start, len } = longestZeroRun(groups);
  if (len < 2) return groups.join(":");
  const head = groups.slice(0, start);
  const tail = groups.slice(start + len);
  if (head.length === 0 && tail.length === 0) return "::";
  return `${head.join(":")}::${tail.join(":")}`;
}

function Ipv6Controls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "IPv6 地址" : "IPv6 address"}</span>
        <input className="txt" value={config.addr} onChange={(e) => onChange({ ...config, addr: e.target.value })}
          placeholder="2001:0db8:0000:0000:0000:ff00:0042:8329"
          style={{ width: 360, fontFamily: "ui-monospace, monospace" }} />
      </label>
    </div>
  );
}

type Ipv6Scene = { step: number; groups: string[]; result: string; bad?: boolean };

function Ipv6Render({ scene, t, step, count, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, groups: [], result: "" }) as Ipv6Scene;
  if (s.bad) {
    return (
      <Panel>
        <Note tone="warn">
          {zh
            ? "无法解析 IPv6 地址，请输入 8 组十六进制（如 2001:0db8:0000:0000:0000:ff00:0042:8329）。"
            : "Cannot parse the IPv6 address; enter 8 hex groups (e.g. 2001:0db8:0000:0000:0000:ff00:0042:8329)."}
        </Note>
      </Panel>
    );
  }
  const groups = s.groups;
  const { start, len } = longestZeroRun(groups);
  const collapse = s.step >= 2 && len >= 2;
  const canStep = !!onNext && !playing && s.step < 3 && (typeof count !== "number" || typeof step !== "number" || step < count - 1);
  const cue = s.step === 0
    ? T("点击去掉前导零", "click to strip leading zeros")
    : s.step === 1
      ? T("点击压缩最长全零段", "click to collapse the longest zero run")
      : T("点击输出结果", "click to output the result");
  return (
    <Panel>
      <div style={{ textAlign: "center", fontSize: 12, color: "#64748b" }}>
        {zh ? "完整地址（8 组 × 16 bit = 128 bit）" : "Full address (8 groups × 16 bit = 128 bit)"}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", fontFamily: "ui-monospace, monospace", fontSize: 15 }}>
        {groups.map((g, i) => {
          if (collapse && i === start) {
            return <span key={i} style={{ padding: "6px 14px", borderRadius: 10, background: "#4338ca", color: "#fff", fontWeight: 900 }}>::</span>;
          }
          if (collapse && i > start && i < start + len) return null;
          const isZero = g === "0";
          return (
            <span key={i} style={{ padding: "6px 12px", borderRadius: 10, background: isZero ? "#f1f5f9" : "#eef2ff", border: `1px solid ${isZero ? "#e2e8f0" : "#c7d2fe"}`, fontWeight: 800, color: isZero ? "#94a3b8" : "#3730a3" }}>{g}</span>
          );
        })}
      </div>
      <div
        onClick={canStep ? (e) => { e.stopPropagation(); onNext(); } : undefined}
        style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: "#0f172a", color: "#e2e8f0", fontFamily: "ui-monospace, monospace", fontSize: 16, letterSpacing: 1, cursor: canStep ? "pointer" : "default", border: canStep ? "1px dashed #4338ca" : "1px solid transparent" }}
      >
        {s.result || "-"}
      </div>
      {canStep && <StepHint text={t(cue)} />}
      <Status title={zh ? "状态 / 数值" : "State / Values"}>
        <KV k={zh ? "进度" : "Progress"} v={`${typeof step === "number" ? step + 1 : 1} / ${typeof count === "number" ? count : "-"}`} />
        <KV k={zh ? "分组数" : "Groups"} v={`${groups.length} / 8`} />
        <KV k={zh ? "压缩段" : "Collapsed run"} v={len >= 2 ? `${zh ? "第 " : "groups "}${start + 1}-${start + len} ${zh ? "组" : ""}`.trim() : (zh ? "无" : "none")} />
        <KV k={zh ? "当前结果" : "Result"} v={s.result || "-"} />
      </Status>
      <Note>
        {zh
          ? "压缩规则：① 每组删去前导零（至少保留一位，如 0db8 → db8）；② 把最长的一段（≥2 个）连续全零组用 :: 代替，且一个地址最多出现一次 ::；③ 例：2001:0db8:0000:0000:0000:ff00:0042:8329 → 2001:db8::ff00:42:8329。"
          : "Compression rules: (1) drop leading zeros in each group (keep at least one digit, e.g. 0db8 → db8); (2) replace the longest run (≥2) of all-zero groups with ::, appearing at most once; (3) e.g. 2001:0db8:0000:0000:0000:ff00:0042:8329 → 2001:db8::ff00:42:8329."}
      </Note>
    </Panel>
  );
}

function ipv6Generate(config: any): Frame<Ipv6Scene>[] {
  const raw = String(config?.addr ?? IPV6_DEFAULT.addr);
  const parsed = parseIpv6(raw);
  if (!parsed) {
    return [{ line: 0, caption: T(`! 无法解析 IPv6 地址「${raw}」`, `! Cannot parse IPv6 address "${raw}"`), scene: { step: 0, groups: [], result: "", bad: true } }];
  }
  const stripped = stripZeros(parsed);
  const { start, len } = longestZeroRun(stripped);
  const compressed = compressIpv6(stripped);
  return [
    { line: 0, caption: T(`完整 128 位地址 $${parsed.join(":")}$（8 组）`, `full 128-bit address $${parsed.join(":")}$ (8 groups)`), scene: { step: 0, groups: [...parsed], result: parsed.join(":") } },
    { line: 1, caption: T("每组去掉前导零（至少保留一位）", "strip leading zeros in each group (keep at least one digit)"), scene: { step: 1, groups: stripped, result: stripped.join(":") } },
    { line: 2, caption: len >= 2 ? T(`最长全零段（第 ${start + 1}–${start + len} 组）压缩为 \`::\``, `longest all-zero run (groups ${start + 1}–${start + len}) collapses to \`::\``) : T("无连续全零组，不压缩", "no consecutive all-zero run; nothing to compress"), scene: { step: 2, groups: stripped, result: compressed } },
    { line: 3, caption: T(`返回压缩地址 $${compressed}$`, `return compressed address $${compressed}$`), scene: { step: 3, groups: stripped, result: compressed } },
  ];
}

const IPV6_CODE = [
  T("读入完整 128 位地址（8 组十六进制）", "read the full 128-bit address (8 hex groups)"),
  T("每组去掉前导零", "strip leading zeros in each group"),
  T("最长全零段压缩为 `::`", "collapse the longest all-zero run to `::`"),
  T("return 压缩后的地址", "return the compressed address"),
];

// =====================================================================
const SUBS: Record<SubMode, SubDef> = {
  subnet: { title: T("子网与 CIDR", "Subnet / CIDR"), defaultConfig: SUBNET_DEFAULT, Controls: SubnetControls, Render: SubnetRender, generate: subnetGenerate, code: SUBNET_CODE },
  nat: { title: T("NAT", "NAT"), Render: NatRender, generate: natGenerate, code: NAT_CODE },
  forwarding: { title: T("最长前缀匹配", "Longest Prefix"), defaultConfig: FWD_DEFAULT, Controls: ForwardingControls, Render: ForwardingRender, generate: forwardingGenerate, code: FWD_CODE },
  ipv6: { title: T("IPv6", "IPv6"), defaultConfig: IPV6_DEFAULT, Controls: Ipv6Controls, Render: Ipv6Render, generate: ipv6Generate, code: IPV6_CODE },
};

export const { module: cnNetworkDataModule, GROUPS: cnNetworkDataGroups } = makeChapter<SubMode>({
  id: "cn-network-data",
  title: T("网络层·数据平面", "Network: Data Plane"),
  desc: T(
    "子网掩码与 CIDR 计算、NAT 地址端口转换、转发表与最长前缀匹配、IPv6 地址压缩。",
    "Subnet mask & CIDR calculation, NAT address/port translation, forwarding table with longest prefix matching, and IPv6 address compression.",
  ),
  tags: ["computer-network", "network"],
  groups: [
    { label: "数据平面", opts: [
      { v: "subnet", zh: "子网与 CIDR", en: "Subnet/CIDR" },
      { v: "nat", zh: "NAT", en: "NAT" },
      { v: "forwarding", zh: "最长前缀匹配", en: "Forwarding" },
      { v: "ipv6", zh: "IPv6", en: "IPv6" },
    ] },
  ],
  subs: SUBS,
});
