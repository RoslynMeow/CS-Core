import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { defaultAlphabet } from '../../lib/alphabet';
import { loadGlobal } from '../../lib/alphabetStorage';

type Cfg = { width: number; bits: string };
const DEFAULT_CFG: Cfg = { width: 8, bits: '00001101' };
type Scene = {
  width: number;
  bits: number[]; // MSB first for display
  lsb: number[]; // LSB first for calc
  value: number;
  max: number;
  highlight: number | null; // index in MSB display
  partials: number[];
  overflow: boolean;
};

function parseBits(s: string): number[] | null {
  const t = s.trim();
  if (!t) return null;
  const arr: number[] = [];
  for (const ch of t) {
    if (ch !== '0' && ch !== '1') return null;
    arr.push(ch === '1' ? 1 : 0);
  }
  return arr;
}

function randBits(width: number): string {
  let out = '';
  for (let i = 0; i < width; i++) out += Math.random() < 0.5 ? '0' : '1';
  // avoid all zero often? keep as is, but ensure at least one 1 half time
  return out;
}

function expandFrames(width: number, bitsStr: string): Frame<Scene>[] {
  const msb = parseBits(bitsStr);
  const frames: Frame<Scene>[] = [];
  const max = Math.pow(2, width) - 1;

  if (!msb) {
    return [{ line: 0, caption: T('⚠ 仅允许 0/1', '⚠ Only 0/1 allowed'), scene: { width, bits: [], lsb: [], value: 0, max, highlight: null, partials: [], overflow: false } }];
  }
  // align length to width: pad or show warning but still evaluate
  let displayBits = [...msb];
  let overflow = false;
  if (displayBits.length !== width) overflow = true;
  // for calculation, use actual bits padded/truncated to width (left pad 0)
  const calcMSB = displayBits.length > width ? displayBits.slice(displayBits.length - width) : Array(width - displayBits.length).fill(0).concat(displayBits);
  const lsb = calcMSB.slice().reverse();
  const k = width;

  const sceneBase = (value: number, highlight: number | null, partials: number[]): Scene => ({
    width, bits: displayBits, lsb, value, max, highlight, partials, overflow,
  });

  // init
  frames.push({
    line: 0,
    caption: overflow
      ? T(`长度不符 $n=${width}$，按 ${width} 位对齐后 $b=${calcMSB.join('')}$`, `Length mismatch, aligned to $b=${calcMSB.join('')}$`)
      : T(`初始化 $y=0$，$n=${width}$，$b=${calcMSB.join('')}$`, `Init $y=0$, $n=${width}$, $b=${calcMSB.join('')}$`),
    scene: sceneBase(0, null, []),
  });

  let y = 0;
  const partials: number[] = [];
  // ensure first real frame after init
  if (overflow) {
    // already pushed, continue loop without duplicate init
  } else {
    // init already pushed with y=0
  }

  for (let i = 0; i < k; i++) {
    const bi = lsb[i];
    const weight = Math.pow(2, i);
    const term = bi * weight;
    // loop header
    frames.push({
      line: 1,
      caption: T(`$i=${i}$，$b_${i}=${bi}$，权 $2^{${i}}=${weight}$`, `$i=${i}$ $b_${i}=${bi}$ weight ${weight}`),
      scene: sceneBase(y, k - 1 - i, [...partials]),
    });
    y += term;
    partials.push(term);
    frames.push({
      line: 2,
      caption: T(`$y\\gets ${y - term}+${bi}\\cdot2^{${i}}=${y}$`, `$y\\gets ${y - term}+${bi}\\cdot2^{${i}}=${y}$`),
      scene: sceneBase(y, k - 1 - i, [...partials]),
    });
  }

  const bitsDisplay = calcMSB.join('');
  frames.push({
    line: 3,
    caption: overflow
      ? T(`完成：$U(b)=${y}$，截齐后 $b=${bitsDisplay}$，$y\\in[0,2^{${width}}-1]=[0,${max}]$`, `Done: $U(b)=${y}$ in $[0,${max}]$`)
      : T(`完成：$U(${bitsDisplay})=${y}$，$y\\in[0,2^{${width}}-1]=[0,${max}]$`, `Done: $U(${bitsDisplay})=${y}$ in $[0,${max}]$`),
    scene: sceneBase(y, null, [...partials]),
  });

  return frames;
}

export const unsignedIntModule: ModuleDef<Scene, Cfg> = {
  id: 'unsigned-int',
  title: T('无符号整数', 'Unsigned Integer'),
  desc: T('定长 $n$ 位 $b_{n-1}\\dots b_0$ 解释 $U(b)=\\sum b_i2^i$，$y\\in[0,2^n-1]$。', 'Fixed $n$ bits $U(b)=\\sum b_i2^i$, $y\\in[0,2^n-1]$.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) {
    return { ...c, bits: randBits(c.width) };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', letterSpacing: '.04em' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$n$" /></span>
            <input className="txt" type="number" min={2} max={16} value={config.width} onChange={e => {
              const w = Math.max(2, Math.min(16, Math.floor(Number(e.target.value) || 8)));
              // auto pad/truncate bits to new width
              let b = config.bits;
              if (b.length !== w) {
                if (b.length < w) b = '0'.repeat(w - b.length) + b;
                else b = b.slice(b.length - w);
              }
              onChange({ ...config, width: w, bits: b });
            }} style={{ width: 64 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>位</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '.04em' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$b$" /></span>
            <input className="txt" value={config.bits} onChange={e => onChange({ ...config, bits: e.target.value.replace(/[^01]/g, '') })} style={{ width: 140, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }} placeholder="0101" />
          </label>
          <button className="ghost" onClick={() => onChange({ ...config, bits: randBits(config.width) })}>
            ↻ {t(T('重新生成', 'Regenerate'))}
          </button>
          <button className="ghost" onClick={() => onChange(DEFAULT_CFG as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  code: [
    T('$y \\gets 0$', '$y \\gets 0$'),
    T('for $i \\gets 0$ to $n-1$:', 'for $i \\gets 0$ to $n-1$:'),
    T('  $y \\gets y + b_i\\cdot 2^i$', '  $y \\gets y + b_i\\cdot 2^i$'),
    T('return $y$ // $y\\in[0,2^n-1]$', 'return $y$ // $y\\in[0,2^n-1]$'),
  ],
  generate(cfg) { return expandFrames(cfg.width, cfg.bits); },
  Render({ scene }) {
    const global = loadGlobal();
    const defFor = (vals: number[]) => vals.map(v => (defaultAlphabet(2)[v] ?? String(v)));
    const custFor = (vals: number[]) => vals.map(v => {
      const img = global?.glyphs[v];
      return img ? ({ img } as const) : null;
    });

    // display bits are MSB order
    const msbVals = scene.bits;
    const defGlyphs = defFor(msbVals);
    const custGlyphs = custFor(msbVals);
    // weights row
    const weights = msbVals.map((_, idx) => Math.pow(2, msbVals.length - 1 - idx));

    const pct = scene.max > 0 ? Math.min(100, Math.max(0, (scene.value / scene.max) * 100)) : 0;

    const RowDef = () => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>数码</span>
        {defGlyphs.length === 0 ? <span style={{ color: '#94a3b8' }}>—</span> : defGlyphs.map((g, i) => {
          const active = scene.highlight === i;
          return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>{g}</strong></div>;
        })}
      </div>
    );
    const RowCust = () => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>手绘</span>
        {custGlyphs.length === 0 ? <span style={{ color: '#94a3b8' }}>—</span> : custGlyphs.map((g, i) => {
          const active = scene.highlight === i;
          return (
            <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: g ? 'solid' : 'dashed' }}>
              {g && typeof g === 'object' ? <img src={g.img} alt="g" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}
            </div>
          );
        })}
      </div>
    );

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <RowDef />
        <RowCust />
        {/* weights */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>权</span>
          {weights.map((w, i) => {
            const active = scene.highlight === i;
            return <div key={i} style={{ width: 44, textAlign: 'center', fontSize: 11, color: active ? '#4f46e5' : '#94a3b8', fontWeight: active ? 800 : 500 }}>{w}</div>;
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 2 }}>
          <MathText text={`$U(b)=${scene.value}$`} />
          {scene.partials.length > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>({scene.partials.join(' + ')})</span>}
        </div>

        {/* range bar */}
        <div style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
            <span><MathText text="$0$" /></span>
            <span><MathText text={`$2^{${scene.width}}-1=${scene.max}$`} /></span>
          </div>
          <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginTop: 4, position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: scene.overflow ? '#ef4444' : 'linear-gradient(90deg,#6366f1,#06b6d4)', transition: 'width .3s' }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: scene.overflow ? '#ef4444' : '#64748b', marginTop: 4 }}>
            {scene.overflow ? '⚠ 位数与位宽不符' : <MathText text={`$y=${scene.value}$ · 占比 ${pct.toFixed(1)}\\%`} />}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          <MathText text={`$\\mathcal I_{\\mathbb N}(b)=\\sum_{i=0}^{n-1} b_i2^i$ · $\\mathbb B^n\\to[0,2^n-1]$`} />
        </div>
      </div>
    ) as unknown as never;
  },
};
