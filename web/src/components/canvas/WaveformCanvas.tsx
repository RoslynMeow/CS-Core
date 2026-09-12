import type { LogicValue } from '../../lib/digital/types';
import { logicColor } from '../../lib/digital/logic';
import { valueAt, type Sample } from '../../lib/digital/sim';

/**
 * 逻辑分析仪 · 滚动记录
 * ====================
 * 持续运行的示波器：显示 [tStart, tEnd] 区间的阶梯波形，最新时刻在右侧；
 * 时间前进时波形从左向右滚动。无播放/游标交互。
 */

export interface WaveLane {
  net: string;
  label: string;
  samples: Sample[];
}

function niceStep(span: number): number {
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return step * mag;
}

export function WaveformCanvas({
  lanes,
  tStart,
  tEnd,
  height = 220,
}: {
  lanes: WaveLane[];
  tStart: number;
  tEnd: number;
  height?: number;
}) {
  const padL = 64;
  const padR = 16;
  const padT = 10;
  const padB = 20;
  const W = 900;
  const laneH = Math.max(18, Math.floor((height - padT - padB) / Math.max(1, lanes.length)));
  const plotW = W - padL - padR;
  const span = Math.max(1e-6, tEnd - tStart);
  const xFor = (t: number) => padL + ((t - tStart) / span) * plotW;
  const yFor = (v: LogicValue, top: number) => {
    const mid = top + laneH / 2;
    if (v === '1') return top + 4;
    if (v === '0') return top + laneH - 4;
    return mid;
  };

  const step = niceStep(span);
  const ticks: number[] = [];
  for (let t = Math.ceil(tStart / step) * step; t <= tEnd + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(6)));
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, background: '#0f172a', borderRadius: 10, display: 'block' }}
    >
      {ticks.map((t) => (
        <line key={`g${t}`} x1={xFor(t)} y1={padT} x2={xFor(t)} y2={height - padB} stroke="#1e293b" strokeWidth={1} />
      ))}
      {ticks.map((t) => (
        <text key={`l${t}`} x={xFor(t)} y={height - 6} fontSize={9} fill="#64748b" textAnchor="middle" fontFamily="ui-monospace, monospace">{t.toFixed(1)}</text>
      ))}

      {lanes.map((lane, li) => {
        const top = padT + li * laneH;
        const mid = top + laneH / 2;
        const ss = lane.samples;
        // 可见区间内的阶梯段
        const hlines: { x1: number; x2: number; y: number; v: LogicValue }[] = [];
        const vlines: { x: number; y1: number; y2: number; v: LogicValue }[] = [];
        let cur: LogicValue = valueAt(ss, tStart);
        let prevT = tStart;
        for (const s of ss) {
          if (s.t <= tStart) continue;
          if (s.t > tEnd) break;
          hlines.push({ x1: xFor(prevT), x2: xFor(s.t), y: yFor(cur, top), v: cur });
          vlines.push({ x: xFor(s.t), y1: yFor(cur, top), y2: yFor(s.v, top), v: s.v });
          cur = s.v;
          prevT = s.t;
        }
        hlines.push({ x1: xFor(prevT), x2: xFor(tEnd), y: yFor(cur, top), v: cur });
        return (
          <g key={lane.net}>
            <line x1={padL} y1={mid} x2={W - padR} y2={mid} stroke="#1e293b" strokeWidth={1} strokeDasharray="2 4" />
            <text x={padL - 8} y={mid + 4} fontSize={11} fill="#cbd5e1" textAnchor="end" fontFamily="ui-monospace, monospace">{lane.label}</text>
            {hlines.map((h, i) => (
              <line key={`h${i}`} x1={h.x1} y1={h.y} x2={h.x2} y2={h.y} stroke={logicColor(h.v)} strokeWidth={2} strokeDasharray={h.v === 'Z' ? '3 3' : undefined} />
            ))}
            {vlines.map((vv, i) => (
              <line key={`v${i}`} x1={vv.x} y1={vv.y1} x2={vv.x} y2={vv.y2} stroke={logicColor(vv.v)} strokeWidth={1.4} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
