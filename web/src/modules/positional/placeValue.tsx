import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

// 位权 (Place Value): 同一数码在不同位置, 权不同 n^i, 贡献 P_i·n^i
type Cfg = { base: number; numeral: string };
type Scene = {
  base: number;
  digits: number[];   // MSB first
  weights: number[];  // n^(k-1-idx)
  contribs: number[];
  value: number;
  invalid: boolean;
};

const DEFAULT_CFG: Cfg = { base: 10, numeral: '3507' };

function parse(numeral: string, base: number): number[] | null {
  const s = numeral.trim();
  if (!s) return null;
  const msb = s.split('').map((ch) => parseInt(ch, base));
  if (msb.some((v) => Number.isNaN(v) || v < 0 || v >= base)) return null;
  return msb;
}
function randNumeral(base: number, len: number): string {
  const pool = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < len; i++) s += pool[Math.floor(Math.random() * base)];
  if (s.length > 1 && s[0] === '0') s = pool[1 + Math.floor(Math.random() * (base - 1))] + s.slice(1);
  return s;
}
function build(cfg: Cfg): Scene {
  const msb = parse(cfg.numeral, cfg.base);
  if (!msb) return { base: cfg.base, digits: [], weights: [], contribs: [], value: 0, invalid: true };
  const k = msb.length;
  const weights = msb.map((_, idx) => cfg.base ** (k - 1 - idx));
  const contribs = msb.map((d, idx) => d * weights[idx]);
  return { base: cfg.base, digits: msb, weights, contribs, value: contribs.reduce((a, b) => a + b, 0), invalid: false };
}

export const placeValueModule: ModuleDef<Scene, Cfg> = {
  id: 'positional-place-value',
  title: T('位权', 'Place Value'),
  desc: T('位置不同则权不同：第 $i$ 位权 $n^i$，贡献 $P_i\\cdot n^i$，$y=\\sum P_i n^i$。', 'Position → weight $n^i$; $y=\\sum P_i n^i$.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) {
    const base = 2 + Math.floor(Math.random() * 15);
    return { ...c, base, numeral: randNumeral(base, 3 + Math.floor(Math.random() * 2)) };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>{t(T('进制', 'Base'))}</span>
          <input className="txt" type="number" min={2} max={36} value={config.base}
            onChange={(e) => {
              const base = Math.max(2, Math.min(36, Number(e.target.value) || 10));
              onChange({ ...config, base, numeral: randNumeral(base, config.numeral.trim().length || 4) });
            }} style={{ width: 72 }} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>{t(T('数码', 'Numeral'))}</span>
          <input className="txt" value={config.numeral} onChange={(e) => onChange({ ...config, numeral: e.target.value })} style={{ width: 120, fontFamily: 'ui-monospace, monospace' }} />
        </label>
        <button className="ghost" onClick={() => onChange({ ...config, numeral: randNumeral(config.base, config.numeral.trim().length || 4) })}>↻ {t(T('随机', 'Random'))}</button>
      </div>
    ) as unknown as never;
  },
  generate(cfg) {
    return [{ line: 0, caption: T('位权结果：$y=\\sum P_i\\cdot n^i$', 'Place value: $y=\\sum P_i n^i$'), scene: build(cfg) }] as Frame<Scene>[];
  },
  Render({ scene: _scene, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const s = ((_scene as any) ?? {}) as Scene;
    if (s.invalid || !Array.isArray(s.digits) || s.digits.length === 0) {
      return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>{isZh ? '输入合法的数码' : 'enter valid digits'}</div> as unknown as never;
    }
    const k = s.digits.length;
    return (
      <div style={{ display: 'grid', gap: 12, maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {s.digits.map((d, idx) => {
            const i = k - 1 - idx; // LSB index
            const hot = i === k - 1; // 最高位强调
            return (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{`第 ${i} 位`}</div>
                <div className="digit" style={{ width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hot ? '#eef2ff' : '#fff' }}>
                  <strong style={{ color: hot ? '#4338ca' : undefined }}>{d}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#0369a1', marginTop: 2 }}><MathText text={`$\\times ${s.base}^{${i}}$`} /></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>= {s.contribs[idx]}</div>
              </div>
            );
          })}
        </div>
        <table style={{ margin: '0 auto', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #e2e8f0' }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11 }}>
              <th style={{ padding: '5px 12px' }}>{isZh ? '位 i' : 'pos i'}</th>
              <th style={{ padding: '5px 12px' }}>{isZh ? '数码 P_i' : 'digit'}</th>
              <th style={{ padding: '5px 12px' }}>{isZh ? '权 n^i' : 'weight'}</th>
              <th style={{ padding: '5px 12px' }}>{isZh ? '贡献' : 'value'}</th>
            </tr>
          </thead>
          <tbody>
            {s.digits.map((d, idx) => {
              const i = k - 1 - idx;
              return (
                <tr key={idx}>
                  <td style={{ padding: '5px 12px', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>{i}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'center' }}>{d}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'center', color: '#0369a1' }}>{s.base ** i}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'center', color: '#b45309', fontWeight: 700 }}>{s.contribs[idx]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ textAlign: 'center', fontSize: 15 }}>
          <MathText text={`$(${s.digits.join('')})_{${s.base}} = ${s.contribs.join(' + ')} = ${s.value}_{10}$`} />
        </div>
      </div>
    ) as unknown as never;
  },
};
