import { T } from '../../i18n/lang';
import type { FramesOrInfinite, ModuleDef, Frame } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { defaultAlphabet } from '../../lib/alphabet';
import { loadGlobal } from '../../lib/alphabetStorage';


type Mode = 'expansion' | 'successor' | 'addition';
type Cfg = { base: number; numeral: string; numeralB: string; mode: Mode };
const DEFAULT_CFG: Cfg = { base: 10, numeral: '19', numeralB: '27', mode: 'successor' };
type Scene = { base: number; digits: number[]; digitsB?: number[]; res?: number[]; value?: number; highlight: number | null; partials?: number[]; carry?: number | boolean; i?: number | null };

function parseLSB(s: string, base: number): number[] | null {
  const msb = s.trim().split('').map(ch => parseInt(ch, base));
  if (msb.length === 0 || msb.some(v => Number.isNaN(v) || v < 0 || v >= base)) return null;
  return msb.reverse();
}
function glyphsFor(digits: number[]): (string | { img: string })[] {
  const g = loadGlobal();
  return digits.map(d => {
    const img = g?.glyphs[d];
    if (img) return { img } as const;
    // fallback to default alphabet char for current base length? use digit value directly via pool
    // find default char for this value regardless of base size
    const pool = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
    return pool[d] ?? String(d);
  });
}
function defaultGlyphs(digits: number[], base: number): string[] {
  const def = defaultAlphabet(base);
  return digits.map(d => def[d] ?? String(d));
}

const CODE: Record<Mode, ReturnType<NonNullable<ModuleDef['codeFor']>>> = {
  expansion: [
    T('$y \\gets 0$', '$y \\gets 0$'),
    T('for $i \\gets 0$ to $k-1$:', 'for $i \\gets 0$ to $k-1$:'),
    T('  $y \\gets y + P_i\\cdot n^i$', '  $y \\gets y + P_i\\cdot n^i$'),
    T('return $y$', 'return $y$'),
  ] as never,
  successor: [
    T('$i \\gets 0$', '$i \\gets 0$'),
    T('while $P_i = n-1$:', 'while $P_i = n-1$:'),
    T('  $P_i \\gets 0$', '  $P_i \\gets 0$'),
    T('  $i \\gets i+1$', '  $i \\gets i+1$'),
    T('$P_i \\gets P_i+1$', '$P_i \\gets P_i+1$'),
  ] as never,
  addition: [
    T('$c \\gets 0;\\; i \\gets 0$', '$c \\gets 0;\\; i \\gets 0$'),
    T('while $i < k$:', 'while $i < k$:'),
    T('  $s \\gets P_i+Q_i+c$', '  $s \\gets P_i+Q_i+c$'),
    T('  $R_i \\gets s \\bmod n$', '  $R_i \\gets s \\bmod n$'),
    T('  $c \\gets \\lfloor s/n\\rfloor$', '  $c \\gets \\lfloor s/n\\rfloor$'),
    T('  $i \\gets i+1$', '  $i \\gets i+1$'),
    T('$c=1 \\implies R_k\\gets1$', '$c=1 \\implies R_k\\gets1$'),
  ] as never,
};

function expansionFrames(base: number, numeral: string): Frame<Scene>[] {
  const lsb = parseLSB(numeral, base);
  if (!lsb) return [{ line: 0, caption: T('⚠ 数码不合法', '⚠ Invalid digits'), scene: { base, digits: [], highlight: null } }];
  const k = lsb.length;
  let y = 0; const partials: number[] = [];
  const frames: Frame<Scene>[] = [];
  frames.push({ line: 0, caption: T(`初始化 $y=0$，$n=${base}$，$P=${numeral}$`, `Init $y=0$, $n=${base}$, $P=${numeral}$`), scene: { base, digits: lsb.slice().reverse(), value: 0, highlight: null, partials: [] } });
  for (let i = 0; i < k; i++) {
    const term = lsb[i] * Math.pow(base, i);
    frames.push({ line: 1, caption: T(`$i=${i}$，$P_${i}=${lsb[i]}$，权 $n^{${i}}=${Math.pow(base, i)}$`, `$i=${i}$ $P_${i}=${lsb[i]}$ weight ${Math.pow(base, i)}$`), scene: { base, digits: lsb.slice().reverse(), value: y, highlight: k - 1 - i, partials: [...partials] } });
    y += term; partials.push(term);
    frames.push({ line: 2, caption: T(`$y\\gets${y - term}+${lsb[i]}\\cdot${base}^{${i}}=${y}$`, `$y\\gets${y - term}+${lsb[i]}\\cdot${base}^{${i}}=${y}$`), scene: { base, digits: lsb.slice().reverse(), value: y, highlight: k - 1 - i, partials: [...partials] } });
  }
  frames.push({ line: 3, caption: T(`完成：$(${numeral})_{${base}}=${y}_{10}$`, `Done: $(${numeral})_{${base}}=${y}_{10}$`), scene: { base, digits: lsb.slice().reverse(), value: y, highlight: null, partials } });
  return frames;
}

function additionFrames(base: number, aStr: string, bStr: string): Frame<Scene>[] {
  const aLSB = parseLSB(aStr, base), bLSB = parseLSB(bStr, base);
  if (!aLSB || !bLSB) return [{ line: 0, caption: T('⚠ 数码不合法', '⚠ Invalid'), scene: { base, digits: [], highlight: null } }];
  const k = Math.max(aLSB.length, bLSB.length);
  while (aLSB.length < k) aLSB.push(0);
  while (bLSB.length < k) bLSB.push(0);
  const res: number[] = []; let c = 0;
  const frames: Frame<Scene>[] = [];
  const scene = (i: number | null): Scene => ({ base, digits: aLSB.slice().reverse(), digitsB: bLSB.slice().reverse(), res: res.slice().reverse(), i, carry: c, highlight: i !== null ? (aLSB.length - 1 - i) : null } as Scene);
  frames.push({ line: 0, caption: T(`$c=0$, $A=${aStr}$, $B=${bStr}$, $n=${base}$`, `$c=0$, $A=${aStr}$, $B=${bStr}$`), scene: scene(null) });
  for (let i = 0; i < k; i++) {
    frames.push({ line: 1, caption: T(`列 $i=${i}$`, `col $i=${i}$`), scene: scene(i) });
    const s = aLSB[i] + bLSB[i] + c;
    frames.push({ line: 2, caption: T(`$s=${aLSB[i]}+${bLSB[i]}+${c}=${s}$`, `$s=${aLSB[i]}+${bLSB[i]}+${c}=${s}$`), scene: scene(i) });
    res[i] = s % base;
    frames.push({ line: 3, caption: T(`$R_${i}=${s}\\bmod${base}=${res[i]}$`, `$R_${i}=${s}\\bmod${base}=${res[i]}$`), scene: { base, digits: aLSB.slice().reverse(), digitsB: bLSB.slice().reverse(), res: res.slice().reverse(), i, carry: c, highlight: aLSB.length - 1 - i } });
    c = Math.floor(s / base);
    frames.push({ line: 4, caption: T(`$c=\\lfloor${s}/${base}\\rfloor=${c}$`, `$c=\\lfloor${s}/${base}\\rfloor=${c}$`), scene: { base, digits: aLSB.slice().reverse(), digitsB: bLSB.slice().reverse(), res: res.slice().reverse(), i, carry: c, highlight: aLSB.length - 1 - i } });
    frames.push({ line: 5, caption: T(`$i\\gets${i + 1}$`, `$i\\gets${i + 1}$`), scene: { base, digits: aLSB.slice().reverse(), digitsB: bLSB.slice().reverse(), res: res.slice().reverse(), i, carry: c, highlight: null } });
  }
  if (c === 1) { res.push(1); frames.push({ line: 6, caption: T(`末进位 $R_${k}=1$`, `final carry`), scene: { base, digits: aLSB.slice().reverse(), digitsB: bLSB.slice().reverse(), res: res.slice().reverse(), i: k, carry: 0, highlight: null } }); }
  else frames.push({ line: 6, caption: T(`$c=0$ 结束`, `done`), scene: scene(null) });
  return frames;
}

function successorInfinite(base: number, numeral: string): FramesOrInfinite<Scene> {
  const orig = parseLSB(numeral, base);
  if (!orig) return { frames: [{ line: 0, caption: T('⚠ 数码不合法', '⚠ Invalid'), scene: { base, digits: [], highlight: null } }], extend: () => [] };
  let p = [...orig, 0, 0, 0]; // extend space
  const origLen = orig.length;
  let curTrim = () => { let k = p.length; while (k > origLen && p[k - 1] === 0) k--; if (k === 0) k = 1; return p.slice(0, k).reverse(); };
  let step = 0;
  const frames: Frame<Scene>[] = [];
  const initDigits = curTrim();
  frames.push({ line: 0, caption: T(`起始 $P=${numeral}$, $n=${base}$, $i\\gets0$`, `start $P=${numeral}$`), scene: { base, digits: initDigits, highlight: initDigits.length - 1, i: 0, carry: false } });

  const oneStep = (): Frame<Scene>[] => {
    const out: Frame<Scene>[] = [];
    let i = 0;
    while (true) {
      const cur = curTrim();
      const hi = cur.length - 1 - i;
      const pi = p[i] ?? 0;
      out.push({ line: 1, caption: T(`判断 $P_${i}=${pi}$ ?= $n-1=${base - 1}$`, `check $P_${i}=${pi}$`), scene: { base, digits: cur, highlight: hi, i, carry: pi === base - 1 } });
      if (pi === base - 1) {
        p[i] = 0;
        const afterZero = curTrim();
        out.push({ line: 2, caption: T(`$P_${i}=n-1$ → $0$ 进位`, `zero carry`), scene: { base, digits: afterZero, highlight: afterZero.length - 1 - i, i, carry: true } });
        i++;
        if (i >= p.length) p.push(0);
        const afterInc = curTrim();
        const hi2 = afterInc.length - 1 - i;
        out.push({ line: 3, caption: T(`$i\\gets${i}$`, `$i\\gets${i}$`), scene: { base, digits: afterInc, highlight: hi2 < 0 ? afterInc.length - 1 : hi2, i, carry: true } });
      } else break;
    }
    const before = p[i] ?? 0;
    p[i] = before + 1;
    const after = curTrim();
    out.push({ line: 4, caption: T(`$P_${i}:${before}\\to${p[i]}$，第 ${++step} 次后继`, `succ #${step}`), scene: { base, digits: after, highlight: after.length - 1 - i, i, carry: false } });
    const next = curTrim();
    out.push({ line: 0, caption: T(`回到 $i\\gets0$ 准备下一次 +1`, `reset $i\\gets0$`), scene: { base, digits: next, highlight: next.length - 1, i: 0, carry: false } });
    return out;
  };

  // first 3 increments eagerly
  for (let k = 0; k < 3; k++) frames.push(...oneStep());

  return {
    frames,
    extend: () => oneStep(),
  };
}

function randNumeral(base: number, len = 2 + Math.floor(Math.random() * 3)): string {
  const pool = defaultAlphabet(base);
  let s = '';
  for (let i = 0; i < len; i++) s += pool[Math.floor(Math.random() * base)];
  // avoid leading zero for multi-digit
  if (s.length > 1 && s[0] === pool[0]) s = pool[1 + Math.floor(Math.random() * (base - 1))] + s.slice(1);
  return s;
}
export const positionalCoreModule: ModuleDef<Scene, Cfg> = {
  id: 'positional-system',
  title: T('位置记数系统', 'Positional System'),
  desc: T('共享字符表 $S_n$ 的三合一：按权展开 · 后继 · 列式加法', 'Unified $S_n$: expansion · successor · addition'),
  tags: ['data-structures'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) {
    return { ...c, numeral: randNumeral(c.base), numeralB: c.mode === 'addition' ? randNumeral(c.base) : c.numeralB };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', letterSpacing: '.04em' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('进位制', 'Base'))}</span>
            <input className="txt" type="number" min={2} max={36} value={config.base} onChange={e => onChange({ ...config, base: Math.max(2, Math.min(36, Number(e.target.value) || 10)) })} style={{ width: 72 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('模式', 'Mode'))}</span>
            <select className="txt" value={config.mode} onChange={e => onChange({ ...config, mode: e.target.value as Mode })}>
              <option value="expansion">{t(T('按权展开', 'Expansion'))}</option>
              <option value="successor">{t(T('后继', 'Successor'))}</option>
              <option value="addition">{t(T('加法', 'Addition'))}</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '.04em' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('数码', 'Numeral'))} A</span>
            <input className="txt" value={config.numeral} onChange={e => onChange({ ...config, numeral: e.target.value })} style={{ width: 96 }} />
          </label>
          {config.mode === 'addition' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('数码', 'Numeral'))} B</span><input className="txt" value={config.numeralB} onChange={e => onChange({ ...config, numeralB: e.target.value })} style={{ width: 96 }} /></label>}
          <button className="ghost" onClick={() => onChange({ ...config, numeral: randNumeral(config.base), numeralB: config.mode === 'addition' ? randNumeral(config.base) : config.numeralB })}>
            ↻ {t(T('重新生成', 'Regenerate'))}
          </button>
          <button className="ghost" onClick={() => onChange(DEFAULT_CFG as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.mode] as never; },
  generate(cfg) {
    if (cfg.mode === 'expansion') return expansionFrames(cfg.base, cfg.numeral);
    if (cfg.mode === 'addition') return additionFrames(cfg.base, cfg.numeral, cfg.numeralB);
    return successorInfinite(cfg.base, cfg.numeral);
  },
  Render({ scene }) {
    const digits = scene.digits;
    const defGlyphs = defaultGlyphs(digits, scene.base);
    // custom pool: shared global 64
    const global = loadGlobal();
    const customGlyphsFor = (ds: number[]): (string | null | { img: string })[] => ds.map(d => {
      const img = global?.glyphs[d];
      return img ? ({ img } as const) : null;
    });
    const cust = customGlyphsFor(digits);
    const RowDef = ({ glyphs }: { glyphs: string[] }) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>数码</span>
        {glyphs.map((g, i) => {
          const active = scene.highlight === i;
          return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong>{g}</strong></div>;
        })}
      </div>
    );
    const RowCust = ({ glyphs }: { glyphs: (string | null | { img: string })[] }) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>手绘</span>
        {glyphs.map((g, i) => {
          const active = scene.highlight === i;
          return (
            <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 48, height: 48, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: g ? 'solid' : 'dashed' }}>
              {g && typeof g === 'object' ? <img src={g.img} alt="g" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}
            </div>
          );
        })}
      </div>
    );
    if (scene.digitsB) {
      const A = scene.digits;
      const B = scene.digitsB!;
      const R = scene.res ?? [];
      const hasCarry = !!scene.carry && scene.carry !== 0;
      const cols = Math.max(A.length, B.length, R.length + (hasCarry && R.length === Math.max(A.length, B.length) ? 1 : 0), R.length);
      const padEmpty = (arr: string[], len: number) => { const out: (string | null)[] = Array(len).fill(null); for (let j = 0; j < arr.length; j++) out[len - arr.length + j] = arr[j]; return out; };
      const padCustom = (arr: (string | null | { img: string })[], len: number) => { const out: (string | null | { img: string } | null)[] = Array(len).fill(null); for (let j = 0; j < arr.length; j++) out[len - arr.length + j] = arr[j]; return out; };
      const aDef = defaultGlyphs(A, scene.base);
      const bDef = defaultGlyphs(B, scene.base);
      const rDef = R.length ? defaultGlyphs(R, scene.base) : [];
      const aCust = customGlyphsFor(A);
      const bCust = customGlyphsFor(B);
      const rCust = R.length ? customGlyphsFor(R) : [];
      const aDefP = padEmpty(aDef as unknown as string[], cols) as string[];
      const bDefP = padEmpty(bDef as unknown as string[], cols) as string[];
      const rDefP = padEmpty(rDef as unknown as string[], cols) as unknown as string[];
      const aCustP = padCustom(aCust as never, cols);
      const bCustP = padCustom(bCust as never, cols);
      const rCustP = padCustom(rCust as never, cols);
      const carryDots: (string | null)[] = Array(cols).fill(null);
      const hasFinalCarry = !!scene.res && scene.res.length > Math.max(A.length, B.length) && scene.carry && scene.carry !== 0;
      if (hasFinalCarry) {
        carryDots[0] = '•';
      } else if (scene.carry && scene.carry !== 0 && scene.highlight !== null) {
        const pos = scene.highlight - 1;
        if (pos >= 0) carryDots[pos] = '•';
        else if (pos < 0) carryDots[0] = '•';
      } else if (scene.carry && scene.carry !== 0 && scene.i !== null && cols > 1) {
        const pos = cols - 2 - (scene.i as number);
        if (pos >= 0 && pos < cols) carryDots[pos] = '•';
      }
      const RowDefPad = ({ glyphs }: { glyphs: (string | null)[] }) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>数码</span>
          {glyphs.map((g, i) => {
            const active = scene.highlight === i;
            const isEmpty = g === null;
            return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: isEmpty ? 'dashed' : 'solid', background: isEmpty ? '#f8fafc' : '#fff' }}>{isEmpty ? null : <strong>{g}</strong>}</div>;
          })}
        </div>
      );
      const RowCustPad = ({ glyphs }: { glyphs: (string | null | { img: string } | null)[] }) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>手绘</span>
          {glyphs.map((g, i) => {
            const active = scene.highlight === i;
            const isEmpty = g === null;
            return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 48, height: 48, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: isEmpty ? 'dashed' : 'solid', background: isEmpty ? '#f8fafc' : '#fff' }}>{isEmpty ? null : typeof g === 'string' ? <strong>{g}</strong> : g && typeof g === 'object' ? <img src={(g as { img: string }).img} alt="g" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}</div>;
          })}
        </div>
      );
      return (
        <div style={{ display: 'grid', gap: 6 }}>
          <RowDefPad glyphs={aDefP as never} /><RowCustPad glyphs={aCustP as never} />
          <div style={{ height: 4 }} />
          <RowDefPad glyphs={bDefP as never} /><RowCustPad glyphs={bCustP as never} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', height: 14 }}>
            <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }} />
            {carryDots.map((d, i) => <div key={i} style={{ width: 48, textAlign: 'center', fontSize: 16, lineHeight: '14px', color: '#ef4444', fontWeight: 900 }}>{d ?? ''}</div>)}
          </div>
          <div style={{ borderTop: '1px solid #cbd5e1', margin: '0 0 2px' }} />
          {rDefP.some(v => v !== null) && <><RowDefPad glyphs={rDefP as never} /><RowCustPad glyphs={rCustP as never} /></>}
          <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 6 }}><MathText text={`$c=${scene.carry ?? 0}$`} /></div>
        </div>
      ) as unknown as never;
    }
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <RowDef glyphs={defGlyphs} />
        <RowCust glyphs={cust} />
        {scene.value !== undefined && <div style={{ textAlign: 'center', marginTop: 4 }}><MathText text={`$y=${scene.value}$`} /></div>}
        {scene.partials && scene.partials.length > 0 && <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>({scene.partials.join(' + ')})</div>}
      </div>
    ) as unknown as never;
  },
};
