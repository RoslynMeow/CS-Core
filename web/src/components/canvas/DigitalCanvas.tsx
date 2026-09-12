import type { DigPreset, GateKind, LogicValue } from '../../lib/digital/types';
import { logicColor } from '../../lib/digital/logic';
import { valueAt, type SimResult } from '../../lib/digital/sim';

/**
 * 数字画布 · 门级原理图（四值 0/1/X/Z，按时刻回放）
 * 走线规则（横平竖直）：
 *  - 单负载：直角折线，拐点靠近引脚（L 形）。
 *  - 多负载：竖直总线 + 水平分支，T 型处画汇接点。
 *  - 不同网的横竖线交叉处画小圆弧（跨线，不连接）。
 * 画布禁止选中。
 */

const INK = '#1e293b';
const STUB = 18; // 引脚前的一小段水平线

const GATE_W: Record<GateKind, number> = { NOT: 46, BUF: 46, AND: 56, OR: 58, NAND: 60, NOR: 62, XOR: 64 };
const GATE_H: Record<GateKind, number> = { NOT: 34, BUF: 34, AND: 42, OR: 42, NAND: 42, NOR: 42, XOR: 42 };
const GATE_IN: Record<GateKind, number> = { NOT: 1, BUF: 1, AND: 2, OR: 2, NAND: 2, NOR: 2, XOR: 2 };

interface Pin { x: number; y: number; net: string; driver: boolean }
interface Seg { x1: number; y1: number; x2: number; y2: number; net: string }

function andPath(w: number, h: number): string {
  const r = h / 2;
  const wc = w - r;
  return `M0,0 L${wc},0 A${r},${r} 0 0 1 ${wc},${h} L0,${h} Z`;
}
function orPath(x0: number, w: number, h: number): string {
  const d = w - x0;
  return `M${x0},0 C${x0 + d * 0.45},0 ${x0 + d * 0.6},${h / 2} ${w},${h / 2} ` +
    `C${x0 + d * 0.6},${h / 2} ${x0 + d * 0.45},${h} ${x0},${h} ` +
    `C${x0 + d * 0.32},${h} ${x0 + d * 0.32},0 ${x0},0 Z`;
}
function triPath(w: number, h: number): string {
  return `M0,0 L${w},${h / 2} L0,${h} Z`;
}

function GateShape({ kind, w, h }: { kind: GateKind; w: number; h: number }) {
  const bubble = kind === 'NAND' || kind === 'NOR';
  const xor = kind === 'XOR';
  const x0 = xor ? 9 : 0;
  const bodyW = bubble ? w - 9 : w;
  let body: string;
  if (kind === 'NOT' || kind === 'BUF') body = triPath(bodyW, h);
  else if (kind === 'AND' || kind === 'NAND') body = andPath(bodyW, h);
  else body = orPath(x0, bodyW, h);
  return (
    <g>
      <path d={body} fill="#fff" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {xor && <path d={`M0,0 C9,${h * 0.25} 9,${h * 0.75} 0,${h}`} fill="none" stroke={INK} strokeWidth={2} />}
      {bubble && <circle cx={bodyW + 5} cy={h / 2} r={4} fill="#fff" stroke={INK} strokeWidth={2} />}
    </g>
  );
}

/** 水平线段，遇到跨线处画小圆弧（先上跨） */
function hopPath(seg: Seg, crossings: number[]): string {
  const y = seg.y1;
  const xs = [...crossings].sort((a, b) => a - b);
  if (!xs.length) return `M ${seg.x1} ${y} L ${seg.x2} ${y}`;
  const r = 4;
  let d = `M ${seg.x1} ${y}`;
  for (const x of xs) {
    d += ` L ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y}`;
  }
  d += ` L ${seg.x2} ${y}`;
  return d;
}

export function DigitalCanvas({
  preset,
  sim,
  time,
  onToggleInput,
  onOpenGate,
  onOpenBlock,
  height = 300,
}: {
  preset: DigPreset;
  sim: SimResult;
  time: number;
  onToggleInput: (id: string) => void;
  onOpenGate: (id: string) => void;
  onOpenBlock: (id: string) => void;
  height?: number;
}) {
  const { layout } = preset;
  const valOf = (net: string): LogicValue => valueAt(sim.waves.get(net), time);

  const pins: Pin[] = [];
  for (const inp of preset.top.inputs) {
    const p = layout.inputs[inp.id];
    if (p) pins.push({ x: p.x, y: p.y, net: inp.net, driver: true });
  }
  for (const o of preset.top.outputs) {
    const p = layout.outputs[o.id];
    if (p) pins.push({ x: p.x, y: p.y, net: o.net, driver: false });
  }
  for (const g of preset.top.gates) {
    const p = layout.gates[g.id];
    if (!p) continue;
    const w = GATE_W[g.kind]; const h = GATE_H[g.kind]; const n = GATE_IN[g.kind];
    for (let i = 0; i < n; i++) pins.push({ x: p.x, y: p.y + (h * (i + 1)) / (n + 1), net: g.inputs[i], driver: false });
    const bubble = g.kind === 'NAND' || g.kind === 'NOR';
    pins.push({ x: p.x + w + (bubble ? 3 : 0), y: p.y + h / 2, net: g.output, driver: true });
  }
  const BLOCK_W = 76; const BLOCK_H = 84;
  for (const b of preset.top.blocks) {
    const p = layout.blocks[b.id];
    if (!p) continue;
    const def = preset.defs.find((d) => d.id === b.defId);
    if (!def) continue;
    const ins = def.ports.filter((x) => x.dir === 'in');
    const outs = def.ports.filter((x) => x.dir === 'out');
    ins.forEach((port, i) => pins.push({ x: p.x, y: p.y + (BLOCK_H * (i + 1)) / (ins.length + 1), net: b.connections[port.name], driver: false }));
    outs.forEach((port, i) => pins.push({ x: p.x + BLOCK_W, y: p.y + (BLOCK_H * (i + 1)) / (outs.length + 1), net: b.connections[port.name], driver: true }));
  }

  const byNet = new Map<string, Pin[]>();
  for (const pin of pins) {
    const arr = byNet.get(pin.net) ?? [];
    arr.push(pin);
    byNet.set(pin.net, arr);
  }

  const segs: Seg[] = [];
  const junctions: { x: number; y: number }[] = [];

  for (const [net, ps] of byNet) {
    const drv = ps.find((p) => p.driver) ?? ps[0];
    const loads = ps.filter((p) => p !== drv);
    if (!loads.length) continue;

    if (loads.length === 1) {
      const l = loads[0];
      if (Math.abs(drv.y - l.y) < 0.5) {
        segs.push({ x1: drv.x, y1: drv.y, x2: l.x, y2: l.y, net });
      } else {
        const dir = l.x >= drv.x ? -1 : 1; // 拐点在引脚前
        const sx = l.x + dir * STUB;
        segs.push({ x1: drv.x, y1: drv.y, x2: sx, y2: drv.y, net });
        segs.push({ x1: sx, y1: drv.y, x2: sx, y2: l.y, net });
        segs.push({ x1: sx, y1: l.y, x2: l.x, y2: l.y, net });
      }
      continue;
    }

    // 多负载：竖直总线 + 水平分支
    const ysAll = [drv.y, ...loads.map((l) => l.y)];
    if (Math.max(...ysAll) - Math.min(...ysAll) < 0.5) {
      for (const l of loads) segs.push({ x1: drv.x, y1: drv.y, x2: l.x, y2: l.y, net });
      continue;
    }
    const ys = [...new Set(ysAll)].sort((a, b) => a - b);
    const yTop = ys[0]; const yBot = ys[ys.length - 1];
    const minX = Math.min(...loads.map((l) => l.x));
    const maxX = Math.max(...loads.map((l) => l.x));
    const tx = (drv.x + (minX > drv.x ? minX : maxX)) / 2;
    segs.push({ x1: drv.x, y1: drv.y, x2: tx, y2: drv.y, net });
    segs.push({ x1: tx, y1: yTop, x2: tx, y2: yBot, net });
    for (const l of loads) segs.push({ x1: tx, y1: l.y, x2: l.x, y2: l.y, net });
    for (const y of ys) {
      let deg = 0;
      if (y !== yTop) deg++;
      if (y !== yBot) deg++;
      if (y === drv.y) deg++;
      deg += loads.filter((l) => l.y === y).length;
      if (deg >= 3) junctions.push({ x: tx, y });
    }
  }

  // 交叉检测：水平段被其他网的竖直段穿过 → 画圆弧
  const hSegs = segs.filter((s) => Math.abs(s.y1 - s.y2) < 0.5);
  const vSegs = segs.filter((s) => Math.abs(s.x1 - s.x2) < 0.5);
  const crossingsFor = (h: Seg): number[] => {
    const xs: number[] = [];
    const xa = Math.min(h.x1, h.x2); const xb = Math.max(h.x1, h.x2);
    for (const v of vSegs) {
      if (v.net === h.net) continue;
      const x = v.x1;
      const ya = Math.min(v.y1, v.y2); const yb = Math.max(v.y1, v.y2);
      if (x > xa + 2 && x < xb - 2 && h.y1 > ya + 2 && h.y1 < yb - 2) xs.push(x);
    }
    return xs;
  };

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, display: 'block', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* 导线：水平段可能带跨线圆弧 */}
      {hSegs.map((s, i) => {
        const v = valOf(s.net);
        return <path key={`h${i}`} d={hopPath(s, crossingsFor(s))} fill="none" stroke={logicColor(v)} strokeWidth={v === '1' ? 2.6 : 2} strokeDasharray={v === 'Z' ? '4 4' : undefined} strokeLinecap="round" />;
      })}
      {vSegs.map((s, i) => {
        const v = valOf(s.net);
        return <line key={`v${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={logicColor(v)} strokeWidth={v === '1' ? 2.6 : 2} strokeDasharray={v === 'Z' ? '4 4' : undefined} strokeLinecap="round" />;
      })}
      {junctions.map((j, i) => (
        <circle key={`j${i}`} cx={j.x} cy={j.y} r={3.2} fill="#334155" />
      ))}

      {/* 门 */}
      {preset.top.gates.map((g) => {
        const p = layout.gates[g.id];
        if (!p) return null;
        const w = GATE_W[g.kind]; const h = GATE_H[g.kind];
        const outV = valOf(g.output);
        return (
          <g key={g.id} style={{ cursor: 'pointer' }} onClick={() => onOpenGate(g.id)}>
            <title>{`点击查看 ${g.kind} 内部`}</title>
            <rect x={p.x - 4} y={p.y - 4} width={w + 12} height={h + 8} fill="transparent" />
            <g transform={`translate(${p.x} ${p.y})`}><GateShape kind={g.kind} w={w} h={h} /></g>
            <text x={p.x + w / 2} y={p.y - 6} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="ui-monospace, monospace" fill={INK}>{g.kind}</text>
            <text x={p.x + w + 12} y={p.y + h / 2 + 4} fontSize={11} fontWeight={800} fontFamily="ui-monospace, monospace" fill={logicColor(outV)}>{outV}</text>
          </g>
        );
      })}

      {/* 子电路块 */}
      {preset.top.blocks.map((b) => {
        const p = layout.blocks[b.id];
        if (!p) return null;
        const def = preset.defs.find((d) => d.id === b.defId);
        return (
          <g key={b.id} style={{ cursor: 'pointer' }} onClick={() => onOpenBlock(b.id)}>
            <title>点击查看内部</title>
            <rect x={p.x} y={p.y} width={BLOCK_W} height={BLOCK_H} rx={8} fill="#eef2ff" stroke="#6366f1" strokeWidth={2} />
            <text x={p.x + BLOCK_W / 2} y={p.y + BLOCK_H / 2 + 4} fontSize={13} fontWeight={800} textAnchor="middle" fill="#4338ca">{b.label ?? def?.name.zh}</text>
          </g>
        );
      })}

      {/* 输入端子 */}
      {preset.top.inputs.map((inp) => {
        const p = layout.inputs[inp.id];
        if (!p) return null;
        const v = valOf(inp.net);
        return (
          <g key={inp.id} style={{ cursor: 'pointer' }} onClick={() => onToggleInput(inp.id)}>
            <title>点击切换 0/1</title>
            <circle cx={p.x} cy={p.y} r={12} fill="#fff" stroke={logicColor(v)} strokeWidth={2.4} />
            <text x={p.x} y={p.y + 4} fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="ui-monospace, monospace" fill={logicColor(v)}>{v}</text>
            <text x={p.x} y={p.y + 27} fontSize={10} textAnchor="middle" fill="#64748b">{inp.label ?? inp.net}</text>
          </g>
        );
      })}

      {/* 输出端子 */}
      {preset.top.outputs.map((o) => {
        const p = layout.outputs[o.id];
        if (!p) return null;
        const v = valOf(o.net);
        return (
          <g key={o.id}>
            <circle cx={p.x} cy={p.y} r={12} fill="#fff" stroke={logicColor(v)} strokeWidth={2.4} />
            <text x={p.x} y={p.y + 4} fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="ui-monospace, monospace" fill={logicColor(v)}>{v}</text>
            <text x={p.x} y={p.y + 27} fontSize={10} textAnchor="middle" fill="#64748b">{o.label ?? o.net}</text>
          </g>
        );
      })}
    </svg>
  );
}
