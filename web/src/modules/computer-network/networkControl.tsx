import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 网络层：控制平面
//   对应 tex/ComputerNetwork/chapters/network_control_plane.tex
//   ls(Dijkstra) / dv(距离向量) / icmp(traceroute)
// =====================================================================

type SubMode = "ls" | "dv" | "icmp";

// ---------------------------------------------------------------------
// 链路状态：Dijkstra
// ---------------------------------------------------------------------

const LS_LABELS = ["u", "v", "w", "x", "y", "z"];
const LS_POS: Record<string, [number, number]> = {
  u: [70, 50], v: [240, 50], w: [155, 145], x: [55, 195], y: [335, 195], z: [435, 195],
};
const LS_EDGES: [string, string, number][] = [
  ["u", "v", 2], ["u", "w", 5], ["u", "x", 1],
  ["v", "w", 3], ["v", "x", 2],
  ["w", "x", 3], ["w", "y", 1], ["w", "z", 5],
  ["x", "y", 1], ["y", "z", 2],
];

const LS_DEFAULT = { source: "u" };

function LsControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
        <span>{zh ? "源节点" : "Source"}</span>
        <select className="txt" value={config.source} style={{ fontWeight: 700 }}
          onChange={(e) => onChange({ ...config, source: e.target.value })}>
          {LS_LABELS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

type LsStep = { selected: string | null; N: string[]; dist: Record<string, number>; prev: Record<string, string | null> };

function lsDijkstra(src: string): LsStep[] {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const adj: Record<string, [string, number][]> = {};
  LS_LABELS.forEach((n) => { dist[n] = Infinity; prev[n] = null; adj[n] = []; });
  LS_EDGES.forEach(([a, b, w]) => { adj[a].push([b, w]); adj[b].push([a, w]); });
  dist[src] = 0;
  const visited = new Set<string>();
  const steps: LsStep[] = [{ selected: null, N: [src], dist: { ...dist }, prev: { ...prev } }];
  while (visited.size < LS_LABELS.length) {
    let w: string | null = null;
    for (const n of LS_LABELS) if (!visited.has(n) && (w === null || dist[n] < dist[w])) w = n;
    if (w === null || dist[w] === Infinity) break;
    visited.add(w);
    for (const [v, c] of adj[w]) {
      if (!visited.has(v) && dist[w] + c < dist[v]) { dist[v] = dist[w] + c; prev[v] = w; }
    }
    steps.push({ selected: w, N: [...visited], dist: { ...dist }, prev: { ...prev } });
  }
  return steps;
}

type LsScene = { step: number; selected: string | null; N: string[]; dist: Record<string, number>; prev: Record<string, string | null> };

const LS_CODE = [
  T("$N' \\gets \\{u\\}$；$D(u)=0$，其余 $D(v)=\\infty$", "$N' \\gets \\{u\\}$; $D(u)=0$, others $D(v)=\\infty$"),
  T("循环：", "loop:"),
  T("  取 $w \\notin N'$ 使 $D(w)$ 最小", "  pick $w \\notin N'$ with min $D(w)$"),
  T("  将 $w$ 加入 $N'$", "  add $w$ to $N'$"),
  T("  对 $w$ 的每个邻居 $v$：", "  for each neighbor $v$ of $w$:"),
  T("    $D(v) \\gets \\min(D(v), D(w)+c(w,v))$", "    $D(v) \\gets \\min(D(v), D(w)+c(w,v))$"),
  T("直到 $N'$ 含所有节点", "until $N'$ contains all nodes"),
];

function lsGenerate(config: any): Frame<LsScene>[] {
  const src = LS_LABELS.includes(config?.source) ? (config.source as string) : "u";
  const steps = lsDijkstra(src);
  return steps.map((st, i) => {
    const scene: LsScene = { step: i, selected: st.selected, N: st.N, dist: st.dist, prev: st.prev };
    if (i === 0) {
      return { line: 0, caption: T(`初始化：源 $${src}$ 的 $D=0$，其余为 $\\infty$`, `Init: source $${src}$ has $D=0$, others $\\infty$`), scene };
    }
    const w = st.selected as string;
    const relaxed = LS_LABELS.filter((n) => st.prev[n] === w);
    const cap = relaxed.length
      ? T(`选定 $w=${w}$ 加入 $N'$，松弛邻居 ${relaxed.map((n) => `$${n}$`).join("、")} 的 $D$ 被更新`, `settle $w=${w}$, relax neighbors ${relaxed.join(", ")}`)
      : T(`选定 $w=${w}$ 加入 $N'$，其邻居无更短路径`, `settle $w=${w}$; no shorter path for neighbors`);
    return { line: 2, caption: cap, scene };
  });
}

function LsRender({ scene, config, t, step: stepProp, onNext, playing }: any) {
  const zh = isZh(t);
  const src = LS_LABELS.includes(config?.source) ? (config.source as string) : "u";
  const steps = lsDijkstra(src);
  const s = (scene ?? {}) as Partial<LsScene>;
  const step = typeof s.step === "number" ? Math.max(0, Math.min(steps.length - 1, s.step)) : (typeof stepProp === "number" ? stepProp : steps.length - 1);
  const upto = steps.slice(0, step + 1);
  const cur = steps[step];
  const dist = (s.dist ?? cur.dist) as Record<string, number>;
  const prev = (s.prev ?? cur.prev) as Record<string, string | null>;
  const N = (s.N ?? cur.N) as string[];
  const selected = (s.selected ?? cur.selected) as string | null;
  const nextSel = steps[step + 1] ? (steps[step + 1].selected as string) : null;
  const atEnd = nextSel === null;
  const advance = () => { if (!atEnd && !playing) onNext?.(); };
  const onNodeClick = (e: React.MouseEvent) => { e.stopPropagation(); advance(); };
  const INF = Infinity;

  const cell = (d: number, p: string | null) => (d === INF ? "∞ / −" : `${d} / ${p ?? "−"}`);
  const activeRow = upto.length - 1;
  const rows: React.ReactNode[][] = upto.map((st, i) => {
    const on = i === activeRow;
    const hl = (node: React.ReactNode) => (on ? <b style={{ color: "#4338ca" }}>{node}</b> : node);
    return [
      hl(i === 0 ? (zh ? "初始化" : "init") : `#${i}`),
      hl(`{ ${st.N.join(", ")} }`),
      ...LS_LABELS.map((n) => hl(cell(st.dist[n], st.prev[n]))),
    ];
  });
  const head = [zh ? "步骤" : "step", "N'", ...LS_LABELS];

  const paths: React.ReactNode[][] = LS_LABELS.map((dst) => {
    if (dist[dst] === INF) return [dst, "∞", "−"];
    const chain: string[] = [];
    let c: string | null = dst;
    while (c) { chain.unshift(c); if (c === src) break; c = prev[c]; }
    return [dst, chain.join(" -> "), `${dist[dst]}`];
  });

  const inTree = (a: string, b: string) => prev[b] === a || prev[a] === b;

  return (
    <Panel>
      <svg viewBox="0 0 490 240" style={{ width: "100%", maxWidth: 560, height: "auto", margin: "0 auto", display: "block" }}>
        {LS_EDGES.map(([a, b, w]) => {
          const [x1, y1] = LS_POS[a];
          const [x2, y2] = LS_POS[b];
          const tree = inTree(a, b);
          return (
            <g key={`${a}-${b}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tree ? "#ef4444" : "#cbd5e1"} strokeWidth={tree ? 3 : 1.5} />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" fontSize={11} fill={tree ? "#b91c1c" : "#64748b"} fontWeight={tree ? 800 : 400} fontFamily="ui-monospace, monospace">{w}</text>
            </g>
          );
        })}
        {LS_LABELS.map((n) => {
          const [cx, cy] = LS_POS[n];
          const isSrc = n === src;
          const isSel = n === selected;
          const isNext = n === nextSel;
          const vis = N.includes(n);
          const fill = isSel ? "#fde68a" : isSrc ? "#bbf7d0" : vis ? "#dbeafe" : "#fff";
          const stroke = isSel ? "#d97706" : isSrc ? "#16a34a" : vis ? "#3b82f6" : "#94a3b8";
          return (
            <g key={n} onClick={isNext ? onNodeClick : undefined} style={isNext ? { cursor: "pointer" } : undefined}>
              {isSel && <circle cx={cx} cy={cy} r={21} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" />}
              {isNext && <circle cx={cx} cy={cy} r={23} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeDasharray="3 3" />}
              <circle cx={cx} cy={cy} r={16} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize={13} fontWeight={800} fill="#0f172a" fontFamily="ui-monospace, monospace">{n}</text>
              <text x={cx} y={cy + 30} textAnchor="middle" fontSize={10} fill={vis ? "#1d4ed8" : "#94a3b8"} fontFamily="ui-monospace, monospace">{dist[n] === INF ? "∞" : dist[n]}</text>
              {isNext && <text x={cx} y={cy - 26} textAnchor="middle" fontSize={10} fill="#16a34a" fontWeight={800} fontFamily="ui-monospace, monospace">{zh ? "点此加入 N'" : "click to add"}</text>}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {zh
            ? `当前：${step === 0 ? "初始化" : `已加入 ${selected}`}；N' = { ${N.join(", ")} }，每格 D(v) / 前驱`
            : `now: ${step === 0 ? "init" : `settled ${selected}`}; N' = { ${N.join(", ")} }, each cell D(v) / predecessor`}
        </span>
        <button
          onClick={advance}
          disabled={atEnd || playing}
          style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 999, border: "1px solid #c7d2fe", background: atEnd ? "#e2e8f0" : "#4338ca", color: atEnd ? "#64748b" : "#fff", fontSize: 12, fontWeight: 700, cursor: atEnd ? "default" : "pointer" }}>
          {zh
            ? (atEnd ? "已完成" : `加入 N'（点击节点 ${nextSel}）`)
            : (atEnd ? "done" : `add to N' (click node ${nextSel})`)}
        </button>
      </div>

      <Table head={head} rows={rows} />

      <div style={{ fontSize: 12, color: "#475569" }}>
        {zh ? `当前第 ${step} 步（共 ${steps.length - 1} 次加入）：每格为 D(v) / 前驱；红色边为已确定的最短路树。` : `Step ${step} of ${steps.length - 1}: each cell is D(v) / predecessor; red edges form the settled shortest-path tree.`}
      </div>

      <Table head={zh ? ["目的", `从 ${src} 的最短路`, "代价"] : ["Dest", `Shortest path from ${src}`, "Cost"]} rows={paths} />

      <Note>
        <MathText text={zh
          ? `$D(v) \\gets \\min(D(v), D(w)+c(w,v))$，每次从未确定集合中选 $D$ 最小者加入 $N'$，复杂度 $O(|V|^2)$。`
          : `$D(v) \\gets \\min(D(v), D(w)+c(w,v))$; repeatedly settle the unvisited node with min $D$. Complexity $O(|V|^2)$.`} />
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// 距离向量：计数到无穷
// ---------------------------------------------------------------------

const DV_DEFAULT = { rounds: 6 };

function DvControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "轮数" : "Rounds"} value={config.rounds} onChange={(v) => onChange({ ...config, rounds: v })} min={1} max={10} width={70} />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "链路 x–y 断开后" : "after link x–y fails"}</span>
    </div>
  );
}

function dvSim(rounds: number, poison: boolean): { dy: number; dz: number }[] {
  const INF = Infinity;
  let dy = 1, dz = 2, ny = "x", nz = "y";
  const out = [{ dy, dz }];
  for (let r = 0; r < rounds; r++) {
    const advYtoZ = poison && ny === "z" ? INF : dy;
    const advZtoY = poison && nz === "y" ? INF : dz;
    const yFromZ = 1 + advZtoY;
    const newDy = Math.min(INF, yFromZ);
    const newNy = INF <= yFromZ ? "x" : "z";
    const zFromY = 1 + advYtoZ;
    const newDz = Math.min(zFromY, INF);
    const newNz = zFromY <= INF ? "y" : "x";
    dy = newDy; dz = newDz; ny = newNy; nz = newNz;
    out.push({ dy, dz });
  }
  return out;
}

type DvRow = { round: number; dy: number; dz: number; pdy: number; pdz: number };
type DvScene = { round: number; table: DvRow[] };

const DV_CODE = [
  T("$D_x \\gets [0, \\infty, \\infty]$", "$D_x \\gets [0, \\infty, \\infty]$"),
  T("每个节点把 $D_x$ 发送给邻居", "each node sends $D_x$ to neighbors"),
  T("收到邻居的 $D_v$ 后：", "on receiving neighbor's $D_v$:"),
  T("  $D_x(y) \\gets \\min_v\\{ c(x,v)+D_v(y) \\}$", "  $D_x(y) \\gets \\min_v\\{ c(x,v)+D_v(y) \\}$"),
  T("若 $D_x$ 改变则重新通告", "if $D_x$ changed, advertise again"),
];

function dvGenerate(config: any): Frame<DvScene>[] {
  const rounds = Math.max(1, Math.min(10, config?.rounds ?? 6));
  const normal = dvSim(rounds, false);
  const poison = dvSim(rounds, true);
  const table: DvRow[] = normal.map((n, i) => ({ round: i, dy: n.dy, dz: n.dz, pdy: poison[i].dy, pdz: poison[i].dz }));
  const m = (v: number) => (v === Infinity ? "\\infty" : `${v}`);
  const frames: Frame<DvScene>[] = table.map((r, i) => {
    const scene: DvScene = { round: i, table };
    if (i === 0) {
      return { line: 0, caption: T(`初始（$x$–$y$ 链路断开）：$D_y(x)=${m(r.dy)},\\; D_z(x)=${m(r.dz)}$`, `init (link $x$–$y$ down): $D_y(x)=${m(r.dy)},\\; D_z(x)=${m(r.dz)}$`), scene };
    }
    return { line: 3, caption: T(`第 $${i}$ 轮：$D_y(x)=${m(r.dy)},\\; D_z(x)=${m(r.dz)}$；毒性逆转通告的 $D_y(x)=${m(r.pdy)}$`, `round ${i}: $D_y(x)=${m(r.dy)},\\; D_z(x)=${m(r.dz)}$; poisoned $D_y(x)=${m(r.pdy)}$`), scene };
  });
  return frames;
}

function DvRender({ scene, config, t, onNext, playing }: any) {
  const zh = isZh(t);
  const rounds = Math.max(1, Math.min(10, config?.rounds ?? 6));
  const normal = dvSim(rounds, false);
  const poison = dvSim(rounds, true);
  const fmt = (v: number) => (v === Infinity ? "∞" : `${v}`);
  const s = (scene ?? {}) as Partial<DvScene>;
  const built: DvRow[] = normal.map((n, i) => ({ round: i, dy: n.dy, dz: n.dz, pdy: poison[i].dy, pdz: poison[i].dz }));
  const table = s.table && Array.isArray(s.table) && s.table.length ? s.table : built;
  const round = typeof s.round === "number" ? Math.max(0, Math.min(table.length - 1, s.round)) : table.length - 1;
  const shown = table.slice(0, round + 1);
  const active = shown.length - 1;
  const row = table[Math.max(0, Math.min(table.length - 1, round))];
  const atEnd = round >= table.length - 1;
  const advance = () => { if (!atEnd && !playing) onNext?.(); };
  const onNodeClick = (e: React.MouseEvent) => { e.stopPropagation(); advance(); };

  const rows: React.ReactNode[][] = shown.map((n, i) => {
    const on = i === active;
    const hl = (node: React.ReactNode) => (on ? <b style={{ color: "#4338ca" }}>{node}</b> : node);
    return [hl(i === 0 ? (zh ? "初始" : "init") : `t${i}`), hl(fmt(n.dy)), hl(fmt(n.dz)), hl(fmt(n.pdy)), hl(fmt(n.pdz))];
  });

  return (
    <Panel>
      <svg viewBox="0 0 400 110" style={{ width: "100%", maxWidth: 420, height: "auto", margin: "0 auto", display: "block" }}>
        <line x1={70} y1={55} x2={200} y2={55} stroke="#ef4444" strokeWidth={2} strokeDasharray="6 5" />
        <line x1={200} y1={55} x2={330} y2={55} stroke="#cbd5e1" strokeWidth={2} />
        <text x={130} y={45} textAnchor="middle" fontSize={11} fill="#b91c1c" fontFamily="ui-monospace, monospace">∞ (x–y)</text>
        <text x={265} y={45} textAnchor="middle" fontSize={11} fill="#64748b" fontFamily="ui-monospace, monospace">1</text>
        {[["x", 70], ["y", 200], ["z", 330]].map(([n, cx]) => (
          <g key={n as string} onClick={atEnd ? undefined : onNodeClick} style={atEnd ? undefined : { cursor: "pointer" }}>
            {!atEnd && n === "y" && <circle cx={cx as number} cy={55} r={22} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeDasharray="3 3" />}
            <circle cx={cx as number} cy={55} r={16} fill="#dbeafe" stroke="#3b82f6" strokeWidth={2} />
            <text x={cx as number} y={59} textAnchor="middle" fontSize={13} fontWeight={800} fill="#0f172a" fontFamily="ui-monospace, monospace">{n}</text>
          </g>
        ))}
        <text x={200} y={100} textAnchor="middle" fontSize={11} fill="#4338ca" fontWeight={800} fontFamily="ui-monospace, monospace">{zh ? `当前第 ${round} 轮` : `round ${round}`}</text>
      </svg>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: 12, color: "#475569", fontFamily: "ui-monospace, monospace" }}>
          {zh
            ? `第 ${round} 轮：D_y(x)=${fmt(row.dy)}，D_z(x)=${fmt(row.dz)}；毒性逆转通告 ${fmt(row.pdy)} / ${fmt(row.pdz)}`
            : `round ${round}: D_y(x)=${fmt(row.dy)}, D_z(x)=${fmt(row.dz)}; poisoned ${fmt(row.pdy)} / ${fmt(row.pdz)}`}
        </span>
        <button
          onClick={advance}
          disabled={atEnd || playing}
          style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 999, border: "1px solid #c7d2fe", background: atEnd ? "#e2e8f0" : "#4338ca", color: atEnd ? "#64748b" : "#fff", fontSize: 12, fontWeight: 700, cursor: atEnd ? "default" : "pointer" }}>
          {zh ? (atEnd ? "已收敛" : "交换一次") : (atEnd ? "converged" : "exchange once")}
        </button>
      </div>

      <Table
        head={[zh ? "轮次" : "round", zh ? "普通 D_y(x)" : "normal D_y(x)", "D_z(x)", zh ? "毒性逆转 D_y(x)" : "poison D_y(x)", "D_z(x)"]}
        rows={rows}
      />

      <Chips items={zh
        ? [
          ["好消息传得快", "代价下降时，一轮内即可沿邻居传播到全网。"],
          ["坏消息传得慢", "x–y 断开后，y 误以为可经 z 到 x，D 每轮 +2 缓慢增长。"],
          ["计数到无穷", "如此反复直到超过「无穷」阈值才收敛。"],
          ["毒性逆转", "若 z 经 y 到 x，则 z 向 y 通告 D_z(x)=∞，坏消息立刻传播。"],
        ]
        : [
          ["Good news fast", "A cost decrease propagates within one round."],
          ["Bad news slow", "After x–y fails, y thinks it can reach x via z; D grows by 2 each round."],
          ["Count to infinity", "It loops until it exceeds the 'infinity' threshold."],
          ["Poisoned reverse", "If z routes to x via y, z tells y D_z(x)=∞, so bad news spreads at once."],
        ]} />

      <Note>
        <MathText text={zh
          ? "$D_x(y) = \\min_{v \\in N(x)}\\{\\, c(x,v) + D_v(y) \\,\\}$；水平分割与毒性逆转用于打破环路。"
          : "$D_x(y) = \\min_{v \\in N(x)}\\{\\, c(x,v) + D_v(y) \\,\\}$; split horizon and poisoned reverse break loops."} />
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// ICMP：traceroute 逐跳探测
// ---------------------------------------------------------------------

const ICMP_PATH = ["R1 10.0.0.1", "R2 10.0.1.1", "R3 198.51.100.1", "D 203.0.113.9"];

type IcmpScene = { ttl: number; hops: string[]; done: boolean };

const ICMP_CODE = [
  T("$ttl \\gets 1$", "$ttl \\gets 1$"),
  T("发送探测包，置 $TTL=ttl$", "send probe with $TTL=ttl$"),
  T("每跳路由器 $TTL \\gets TTL-1$", "each router $TTL \\gets TTL-1$"),
  T("若 $TTL=0$：回送「超时」(11)", "if $TTL=0$: reply 'Time Exceeded' (11)"),
  T("到目的：回送应答，$ttl \\gets ttl+1$", "at dest: reply, $ttl \\gets ttl+1$"),
];

function icmpGenerate(_config: any): Frame<IcmpScene>[] {
  return ICMP_PATH.map((_, i) => {
    const ttl = i + 1;
    const hops = ICMP_PATH.slice(0, ttl);
    const done = ttl === ICMP_PATH.length;
    return {
      line: done ? 4 : 3,
      caption: done
        ? T(`$TTL=${ttl}$ 抵达目的主机，回送应答，探测结束`, `$TTL=${ttl}$ reaches destination; reply returns, done`)
        : T(`$TTL=${ttl}$：第 ${ttl} 跳路由器把 $TTL$ 减到 0，回送 ICMP 超时，暴露第 ${ttl} 跳`, `$TTL=${ttl}$: hop ${ttl} decrements to 0, replies Time Exceeded, revealing hop ${ttl}`),
      scene: { ttl, hops, done },
    };
  });
}

function IcmpRender({ scene, t, onNext, playing }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<IcmpScene>;
  const hops = Array.isArray(s.hops) && s.hops.length ? s.hops : ICMP_PATH;
  const ttl = typeof s.ttl === "number" ? Math.max(1, Math.min(ICMP_PATH.length, s.ttl)) : ICMP_PATH.length;
  const done = !!s.done;
  const nodes = ["S", ...ICMP_PATH.map((h) => h.split(" ")[0])];
  const X = (i: number) => 40 + i * 88;
  const Y = 62;
  const atEnd = done || ttl >= ICMP_PATH.length;
  const advance = () => { if (!atEnd && !playing) onNext?.(); };
  const onNodeClick = (e: React.MouseEvent) => { e.stopPropagation(); advance(); };
  return (
    <Panel>
      <svg viewBox="0 0 440 132" style={{ width: "100%", maxWidth: 520, height: "auto", margin: "0 auto", display: "block" }}>
        {nodes.slice(1).map((_, k) => {
          const i = k + 1;
          const rev = i <= ttl;
          const last = i === ttl;
          return <line key={i} x1={X(i - 1)} y1={Y} x2={X(i)} y2={Y}
            stroke={rev ? (last && done ? "#16a34a" : "#6366f1") : "#cbd5e1"} strokeWidth={rev ? 3 : 1.5} />;
        })}
        <text x={220} y={22} textAnchor="middle" fontSize={11} fill="#4338ca" fontWeight={800} fontFamily="ui-monospace, monospace">
          {done ? (zh ? "到达目的地，探测结束" : "destination reached") : (zh ? `发探测包 TTL=${ttl}` : `probe TTL=${ttl}`)}
        </text>
        {nodes.map((n, i) => {
          const rev = i > 0 && i <= ttl;
          const cur = i === ttl;
          const clickable = i === 0 && !atEnd;
          const fill = cur && done ? "#bbf7d0" : cur ? "#fde68a" : rev ? "#dbeafe" : "#fff";
          const stroke = cur && done ? "#16a34a" : cur ? "#d97706" : rev ? "#3b82f6" : "#94a3b8";
          return (
            <g key={i} onClick={clickable ? onNodeClick : undefined} style={clickable ? { cursor: "pointer" } : undefined}>
              {cur && <circle cx={X(i)} cy={Y} r={21} fill="none" stroke={cur && done ? "#16a34a" : "#f59e0b"} strokeWidth={2} strokeDasharray="4 3" />}
              {clickable && <circle cx={X(i)} cy={Y} r={23} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeDasharray="3 3" />}
              <circle cx={X(i)} cy={Y} r={16} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={X(i)} y={Y + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#0f172a" fontFamily="ui-monospace, monospace">{n}</text>
              {clickable && <text x={X(i)} y={Y - 26} textAnchor="middle" fontSize={10} fill="#16a34a" fontWeight={800} fontFamily="ui-monospace, monospace">{zh ? "点此发送" : "send"}</text>}
              {i > 0 && (
                <text x={X(i)} y={Y + 32} textAnchor="middle" fontSize={9.5} fill={rev ? "#4338ca" : "#94a3b8"} fontFamily="ui-monospace, monospace">
                  {rev ? ICMP_PATH[i - 1].split(" ")[1] : "?"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {zh ? `已发现 ${hops.length} 跳：` : `${hops.length} hop(s) found:`}
        </span>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {hops.map((h, i) => (
            <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#dbeafe", color: "#1e40af", fontFamily: "ui-monospace, monospace" }}>{i + 1}. {h}</span>
          ))}
        </span>
        <button
          onClick={advance}
          disabled={atEnd || playing}
          style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 999, border: "1px solid #c7d2fe", background: atEnd ? "#e2e8f0" : "#4338ca", color: atEnd ? "#64748b" : "#fff", fontSize: 12, fontWeight: 700, cursor: atEnd ? "default" : "pointer" }}>
          {zh ? (atEnd ? "探测完成" : `发送探测 (TTL=${ttl + 1})`) : (atEnd ? "done" : `send probe (TTL=${ttl + 1})`)}
        </button>
      </div>

      <Table
        head={[zh ? "TTL" : "TTL", zh ? "路径节点" : "Hop", zh ? "回送" : "Reply"]}
        rows={ICMP_PATH.map((h, i) => {
          const rev = i + 1 <= ttl;
          const doneRow = done && i + 1 === ttl;
          const reply = doneRow ? (zh ? "回显应答 / 端口不可达 (3)" : "Echo Reply / Port Unreachable (3)") : (zh ? "超时 (11)" : "Time Exceeded (11)");
          return [String(i + 1), rev ? h : (zh ? "未探测" : "not probed"), rev ? reply : "−"];
        })}
      />

      <Note>
        <MathText text={zh
          ? `traceroute 依次发 $TTL=1,2,3,\\dots$ 的探测包：每跳路由器把 $TTL$ 减 1，减到 0 就丢弃并回送「超时」，从而逐跳暴露路径；已发现 ${hops.length} 跳。`
          : `traceroute sends probes with $TTL=1,2,3,\\dots$: each hop decrements $TTL$, and at 0 discards the packet and returns Time Exceeded, revealing the path one hop at a time; ${hops.length} hop(s) discovered.`} />
      </Note>
    </Panel>
  );
}

// ---------------------------------------------------------------------

const SUBS: Record<SubMode, SubDef> = {
  ls: { title: T("链路状态 Dijkstra", "Link-State Dijkstra"), defaultConfig: LS_DEFAULT, Controls: LsControls, Render: LsRender, generate: lsGenerate, code: LS_CODE },
  dv: { title: T("距离向量", "Distance-Vector"), defaultConfig: DV_DEFAULT, Controls: DvControls, Render: DvRender, generate: dvGenerate, code: DV_CODE },
  icmp: { title: T("ICMP traceroute", "ICMP traceroute"), Render: IcmpRender, generate: icmpGenerate, code: ICMP_CODE },
};

export const { module: cnNetworkControlModule, GROUPS: cnNetworkControlGroups } = makeChapter<SubMode>({
  id: "cn-network-control",
  title: T("网络层·控制平面", "Network: Control Plane"),
  desc: T("路由表如何算出：链路状态 Dijkstra、距离向量与计数到无穷、ICMP traceroute 逐跳探测。", "How routing tables are computed: link-state Dijkstra, distance-vector & count-to-infinity, ICMP traceroute per-hop probing."),
  tags: ["computer-network", "network"],
  groups: [
    {
      label: "控制平面", opts: [
        { v: "ls", zh: "链路状态 Dijkstra", en: "Link-State" },
        { v: "dv", zh: "距离向量", en: "Distance-Vector" },
        { v: "icmp", zh: "ICMP traceroute", en: "ICMP traceroute" },
      ],
    },
  ],
  subs: SUBS,
});
