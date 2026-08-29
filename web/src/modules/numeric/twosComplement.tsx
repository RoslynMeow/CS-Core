import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { defaultAlphabet } from '../../lib/alphabet';
import { loadGlobal } from '../../lib/alphabetStorage';

type Cfg = { width: number; bits: string };
const DEFAULT_CFG: Cfg = { width: 8, bits: '10000001' };
type Scene = {
  width: number;
  bits: number[]; // MSB first display
  lsb: number[];
  value: number;
  min: number;
  max: number;
  highlight: number | null;
  partials: number[];
  overflow: boolean;
};

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

function gen(width: number, bitsStr: string): Frame<Scene>[] {
  const msb = parseBits(bitsStr);
  const frames: Frame<Scene>[] = [];
  const min = -(2 ** (width - 1));
  const max = 2 ** (width - 1) - 1;
  if (!msb) return [{ line: 0, caption: T('! 仅允许 0/1', '! Only 0/1'), scene: { width, bits: [], lsb: [], value: 0, min, max, highlight: null, partials: [], overflow: false } }];

  const display = [...msb];
  const overflow = display.length !== width;
  const calcMSB = display.length > width ? display.slice(display.length - width) : Array(width - display.length).fill(0).concat(display);
  const lsb = calcMSB.slice().reverse();

  const scene = (value: number, highlight: number | null, partials: number[]): Scene => ({
    width, bits: display, lsb, value, min, max, highlight, partials, overflow,
  });

  frames.push({
    line: 0,
    caption: overflow
      ? T(`长度不符 $n=${width}$，对齐后 $b=${calcMSB.join('')}$`, `Length mismatch aligned $b=${calcMSB.join('')}$`)
      : T(`初始化 $y=0$，$n=${width}$，$b=${calcMSB.join('')}$`, `Init $y=0$, $n=${width}$`),
    scene: scene(0, null, []),
  });

  let y = 0;
  const partials: number[] = [];
  // low bits 0 .. n-2
  for (let i = 0; i < width - 1; i++) {
    const bi = lsb[i];
    const w = 2 ** i;
    const term = bi * w;
    frames.push({
      line: 1,
      caption: T(`$i=${i}$，$b_${i}=${bi}$，权 $2^{${i}}=${w}$`, `$i=${i}$ $b_${i}=${bi}$ weight ${w}`),
      scene: scene(y, width - 1 - i, [...partials]),
    });
    y += term;
    partials.push(term);
    frames.push({
      line: 2,
      caption: T(`$y\\gets ${y - term}+${bi}\\cdot2^{${i}}=${y}$`, `$y\\gets ${y - term}+${bi}\\cdot2^{${i}}=${y}$`),
      scene: scene(y, width - 1 - i, [...partials]),
    });
  }
  // sign bit
  const bn = lsb[width - 1];
  const wSign = 2 ** (width - 1);
  frames.push({
    line: 3,
    caption: T(`符号位 $b_{${width - 1}}=${bn}$，权 $-2^{${width - 1}}=-${wSign}$`, `sign $b_{${width - 1}}=${bn}$ weight $-${wSign}$`),
    scene: scene(y, 0, [...partials]),
  });
  const termSign = -bn * wSign;
  y += termSign;
  partials.push(termSign);
  frames.push({
    line: 3,
    caption: T(`$y\\gets ${y - termSign}+(${bn}\\cdot-${wSign})=${y}$`, `$y\\gets ${y - termSign}+${termSign}=${y}$`),
    scene: scene(y, 0, [...partials]),
  });

  frames.push({
    line: 4,
    caption: T(`完成：$T(${calcMSB.join('')})=${y}$，$y\\in[${min},${max}]$`, `Done: $T(${calcMSB.join('')})=${y}$ in $[${min},${max}]$`),
    scene: scene(y, null, [...partials]),
  });

  return frames;
}

export const twosComplementModule: ModuleDef<Scene, Cfg> = {
  id: 'twos-complement',
  title: T('补码', 'Two\'s Complement'),
  desc: T('有符号 $T(b)=-b_{n-1}2^{n-1}+\\sum_{i=0}^{n-2}b_i2^i$，$y\\in[-2^{n-1},2^{n-1}-1]$，消双零。', 'Signed $T(b)=-b_{n-1}2^{n-1}+\\sum b_i2^i$, $y\\in[-2^{n-1},2^{n-1}-1]$.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) { return { ...c, bits: randBits(c.width) }; },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$n$" /></span>
            <input className="txt" type="number" min={2} max={16} value={config.width} onChange={e => {
              const w = Math.max(2, Math.min(16, Math.floor(Number(e.target.value) || 8)));
              let b = config.bits;
              if (b.length !== w) b = b.length < w ? '0'.repeat(w - b.length) + b : b.slice(b.length - w);
              onChange({ ...config, width: w, bits: b });
            }} style={{ width: 64 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>位</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$b$" /></span>
            <input className="txt" value={config.bits} onChange={e => onChange({ ...config, bits: e.target.value.replace(/[^01]/g, '') })} style={{ width: 140, fontFamily: 'ui-monospace, monospace' }} />
          </label>
          <button className="ghost" onClick={() => onChange({ ...config, bits: randBits(config.width) })}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={() => onChange(DEFAULT_CFG as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  code: [
    T('$y \\gets 0$', '$y \\gets 0$'),
    T('for $i \\gets 0$ to $n-2$:', 'for $i \\gets 0$ to $n-2$:'),
    T('  $y \\gets y + b_i\\cdot 2^i$', '  $y \\gets y + b_i\\cdot 2^i$'),
    T('$y \\gets y - b_{n-1}\\cdot 2^{n-1}$ // 符号负权', '$y \\gets y - b_{n-1}\\cdot 2^{n-1}$'),
    T('return $y$ // $y\\in[-2^{n-1},2^{n-1}-1]$', 'return $y$'),
  ],
  generate(cfg) { return gen(cfg.width, cfg.bits); },
  Render({ scene }) {
    const global = loadGlobal();
    const defFor = (vals: number[]) => vals.map(v => defaultAlphabet(2)[v] ?? String(v));
    const custFor = (vals: number[]) => vals.map(v => {
      const img = global?.glyphs[v];
      return img ? ({ img } as const) : null;
    });
    const defGlyphs = defFor(scene.bits);
    const custGlyphs = custFor(scene.bits);
    const weights = scene.bits.map((_, idx) => {
      const i = scene.bits.length - 1 - idx;
      if (i === scene.width - 1) return -(2 ** i);
      return 2 ** i;
    });

    // range bar: min .. max centered
    const range = scene.max - scene.min;
    const pct = range > 0 ? ((scene.value - scene.min) / range) * 100 : 50;
    const zeroPct = range > 0 ? ((-scene.min) / range) * 100 : 50;

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>数码</span>
          {defGlyphs.map((g, i) => {
            const isSign = i === 0;
            const active = scene.highlight === i;
            return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: isSign ? '#f59e0b' : undefined, background: isSign ? '#fffbeb' : '#fff' }}><strong style={{ color: isSign ? '#d97706' : undefined }}>{g}</strong></div>;
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>手绘</span>
          {custGlyphs.map((g, i) => {
            const isSign = i === 0;
            const active = scene.highlight === i;
            return (
              <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: g ? 'solid' : 'dashed', borderColor: isSign ? '#f59e0b' : undefined, background: isSign ? '#fffbeb' : '#fff' }}>
                {g && typeof g === 'object' ? <img src={g.img} alt="g" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>权</span>
          {weights.map((w, i) => {
            const active = scene.highlight === i;
            const isSign = i === 0;
            return <div key={i} style={{ width: 44, textAlign: 'center', fontSize: 11, color: active ? (isSign ? '#d97706' : '#4f46e5') : '#94a3b8', fontWeight: active ? 800 : 500 }}>{w}</div>;
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <MathText text={`$T(b)=${scene.value}$`} />
          {scene.partials.length > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>({scene.partials.join(' + ')})</span>}
        </div>

        <div style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
            <span><MathText text={`$${scene.min}$`} /></span>
            <span><MathText text={`$0$`} /></span>
            <span><MathText text={`$${scene.max}$`} /></span>
          </div>
          <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, marginTop: 4, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: `${zeroPct}%`, top: 0, bottom: 0, width: 2, background: '#94a3b8' }} />
            <div style={{ position: 'absolute', left: `${Math.min(pct, zeroPct)}%`, width: `${Math.abs(pct - zeroPct)}%`, height: '100%', background: 'linear-gradient(90deg,#f59e0b,#ef4444)', opacity: 0.9, transition: 'all .3s' }} />
            <div style={{ position: 'absolute', left: `${pct}%`, top: -2, width: 8, height: 14, marginLeft: -4, background: '#0f172a', borderRadius: 2, transform: 'translateY(-1px)' }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', marginTop: 4 }}>
            <MathText text={`$y=${scene.value}$ · $[-2^{${scene.width - 1}},2^{${scene.width - 1}}-1]$`} />
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          <MathText text={`$\\mathcal I_{\\mathbb Z}(b)=-b_{n-1}2^{n-1}+\\sum_{i=0}^{n-2}b_i2^i$`} />
        </div>
      </div>
    ) as unknown as never;
  },
};
