import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 第 ? 章 无线与移动网络
//   对应 tex/ComputerNetwork/chapters/wireless.tex
//   wireless-link(隐藏终端 逐帧) / wifi(CSMA/CA 逐帧) / mobility(移动性管理 逐帧)
// =====================================================================

type SubMode = "wireless-link" | "wifi" | "mobility";

type Kv = [string, React.ReactNode];

// 用户驱动触发器：点击推进到下一帧（onNext）
function NextButton({ onNext, zh, zhLabel, enLabel, disabled, hint }: { onNext?: () => void; zh: boolean; zhLabel: string; enLabel: string; disabled?: boolean; hint?: string }) {
  const off = !!disabled || typeof onNext !== "function";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
      <button disabled={off} onClick={(e) => { e.stopPropagation(); if (!off) onNext?.(); }} style={{ padding: "7px 18px", borderRadius: 999, border: "1px solid #c7d2fe", background: off ? "#f1f5f9" : "#4338ca", color: off ? "#94a3b8" : "#fff", fontWeight: 800, fontSize: 13, cursor: off ? "default" : "pointer", fontFamily: "inherit" }}>
        {zh ? zhLabel : enLabel}
      </button>
      {!off && hint && <span style={{ fontSize: 12, color: "#4338ca" }}>{hint}</span>}
    </div>
  );
}

// 内联「状态 / 数值」面板：每步从 scene 派生
function ValuePanel({ zh, rows }: { zh: boolean; rows: Kv[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "grid", gap: 6, padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 13 }}>{zh ? "状态 / 数值" : "State / Values"}</div>
      <Table head={zh ? ["项", "值"] : ["Item", "Value"]} rows={rows as React.ReactNode[][]} />
    </div>
  );
}

// ---------------------------------------------------------------------
// 1) 无线链路：隐藏终端（逐帧动画）
//    A 发往 B；C 在 A 覆盖之外也想发；A、C 互不可达 → 在 B 处碰撞
// ---------------------------------------------------------------------
type WirelessLinkScene = { step: number; tx: string[]; collision: boolean };

const WIRELESS_LINK_CODE = [
  T("A 监听信道：有帧要发往 B", "A senses the channel; has a frame for B"),
  T("C 也想发，却听不到 A（隐藏终端）", "C wants to send but cannot hear A (hidden terminal)"),
  T("A、C 都判断空闲 → 同时发送", "A and C both judge idle → transmit at once"),
  T("信号在 B 处碰撞，帧损坏", "signals collide at B; the frame is corrupted"),
  T("退避重传（Wi-Fi 用 ACK / RTS-CTS）", "back off & retry (Wi-Fi uses ACK / RTS-CTS)"),
];

function wirelessLinkGenerate(_config: any): Frame<WirelessLinkScene>[] {
  return [
    { line: 0, caption: T("A 有发往 B 的帧，先执行载波监听（先听后发）", "A has a frame for B and does carrier sense first"), scene: { step: 0, tx: [], collision: false } },
    { line: 1, caption: T("C 也想要发送，但 A 与 C 相距过远、互不可达（隐藏终端）", "C also wants to send, but A and C are too far apart to hear each other (hidden terminal)"), scene: { step: 1, tx: [], collision: false } },
    { line: 2, caption: T("A 监听信道为空闲，开始向 B 发送", "A senses the channel idle and starts sending to B"), scene: { step: 2, tx: ["A"], collision: false } },
    { line: 2, caption: T("C 同样监听为空闲（听不到 A），也开始发送", "C also senses idle (it cannot hear A) and starts sending"), scene: { step: 3, tx: ["A", "C"], collision: false } },
    { line: 3, caption: T("两个信号在 B 处叠加碰撞，帧损坏", "The two signals overlap and collide at B; the frame is corrupted"), scene: { step: 4, tx: ["A", "C"], collision: true } },
    { line: 4, caption: T("收不到 ACK，A、C 退避后重传；RTS/CTS 可避免", "No ACK: A and C back off and retry; RTS/CTS avoids it"), scene: { step: 5, tx: [], collision: false } },
  ];
}

function WirelessLinkRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, tx: [], collision: false }) as Partial<WirelessLinkScene>;
  const tx = Array.isArray(s.tx) ? s.tx : [];
  const aOn = tx.includes("A");
  const cOn = tx.includes("C");
  const collision = !!s.collision;
  const done = (s.step ?? 0) >= 5;
  const rows: Kv[] = [
    [zh ? "步骤" : "Step", `${(s.step ?? 0) + 1} / 6`],
    [zh ? "正在发送" : "Transmitting", tx.length ? tx.join(", ") : "—"],
    [zh ? "是否碰撞" : "Collision", collision ? (zh ? "是" : "yes") : (zh ? "否" : "no")],
  ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={done} hint={zh ? "点击让 A / C 竞争信道，逐步演示隐藏终端" : "click to let A / C contend, showing hidden terminals"}
        zhLabel={done ? "已退避重传" : "发送"} enLabel={done ? "backed off" : "send"} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 560 230" width="100%" style={{ maxWidth: 620, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <circle cx="90" cy="115" r="120" fill="#dbeafe" fillOpacity="0.45" stroke="#93c5fd" strokeDasharray="4 3" />
          <circle cx="280" cy="115" r="150" fill="#dcfce7" fillOpacity="0.35" stroke="#86efac" strokeDasharray="4 3" />
          <circle cx="470" cy="115" r="120" fill="#fee2e2" fillOpacity="0.45" stroke="#fca5a5" strokeDasharray="4 3" />

          <line x1="90" y1="115" x2="470" y2="115" stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 5" opacity="0.5" />
          <text x="280" y="108" textAnchor="middle" fontSize="16" fill="#dc2626" fontWeight="800">✕</text>

          {aOn && <line x1="90" y1="115" x2="280" y2="115" stroke="#2563eb" strokeWidth="3" strokeDasharray="6 4" />}
          {cOn && <line x1="470" y1="115" x2="280" y2="115" stroke="#ea580c" strokeWidth="3" strokeDasharray="6 4" />}

          <text x="90" y="121" textAnchor="middle" fontSize="18" fontWeight="800" fill={aOn ? "#2563eb" : "#1e3a8a"}>A</text>
          <text x="280" y="121" textAnchor="middle" fontSize="18" fontWeight="800" fill={collision ? "#dc2626" : "#166534"}>B</text>
          <text x="470" y="121" textAnchor="middle" fontSize="18" fontWeight="800" fill={cOn ? "#ea580c" : "#991b1b"}>C</text>

          <text x="185" y="100" textAnchor="middle" fontSize="11" fill={aOn ? "#2563eb" : "#94a3b8"}>{aOn ? (zh ? "A 发送 →" : "A tx →") : (zh ? "可达" : "reachable")}</text>
          <text x="375" y="100" textAnchor="middle" fontSize="11" fill={cOn ? "#ea580c" : "#94a3b8"}>{cOn ? (zh ? "← C 发送" : "← C tx") : (zh ? "可达" : "reachable")}</text>

          {collision && (
            <>
              <circle cx="280" cy="115" r="24" fill="none" stroke="#dc2626" strokeWidth="3" />
              <text x="280" y="70" textAnchor="middle" fontSize="14" fontWeight="800" fill="#dc2626">{zh ? "碰撞！" : "Collision!"}</text>
            </>
          )}

          <text x="280" y="205" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#dc2626">
            {zh ? "A 与 C 互不可达：载波监听失效 → 同时发送在 B 处碰撞" : "A and C can't hear each other: carrier sensing fails → collisions at B"}
          </text>
        </svg>
      </div>
      <Note tone={collision ? "warn" : "info"}>
        {zh
          ? "隐藏终端使 CSMA 的「先听后发」失效；Wi-Fi 用 ACK 确认与可选 RTS/CTS 预约来缓解。"
          : "Hidden terminals defeat listen-before-talk; Wi-Fi adds ACK confirmation and optional RTS/CTS reservation."}
      </Note>
      <ValuePanel zh={zh} rows={rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 2) Wi-Fi / CSMA-CA 逐帧流程 + 效率计算器
//    监听空闲 → 等待 DIFS → 随机退避 → (可选 RTS/CTS) → 发送 → 等待 ACK → 成功
// ---------------------------------------------------------------------
type WifiScene = {
  step: number;
  state: "idle" | "difs" | "backoff" | "rts" | "transmit" | "ack" | "done";
  backoff: number;
  rts: boolean;
};

const WIFI_DEFAULT = { tPayload: 800, tOverhead: 220, rts: false };

function WifiControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "载荷 T_payload" : "T_payload"} value={config.tPayload} onChange={(v) => set({ tPayload: v })} min={1} max={100000} step={10} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>µs</span>
      <NumField label={zh ? "开销 T_overhead" : "T_overhead"} value={config.tOverhead} onChange={(v) => set({ tOverhead: v })} min={1} max={100000} step={10} width={100} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>µs</span>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={!!config.rts} onChange={(e) => set({ rts: e.target.checked })} />
        <span>{zh ? "RTS/CTS 预约" : "RTS/CTS"}</span>
      </label>
    </div>
  );
}

function wifiGenerate(config: any): Frame<WifiScene>[] {
  const rts = !!config.rts;
  const backoff = rts ? 5 : 8;
  const base = { backoff, rts };
  const frames: Frame<WifiScene>[] = [
    { line: 0, caption: T("载波监听：信道空闲，继续", "Carrier sense: channel idle, proceed"), scene: { ...base, step: 0, state: "idle" } },
    { line: 1, caption: T("等待 DIFS 帧间间隔", "Wait DIFS inter-frame space"), scene: { ...base, step: 1, state: "difs" } },
    { line: 2, caption: T(`随机退避：取 $K=${backoff}$ 个时隙，倒计时归零`, `Random backoff: pick $K=${backoff}$ slots, count to zero`), scene: { ...base, step: 2, state: "backoff" } },
  ];
  if (rts) {
    frames.push({ line: 3, caption: T("先发 RTS 预约信道，等待 CTS 回应", "Send RTS to reserve the channel, wait for CTS"), scene: { ...base, step: 3, state: "rts" } });
  }
  frames.push({ line: 4, caption: T("倒计时归零 → 发送整帧数据", "Countdown zero → transmit the whole frame"), scene: { ...base, step: 4, state: "transmit" } });
  frames.push({ line: 5, caption: T("等待接收方 ACK 确认", "Wait for the receiver's ACK"), scene: { ...base, step: 5, state: "ack" } });
  frames.push({ line: 5, caption: T("收到 ACK，发送成功；若超时则退避重传", "ACK received, success; on timeout back off & retry"), scene: { ...base, step: 6, state: "done" } });
  return frames;
}

const WIFI_CODE = [
  T("监听信道：空闲才继续", "sense: proceed only if idle"),
  T("等待 DIFS", "wait DIFS"),
  T("随机退避 $K$ 个时隙", "random backoff $K$ slots"),
  T("(可选) RTS/CTS 预约信道", "(optional) RTS/CTS reserve"),
  T("发送整帧数据", "transmit the whole frame"),
  T("等待 ACK；超时 → 退避重传", "wait ACK; timeout → backoff & retry"),
];

function WifiRender({ scene, config, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<WifiScene>;
  const state = s.state ?? "idle";
  const backoff = s.backoff ?? 0;
  const rts = !!s.rts;
  const order: WifiScene["state"][] = rts
    ? ["idle", "difs", "backoff", "rts", "transmit", "ack"]
    : ["idle", "difs", "backoff", "transmit", "ack"];
  const cur = state === "done" ? order.length : order.indexOf(state);
  const labels: Record<string, string> = {
    idle: zh ? "监听空闲" : "Sense",
    difs: "DIFS",
    backoff: zh ? `退避 K=${backoff}` : `Backoff K=${backoff}`,
    rts: "RTS / CTS",
    transmit: zh ? "发送数据" : "DATA",
    ack: zh ? "等待 ACK" : "ACK",
  };
  const tp = Number(config?.tPayload);
  const to = Number(config?.tOverhead);
  const showEff = Number.isFinite(tp) && Number.isFinite(to) && tp > 0 && to > 0;
  const eff = showEff ? tp / (tp + to) : 0;
  const rows: React.ReactNode[][] = [
    [zh ? "载荷" : "Payload", `${tp} µs`, "T_payload"],
    [zh ? "开销" : "Overhead", `${to} µs`, "DIFS + backoff + header + ACK"],
    [zh ? "总额" : "Total", `${tp + to} µs`, "T_payload + T_overhead"],
    [zh ? "效率" : "Efficiency", `${(eff * 100).toFixed(1)}%`, "T_payload / (T_payload + T_overhead)"],
  ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={state === "done"} hint={zh ? "点击推进 CSMA/CA：监听、DIFS、退避、发送、ACK" : "click to advance CSMA/CA: sense, DIFS, backoff, DATA, ACK"}
        zhLabel={state === "done" ? "发送成功" : "监听 / 发送"} enLabel={state === "done" ? "sent" : "sense / send"} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
        {order.map((k, i) => {
          const done = i < cur;
          const active = i === cur;
          const bg = active ? "#eef2ff" : done ? "#ecfdf5" : "#f8fafc";
          const bd = active ? "#6366f1" : done ? "#86efac" : "#e2e8f0";
          const fg = active ? "#4338ca" : done ? "#166534" : "#94a3b8";
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ color: done || active ? "#6366f1" : "#cbd5e1", fontWeight: 800 }}>→</span>}
              <div style={{ padding: "8px 12px", borderRadius: 10, background: bg, border: `2px solid ${bd}`, color: fg, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
                {labels[k]}
              </div>
            </div>
          );
        })}
        {state === "done" && <span style={{ marginLeft: 6, fontSize: 18 }}>✅</span>}
      </div>
      <ValuePanel zh={zh} rows={[
        [zh ? "当前状态" : "Current state", labels[state] ?? state],
        [zh ? "退避时隙 K" : "Backoff slots K", backoff],
        [zh ? "RTS/CTS" : "RTS/CTS", rts ? (zh ? "开启" : "on") : (zh ? "关闭" : "off")],
      ]} />
      {rts && (
        <Note>
          {zh
            ? "RTS/CTS：先发短控制帧预约信道，解决隐藏终端问题；小帧开销更大。"
            : "RTS/CTS: short control frames reserve the channel, fixing hidden terminals; costs more for small frames."}
        </Note>
      )}
      {showEff && (
        <>
          <div style={{ textAlign: "center", fontSize: 14 }}>
            <MathText text={zh
              ? "效率 $\\eta = \\dfrac{T_{payload}}{T_{payload}+T_{overhead}}$"
              : "efficiency $\\eta = \\dfrac{T_{payload}}{T_{payload}+T_{overhead}}$"} />
          </div>
          <Table head={zh ? ["项", "值", "说明"] : ["Item", "Value", "Note"]} rows={rows} />
        </>
      )}
      <Note tone={showEff && eff < 0.5 ? "warn" : "info"}>
        {zh
          ? `CSMA/CA 用确认代替碰撞检测：无法边发边听，故用 DIFS + 随机退避 + ACK 保证可靠。${showEff ? `当前效率 ${(eff * 100).toFixed(1)}%。` : ""}`
          : `CSMA/CA confirms instead of detecting collisions: it cannot listen while transmitting, so DIFS + random backoff + ACK ensure reliability.${showEff ? ` Current efficiency ${(eff * 100).toFixed(1)}%.` : ""}`}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 3) 移动性管理 逐帧：归属 → 拜访 → 注册 → 隧道转发 → 切换
// ---------------------------------------------------------------------
type MobilityScene = { step: number; location: "home" | "foreign" | "tunnel" | "handover" };

function mobilityGenerate(_config: any): Frame<MobilityScene>[] {
  return [
    { line: 0, caption: T("移动节点 MN 位于归属网络并使用永久地址；HA 记录其当前位置", "MN is in its home network on its permanent address; HA records its location"), scene: { step: 0, location: "home" } },
    { line: 1, caption: T("MN 移动到拜访网络，通过外地代理 FA 获得转交地址 CoA", "MN moves into a visited network and gets a care-of address (CoA) from the foreign agent"), scene: { step: 1, location: "foreign" } },
    { line: 2, caption: T("MN 向归属代理 HA 注册 CoA", "MN registers its CoA with the home agent"), scene: { step: 2, location: "foreign" } },
    { line: 3, caption: T("对端发往永久地址；HA 封装分组经隧道 (IP-in-IP) 送到 FA，再转交 MN", "A peer sends to the permanent address; HA encapsulates and tunnels (IP-in-IP) to the FA, which delivers to MN"), scene: { step: 3, location: "tunnel" } },
    { line: 4, caption: T("切换 handover：MN 进入新网络，重新注册，HA 把隧道重定向到新 FA", "Handover: MN enters a new network, re-registers, and HA re-points the tunnel to the new FA"), scene: { step: 4, location: "handover" } },
  ];
}

const MOBILITY_CODE = [
  T("MN 在归属网：永久地址，HA 记录位置", "MN at home: permanent address, HA tracks location"),
  T("MN 进入拜访网：FA 分配转交地址 CoA", "MN enters visited net: FA assigns care-of address"),
  T("向 HA 注册 CoA", "register CoA with HA"),
  T("HA 隧道 (IP-in-IP) 转发到 FA", "HA tunnels (IP-in-IP) to FA"),
  T("切换：更新注册，重定向隧道", "handover: update registration, re-point tunnel"),
];

function MobilityRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, location: "home" }) as Partial<MobilityScene>;
  const loc = s.location ?? "home";
  const step = s.step ?? 0;
  const tunnelOn = loc === "tunnel" || loc === "handover";
  const locLabel = loc === "home"
    ? (zh ? "归属网络" : "Home network")
    : loc === "handover"
      ? (zh ? "拜访网络 B" : "Visited B")
      : (zh ? "拜访网络 A" : "Visited A");
  const rows: Kv[] = [
    [zh ? "步骤" : "Step", `${step + 1} / 5`],
    [zh ? "当前网络" : "Location", locLabel],
    [zh ? "注册状态" : "Registration", step >= 2 ? (zh ? "已向 HA 注册 CoA" : "CoA registered with HA") : (zh ? "未注册" : "not registered")],
    [zh ? "隧道" : "Tunnel", tunnelOn ? (zh ? "已建立" : "established") : (zh ? "无" : "none")],
  ];
  const mn = loc === "home" ? { x: 150, y: 170 } : loc === "handover" ? { x: 405, y: 170 } : { x: 352, y: 170 };
  const status: string[] = zh
    ? [
      "MN 在归属网，HA 记录永久地址",
      "MN 进入拜访网 A，FA 分配转交地址 CoA",
      "MN 向 HA 注册 CoA，HA 建立映射",
      "HA 隧道封装转发到 FA，FA 解封转交 MN",
      "切换：MN 移动到拜访网 B，HA 重定向隧道到新 FA",
    ]
    : [
      "MN at home, HA tracks the permanent address",
      "MN enters visited A, FA assigns a care-of address",
      "MN registers CoA with HA; HA maps it",
      "HA tunnels to the FA, which decapsulates to MN",
      "Handover: MN moves to visited B; HA re-points the tunnel",
    ];
  const conceptRows: React.ReactNode[][] = zh
    ? [
      ["无线 Wireless", "链路介质：用无线电而非线缆传输"],
      ["移动 Mobile", "网络位置：节点改变接入点/子网"],
      ["两者独立", "移动节点可改用有线；固定主机也可用 Wi-Fi"],
    ]
    : [
      ["Wireless", "link medium: radio instead of cable"],
      ["Mobile", "network location: node changes AP/subnet"],
      ["Independent", "a mobile node can be wired; a fixed host can use Wi-Fi"],
    ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={step >= 4} hint={zh ? "点击推进移动性管理：移动、注册、隧道转发、切换" : "click to advance mobility: move, register, tunnel, handover"}
        zhLabel={step >= 4 ? "切换完成" : "下一步"} enLabel={step >= 4 ? "handover done" : "next step"} />
      <Chips items={zh
        ? [
          ["归属代理 HA", "移动节点归属网上的锚点"],
          ["外地代理 FA", "当前拜访网中的中转"],
          ["隧道转发", "HA 封装 → 经 IP-in-IP 送至 FA/节点"],
          ["切换 handover", "更换基站/子网时保持连接"],
        ]
        : [
          ["Home Agent (HA)", "anchor on the home network"],
          ["Foreign Agent (FA)", "relay in the visited network"],
          ["Tunneling", "HA encapsulates → IP-in-IP to FA/node"],
          ["Handover", "keep connection when changing BS/subnet"],
        ]} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 640 240" width="100%" style={{ maxWidth: 700, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <rect x="20" y="30" width="170" height="180" rx="12" fill="#eef2ff" stroke="#c7d2fe" />
          <text x="105" y="52" textAnchor="middle" fontSize="13" fontWeight="800" fill="#4338ca">{zh ? "归属网络" : "Home network"}</text>
          <rect x="230" y="30" width="170" height="180" rx="12" fill="#dcfce7" stroke="#86efac" />
          <text x="315" y="52" textAnchor="middle" fontSize="13" fontWeight="800" fill="#166534">{zh ? "拜访网络 A" : "Visited A"}</text>
          <rect x="440" y="30" width="180" height="180" rx="12" fill="#fef9c3" stroke="#fde68a" />
          <text x="530" y="52" textAnchor="middle" fontSize="13" fontWeight="800" fill="#92400e">{zh ? "拜访网络 B" : "Visited B"}</text>

          <circle cx="70" cy="110" r="22" fill="#dbeafe" stroke="#60a5fa" />
          <text x="70" y="115" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1e3a8a">HA</text>
          <circle cx="290" cy="110" r="22" fill="#bbf7d0" stroke="#34d399" />
          <text x="290" y="115" textAnchor="middle" fontSize="12" fontWeight="800" fill="#166534">FA</text>
          <circle cx="500" cy="110" r="22" fill="#fde68a" stroke="#f59e0b" />
          <text x="500" y="115" textAnchor="middle" fontSize="12" fontWeight="800" fill="#92400e">FA</text>

          <line x1="92" y1="110" x2="268" y2="110" stroke={tunnelOn ? "#4338ca" : "#cbd5e1"} strokeWidth={tunnelOn ? 3 : 1.5} strokeDasharray={tunnelOn ? undefined : "4 4"} />
          <rect x="150" y="97" width="60" height="26" rx="6" fill={tunnelOn ? "#4338ca" : "#e2e8f0"} />
          <text x="180" y="115" textAnchor="middle" fontSize="11" fontWeight="800" fill={tunnelOn ? "#fff" : "#94a3b8"}>{zh ? "隧道" : "tunnel"}</text>

          {loc === "home" && <line x1="92" y1="110" x2={mn.x} y2={mn.y} stroke="#60a5fa" strokeWidth="2" />}
          {(loc === "foreign" || loc === "tunnel") && <line x1="312" y1="110" x2={mn.x} y2={mn.y} stroke="#34d399" strokeWidth="2" />}
          {loc === "handover" && (
            <>
              <line x1="290" y1="132" x2={mn.x} y2={mn.y} stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
              <line x1="500" y1="132" x2={mn.x} y2={mn.y} stroke="#f59e0b" strokeWidth="2.5" />
              <text x="405" y="205" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#92400e">{zh ? "切换 handover" : "handover"}</text>
            </>
          )}

          <circle cx={mn.x} cy={mn.y} r="18" fill="#fef3c7" stroke="#f59e0b" strokeWidth="2.5" />
          <text x={mn.x} y={mn.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#92400e">MN</text>

          {loc === "home" && <text x={mn.x} y={mn.y + 34} textAnchor="middle" fontSize="10.5" fill="#64748b">{zh ? "永久地址" : "permanent addr"}</text>}
          {(loc === "foreign" || loc === "tunnel") && <text x={mn.x} y={mn.y + 34} textAnchor="middle" fontSize="10.5" fill="#64748b">{zh ? "CoA" : "CoA"}</text>}
        </svg>
      </div>
      <Note>{status[step] ?? status[0]}</Note>
      <ValuePanel zh={zh} rows={rows} />
      <Table head={zh ? ["概念", "含义"] : ["Concept", "Meaning"]} rows={conceptRows} />
      <Note tone="warn">
        {zh
          ? "关键区分：无线 ≠ 移动。无线强调链路介质（无线电），移动强调节点改变了接入点；切换时通过归属/外地代理与隧道维持可达性。"
          : "Key distinction: wireless ≠ mobile. Wireless is about the link medium (radio); mobile is about changing access points. Home/foreign agents plus tunneling preserve reachability during handover."}
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
const SUBS: Record<SubMode, SubDef> = {
  "wireless-link": { title: T("无线链路", "Wireless Link"), Render: WirelessLinkRender, generate: wirelessLinkGenerate, code: WIRELESS_LINK_CODE },
  wifi: { title: T("Wi-Fi / CSMA-CA", "Wi-Fi"), defaultConfig: WIFI_DEFAULT, Controls: WifiControls, Render: WifiRender, generate: wifiGenerate, code: WIFI_CODE },
  mobility: { title: T("移动性管理", "Mobility"), Render: MobilityRender, generate: mobilityGenerate, code: MOBILITY_CODE },
};

export const { module: cnWirelessModule, GROUPS: cnWirelessGroups } = makeChapter<SubMode>({
  id: "cn-wireless",
  title: T("无线与移动网络", "Wireless & Mobile"),
  desc: T(
    "无线链路特征（路径损耗/多径/干扰/隐藏终端）、Wi-Fi 的 CSMA/CA 与效率、移动性管理（归属/外地代理、隧道、切换）及「无线 ≠ 移动」。",
    "Wireless link characteristics, Wi-Fi CSMA/CA and efficiency, mobility management (home/foreign agents, tunneling, handover), and wireless ≠ mobile.",
  ),
  tags: ["computer-network", "wireless"],
  groups: [
    {
      label: "无线", opts: [
        { v: "wireless-link", zh: "无线链路", en: "Wireless Link" },
        { v: "wifi", zh: "Wi-Fi / CSMA-CA", en: "Wi-Fi" },
        { v: "mobility", zh: "移动性管理", en: "Mobility" },
      ],
    },
  ],
  subs: SUBS,
});
