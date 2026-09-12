import type { Component } from '../../lib/circuit/netlist';
import { componentValue } from '../../lib/circuit/netlist';
import { formatValue } from '../../lib/circuit/format';
import type { CircuitPreset, Pt } from '../../lib/circuit/presets';
import type { DCResult } from '../../lib/circuit/mna';

/**
 * 电路画布 · 手控坐标 SVG 原理图
 * ==============================
 * - 导线：直角段；T 型连接画汇接点；交叉处水平线画小圆弧；导线画在元件下方。
 * - 符号：电阻/电源/标准 MOSFET/二极管/三极管/电源轨/地。
 * - 节点按电位着色；支路电流用箭头标注。
 */

const INK = '#1e293b';
const WIRE = '#94a3b8';
const GND = '#1f2937';
const VDD = '#dc2626';
const GRID = '#334155';
const ON = '#16a34a';
const OFF = '#dc2626';

function unit(p1: Pt, p2: Pt) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len };
}

function valueText(c: Component): string {
  const v = componentValue(c);
  switch (c.kind) {
    case 'R': return formatValue(v, 'Ω');
    case 'C': return formatValue(v, 'F');
    case 'L': return formatValue(v, 'H');
    case 'V': return formatValue(v, 'V');
    case 'I': return formatValue(v, 'A');
    case 'M': return c.channel === 'N' ? 'NMOS' : 'PMOS';
    case 'D': return '';
    case 'Q': return c.npn ? 'NPN' : 'PNP';
  }
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
const LOW: [number, number, number] = [100, 116, 139];
const HIGH: [number, number, number] = [220, 38, 38];
function potentialColor(v: number, maxAbs: number): string {
  if (maxAbs <= 0) return 'rgb(100,116,139)';
  return mix(LOW, HIGH, Math.max(0, Math.min(1, Math.abs(v) / maxAbs)));
}

// ── 元件符号 ──────────────────────────────────────────────────
function Leads({ p1, p2, inner }: { p1: Pt; p2: Pt; inner: number }) {
  const { ux, uy, len } = unit(p1, p2);
  const cx = (p1.x + p2.x) / 2; const cy = (p1.y + p2.y) / 2;
  const d = Math.min(inner, len / 2);
  return (
    <>
      <line x1={p1.x} y1={p1.y} x2={cx - ux * d} y2={cy - uy * d} stroke={INK} strokeWidth={2} />
      <line x1={cx + ux * d} y1={cy + uy * d} x2={p2.x} y2={p2.y} stroke={INK} strokeWidth={2} />
    </>
  );
}

function ResistorGlyph({ p1, p2 }: { p1: Pt; p2: Pt }) {
  const { ux, uy, nx, ny, len } = unit(p1, p2);
  const cx = (p1.x + p2.x) / 2; const cy = (p1.y + p2.y) / 2;
  const body = Math.min(48, len * 0.7); const half = body / 2; const amp = 7; const segs = 6;
  const ex = cx - ux * half; const ey = cy - uy * half;
  const bx = cx + ux * half; const by = cy + uy * half;
  const pts: string[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const px = ex + (bx - ex) * t; const py = ey + (by - ey) * t;
    const off = i === 0 || i === segs ? 0 : i % 2 === 1 ? amp : -amp;
    pts.push(`${px + nx * off},${py + ny * off}`);
  }
  return <path d={`M ${ex} ${ey} L ${pts.join(' L ')}`} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
}

function SourceGlyph({ p1, p2, kind }: { p1: Pt; p2: Pt; kind: 'V' | 'I' }) {
  const { ux, uy, nx, ny } = unit(p1, p2);
  const cx = (p1.x + p2.x) / 2; const cy = (p1.y + p2.y) / 2; const r = 14;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth={2} />
      {kind === 'V' ? (
        <>
          <text x={cx - ux * 4 + nx * 5} y={cy - uy * 4 + ny * 5} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill={INK} fontWeight={700}>+</text>
          <text x={cx + ux * 4 + nx * 5} y={cy + uy * 4 + ny * 5} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill={INK} fontWeight={700}>−</text>
        </>
      ) : (
        <line x1={cx - ux * 8} y1={cy - uy * 8} x2={cx + ux * 8} y2={cy + uy * 8} stroke={INK} strokeWidth={2} markerEnd="url(#i-arrow)" />
      )}
    </>
  );
}

/** 标准增强型 MOSFET：栅极板 + 沟道 + 源极箭头 + PMOS 栅极气泡 */
function MosGlyph({ dp, sp, gp, channel, on }: { dp: Pt; sp: Pt; gp: Pt; channel: 'N' | 'P'; on: boolean }) {
  const { ux, uy, nx, ny, len } = unit(dp, sp);
  const col = on ? ON : OFF;
  const chTop = { x: dp.x + ux * len * 0.24, y: dp.y + uy * len * 0.24 };
  const chBot = { x: dp.x + ux * len * 0.76, y: dp.y + uy * len * 0.76 };
  const mid = { x: dp.x + ux * len * 0.5, y: dp.y + uy * len * 0.5 };
  const side = Math.sign((gp.x - mid.x) * nx + (gp.y - mid.y) * ny) || 1;
  const off = 7;
  const plateTop = { x: chTop.x + nx * off * side, y: chTop.y + ny * off * side };
  const plateBot = { x: chBot.x + nx * off * side, y: chBot.y + ny * off * side };
  const plateMid = { x: mid.x + nx * off * side, y: mid.y + ny * off * side };
  const arrowDir = channel === 'N' ? -1 : 1;
  const ap = { x: chBot.x + (sp.x - chBot.x) * 0.55, y: chBot.y + (sp.y - chBot.y) * 0.55 };
  const tip = { x: ap.x + ux * arrowDir * 6, y: ap.y + uy * arrowDir * 6 };
  const baseL = { x: ap.x - ux * arrowDir * 5 + nx * 4.5, y: ap.y - uy * arrowDir * 5 + ny * 4.5 };
  const baseR = { x: ap.x - ux * arrowDir * 5 - nx * 4.5, y: ap.y - uy * arrowDir * 5 - ny * 4.5 };
  return (
    <g>
      <line x1={dp.x} y1={dp.y} x2={chTop.x} y2={chTop.y} stroke={col} strokeWidth={2} />
      <line x1={chBot.x} y1={chBot.y} x2={sp.x} y2={sp.y} stroke={col} strokeWidth={2} />
      <line x1={chTop.x} y1={chTop.y} x2={chBot.x} y2={chBot.y} stroke={col} strokeWidth={3.4} strokeLinecap="butt" />
      <line x1={plateTop.x} y1={plateTop.y} x2={plateBot.x} y2={plateBot.y} stroke={GRID} strokeWidth={2.4} />
      <line x1={gp.x} y1={gp.y} x2={plateMid.x} y2={plateMid.y} stroke={GRID} strokeWidth={2} />
      {channel === 'P' && <circle cx={plateMid.x - (plateMid.x - gp.x) * 0.12} cy={plateMid.y - (plateMid.y - gp.y) * 0.12} r={3.6} fill="#fff" stroke={GRID} strokeWidth={2} />}
      <polygon points={`${tip.x},${tip.y} ${baseL.x},${baseL.y} ${baseR.x},${baseR.y}`} fill={col} stroke="none" />
    </g>
  );
}

/** 二极管：三角 + 阴极横杠（a=阳极，b=阴极） */
function DiodeGlyph({ p1, p2, on }: { p1: Pt; p2: Pt; on: boolean }) {
  const { ux, uy, nx, ny, len } = unit(p1, p2);
  const cx = (p1.x + p2.x) / 2; const cy = (p1.y + p2.y) / 2;
  const col = on ? ON : OFF;
  const half = Math.min(14, len * 0.4);
  const tip = { x: cx + ux * half, y: cy + uy * half };
  const b1 = { x: cx - ux * half + nx * half, y: cy - uy * half + ny * half };
  const b2 = { x: cx - ux * half - nx * half, y: cy - uy * half - ny * half };
  const bar1 = { x: tip.x + nx * half, y: tip.y + ny * half };
  const bar2 = { x: tip.x - nx * half, y: tip.y - ny * half };
  return (
    <g>
      <line x1={p1.x} y1={p1.y} x2={cx - ux * half} y2={cy - uy * half} stroke={col} strokeWidth={2} />
      <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill={col} stroke={col} strokeWidth={1} />
      <line x1={bar1.x} y1={bar1.y} x2={bar2.x} y2={bar2.y} stroke={col} strokeWidth={3} />
      <line x1={tip.x} y1={tip.y} x2={p2.x} y2={p2.y} stroke={col} strokeWidth={2} />
    </g>
  );
}

/** 三极管：圆圈 + 基极竖杠 + 集电极/发射极引线 + 发射极箭头（a=集电极，b=发射极，g=基极） */
function BjtGlyph({ c, e, b, npn, on }: { c: Pt; e: Pt; b: Pt; npn: boolean; on: boolean }) {
  const col = on ? ON : OFF;
  // 基极竖杠位置：在 c-e 线朝向 base 的一侧
  const mid = { x: (c.x + e.x) / 2, y: (c.y + e.y) / 2 };
  const toBase = { x: b.x - mid.x, y: b.y - mid.y };
  const towardBase = Math.sign(toBase.x !== 0 ? toBase.x : 1); // 假定 base 在左或右
  const barX = mid.x + towardBase * 14;
  const barTop = c.y + (e.y - c.y) * 0.2;
  const barBot = c.y + (e.y - c.y) * 0.8;
  const jc = { x: barX, y: c.y + (e.y - c.y) * 0.32 };
  const je = { x: barX, y: c.y + (e.y - c.y) * 0.68 };
  // 发射极箭头（NPN 朝外，PNP 朝内）
  const dir = { x: e.x - je.x, y: e.y - je.y };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dl; const uy = dir.y / dl;
  const nx = -uy; const ny = ux;
  const arrCenter = { x: je.x + ux * dl * 0.35, y: je.y + uy * dl * 0.35 };
  const arrowSign = npn ? 1 : -1;
  const tip = { x: arrCenter.x + ux * arrowSign * 6, y: arrCenter.y + uy * arrowSign * 6 };
  const bl = { x: arrCenter.x - ux * arrowSign * 5 + nx * 4.5, y: arrCenter.y - uy * arrowSign * 5 + ny * 4.5 };
  const br = { x: arrCenter.x - ux * arrowSign * 5 - nx * 4.5, y: arrCenter.y - uy * arrowSign * 5 - ny * 4.5 };
  return (
    <g>
      <circle cx={(barX + mid.x) / 2} cy={mid.y} r={22} fill="#fff" stroke={INK} strokeWidth={1.4} />
      <line x1={barX} y1={barTop} x2={barX} y2={barBot} stroke={col} strokeWidth={3} />
      <line x1={b.x} y1={b.y} x2={barX} y2={mid.y} stroke={col} strokeWidth={2} />
      <line x1={c.x} y1={c.y} x2={jc.x} y2={jc.y} stroke={col} strokeWidth={2} />
      <line x1={jc.x} y1={jc.y} x2={barX} y2={barTop + (barBot - barTop) * 0.18} stroke={col} strokeWidth={2} />
      <line x1={e.x} y1={e.y} x2={je.x} y2={je.y} stroke={col} strokeWidth={2} />
      <line x1={je.x} y1={je.y} x2={barX} y2={barTop + (barBot - barTop) * 0.82} stroke={col} strokeWidth={2} />
      <polygon points={`${tip.x},${tip.y} ${bl.x},${bl.y} ${br.x},${br.y}`} fill={col} stroke="none" />
    </g>
  );
}

function GroundGlyph({ p }: { p: Pt }) {
  return (
    <g stroke={GND} strokeWidth={2}>
      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + 8} />
      <line x1={p.x - 12} y1={p.y + 8} x2={p.x + 12} y2={p.y + 8} />
      <line x1={p.x - 8} y1={p.y + 13} x2={p.x + 8} y2={p.y + 13} />
      <line x1={p.x - 4} y1={p.y + 18} x2={p.x + 4} y2={p.y + 18} />
    </g>
  );
}

function VddGlyph({ p }: { p: Pt }) {
  return (
    <g stroke={VDD} strokeWidth={2}>
      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 8} />
      <line x1={p.x - 14} y1={p.y - 8} x2={p.x + 14} y2={p.y - 8} />
      <text x={p.x} y={p.y - 14} fontSize={11} textAnchor="middle" fontFamily="ui-monospace, monospace" fill={VDD} strokeWidth={0}>Vdd</text>
    </g>
  );
}

// ── 导线分析：汇接点 + 交叉圆弧 ────────────────────────────────
interface Seg2 { x1: number; y1: number; x2: number; y2: number; h: boolean }
const EPS = 0.6;
function onSeg(p: Pt, s: Seg2, strict: boolean): boolean {
  const minx = Math.min(s.x1, s.x2) - EPS, maxx = Math.max(s.x1, s.x2) + EPS;
  const miny = Math.min(s.y1, s.y2) - EPS, maxy = Math.max(s.y1, s.y2) + EPS;
  if (p.x < minx || p.x > maxx || p.y < miny || p.y > maxy) return false;
  if (s.h) { if (Math.abs(p.y - s.y1) > EPS) return false; }
  else { if (Math.abs(p.x - s.x1) > EPS) return false; }
  if (strict) {
    return Math.hypot(p.x - s.x1, p.y - s.y1) > EPS && Math.hypot(p.x - s.x2, p.y - s.y2) > EPS;
  }
  return true;
}
function analyzeWires(wires: [Pt, Pt][]) {
  const segs: Seg2[] = wires.map(([a, b]) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, h: Math.abs(a.y - b.y) < EPS }));
  const cand: Pt[] = [];
  for (const s of segs) { cand.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }); }
  for (const a of segs) for (const b of segs) {
    if (a === b) continue;
    for (const p of [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }]) if (onSeg(p, a, true)) cand.push(p);
  }
  const dots: Pt[] = [];
  for (const p of cand) {
    let branches = 0;
    for (const s of segs) {
      if (!onSeg(p, s, false)) continue;
      const e1 = Math.hypot(p.x - s.x1, p.y - s.y1) < EPS;
      const e2 = Math.hypot(p.x - s.x2, p.y - s.y2) < EPS;
      branches += e1 && e2 ? 2 : e1 || e2 ? 1 : 2;
    }
    if (branches >= 3 && !dots.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < EPS)) dots.push(p);
  }
  const hops = new Map<number, number[]>();
  segs.forEach((s, i) => {
    if (!s.h) return;
    const xs: number[] = [];
    for (const v of segs) {
      if (v.h) continue;
      const p = { x: v.x1, y: s.y1 };
      if (onSeg(p, s, true) && onSeg(p, v, true)) xs.push(v.x1);
    }
    if (xs.length) hops.set(i, xs);
  });
  return { segs, dots, hops };
}

function hopPath(s: Seg2, crossings: number[]): string {
  const y = s.y1;
  const xs = [...crossings].sort((a, b) => a - b);
  if (!xs.length) return `M ${s.x1} ${y} L ${s.x2} ${y}`;
  const r = 4;
  let d = `M ${s.x1} ${y}`;
  for (const x of xs) d += ` L ${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y}`;
  return d + ` L ${s.x2} ${y}`;
}

export function CircuitCanvas({
  preset,
  result,
  height = 420,
  onToggleTerm,
}: {
  preset: CircuitPreset;
  result: DCResult | null;
  height?: number;
  onToggleTerm?: (nodeId: string) => void;
}) {
  const { layout, circuit } = preset;
  const nodePos = layout.nodes;
  const comps = layout.comps ?? {};
  const wires = layout.wires ?? [];
  const { segs, dots, hops } = analyzeWires(wires);

  const maxAbs = result
    ? Math.max(...Object.values(result.nodeVoltages).map((v) => Math.abs(v)), 1e-9)
    : 1;

  const term = (c: Component): { p1: Pt; p2: Pt; g?: Pt } => {
    const override = comps[c.id];
    if (override) return { p1: override.a, p2: override.b, g: override.g };
    return { p1: nodePos[c.a], p2: nodePos[c.b] };
  };

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, display: 'block', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <defs>
        <marker id="i-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill={INK} />
        </marker>
        <marker id="cur-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 z" fill="#16a34a" />
        </marker>
      </defs>

      {/* 导线（在元件下方） */}
      {segs.map((s, i) => s.h
        ? <path key={`w${i}`} d={hopPath(s, hops.get(i) ?? [])} fill="none" stroke={WIRE} strokeWidth={2} />
        : <line key={`w${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={WIRE} strokeWidth={2} />)}
      {/* 汇接点 */}
      {dots.map((p, i) => <circle key={`dot${i}`} cx={p.x} cy={p.y} r={3.4} fill={GRID} />)}

      {/* 元件 */}
      {circuit.components.map((c) => {
        const { p1, p2, g } = term(c);
        const { ux, uy, nx, ny } = unit(p1, p2);
        const cx = (p1.x + p2.x) / 2; const cy = (p1.y + p2.y) / 2;
        const I = result?.elementCurrents[c.id] ?? 0;
        const dir = I >= 0 ? 1 : -1;
        const hasI = Math.abs(I) > 1e-12;
        return (
          <g key={c.id}>
            {c.kind === 'R' && <><Leads p1={p1} p2={p2} inner={26} /><ResistorGlyph p1={p1} p2={p2} /></>}
            {c.kind === 'V' && <><Leads p1={p1} p2={p2} inner={14} /><SourceGlyph p1={p1} p2={p2} kind="V" /></>}
            {c.kind === 'I' && <><Leads p1={p1} p2={p2} inner={14} /><SourceGlyph p1={p1} p2={p2} kind="I" /></>}
            {c.kind === 'M' && g && <MosGlyph dp={p1} sp={p2} gp={g} channel={c.channel} on={c.on} />}
            {c.kind === 'D' && <DiodeGlyph p1={p1} p2={p2} on={c.on} />}
            {c.kind === 'Q' && <BjtGlyph c={p1} e={p2} b={g ?? p1} npn={c.npn} on={c.on} />}
            {c.kind !== 'R' && c.kind !== 'V' && c.kind !== 'I' && c.kind !== 'M' && c.kind !== 'D' && c.kind !== 'Q' && <Leads p1={p1} p2={p2} inner={12} />}
            {(c.kind === 'R' || c.kind === 'V' || c.kind === 'I' || c.kind === 'C' || c.kind === 'L') && (
              <text x={cx + nx * 30} y={cy + ny * 30} fontSize={11} fontFamily="ui-monospace, monospace" textAnchor="middle" dominantBaseline="middle" fill="#334155">
                {`${c.label ?? c.id} ${valueText(c)}`}
              </text>
            )}
            {hasI && result && c.kind !== 'I' && (
              <g>
                <line x1={cx + nx * -16 - ux * 12 * dir} y1={cy + ny * -16 - uy * 12 * dir} x2={cx + nx * -16 + ux * 12 * dir} y2={cy + ny * -16 + uy * 12 * dir} stroke="#16a34a" strokeWidth={1.6} markerEnd="url(#cur-arrow)" />
                <text x={cx + nx * -34} y={cy + ny * -34} fontSize={10} fontFamily="ui-monospace, monospace" textAnchor="middle" dominantBaseline="middle" fill="#16a34a">{`I=${formatValue(Math.abs(I), 'A')}`}</text>
              </g>
            )}
          </g>
        );
      })}

      {/* 节点 */}
      {Object.entries(nodePos).map(([id, p]) => {
        const v = result?.nodeVoltages[id] ?? 0;
        const col = potentialColor(v, maxAbs);
        const label = p.label ?? id;
        const vtxt = result ? formatValue(v, 'V') : '';
        if (p.term) {
          const clickable = p.term === 'in' && !!onToggleTerm;
          return (
            <g key={id} style={clickable ? { cursor: 'pointer' } : undefined} onClick={clickable ? () => onToggleTerm?.(id) : undefined}>
              <circle cx={p.x} cy={p.y} r={13} fill="#fff" stroke={col} strokeWidth={2.2} />
              <text x={p.x} y={p.y + 4} fontSize={10} fontWeight={800} textAnchor="middle" fontFamily="ui-monospace, monospace" fill={col}>{vtxt}</text>
              <text x={p.x} y={p.y + 30} fontSize={10} textAnchor="middle" fill="#64748b">{label}</text>
            </g>
          );
        }
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={4} fill={col} stroke="#fff" strokeWidth={1.5} />
            {!(p.vdd || p.gnd) && (
              <text x={p.x + 9} y={p.y - 9} fontSize={10} fontFamily="ui-monospace, monospace" fill={col} fontWeight={700}>{label + (vtxt ? ` ${vtxt}` : '')}</text>
            )}
            {p.gnd && <GroundGlyph p={p} />}
            {p.vdd && <VddGlyph p={p} />}
          </g>
        );
      })}
    </svg>
  );
}
