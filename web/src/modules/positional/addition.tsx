import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

type Cfg = { base: number; a: string; b: string };
type Scene = { aDigits: number[]; bDigits: number[]; res: number[]; i: number | null; carry: number };

function parseLSB(s: string, base: number): number[] | null {
  const msb = s.trim().split('').map(ch => parseInt(ch, base));
  if (msb.length === 0 || msb.some(v => Number.isNaN(v) || v < 0 || v >= base)) return null;
  return msb.reverse();
}

export const additionModule: ModuleDef<Scene, Cfg> = {
  id: 'positional-addition',
  title: T('列式加法', 'Column Addition'),
  desc: T('逐列 $s=P_i+Q_i+c$，$R_i=s\\bmod n$，进位 $c=\\lfloor s/n\\rfloor$。', 'Per column $s=P_i+Q_i+c$, $R_i=s\\bmod n$, carry $c=\\lfloor s/n\\rfloor$.'),
  tags: ['data-structures'],
  defaultConfig: { base: 10, a: '27', b: '48' },
  Controls({ config, onChange }) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          base <input className="txt" type="number" min={2} max={16} value={config.base} onChange={e => onChange({ ...config, base: Math.max(2, Math.min(16, Number(e.target.value) || 10)) })} style={{ width: 72 }} />
        </label>
        <label>
          a <input className="txt" value={config.a} onChange={e => onChange({ ...config, a: e.target.value })} style={{ width: 90 }} />
        </label>
        <label>
          b <input className="txt" value={config.b} onChange={e => onChange({ ...config, b: e.target.value })} style={{ width: 90 }} />
        </label>
      </div>
    ) as unknown as never;
  },
  code: [
    T('$c \\gets 0;\\; i \\gets 0$', '$c \\gets 0;\\; i \\gets 0$'),
    T('while $i < k$:', 'while $i < k$:'),
    T('  $s \\gets P_i+Q_i+c$', '  $s \\gets P_i+Q_i+c$'),
    T('  $R_i \\gets s \\bmod n$', '  $R_i \\gets s \\bmod n$'),
    T('  $c \\gets \\lfloor s/n\\rfloor$', '  $c \\gets \\lfloor s/n\\rfloor$'),
    T('  $i \\gets i+1$', '  $i \\gets i+1$'),
    T('$c=1 \\implies R_k\\gets1$ // 末进位', '$c=1 \\implies R_k\\gets1$ // final carry'),
  ],
  generate(cfg) {
    const aLSB = parseLSB(cfg.a, cfg.base);
    const bLSB = parseLSB(cfg.b, cfg.base);
    const frames: Frame<Scene>[] = [];
    if (!aLSB || !bLSB) {
      frames.push({ line: 0, caption: T('⚠ 数码不合法', '⚠ Invalid digits'), scene: { aDigits: [], bDigits: [], res: [], i: null, carry: 0 } });
      return frames;
    }
    const k = Math.max(aLSB.length, bLSB.length);
    while (aLSB.length < k) aLSB.push(0);
    while (bLSB.length < k) bLSB.push(0);
    const res: number[] = [];
    let c = 0;
    const scene = (i: number | null): Scene => ({ aDigits: aLSB.slice().reverse(), bDigits: bLSB.slice().reverse(), res: res.slice().reverse(), i, carry: c });
    frames.push({ line: 0, caption: T(`初始化 $c=0$, $k=${k}$，$A=${cfg.a}$, $B=${cfg.b}$, $n=${cfg.base}$`, `Init $c=0$, $k=${k}$, $A=${cfg.a}$, $B=${cfg.b}$`), scene: scene(null) });
    for (let i = 0; i < k; i++) {
      frames.push({ line: 1, caption: T(`列 $i=${i}$ 开始`, `Column $i=${i}$`), scene: scene(i) });
      const s = aLSB[i] + bLSB[i] + c;
      frames.push({ line: 2, caption: T(`$s=${aLSB[i]}+${bLSB[i]}+${c}=${s}$`, `$s=${aLSB[i]}+${bLSB[i]}+${c}=${s}$`), scene: scene(i) });
      const ri = s % cfg.base;
      res[i] = ri;
      frames.push({ line: 3, caption: T(`$R_${i}=${s}\\bmod${cfg.base}=${ri}$`, `$R_${i}=${s}\\bmod${cfg.base}=${ri}$`), scene: scene(i) });
      c = Math.floor(s / cfg.base);
      frames.push({ line: 4, caption: T(`进位 $c=\\lfloor${s}/${cfg.base}\\rfloor=${c}$`, `carry $c=\\lfloor${s}/${cfg.base}\\rfloor=${c}$`), scene: scene(i) });
      frames.push({ line: 5, caption: T(`$i\\gets${i + 1}$`, `$i\\gets${i + 1}$`), scene: scene(i) });
    }
    if (c === 1) {
      res.push(1);
      frames.push({ line: 6, caption: T(`末进位 $c=1$，$R_${k}=1$`, `final carry $R_${k}=1`), scene: scene(k) });
    } else {
      frames.push({ line: 6, caption: T(`末进位 $c=0$ 结束`, `no final carry`), scene: scene(null) });
    }
    return frames;
  },
  Render({ scene }) {
    const cols = Math.max(scene.aDigits.length, scene.bDigits.length, scene.res.length || 0);
    const pad = (arr: number[]) => {
      const cp = [...arr];
      while (cp.length < cols) cp.unshift(0);
      return cp;
    };
    const A = pad(scene.aDigits), B = pad(scene.bDigits), R = pad(scene.res);
    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${cols}, 56px)`, gap: 6, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <div />
          {A.map((v, i) => {
            const li = cols - 1 - i;
            const active = scene.i !== null && li === scene.i;
            return (
              <div key={i} className={`digit ${active ? 'active' : ''}`} style={{ minWidth: 0 }}>
                <small>{li}</small>
                <strong>{v}</strong>
              </div>
            );
          })}
          <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>A</div>
          {B.map((v, i) => (
            <div key={`b-${i}`} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', fontWeight: 700 }}>
              {v}
            </div>
          ))}
          <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>B</div>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={`l-${i}`} style={{ height: 1, background: '#cbd5e1', gridColumn: `${i + 2}` }} />
          ))}
          <div style={{ textAlign: 'right', fontWeight: 800 }}>R</div>
          {R.map((v, i) => (
            <div key={`r-${i}`} style={{ textAlign: 'center', padding: '8px 0', borderRadius: 12, background: '#f8fafc', border: '1px solid var(--border)', fontWeight: 800 }}>
              {v}
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginTop: 6 }}>
          <MathText text={`进位 $c$ = ${scene.carry}`} />
        </div>
      </div>
    ) as unknown as never;
  },
};
