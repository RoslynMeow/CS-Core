import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

// 原码 / 反码 / 补码 / 移码 对比 (单帧, config 驱动)

type Cfg = { width: number; bits: string };
const DEFAULT_CFG: Cfg = { width: 8, bits: '10000101' };
type Scene = { width: number; bits: number[]; unsigned: number; sign: number; mag: number; codes: { name: string; en: string; value: number; note: string }[]; overflow: boolean };

function parseBits(s: string): number[] | null {
  const t = s.trim();
  if (!t) return null;
  const a: number[] = [];
  for (const ch of t) if (ch !== '0' && ch !== '1') return null; else a.push(ch === '1' ? 1 : 0);
  return a;
}
function randBits(w: number): string {
  let o = '';
  for (let i = 0; i < w; i++) o += Math.random() < 0.5 ? '0' : '1';
  return o;
}

function build(cfg: Cfg): Scene {
  const parsed = parseBits(cfg.bits) ?? [];
  const width = cfg.width;
  const overflow = parsed.length !== width;
  const bits = parsed.length > width ? parsed.slice(parsed.length - width) : [...Array(Math.max(0, width - parsed.length)).fill(0), ...parsed];
  const unsigned = bits.reduce((s, b) => s * 2 + b, 0);
  const sign = bits[0] ?? 0;
  const mag = bits.slice(1).reduce((s, b) => s * 2 + b, 0);
  const half = 2 ** (width - 1);
  const maxMag = half - 1;
  const codes = [
    { name: '原码', en: 'Sign-Magnitude', value: sign ? -mag : mag, note: '符号位 + 绝对值; 双零 (±0)' },
    { name: '反码', en: "One's Complement", value: sign ? -(maxMag - mag) : mag, note: '负数逐位取反; 双零' },
    { name: '补码', en: "Two's Complement", value: -sign * half + mag, note: '反码 + 1; 唯一零, 范围不对称' },
    { name: '移码', en: 'Biased', value: unsigned - half, note: '无符号值 − 偏置; 与真值同序, 用于阶码' },
  ];
  return { width, bits, unsigned, sign, mag, codes, overflow };
}

function gen(cfg: Cfg): Frame<Scene>[] {
  return [{ line: 0, caption: T('原码 / 反码 / 补码 / 移码 对比', 'Sign-Magnitude / One\'s / Two\'s / Biased'), scene: build(cfg) }];
}

export const signRepresentationModule: ModuleDef<Scene, Cfg> = {
  id: 'sign-representation',
  title: T('原码/反码/移码', 'Sign Codes'),
  desc: T('同一 $n$ 位模式在原码 / 反码 / 补码 / 移码下的真值对比; 双零与单调序。', 'Same bit pattern under sign-magnitude / one\'s / two\'s / biased.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) { return { ...c, bits: randBits(c.width) }; },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <input className="txt" type="number" min={3} max={16} value={config.width} onChange={(e) => {
            const w = Math.max(3, Math.min(16, Math.floor(Number(e.target.value) || 8)));
            let b = config.bits;
            if (b.length !== w) b = b.length < w ? '0'.repeat(w - b.length) + b : b.slice(b.length - w);
            onChange({ ...config, width: w, bits: b });
          }} style={{ width: 64 }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>{isZh ? '位' : 'bits'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <input className="txt" value={config.bits} onChange={(e) => onChange({ ...config, bits: e.target.value.replace(/[^01]/g, '') })} style={{ width: 160, fontFamily: 'ui-monospace, monospace' }} />
          <button className="ghost" onClick={() => onChange({ ...config, bits: randBits(config.width) })}>↻ {t(T('随机', 'Random'))}</button>
          <button className="ghost" onClick={() => onChange({ ...config, ...DEFAULT_CFG } as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  generate(cfg) { return gen(cfg); },
  Render({ scene: _scene, t }) {
    const s = ((_scene as any) ?? {}) as Scene;
    const isZh = t(T('中文', 'en')) !== 'en';
    const notes: Record<string, [string, string]> = {
      '原码': ['符号位 + 绝对值; 双零 (±0)', 'sign + magnitude; two zeros (±0)'],
      '反码': ['负数逐位取反; 双零', 'negatives bit-inverted; two zeros'],
      '补码': ['反码 + 1; 唯一零, 范围不对称', "one's + 1; unique zero, asymmetric range"],
      '移码': ['无符号值 − 偏置; 与真值同序, 用于阶码', 'unsigned − bias; monotone; used for exponents'],
    };
    const bits = Array.isArray(s.bits) ? s.bits : [];
    const codes = Array.isArray(s.codes) ? s.codes : [];
    const half = 2 ** ((s.width ?? 8) - 1);
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          {bits.map((b, i) => (
            <div key={i} className="digit" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: i === 0 ? '#f59e0b' : undefined, background: i === 0 ? '#fffbeb' : '#fff' }}>
              <strong style={{ color: i === 0 ? '#d97706' : undefined }}>{b}</strong>
            </div>
          ))}
          <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>{isZh ? (s.sign ? '符号位 = 1 (负)' : '符号位 = 0 (正)') : (s.sign ? 'sign = 1 (−)' : 'sign = 0 (+)')}</span>
        </div>
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11 }}>
              <th style={{ padding: '5px 12px', textAlign: 'left' }}>{'编码'}</th>
              <th style={{ padding: '5px 12px' }}>{'真值'}</th>
              <th style={{ padding: '5px 12px', textAlign: 'left' }}>{'说明'}</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c, i) => (
              <tr key={i} style={{ background: c.name === '补码' ? '#f0fdf4' : '#fff' }}>
                <td style={{ padding: '6px 12px', fontWeight: 700, color: '#0f172a' }}>{c.name} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>{c.en}</span></td>
                <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 800, color: '#4338ca', fontFamily: 'ui-monospace, monospace' }}>{c.value}</td>
                <td style={{ padding: '6px 12px', color: '#475569', fontSize: 12 }}>{notes[c.name] ? (isZh ? notes[c.name][0] : notes[c.name][1]) : c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>
          <MathText text={`$U=${s.unsigned}$ · $n=${s.width}$ · $\\text{偏置}=2^{${(s.width ?? 8) - 1}}=${half}$ · $\\text{补码范围}[-${half},${half - 1}]$`} />
        </div>
      </div>
    ) as unknown as never;
  },
};
