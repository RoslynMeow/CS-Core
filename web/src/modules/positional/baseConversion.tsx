import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { defaultAlphabet } from '../../lib/alphabet';
import { loadGlobal } from '../../lib/alphabetStorage';

type Mode = 'integer' | 'fraction' | 'full';
type Cfg = { fromBase: number; toBase: number; numeral: string; mode: Mode };
const DEFAULT_CFG: Cfg = { fromBase: 10, toBase: 2, numeral: '11.625', mode: 'full' };
type Scene = {
  y: number;
  fromBase: number;
  toBase: number;
  srcInt: number[];
  srcFrac: number[];
  toInt: number[];
  toFrac: number[];
  phase: 'init' | 'int' | 'frac' | 'done';
  step: number;
  rem: number | null;
  yk: number | null;
  truncated: boolean;
};

const POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function charToVal(ch: string): number { return POOL.indexOf(ch.toUpperCase()); }
function valToChar(v: number): string { return POOL[v] ?? '?'; }
function valToGlyph(v: number, base: number): string { return (defaultAlphabet(base)[v] ?? valToChar(v)); }

type Parsed = { y: number; intVal: number; fracVal: number; intStr: string; fracStr: string; intDigits: number[]; fracDigits: number[] };
function parseNumeral(s: string, base: number): Parsed | null {
  const raw = s.trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length > 2) return null;
  let intStr = parts[0] ?? '';
  const fracStr = parts[1] ?? '';
  if (intStr === '' && fracStr === '') return null;
  if (intStr === '') intStr = '0';
  // validate int
  const intDigits: number[] = [];
  for (const ch of intStr) {
    const v = charToVal(ch);
    if (v < 0 || v >= base) return null;
    intDigits.push(v);
  }
  const fracDigits: number[] = [];
  for (const ch of fracStr) {
    const v = charToVal(ch);
    if (v < 0 || v >= base) return null;
    fracDigits.push(v);
  }
  let intVal = 0;
  for (const d of intDigits) intVal = intVal * base + d;
  let fracVal = 0;
  for (let i = 0; i < fracDigits.length; i++) fracVal += fracDigits[i] * base ** -(i + 1);
  return { y: intVal + fracVal, intVal, fracVal, intStr, fracStr, intDigits, fracDigits };
}

const CODE: Record<Mode, ReturnType<NonNullable<ModuleDef['codeFor']>>> = {
  integer: [
    T('$y \\gets \\text{value}_n(P)$ // 按权求值', '$y \\gets \\text{value}_n(P)$'),
    T('$y_0 \\gets \\lfloor y \\rfloor$ // 取整', '$y_0 \\gets \\lfloor y \\rfloor$'),
    T('while $y_k > 0$:', 'while $y_k > 0$:'),
    T('  $Q_k \\gets y_k \\bmod m$', '  $Q_k \\gets y_k \\bmod m$'),
    T('  $y_{k+1} \\gets \\lfloor y_k/m\\rfloor$', '  $y_{k+1} \\gets \\lfloor y_k/m\\rfloor$'),
    T('return $Q$ (逆序)', 'return $Q$ (reversed)'),
  ] as never,
  fraction: [
    T('$y \\gets \\text{value}_n(P)$ // 按权求值', '$y \\gets \\text{value}_n(P)$'),
    T('$y_{-1} \\gets y-\\lfloor y\\rfloor$ // 纯小数', '$y_{-1} \\gets y-\\lfloor y\\rfloor$'),
    T('while $y_j \\neq 0$:', 'while $y_j \\neq 0$:'),
    T('  $Q_j \\gets \\lfloor y_j\\cdot m\\rfloor$', '  $Q_j \\gets \\lfloor y_j\\cdot m\\rfloor$'),
    T('  $y_{j-1} \\gets y_j\\cdot m - Q_j$', '  $y_{j-1} \\gets y_j\\cdot m - Q_j$'),
    T('return $Q$ (正序)', 'return $Q$ (in order)'),
  ] as never,
  full: [
    T('$y \\gets \\text{value}_n(P)$ // 按权求值', '$y \\gets \\text{value}_n(P)$'),
    T('$y_0 \\gets \\lfloor y \\rfloor$ // 整数', '$y_0 \\gets \\lfloor y \\rfloor$'),
    T('while $y_k > 0$:', 'while $y_k > 0$:'),
    T('  $Q_k \\gets y_k \\bmod m$', '  $Q_k \\gets y_k \\bmod m$'),
    T('  $y_{k+1} \\gets \\lfloor y_k/m\\rfloor$', '  $y_{k+1} \\gets \\lfloor y_k/m\\rfloor$'),
    T('$y_{-1} \\gets y-\\lfloor y\\rfloor$ // 小数', '$y_{-1} \\gets y-\\lfloor y\\rfloor$'),
    T('while $y_j \\neq 0$:', 'while $y_j \\neq 0$:'),
    T('  $Q_j \\gets \\lfloor y_j\\cdot m\\rfloor$', '  $Q_j \\gets \\lfloor y_j\\cdot m\\rfloor$'),
    T('  $y_{j-1} \\gets y_j\\cdot m - Q_j$', '  $y_{j-1} \\gets y_j\\cdot m - Q_j$'),
    T('return $Q$ (拼合) // 逆序+正序', 'return $Q$ (concat)'),
  ] as never,
};

function digitsToString(d: number[]): string { return d.map(valToChar).join(''); }
const EPS = 1e-12;
const MAX_FRAC = 12;

function generateByMode(cfg: Cfg): Frame<Scene>[] {
  const parsed = parseNumeral(cfg.numeral, cfg.fromBase);
  const frames: Frame<Scene>[] = [];
  const baseScene = (over: Partial<Scene>): Scene => ({
    y: parsed?.y ?? 0, fromBase: cfg.fromBase, toBase: cfg.toBase,
    srcInt: parsed?.intDigits ?? [], srcFrac: parsed?.fracDigits ?? [],
    toInt: [], toFrac: [], phase: 'init', step: -1, rem: null, yk: null, truncated: false, ...over,
  });

  if (!parsed) {
    frames.push({ line: 0, caption: T(`! 数码不合法：需 $P_i\\in S_{${cfg.fromBase}}$`, `! Invalid digits: need $P_i\\in S_{${cfg.fromBase}}$`), scene: baseScene({ phase: 'init' }) });
    return frames;
  }
  const { y, intVal, fracVal, intStr, fracStr } = parsed;

  // common init
  const dot = fracStr ? `.${fracStr}` : '';
  frames.push({
    line: 0,
    caption: T(`按权求值 $y=(${intStr}${dot})_{${cfg.fromBase}} = ${y}$，守恒 $y=\\sum P_i n^i = \\sum Q_j m^j$`, `Evaluate $y=(${intStr}${dot})_{${cfg.fromBase}} = ${y}$`),
    scene: baseScene({ y, phase: 'init', yk: y }),
  });

  if (cfg.mode === 'integer') {
    if (intVal === 0) {
      frames.push({ line: 5, caption: T(`$y_0=0$，$Q_0=0$`, `$y_0=0$, $Q_0=0`), scene: baseScene({ y, toInt: [0], phase: 'done', step: 0, rem: 0, yk: 0 }) });
      return frames;
    }
    let yk = intVal;
    const q: number[] = [];
    frames.push({ line: 1, caption: T(`$y_0=\\lfloor y\\rfloor=${yk}$`, `$y_0=${yk}$`), scene: baseScene({ y, toInt: [], phase: 'int', step: 0, yk }) });
    let k = 0;
    while (yk > 0) {
      frames.push({ line: 2, caption: T(`$y_${k}=${yk}>0$ 进入`, `$y_${k}=${yk}>0$`), scene: baseScene({ y, toInt: [...q].reverse(), phase: 'int', step: k, yk }) });
      const rk = yk % cfg.toBase;
      q.push(rk);
      frames.push({ line: 3, caption: T(`$Q_${k}=${yk}\\bmod${cfg.toBase}=${rk}$`, `$Q_${k}=${yk}\\bmod${cfg.toBase}=${rk}$`), scene: baseScene({ y, toInt: [...q].reverse(), phase: 'int', step: k, rem: rk, yk }) });
      const nxt = Math.floor(yk / cfg.toBase);
      frames.push({ line: 4, caption: T(`$y_${k + 1}=\\lfloor${yk}/${cfg.toBase}\\rfloor=${nxt}$`, `$y_${k + 1}=\\lfloor${yk}/${cfg.toBase}\\rfloor=${nxt}$`), scene: baseScene({ y, toInt: [...q].reverse(), phase: 'int', step: k, rem: rk, yk: nxt }) });
      yk = nxt; k++;
    }
    const out = digitsToString([...q].reverse());
    frames.push({ line: 5, caption: T(`完成：$(${intStr})_{${cfg.fromBase}} = (${out})_{${cfg.toBase}}$`, `Done: $(${intStr})_{${cfg.fromBase}} = (${out})_{${cfg.toBase}}$`), scene: baseScene({ y, toInt: [...q].reverse(), phase: 'done', step: k - 1, yk: 0 }) });
    return frames;
  }

  if (cfg.mode === 'fraction') {
    const yFrac0 = fracVal;
    if (yFrac0 < EPS) {
      frames.push({ line: 1, caption: T(`小数部分 $y_{-1}=0$，无需转换`, `No fractional part`), scene: baseScene({ y, toFrac: [], phase: 'done', yk: 0 }) });
      frames.push({ line: 5, caption: T(`完成：$(${cfg.numeral})_{${cfg.fromBase}}$ 小数部分为 $0$`, `Done: fractional $0$`), scene: baseScene({ y, toFrac: [], phase: 'done', yk: 0 }) });
      return frames;
    }
    let yj = yFrac0;
    const q: number[] = [];
    frames.push({ line: 1, caption: T(`$y_{-1}=${yj}$`, `$y_{-1}=${yj}$`), scene: baseScene({ y, toFrac: [], phase: 'frac', step: -1, yk: yj }) });
    let j = -1;
    let truncated = false;
    while (yj > EPS && q.length < MAX_FRAC) {
      frames.push({ line: 2, caption: T(`$y_{${j}}=${yj.toFixed(6)}\\neq0$ 继续`, `$y_{${j}}\\neq0$`), scene: baseScene({ y, toFrac: [...q], phase: 'frac', step: q.length, yk: yj }) });
      const qj = Math.floor(yj * cfg.toBase + 1e-9);
      q.push(qj);
      frames.push({ line: 3, caption: T(`$Q_{${j}}=\\lfloor${yj.toFixed(6)}\\cdot${cfg.toBase}\\rfloor=${qj}$`, `$Q_{${j}}=\\lfloor${yj.toFixed(6)}\\cdot${cfg.toBase}\\rfloor=${qj}$`), scene: baseScene({ y, toFrac: [...q], phase: 'frac', step: q.length - 1, rem: qj, yk: yj }) });
      const nxt = yj * cfg.toBase - qj;
      const nxtClamped = nxt < EPS ? 0 : nxt;
      frames.push({ line: 4, caption: T(`$y_{${j - 1}}=${yj.toFixed(6)}\\cdot${cfg.toBase}-${qj}=${nxtClamped.toFixed(6)}$`, `$y_{${j - 1}}=${nxtClamped.toFixed(6)}$`), scene: baseScene({ y, toFrac: [...q], phase: 'frac', step: q.length - 1, rem: qj, yk: nxtClamped }) });
      yj = nxtClamped; j--;
    }
    truncated = yj > EPS;
    const out = digitsToString(q);
    const tail = truncated ? '\\dots' : '';
    frames.push({ line: 5, caption: truncated ? T(`截断：$(0.${fracStr})_{${cfg.fromBase}} \\approx (0.${out}${tail})_{${cfg.toBase}}$ 已达 ${MAX_FRAC} 位`, `Truncated: $(0.${fracStr})\\approx(0.${out}\\dots)_{${cfg.toBase}}$`) : T(`完成：$(0.${fracStr})_{${cfg.fromBase}} = (0.${out})_{${cfg.toBase}}$`, `Done: $(0.${fracStr})=(0.${out})$`), scene: baseScene({ y, toFrac: [...q], phase: 'done', truncated, yk: yj }) });
    return frames;
  }

  // full
  let ykInt = intVal;
  const qInt: number[] = [];
  if (intVal === 0) {
    qInt.push(0);
  } else {
    frames.push({ line: 1, caption: T(`$y_0=\\lfloor y\\rfloor=${ykInt}$`, `$y_0=${ykInt}$`), scene: baseScene({ y, toInt: [], toFrac: [], phase: 'int', step: 0, yk: ykInt }) });
    let k = 0;
    while (ykInt > 0) {
      frames.push({ line: 2, caption: T(`$y_${k}=${ykInt}>0$`, `$y_${k}=${ykInt}>0$`), scene: baseScene({ y, toInt: [...qInt].reverse(), phase: 'int', step: k, yk: ykInt }) });
      const rk = ykInt % cfg.toBase;
      qInt.push(rk);
      frames.push({ line: 3, caption: T(`$Q_${k}=${ykInt}\\bmod${cfg.toBase}=${rk}$`, `$Q_${k}=${rk}$`), scene: baseScene({ y, toInt: [...qInt].reverse(), phase: 'int', step: k, rem: rk, yk: ykInt }) });
      const nxt = Math.floor(ykInt / cfg.toBase);
      frames.push({ line: 4, caption: T(`$y_${k + 1}=\\lfloor${ykInt}/${cfg.toBase}\\rfloor=${nxt}$`, `$y_${k + 1}=${nxt}$`), scene: baseScene({ y, toInt: [...qInt].reverse(), phase: 'int', step: k, rem: rk, yk: nxt }) });
      ykInt = nxt; k++;
    }
  }
  if (qInt.length === 0) qInt.push(0);
  // if no fractional part, finish integer only but still need to show frac empty path
  if (fracVal < EPS) {
    const outInt = digitsToString([...qInt].reverse());
    frames.push({ line: 5, caption: T(`小数 $y_{-1}=0$ 跳过`, `No frac`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [], phase: 'done', yk: 0 }) });
    frames.push({ line: 9, caption: T(`完成：$(${intStr}${dot})_{${cfg.fromBase}} = (${outInt})_{${cfg.toBase}}$`, `Done: $(${intStr}) = (${outInt})$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [], phase: 'done', yk: 0 }) });
    return frames;
  }
  let yj = fracVal;
  const qFrac: number[] = [];
  frames.push({ line: 5, caption: T(`$y_{-1}=y-\\lfloor y\\rfloor=${yj}$`, `$y_{-1}=${yj}$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [], phase: 'frac', step: -1, yk: yj }) });
  let j = -1;
  while (yj > EPS && qFrac.length < MAX_FRAC) {
    frames.push({ line: 6, caption: T(`$y_{${j}}=${yj.toFixed(6)}\\neq0$`, `$y_{${j}}\\neq0$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [...qFrac], phase: 'frac', step: qFrac.length, yk: yj }) });
    const qj = Math.floor(yj * cfg.toBase + 1e-9);
    qFrac.push(qj);
    frames.push({ line: 7, caption: T(`$Q_{${j}}=\\lfloor${yj.toFixed(6)}\\cdot${cfg.toBase}\\rfloor=${qj}$`, `$Q_{${j}}=${qj}$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [...qFrac], phase: 'frac', step: qFrac.length - 1, rem: qj, yk: yj }) });
    const nxt = yj * cfg.toBase - qj;
    const nxtClamped = nxt < EPS ? 0 : nxt;
    frames.push({ line: 8, caption: T(`$y_{${j - 1}}=${nxtClamped.toFixed(6)}$`, `$y_{${j - 1}}=${nxtClamped.toFixed(6)}$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [...qFrac], phase: 'frac', step: qFrac.length - 1, rem: qj, yk: nxtClamped }) });
    yj = nxtClamped; j--;
  }
  const truncated = yj > EPS;
  const outInt2 = digitsToString([...qInt].reverse());
  const outFrac2 = digitsToString(qFrac);
  const outFull = `${outInt2}.${outFrac2}${truncated ? '\\dots' : ''}`;
  frames.push({ line: 9, caption: truncated ? T(`截断 ${MAX_FRAC} 位：$(${cfg.numeral})_{${cfg.fromBase}} \\approx (${outFull})_{${cfg.toBase}}$`, `Truncated: $(${cfg.numeral})\\approx(${outFull})$`) : T(`完成：$(${cfg.numeral})_{${cfg.fromBase}} = (${outFull})_{${cfg.toBase}}$ 守恒 $\\sum Q_j m^j = ${y}$`, `Done: $(${cfg.numeral}) = (${outFull})$`), scene: baseScene({ y, toInt: [...qInt].reverse(), toFrac: [...qFrac], phase: 'done', truncated, yk: yj }) });
  return frames;
}

function randNumeral(fromBase: number, mode: Mode): string {
  const pool = defaultAlphabet(fromBase);
  const randInt = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) s += pool[Math.floor(Math.random() * fromBase)];
    if (s.length > 1 && s[0] === pool[0]) s = pool[1 + Math.floor(Math.random() * (fromBase - 1))] + s.slice(1);
    return s || pool[0];
  };
  const intLen = 1 + Math.floor(Math.random() * 2);
  const fracLen = 1 + Math.floor(Math.random() * 3);
  if (mode === 'integer') return randInt(intLen + 1);
  if (mode === 'fraction') return `0.${randInt(fracLen)}`;
  // full: 60% with dot
  if (Math.random() < 0.6) return `${randInt(intLen)}.${randInt(fracLen)}`;
  return randInt(intLen + 1);
}

export const baseConversionModule: ModuleDef<Scene, Cfg> = {
  id: 'base-conversion',
  title: T('进制转换', 'Base Conversion'),
  desc: T('值守恒 $y=\\sum P_i n^i = \\sum Q_j m^j$，整数除基取余 $y_{k+1}=\\lfloor y_k/m\\rfloor$、小数乘基取整 $y_{j-1}=y_j m-Q_j$。', 'Conserved $y=\\sum P_i n^i = \\sum Q_j m^j$, int $y_{k+1}=\\lfloor y_k/m\\rfloor$, frac $y_{j-1}=y_j m-Q_j$.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) { return { ...c, numeral: randNumeral(c.fromBase, c.mode) }; },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', letterSpacing: '.04em' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$n$" /></span>
            <input className="txt" type="number" min={2} max={36} value={config.fromBase} onChange={e => onChange({ ...config, fromBase: Math.max(2, Math.min(36, Number(e.target.value) || 10)) })} style={{ width: 64 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span><MathText text="$m$" /></span>
            <input className="txt" type="number" min={2} max={36} value={config.toBase} onChange={e => onChange({ ...config, toBase: Math.max(2, Math.min(36, Number(e.target.value) || 2)) })} style={{ width: 64 }} />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('模式', 'Mode'))}</span>
            <select className="txt" value={config.mode} onChange={e => onChange({ ...config, mode: e.target.value as Mode })}>
              <option value="integer">{t(T('整数', 'Integer'))}</option>
              <option value="fraction">{t(T('小数', 'Fraction'))}</option>
              <option value="full">{t(T('完整', 'Full'))}</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '.04em' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('数码', 'Numeral'))}</span>
            <input className="txt" value={config.numeral} onChange={e => onChange({ ...config, numeral: e.target.value })} style={{ width: 130 }} />
          </label>
          <button className="ghost" onClick={() => onChange({ ...config, numeral: randNumeral(config.fromBase, config.mode) })}>
            ↻ {t(T('重新生成', 'Regenerate'))}
          </button>
          <button className="ghost" onClick={() => onChange({ ...config, ...DEFAULT_CFG } as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.mode] as never; },
  generate: generateByMode,
  Render({ scene: _scene }) {
    const scene = (_scene as any) ?? {};
    scene.srcInt = scene.srcInt ?? [];
    scene.srcFrac = scene.srcFrac ?? [];
    scene.toInt = scene.toInt ?? [];
    scene.toFrac = scene.toFrac ?? [];
    const srcInt = scene.srcInt;
    const srcFrac = scene.srcFrac;
    const toInt = scene.toInt;
    const toFrac = scene.toFrac;
    const global = loadGlobal();

    const defFor = (vals: number[], base: number) => vals.map(v => valToGlyph(v, base));
    const custFor = (vals: number[]) => vals.map(v => {
      const img = global?.glyphs[v];
      return img ? ({ img } as const) : null;
    });

    const hasFrac = srcFrac.length > 0 || toFrac.length > 0 || scene.phase === 'frac';
    // helpers to render rows
    const RowDef = ({ vals, base, highlightIdx, label }: { vals: (string | null)[]; base: number; highlightIdx: number | null; label: string }) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>{label}</span>
        {vals.length === 0 ? <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span> : vals.map((g, i) => {
          const active = highlightIdx === i;
          const isEmpty = g === null;
          const isDot = g === '.';
          if (isDot) return <div key={i} style={{ width: 14, textAlign: 'center', fontWeight: 900 }}>.</div>;
          return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: isEmpty ? 'dashed' : 'solid', background: isEmpty ? '#f8fafc' : '#fff' }}>{isEmpty ? null : <strong style={{ fontSize: 14 }}>{g}</strong>}</div>;
        })}
      </div>
    );
    const RowCust = ({ vals, highlightIdx, label }: { vals: (string | null | { img: string } | null)[]; highlightIdx: number | null; label: string }) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>{label}</span>
        {vals.length === 0 ? <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span> : vals.map((g, i) => {
          const active = highlightIdx === i;
          const isEmpty = g === null;
          const isDot = (g as unknown as string) === '.';
          if (isDot) return <div key={i} style={{ width: 14, textAlign: 'center', fontWeight: 900 }}>.</div>;
          return <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ width: 44, height: 44, padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: isEmpty ? 'dashed' : 'solid', background: isEmpty ? '#f8fafc' : '#fff' }}>{isEmpty ? null : typeof g === 'string' ? <strong>{g}</strong> : g && typeof g === 'object' ? <img src={(g as { img: string }).img} alt="g" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}</div>;
        })}
      </div>
    );

    // build source rows with dot
    const srcDefVals: (string | null)[] = [...defFor(srcInt, scene.fromBase), ...(srcFrac.length ? ['.', ...defFor(srcFrac, scene.fromBase)] : [])];
    const srcCustVals: (string | null | { img: string } | null)[] = [...custFor(srcInt), ...(srcFrac.length ? ['.' as unknown as string, ...custFor(srcFrac)] : [])];

    // target rows
    let toDefVals: (string | null)[] = [];
    let toCustVals: (string | null | { img: string } | null)[] = [];
    let hiDef: number | null = null;
    if (toInt.length === 0 && toFrac.length === 0) {
      toDefVals = [];
      toCustVals = [];
    } else if (toFrac.length === 0) {
      toDefVals = defFor(toInt, scene.toBase) as (string | null)[];
      toCustVals = custFor(toInt) as never;
      if (scene.phase === 'int' && scene.rem !== null) hiDef = 0; // newest at leftmost
    } else if (toInt.length === 0) {
      toDefVals = ['0', '.', ...defFor(toFrac, scene.toBase)] as (string | null)[];
      toCustVals = [null, '.' as unknown as string, ...custFor(toFrac)] as never;
      if (scene.phase === 'frac' && toFrac.length) hiDef = 2 + toFrac.length - 1;
    } else {
      toDefVals = [...defFor(toInt, scene.toBase), '.', ...defFor(toFrac, scene.toBase)] as (string | null)[];
      toCustVals = [...custFor(toInt), '.' as unknown as string, ...custFor(toFrac)] as never;
      if (scene.phase === 'int' && toInt.length) hiDef = 0;
      else if (scene.phase === 'frac' && toFrac.length) hiDef = toInt.length + 1 + toFrac.length - 1;
    }
    // dot highlight never
    if (hiDef !== null && toDefVals[hiDef] === '.') hiDef = null;

    const srcLabel = '数码';
    const custLabel = '手绘';
    const yText = Number.isFinite(scene.y) ? String(scene.y) : '—';
    const ykText = scene.yk !== null && Number.isFinite(scene.yk) ? scene.yk.toFixed(6).replace(/\.?0+$/, '') : '—';

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 6, padding: '8px 6px', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textAlign: 'center' }}><MathText text={`源 $(${scene.fromBase})$ · $P$`} /></div>
          <RowDef vals={srcDefVals} base={scene.fromBase} highlightIdx={null} label={srcLabel} />
          <RowCust vals={srcCustVals} highlightIdx={null} label={custLabel} />
        </div>
        <div style={{ display: 'grid', gap: 6, padding: '8px 6px', border: '1px solid #c7d2fe', borderRadius: 12, background: '#eef2ff' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', textAlign: 'center' }}><MathText text={`目标 $(${scene.toBase})$ · $Q$${scene.truncated ? '\\;·截断' : ''}`} /></div>
          <RowDef vals={toDefVals} base={scene.toBase} highlightIdx={hiDef} label={srcLabel} />
          <RowCust vals={toCustVals} highlightIdx={hiDef} label={custLabel} />
          {!hasFrac && toInt.length === 0 ? <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>—</div> : null}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
          <span><MathText text={`$y=${yText}$`} /></span>
          <span><MathText text={`$y_k=${ykText}$`} /></span>
          {scene.rem !== null && <span><MathText text={`余/取整 $Q$ = ${valToChar(scene.rem)}`} /></span>}
          {scene.truncated && <span style={{ color: '#f59e0b' }}>已达 {MAX_FRAC} 位截断（无限小数）</span>}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          <MathText text={scene.phase === 'frac' ? '乘基取整正序 · $Q_j=\\lfloor y_j\\cdot m\\rfloor$' : scene.phase === 'int' ? '除基取余逆序 · $Q_k=y_k\\bmod m$' : '守恒 $y=\\sum P_i n^i = \\sum Q_j m^j$'} />
        </div>
      </div>
    ) as unknown as never;
  },
};
