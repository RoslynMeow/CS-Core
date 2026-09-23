import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

// 补码加法溢出检测 (单帧, config 驱动)

type Cfg = { width: number; a: number; b: number };
const DEFAULT_CFG: Cfg = { width: 8, a: 100, b: 100 };
type Scene = {
  width: number; a: number; b: number;
  abits: number[]; bbits: number[]; sbits: number[]; carryIn: number[]; carryOut: number[];
  sumUnsigned: number; sumSigned: number; overflow: boolean; carryInMsb: number; carryOutMsb: number;
  min: number; max: number;
};

function toBits(v: number, w: number): number[] { // LSB first
  const out: number[] = [];
  for (let i = 0; i < w; i++) out.push((v >> i) & 1);
  return out;
}
function randInt(w: number): number {
  const min = -(2 ** (w - 1)), max = 2 ** (w - 1) - 1;
  return min + Math.floor(Math.random() * (max - min + 1));
}
function build(cfg: Cfg): Scene {
  const w = cfg.width;
  const min = -(2 ** (w - 1)), max = 2 ** (w - 1) - 1;
  const a = Math.max(min, Math.min(max, Math.trunc(cfg.a)));
  const b = Math.max(min, Math.min(max, Math.trunc(cfg.b)));
  const mask = w >= 32 ? 0xffffffff : (1 << w) - 1;
  const ua = a & mask, ub = b & mask;
  const abits = toBits(ua, w), bbits = toBits(ub, w);
  const sbits: number[] = [], carryOut: number[] = [], carryIn: number[] = [];
  let c = 0;
  for (let i = 0; i < w; i++) {
    carryIn.push(c);
    const tot = abits[i] + bbits[i] + c;
    sbits.push(tot & 1);
    c = tot >> 1;
    carryOut.push(c);
  }
  const sumUnsigned = (ua + ub) & mask;
  const sumSigned = sumUnsigned >= 2 ** (w - 1) ? sumUnsigned - 2 ** w : sumUnsigned;
  const carryInMsb = carryIn[w - 1];
  const carryOutMsb = carryOut[w - 1];
  return { width: w, a, b, abits, bbits, sbits, carryIn, carryOut, sumUnsigned, sumSigned, overflow: carryInMsb !== carryOutMsb, carryInMsb, carryOutMsb, min, max };
}

function gen(cfg: Cfg): Frame<Scene>[] {
  return [{ line: 0, caption: T('补码加法与溢出检测', 'Two\'s complement addition & overflow'), scene: build(cfg) }];
}

function BitRow({ label, bits, hot, color }: { label: string; bits: number[]; hot: number; color: string }) {
  return (
    <tr>
      <td style={{ padding: '4px 10px', color: '#64748b', fontWeight: 700, textAlign: 'left' }}>{label}</td>
      {bits.slice().reverse().map((b, i) => {
        const isMsb = i === 0;
        return <td key={i} style={{ width: 30, textAlign: 'center', fontFamily: 'ui-monospace, monospace', fontWeight: isMsb || b ? 800 : 400, color: isMsb && hot ? '#dc2626' : b ? color : '#cbd5e1' }}>{b}</td>;
      })}
    </tr>
  );
}

export const overflowModule: ModuleDef<Scene, Cfg> = {
  id: 'overflow',
  title: T('溢出检测', 'Overflow'),
  desc: T('补码加法溢出: 最高位进位 $C_{in}\\!\\oplus\\! C_{out}=1$, 或同号相加结果异号。', 'Signed overflow: Cin xor Cout, or same-sign operands giving opposite sign.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) { return { ...c, a: randInt(c.width), b: randInt(c.width) }; },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const min = -(2 ** (config.width - 1)), max = 2 ** (config.width - 1) - 1;
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <input className="txt" type="number" min={3} max={16} value={config.width} onChange={(e) => {
            const w = Math.max(3, Math.min(16, Math.floor(Number(e.target.value) || 8)));
            const lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1;
            onChange({ ...config, width: w, a: Math.max(lo, Math.min(hi, config.a)), b: Math.max(lo, Math.min(hi, config.b)) });
          }} style={{ width: 64 }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>{`[${min}, ${max}]`}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>A</span><input className="txt" type="number" value={config.a} onChange={(e) => onChange({ ...config, a: Math.max(min, Math.min(max, Math.trunc(Number(e.target.value) || 0))) })} style={{ width: 90 }} />
          </label>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#64748b' }}>+</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>B</span><input className="txt" type="number" value={config.b} onChange={(e) => onChange({ ...config, b: Math.max(min, Math.min(max, Math.trunc(Number(e.target.value) || 0))) })} style={{ width: 90 }} />
          </label>
          <button className="ghost" onClick={() => onChange({ ...config, a: randInt(config.width), b: randInt(config.width) })}>↻ {t(T('随机', 'Random'))}</button>
          <button className="ghost" onClick={() => onChange({ ...config, ...DEFAULT_CFG } as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  generate(cfg) { return gen(cfg); },
  Render({ scene: _scene, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const s = ((_scene as any) ?? {}) as Scene;
    const w = s.width ?? 8;
    const abits = Array.isArray(s.abits) ? s.abits : [];
    const bbits = Array.isArray(s.bbits) ? s.bbits : [];
    const sbits = Array.isArray(s.sbits) ? s.sbits : [];
    const carryIn = Array.isArray(s.carryIn) ? s.carryIn : [];
    const carryOut = Array.isArray(s.carryOut) ? s.carryOut : [];
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8 }}>
          <tbody>
            <BitRow label="A" bits={abits} hot={1} color="#1d4ed8" />
            <BitRow label="B" bits={bbits} hot={1} color="#15803d" />
            <tr>
              <td style={{ padding: '4px 10px', color: '#b45309', fontWeight: 700, textAlign: 'left' }}>{'进位'}</td>
              {carryIn.slice().reverse().map((c, i) => <td key={i} style={{ width: 30, textAlign: 'center', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: c ? '#b45309' : '#cbd5e1' }}>{c}</td>)}
            </tr>
            <BitRow label="和 S" bits={sbits} hot={0} color="#be185d" />
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <span>{`A=${s.a}, B=${s.b}`}</span>
          <span>{`S=${s.sumSigned} (无符号 ${s.sumUnsigned})`}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{`C_{in MSB}=${s.carryInMsb}, C_{out MSB}=${s.carryOutMsb}`}</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 900, color: s.overflow ? '#dc2626' : '#15803d' }}>
          {s.overflow
            ? (isZh ? '溢出! 同号相加得到异号' : 'OVERFLOW! same-sign in, opposite-sign out')
            : (isZh ? '未溢出' : 'No overflow')}
        </div>
      </div>
    ) as unknown as never;
  },
};
