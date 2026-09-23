import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

// 浮点数: IEEE 754 格式解析 + 浮点加法四步 (config 驱动)

type Cfg = { val: string };
const DEFAULT_CFG: Cfg = { val: '3.14' };

function ieee32(x: number) {
  const f = new Float32Array([x]);
  const u = new Uint32Array(f.buffer);
  const bits = u[0] >>> 0;
  const sign = bits >>> 31;
  const exp = (bits >>> 23) & 0xff;
  const frac = bits & 0x7fffff;
  const kind = exp === 255 ? (frac ? 'NaN' : 'Inf') : exp === 0 ? (frac ? 'subnormal' : 'zero') : 'normal';
  const unbiased = kind === 'normal' ? exp - 127 : '—';
  return { bits, sign, exp, frac, unbiased, kind, hex: bits.toString(16).toUpperCase().padStart(8, '0'), bin: bits.toString(2).padStart(32, '0') };
}

function gen(_cfg: Cfg): Frame<Record<string, never>>[] {
  return [{ line: 0, caption: T('IEEE 754 单精度解析', 'IEEE 754 single precision'), scene: {} }];
}

export const floatOpsModule: ModuleDef<Record<string, never>, Cfg> = {
  id: 'float-ops',
  title: T('浮点运算', 'Floating Point'),
  desc: T('IEEE 754 单精度 1+8+23, 偏置 127; 浮点加法: 对阶 → 尾数相加 → 规格化 → 舍入。', 'IEEE 754 fields and floating-point addition steps.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
      
        <input className="txt" value={config.val} onChange={(e) => onChange({ ...config, val: e.target.value })} style={{ width: 140, fontFamily: 'ui-monospace, monospace' }} />
        <button className="ghost" onClick={() => onChange({ ...config, val: '0.1' })}>0.1</button>
        <button className="ghost" onClick={() => onChange({ ...config, val: '0.2' })}>0.2</button>
        <button className="ghost" onClick={() => onChange({ ...config, val: '-2.5' })}>-2.5</button>
      </div>
    ) as unknown as never;
  },
  generate: gen,
  Render({ config: _cfg, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const x = Number(_cfg?.val);
    const ok = Number.isFinite(x) || x === Infinity || x === -Infinity || Number.isNaN(x);
    const v = ieee32(Number.isFinite(x) ? x : (Number.isNaN(x) ? NaN : x));
    const steps: [string, string][] = isZh
      ? [
        ['1. 规格化', '1.5 = 1.1₂ × 2⁰; 0.75 = 1.1₂ × 2⁻¹'],
        ['2. 对阶', '小阶向大阶看齐: 0.75 → 0.11₂ × 2⁰ (尾数右移 1 位, 阶 +1)'],
        ['3. 尾数相加', '1.10₂ + 0.11₂ = 10.01₂'],
        ['4. 规格化', '10.01₂ = 1.001₂ × 2¹ (阶 ← 1)'],
        ['5. 舍入', '1.001₂ × 2¹ = 2.25 (本例精确; 0.1/0.2 因二进制无限循环需舍入)'],
      ]
      : [
        ['1. Normalize', '1.5 = 1.1₂ × 2⁰; 0.75 = 1.1₂ × 2⁻¹'],
        ['2. Align', 'smaller exp up: 0.75 → 0.11₂ × 2⁰'],
        ['3. Add mantissas', '1.10₂ + 0.11₂ = 10.01₂'],
        ['4. Normalize', '10.01₂ = 1.001₂ × 2¹'],
        ['5. Round', '1.001₂ × 2¹ = 2.25 (exact here; 0.1/0.2 rounds)'],
      ];
    const field = (label: string, val: string, color: string, bg: string, w: number) => (
      <div style={{ flexGrow: w, flexBasis: 0, background: bg, borderRight: '1px solid #cbd5e1', padding: '6px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color }}>{label}</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 800, color, wordBreak: 'break-all', letterSpacing: 0.5 }}>{val}</div>
      </div>
    );
    return (
      <div style={{ display: 'grid', gap: 12, maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 12, color: '#475569' }}>
          <b>{isZh ? '格式' : 'Format'}</b>: sign(1) | exponent(8, bias 127) | fraction(23) — {isZh ? '隐含前导 1' : 'implicit leading 1'}
        </div>
        {ok ? (
          <>
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: 10, overflow: 'hidden' }}>
              {field('sign', `${v.sign}`, '#be185d', '#fce7f3', 1)}
              {field('exponent', `${v.exp} (b=${v.unbiased})`, '#0369a1', '#e0f2fe', 2)}
              {field('fraction', v.bin.slice(9), '#6d28d9', '#ede9fe', 6)}
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>
              {`x=${_cfg?.val} → 0x${v.hex}  (kind=${v.kind})`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {v.bin.split('').map((b, i) => (
                <span key={i} style={{ width: 16, textAlign: 'center', fontFamily: 'ui-monospace, monospace', fontSize: 12, color: i === 0 ? '#be185d' : i < 9 ? '#0369a1' : '#6d28d9' }}>{b}</span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{isZh ? '输入一个十进制数' : 'enter a decimal number'}</div>
        )}
        <div style={{ fontWeight: 800, color: '#334155', fontSize: 13 }}>{isZh ? '浮点加法四步 (示例 1.5 + 0.75)' : 'FP addition (1.5 + 0.75)'}</div>
        <div style={{ display: 'grid', gap: 4 }}>
          {steps.map(([k, d], i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', borderRadius: 10, background: i === steps.length - 1 ? '#dcfce7' : '#f8fafc', border: `1px solid ${i === steps.length - 1 ? '#16a34a' : '#e2e8f0'}`, fontSize: 13 }}>
              <span style={{ fontWeight: 800, color: '#4338ca', minWidth: 92 }}>{k}</span>
              <span style={{ color: '#334155' }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>
          <MathText text={isZh ? '$\\text{值} = (-1)^s \\times 1.f \\times 2^{e-127}$' : '$value = (-1)^s \\times 1.f \\times 2^{e-127}$'} />
        </div>
      </div>
    ) as unknown as never;
  },
};
